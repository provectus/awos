#!/usr/bin/env python3
"""
run_audit_test.py — repeatable test harness for the /awos:ai-readiness-audit skill.

Pipeline per run:
  1. Provenance — which awos commit/branch(+dirty) the skill-under-test is from, which
     target repo(+commit), claude version, UTC timestamp.
  2. Serve the worktree — the awos-marketplace is a *directory source*; `claude` serves
     the plugin live from its installLocation (the main checkout), NOT from the version
     caches. So we repoint the marketplace's source.path + installLocation at the worktree
     and `claude plugin marketplace update`, then RESTORE the originals in a finally block
     after the run (and a failed run still restores). Deploying to the caches — the old
     approach — was never loaded by claude. `--no-deploy` skips the repoint.
  3. Prepare target context/audits/ for the chosen --phase:
       first  → blank slate, NO previous audit (tests the empty case).
       second → seed a previous audit from the archive (tests the delta case).
     Whatever was there is stashed into the run archive first; nothing is deleted outright.
  4. Run the audit headless via `claude -p … --output-format stream-json`, tee the full
     transcript to disk while showing a live progress view.
  5. Measure tokens — parse the final stream-json `result` event for total_cost_usd, usage
     (in/out/cache), duration, turns. The skill does NOT report tokens; this script does.
  6. Archive the whole context/audits/<date>/ output + run-meta.json under a
     timestamp+commit-keyed dir, so every run is kept and is comparable.

Org mode is left to the skill: if exploration finds the repo depends on another repo
(e.g. via an outside-pointing symlink), the skill audits that repo too. We pin nothing.

This is run mostly by Claude Code, so the CLI is intentionally explicit. See README.md.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time

HOME = os.path.expanduser("~")
SETTINGS = os.path.join(HOME, ".claude/settings.json")
MARKET_NAME = "awos-marketplace"
CACHE_BASE = os.path.join(HOME, ".claude/plugins/cache", MARKET_NAME, "awos")


def _script_repo_root():
    """git toplevel of the checkout this script lives in (the skill under test by default)."""
    here = os.path.dirname(os.path.abspath(__file__))
    p = subprocess.run(["git", "-C", here, "rev-parse", "--show-toplevel"],
                       text=True, capture_output=True)
    return p.stdout.strip() or os.path.abspath(os.path.join(here, "..", ".."))


def _awos_main_checkout():
    """The awos main checkout = the awos-marketplace directory source. Runs are archived
    under its tmp/ so they all accumulate in one place no matter which checkout (main or a
    worktree) invokes the harness. Falls back to this script's repo root."""
    try:
        s = json.load(open(SETTINGS))
        p = s["extraKnownMarketplaces"][MARKET_NAME]["source"]["path"]
        if p and os.path.isdir(p):
            return p
    except Exception:
        pass
    return _script_repo_root()


# Archive lives in the awos main checkout's tmp/ (kept here on purpose, gitignored).
# Resolved, not hardcoded, so the location is stable but portable.
ARCHIVE_ROOT = os.path.join(_awos_main_checkout(), "tmp", "audit-runs")
# Default skill-under-test is the checkout this harness is run from; override with --worktree.
DEFAULT_WORKTREE = _script_repo_root()


def log(msg=""):
    print(msg, flush=True)


def die(msg, code=2):
    print(f"error: {msg}", file=sys.stderr, flush=True)
    sys.exit(code)


def run(cmd, cwd=None, check=True):
    return subprocess.run(cmd, cwd=cwd, check=check, text=True,
                          capture_output=True)


def git(repo, *args):
    p = subprocess.run(["git", "-C", repo, *args], text=True, capture_output=True)
    return p.stdout.strip()


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


# ---------------------------------------------------------------------------
KM_PATH = os.path.join(HOME, ".claude/plugins/known_marketplaces.json")


# The awos-marketplace is a DIRECTORY source: `claude` serves the plugin live from
# its installLocation/source.path, NOT from the version caches under
# cache/awos-marketplace/awos/<version>/. So to test worktree code we repoint the
# marketplace at the worktree and refresh, then restore afterwards. (Deploying to
# the version caches — the old approach — was never loaded.)

def _marketplace_paths():
    """Current awos-marketplace source.path + installLocation, from both config files."""
    km = json.load(open(KM_PATH))
    s = json.load(open(SETTINGS))
    m = km.get(MARKET_NAME, {})
    return {
        "km_source_path": m.get("source", {}).get("path"),
        "km_install": m.get("installLocation"),
        "settings_source_path": (s.get("extraKnownMarketplaces", {})
                                 .get(MARKET_NAME, {}).get("source", {}).get("path")),
    }


def _set_marketplace_paths(km_source_path, install, settings_source_path):
    """Write the marketplace paths (each config file gets its OWN source path)
    and refresh via `claude plugin marketplace update`. Returns the completed
    update process so callers can check its returncode."""
    km = json.load(open(KM_PATH))
    s = json.load(open(SETTINGS))
    if MARKET_NAME not in km:
        die(f"marketplace '{MARKET_NAME}' not in {KM_PATH}")
    km[MARKET_NAME].setdefault("source", {})["path"] = km_source_path
    km[MARKET_NAME]["installLocation"] = install
    (s.setdefault("extraKnownMarketplaces", {}).setdefault(MARKET_NAME, {})
     .setdefault("source", {}))["path"] = settings_source_path
    json.dump(km, open(KM_PATH, "w"), indent=2)
    json.dump(s, open(SETTINGS, "w"), indent=2)
    return subprocess.run(["claude", "plugin", "marketplace", "update", MARKET_NAME],
                          capture_output=True, text=True)


def repoint_marketplace(worktree):
    """Point awos-marketplace at the worktree and refresh so `claude` serves the
    worktree's plugin. Returns the original paths for restore. Verifies the worktree
    is a valid marketplace + has a built engine."""
    skill = os.path.join(worktree, "plugins/awos/skills/ai-readiness-audit/SKILL.md")
    if not os.path.isfile(os.path.join(worktree, ".claude-plugin/marketplace.json")):
        die(f"worktree is not a marketplace (no .claude-plugin/marketplace.json): {worktree}")
    if not os.path.isfile(skill):
        die(f"worktree has no SKILL.md at {skill}")
    orig = _marketplace_paths()
    up = _set_marketplace_paths(worktree, worktree, worktree)
    if up.returncode != 0:
        # Roll back the config edits before dying — a failed refresh must not
        # leave the marketplace files pointing at the worktree.
        _set_marketplace_paths(orig["km_source_path"], orig["km_install"],
                               orig["settings_source_path"])
        die(f"claude plugin marketplace update failed (rc={up.returncode}): "
            f"{(up.stderr or up.stdout).strip()}")
    return orig, sha256(skill)


def restore_marketplace(orig):
    up = _set_marketplace_paths(orig["km_source_path"], orig["km_install"],
                                orig["settings_source_path"])
    if up.returncode != 0:
        log("\n" + "!" * 70)
        log(f"!! WARNING: `claude plugin marketplace update` FAILED during restore "
            f"(rc={up.returncode}): {(up.stderr or up.stdout).strip()[:300]}")
        log(f"!! Your {MARKET_NAME} marketplace may still point at the worktree.")
        log(f"!! Check {KM_PATH} and {SETTINGS}, then run: "
            f"claude plugin marketplace update {MARKET_NAME}")
        log("!" * 70)


# ---------------------------------------------------------------------------
def date_dirs(audits):
    if not os.path.isdir(audits):
        return []
    out = []
    for n in os.listdir(audits):
        p = os.path.join(audits, n)
        if os.path.isdir(p) and len(n) == 10 and n[4] == "-" and n[7] == "-":
            out.append(n)
    return sorted(out)


def newest_seed_for(target_name, exclude_run):
    """Newest archived run for this target that has a usable audit-output/audit.json."""
    base = os.path.join(ARCHIVE_ROOT, target_name)
    if not os.path.isdir(base):
        return None
    runs = sorted((os.path.join(base, d) for d in os.listdir(base)),
                  key=lambda p: os.path.basename(p), reverse=True)
    for r in runs:
        if os.path.abspath(r) == os.path.abspath(exclude_run):
            continue
        if os.path.isfile(os.path.join(r, "audit-output", "audit.json")):
            return r
    return None


def resolve_seed_output(seed_from):
    """Accept an archived run dir, an audit-output dir, or a context/audits/<date> dir."""
    cand = os.path.join(seed_from, "audit-output")
    if os.path.isfile(os.path.join(cand, "audit.json")):
        return cand
    if os.path.isfile(os.path.join(seed_from, "audit.json")):
        return seed_from
    die(f"--seed-from has no audit.json: {seed_from}")


def prepare_target(target, phase, run_dir, seed_from, seed_date, today):
    audits = os.path.join(target, "context/audits")
    # stash whatever exists (safety; never deleted) then blank
    if os.path.isdir(audits) and os.listdir(audits):
        stash = os.path.join(run_dir, "_preexisting")
        os.makedirs(stash, exist_ok=True)
        for n in os.listdir(audits):
            shutil.move(os.path.join(audits, n), os.path.join(stash, n))
        log(f"  ✓ stashed pre-existing context/audits -> {stash}")
    os.makedirs(audits, exist_ok=True)

    if phase == "first":
        log("  phase=first → blank slate, no previous audit")
        return None

    # phase == second: seed a previous audit under a non-today date
    out = resolve_seed_output(seed_from)
    if not seed_date:
        try:
            sd = json.load(open(os.path.join(out, "audit.json"))).get("date")
        except Exception:
            sd = None
        if not sd or sd == today:
            sd = (dt.date.fromisoformat(today) - dt.timedelta(days=1)).isoformat()
        seed_date = sd
    if seed_date == today:
        die("seed date must differ from today (skill only treats other dates as previous)")
    dest = os.path.join(audits, seed_date)
    shutil.rmtree(dest, ignore_errors=True)
    shutil.copytree(out, dest)
    log(f"  phase=second → seeded previous audit at context/audits/{seed_date} (from {out})")
    return seed_date


# ---------------------------------------------------------------------------
def _num_usage(ev, key):
    u = ev.get("usage") or {}
    v = u.get(key)
    return v if isinstance(v, (int, float)) else 0


def stream_run(target, claude_flags, run_log):
    """Launch claude, tee transcript to run_log, print a live view, return the result event.

    A session that detours through background tasks / ScheduleWakeup emits one
    `result` event PER resume segment. Reading only the last one massively
    under-reports (a hops run read "78s / 9 turns" vs the true 18m47s / 94
    turns), so metrics are aggregated across ALL segments: turns and durations
    are summed, cost/usage take the maximum (cumulative within a session), and
    wall time is measured start→finish here.
    """
    cmd = ["claude", "-p", "/awos:ai-readiness-audit",
           "--output-format", "stream-json", "--verbose"] + claude_flags
    log(f"▶ {' '.join(cmd)}  (cwd={target})")
    log("─" * 60)
    result = {}
    segments = []
    wall_start = time.monotonic()
    proc = subprocess.Popen(cmd, cwd=target, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, bufsize=1)
    with open(run_log, "w") as lf:
        for line in proc.stdout:
            lf.write(line)
            lf.flush()
            s = line.strip()
            if not s:
                continue
            try:
                ev = json.loads(s)
            except Exception:
                continue
            t = ev.get("type")
            if t == "system" and ev.get("subtype") == "init":
                log(f"▶ session — model={ev.get('model','?')}")
            elif t == "assistant":
                for b in ev.get("message", {}).get("content", []):
                    if b.get("type") == "text":
                        txt = " ".join(b.get("text", "").split())
                        if txt:
                            log(f"  💬 {txt[:240]}")
                    elif b.get("type") == "tool_use":
                        hint = (b.get("input", {}).get("subagent_type")
                                or b.get("input", {}).get("description")
                                or b.get("input", {}).get("command") or "")
                        log(f"  🔧 {b.get('name','?')} {' '.join(str(hint).split())[:80]}".rstrip())
            elif t == "result":
                result = ev
                segments.append(ev)
                u = ev.get("usage") or {}
                mark = "✗ ERROR" if ev.get("is_error") else "✓ segment done"
                log(f"\n{mark} — segment {len(segments)}: cost=${ev.get('total_cost_usd')} "
                    f"duration={ev.get('duration_ms')}ms turns={ev.get('num_turns')}")
                log(f"   usage: in={u.get('input_tokens')} out={u.get('output_tokens')} "
                    f"cache_w={u.get('cache_creation_input_tokens')} "
                    f"cache_r={u.get('cache_read_input_tokens')}")
    proc.wait()
    wall_ms = int((time.monotonic() - wall_start) * 1000)

    def _num(ev, key):
        v = ev.get(key)
        return v if isinstance(v, (int, float)) else 0

    if segments:
        # Aggregate across segments; keep the LAST event's identity fields.
        agg = dict(segments[-1])
        agg["num_turns"] = sum(_num(ev, "num_turns") for ev in segments)
        agg["duration_ms"] = sum(_num(ev, "duration_ms") for ev in segments)
        agg["total_cost_usd"] = max(_num(ev, "total_cost_usd") for ev in segments)
        agg["is_error"] = any(ev.get("is_error") for ev in segments)
        # usage/modelUsage counters are cumulative within a session — take the
        # segment with the largest input footprint.
        biggest = max(
            segments,
            key=lambda ev: (_num_usage(ev, "input_tokens")
                            + _num_usage(ev, "cache_read_input_tokens")),
        )
        agg["usage"] = biggest.get("usage")
        agg["modelUsage"] = biggest.get("modelUsage")
        agg["result_segments"] = len(segments)
        agg["wall_ms"] = wall_ms
        result = agg
        if len(segments) > 1:
            log(f"\n⚠ session split into {len(segments)} result segments "
                f"(background tasks / wakeups) — aggregated: "
                f"turns={agg['num_turns']} wall={wall_ms}ms cost=${agg['total_cost_usd']}")
    log("─" * 60)
    return result, proc.returncode


# ---------------------------------------------------------------------------
def summarize_output(out_dir):
    org = os.path.join(out_dir, "org-portfolio.json")
    single = os.path.join(out_dir, "audit.json")
    try:
        if os.path.exists(org):
            d = json.load(open(org))
            import glob
            return {"mode": "org", "portfolio_metrics": d.get("portfolio_metrics"),
                    "repos": len(glob.glob(
                        os.path.join(out_dir, "per-repo", "*", "audit.json")))}
        if os.path.exists(single):
            d = json.load(open(single))
            return {"mode": "single", "audit_total": d.get("audit_total"),
                    "coverage": d.get("coverage"),
                    "dimensions": {x["dimension"]: {"score": x.get("score"),
                                                     "coverage": x.get("coverage")}
                                   for x in d.get("dimensions", [])}}
    except Exception as e:
        return {"error": str(e)}
    return {}


# ---------------------------------------------------------------------------
def locate_out_dir(audits, today, seeded_date):
    """The date-named output dir the run produced: today's if present, else the
    newest date dir that isn't the seeded previous one."""
    out_dir = os.path.join(audits, today)
    if os.path.isdir(out_dir):
        return out_dir
    dd = [d for d in date_dirs(audits) if d != seeded_date]
    return os.path.join(audits, dd[-1]) if dd else ""


def assess_engine_compliance(out_dir, run_log):
    """Did the run actually use the deterministic engine?

    A compliant run invokes `audit-core` and produces audit.json / org-portfolio.json.
    The stochastic headless reversion — the model reconstructs the removed
    per-dimension DAG/fan-out (spawning dimension-auditor subagents) instead of
    calling the engine — produces per-dimension .md grade files and NO audit.json.
    That run silently passes today (rc=0, output dir exists) while having produced
    the wrong artifact type in a different, non-comparable scoring universe.

    Returns the signals so the harness can fail loudly / retry.

    Counting is done on the parsed stream-json transcript, NOT on raw substrings:
    the skill prompt text itself contains "audit-core" (and "dimension-auditor"),
    so a raw `txt.count()` was satisfied by every run — including non-compliant
    ones. Two execution signals count:
      * audit_core_calls — Bash tool_use blocks whose command contains
        `audit-core` (the model ran the engine itself, e.g. org mode).
      * injected_audit_core — the SKILL.md load-time !`…` injection ran
        audit-core before the model acted (the normal single-repo path, which
        produces NO Bash tool_use). Detected via the injection's echo marker
        with the date variable ALREADY SUBSTITUTED — the raw prompt source has
        the literal `$D`, so unexecuted prompt text cannot match."""
    has_json = bool(out_dir) and (
        os.path.isfile(os.path.join(out_dir, "audit.json"))
        or os.path.isfile(os.path.join(out_dir, "org-portfolio.json")))
    audit_core_calls = 0
    fanout_spawns = 0
    injected = False
    inject_marker = re.compile(
        r"\[audit-core\] one-pass deterministic engine → context/audits/\d{4}-\d{2}-\d{2}")
    try:
        with open(run_log) as f:
            for line in f:
                s = line.strip()
                if not s:
                    continue
                try:
                    ev = json.loads(s)
                except Exception:
                    continue
                t = ev.get("type")
                content = ev.get("message", {}).get("content", [])
                if t == "user" and not injected:
                    blob = (content if isinstance(content, str)
                            else json.dumps(content, ensure_ascii=False))
                    if inject_marker.search(blob):
                        injected = True
                if t != "assistant":
                    continue
                for b in content if isinstance(content, list) else []:
                    if not isinstance(b, dict) or b.get("type") != "tool_use":
                        continue
                    name = b.get("name") or ""
                    inp = b.get("input") or {}
                    if name == "Bash" and "audit-core" in str(inp.get("command", "")):
                        audit_core_calls += 1
                    elif name in ("Agent", "Task"):
                        blob = " ".join(str(inp.get(k, "")) for k in
                                        ("subagent_type", "description", "prompt"))
                        if "dimension-auditor" in blob:
                            fanout_spawns += 1
    except Exception:
        pass
    compliant = bool(has_json and (audit_core_calls > 0 or injected))
    return {"engine_compliant": compliant, "has_audit_json": has_json,
            "audit_core_calls": audit_core_calls,
            "injected_audit_core": injected,
            "fanout_agent_spawns": fanout_spawns}


def seed_audit_core(engine, target, out_dir):
    """Recovery for a non-compliant run: run the deterministic engine ourselves so
    the archive still holds a correct audit.json (in the right scoring universe),
    not just the model's hand-graded .md files. The run is salvaged but the meta
    flags it as a product regression (the MODEL skipped the engine)."""
    os.makedirs(out_dir, exist_ok=True)
    rp = subprocess.run(["node", engine, "audit-core", target, out_dir],
                        capture_output=True, text=True)
    if rp.returncode == 0:
        log(f"  ✓ harness ran audit-core → {os.path.join(out_dir, 'audit.json')}")
        return True
    log(f"  ✗ harness audit-core failed: {rp.stderr.strip()[:200]}")
    return False


def main():
    ap = argparse.ArgumentParser(description="Test/iterate on /awos:ai-readiness-audit.")
    ap.add_argument("--target", required=True, help="repo to audit (cwd of the run)")
    ap.add_argument("--worktree", default=DEFAULT_WORKTREE,
                    help="awos checkout whose skill is under test")
    ap.add_argument("--phase", choices=["first", "second"], default="first",
                    help="first=no previous audit (empty); second=seed a previous audit")
    ap.add_argument("--seed-from", default="auto",
                    help="phase=second: archived run dir to seed as previous "
                         "(default auto=newest prior run for this target)")
    ap.add_argument("--seed-date", default="",
                    help="phase=second: date folder for the seed (default derive, !=today)")
    ap.add_argument("--label", default="", help="note recorded in run-meta + dir name")
    ap.add_argument("--build", action="store_true",
                    help="run `npm run build:engine` in worktree before the run")
    ap.add_argument("--claude-flags", default="--dangerously-skip-permissions",
                    help="extra flags passed to claude (space-separated)")
    ap.add_argument("--allow-user-mcp", action="store_true",
                    help="do NOT pass --strict-mcp-config: the audit session may "
                         "see the operator's user-scope MCP servers (real Jira, "
                         "Slack, ...). Default is strict isolation so a test "
                         "audit can never pull live connector data")
    ap.add_argument("--model", default="sonnet",
                    help="model the audit session (and its subagents) run on, "
                         "passed to `claude -p --model` (default 'sonnet' = the "
                         "best available Sonnet alias, no version pin; empty "
                         "string uses the claude default)")
    ap.add_argument("--retries", type=int, default=2,
                    help="if a run skips the engine (no audit-core / no audit.json), "
                         "relaunch claude this many times before giving up (default 2)")
    ap.add_argument("--no-engine-guard", action="store_true",
                    help="disable the audit-core compliance guard + auto-retry "
                         "(record signals only, never retry or seed)")
    ap.add_argument("--no-deploy", action="store_true",
                    help="don't repoint the marketplace — use whatever it currently serves")
    ap.add_argument("--dry-run", action="store_true",
                    help="do everything except launch claude")
    args = ap.parse_args()

    target = os.path.abspath(args.target)
    worktree = os.path.abspath(args.worktree)
    tgt_is_git = bool(git(target, "rev-parse", "--git-dir"))
    child_repos = []
    if not tgt_is_git:
        # Org mode: target is a non-git folder holding git-repo children; the
        # skill audits each and writes an org-portfolio.json into the parent.
        if os.path.isdir(target):
            child_repos = [d for d in sorted(os.listdir(target))
                           if os.path.isdir(os.path.join(target, d, ".git"))]
        if not child_repos:
            die(f"--target is neither a git repo nor an org folder with "
                f"git-repo children: {target}")
    if not os.path.isdir(os.path.join(worktree, "plugins/awos")):
        die(f"--worktree has no plugins/awos: {worktree}")

    # provenance
    awos_sha = git(worktree, "rev-parse", "HEAD")
    awos_short = git(worktree, "rev-parse", "--short", "HEAD")
    awos_branch = git(worktree, "rev-parse", "--abbrev-ref", "HEAD")
    awos_dirty = bool(git(worktree, "status", "--porcelain"))
    tgt_name = os.path.basename(target)
    if tgt_is_git:
        tgt_short = git(target, "rev-parse", "--short", "HEAD")
        tgt_branch = git(target, "rev-parse", "--abbrev-ref", "HEAD")
        tgt_dirty = bool(git(target, "status", "--porcelain"))
    else:
        tgt_short, tgt_branch, tgt_dirty = "org", f"{len(child_repos)}-repos", False
    claude_ver = run(["claude", "--version"], check=False).stdout.strip().splitlines()[:1]
    claude_ver = claude_ver[0] if claude_ver else "?"
    now = dt.datetime.now(dt.timezone.utc)
    ts = now.strftime("%Y%m%dT%H%M%SZ")
    today = now.date().isoformat()

    dirty_tag = "-dirty" if awos_dirty else ""
    run_dir = os.path.join(ARCHIVE_ROOT, tgt_name,
                           f"{ts}__awos-{awos_short}{dirty_tag}__{args.phase}")

    log("─" * 60)
    log(f" target : {tgt_name} @ {tgt_short} ({tgt_branch}, dirty={tgt_dirty})")
    log(f" skill  : awos @ {awos_short} ({awos_branch}, dirty={awos_dirty})")
    log(f" phase  : {args.phase}")
    log(f" run    : {run_dir}")
    log("─" * 60)

    if args.build:
        log("▶ building engine (npm run build:engine)…")
        bp = subprocess.run(["npm", "run", "build:engine"], cwd=worktree, text=True)
        if bp.returncode != 0:
            die("engine build failed")
    engine = os.path.join(worktree, "plugins/awos/skills/ai-readiness-audit/dist/cli.js")
    if not os.path.isfile(engine):
        die("dist/cli.js missing — run with --build")

    # resolve seed if phase=second (read-only)
    seed_from = None
    if args.phase == "second":
        if args.seed_from == "auto":
            seed_from = newest_seed_for(tgt_name, run_dir)
            if not seed_from:
                die(f"phase=second but no prior archived run for {tgt_name}; do a "
                    f"--phase first run before testing the delta case")
        else:
            seed_from = os.path.abspath(args.seed_from)
        log(f"▶ seed source: {seed_from}")
        resolve_seed_output(seed_from)  # validate it has an audit.json (read-only)

    if args.dry_run:
        log("▶ --dry-run: target + marketplace left untouched")
        log(f"  would repoint {MARKET_NAME} -> {worktree} (+ restore after)")
        log(f"  would run     : claude -p /awos:ai-readiness-audit"
            f"{' --model ' + args.model if args.model else ''} (cwd={target})")
        log(f"  would archive : {run_dir}")
        return

    deployed_sha = None
    orig_market = None
    if args.no_deploy:
        log("▶ --no-deploy: using whatever the marketplace currently serves")
    else:
        log(f"▶ repointing {MARKET_NAME} -> worktree (+ refresh)")
        orig_market, deployed_sha = repoint_marketplace(worktree)
        log(f"  ✓ marketplace served from worktree (SKILL.md {deployed_sha})")

    try:
        os.makedirs(run_dir, exist_ok=True)
        log("▶ preparing target context/audits/")
        seeded_date = prepare_target(target, args.phase, run_dir, seed_from,
                                     args.seed_date, today)

        claude_flags = args.claude_flags.split() if args.claude_flags else []
        if args.model:
            claude_flags += ["--model", args.model]
        if not args.allow_user_mcp:
            # Test isolation: without this, user-scope MCP servers (real Jira,
            # Slack, Gmail, ...) leak into the audited session even with
            # --setting-sources project — a test audit could pull live data.
            claude_flags += ["--strict-mcp-config"]
        audits = os.path.join(target, "context/audits")

        # Engine-compliance guard + auto-retry. The headless model sometimes
        # reconstructs the removed per-dimension fan-out instead of calling
        # audit-core, producing .md grade files and no audit.json — a silent
        # regression that used to pass (rc=0, an output dir exists). Detect it,
        # relaunch up to --retries times, and finally salvage by running the
        # engine ourselves. `model_complied` records whether the MODEL used the
        # engine, independent of any salvage.
        attempts = 1 if args.no_engine_guard else max(1, 1 + args.retries)
        out_dir, comp, result, rc, final_log = "", {}, {}, 0, ""
        for attempt in range(1, attempts + 1):
            if attempt > 1:
                log(f"\n▶ engine-skip retry {attempt - 1}/{attempts - 1} — relaunching claude")
                prev = locate_out_dir(audits, today, seeded_date)
                if prev and os.path.isdir(prev) and os.path.basename(prev) != seeded_date:
                    shutil.rmtree(prev, ignore_errors=True)
                    log(f"  ✓ cleared non-compliant output {prev}")
            final_log = os.path.join(run_dir, f"run.attempt{attempt}.jsonl")
            result, rc = stream_run(target, claude_flags, final_log)
            out_dir = locate_out_dir(audits, today, seeded_date)
            comp = assess_engine_compliance(out_dir, final_log)
            if args.no_engine_guard:
                log(f"  engine guard disabled — compliance signals: {comp}")
                break
            if comp["engine_compliant"]:
                if attempt > 1:
                    log(f"  ✓ retry {attempt - 1} complied (audit-core called, audit.json present)")
                break
            log("⚠ NON-COMPLIANT run — the model skipped the deterministic engine "
                f"(audit_core_calls={comp['audit_core_calls']}, "
                f"has_audit_json={comp['has_audit_json']}, "
                f"dimension-auditor_spawns={comp['fanout_agent_spawns']}).")

        model_complied = bool(comp.get("engine_compliant"))
        # Expose the final attempt's transcript under the canonical name for
        # compare scripts (per-attempt transcripts are kept as run.attemptN.jsonl).
        try:
            shutil.copyfile(final_log, os.path.join(run_dir, "run.jsonl"))
        except Exception:
            pass

        # Salvage: if every attempt skipped the engine, run audit-core ourselves
        # so the archive still holds a correct audit.json (right scoring universe),
        # not just the model's hand-graded .md. The run stays flagged as a
        # product regression via model_complied=False.
        engine_seeded = False
        if not args.no_engine_guard and not model_complied:
            log("⚠ all attempts skipped the engine — harness seeding audit-core to salvage the artifact")
            if not out_dir:
                out_dir = os.path.join(audits, today)
            engine_seeded = seed_audit_core(engine, target, out_dir)
            comp = assess_engine_compliance(out_dir, final_log)
        comp["model_complied"] = model_complied
        comp["engine_seeded_by_harness"] = engine_seeded

        # Fallback render: a transport failure (e.g. "API Error: Connection
        # closed mid-response") can kill claude after audit.json is complete but
        # before it renders the reports — leaving a non-zero rc and no
        # report.md/html. audit.json is the source of truth and `render` is a
        # pure function of it, so we can finish the job ourselves and turn a
        # failed run into a complete one. Also renders the salvage-seeded JSON.
        if out_dir and os.path.isdir(out_dir):
            src_json = next(
                (os.path.join(out_dir, n)
                 for n in ("org-portfolio.json", "audit.json")
                 if os.path.isfile(os.path.join(out_dir, n))),
                None)
            if src_json and not os.path.isfile(os.path.join(out_dir, "report.html")):
                log(f"⚠ report.html missing but {os.path.basename(src_json)} present "
                    f"(claude rc={rc}) — rendering reports from JSON")
                for fmt, out_name in (("md", "report.md"), ("html", "report.html")):
                    rp = subprocess.run(
                        ["node", engine, "render", src_json, "--format", fmt],
                        capture_output=True, text=True)
                    if rp.returncode == 0:
                        with open(os.path.join(out_dir, out_name), "w") as f:
                            f.write(rp.stdout)
                        log(f"  ✓ wrote {out_name}")
                    else:
                        log(f"  ✗ render {fmt} failed: {rp.stderr.strip()[:200]}")

        if out_dir and os.path.isdir(out_dir):
            shutil.copytree(out_dir, os.path.join(run_dir, "audit-output"))
            log(f"▶ archived audit output -> {run_dir}/audit-output")
            summary = summarize_output(os.path.join(run_dir, "audit-output"))
        else:
            log(f"⚠ no audit output dir found under {audits} (audit may have failed)")
            summary = {}

        # Did the run finish? A non-zero rc or an is_error result event means
        # the session died mid-flight; the archive may be usable but the run
        # must not report success.
        partial = bool(rc != 0 or result.get("is_error"))

        # Were the judgment categories actually patched? A leftover
        # "PENDING_JUDGMENT" in any archived audit.json means Step 6 never
        # completed the LLM slice — the score is missing the judgment weight.
        judgments_patched = None
        audit_jsons = []
        archived = os.path.join(run_dir, "audit-output")
        for root, _dirs, files in os.walk(archived):
            audit_jsons += [os.path.join(root, n) for n in files if n == "audit.json"]
        if audit_jsons:
            judgments_patched = True
            for p in audit_jsons:
                try:
                    if "PENDING_JUDGMENT" in open(p).read():
                        judgments_patched = False
                        break
                except Exception:
                    pass
            if not judgments_patched:
                log("⚠ PENDING_JUDGMENT left in archived audit.json — the judgment "
                    "categories were never patched (Step 6 incomplete); scores are "
                    "missing the judgment weight")

        meta = {
            "timestamp_utc": ts, "label": args.label, "phase": args.phase,
            "model": args.model or "claude-default",
            "seeded_previous_date": seeded_date,
            "seed_from": seed_from,
            "claude_version": claude_ver, "claude_rc": rc,
            "compliance": comp,
            "skill_under_test": {"repo": "awos", "worktree": worktree, "commit": awos_sha,
                                 "short": awos_short, "branch": awos_branch,
                                 "dirty": awos_dirty,
                                 "served_via": "marketplace-repoint",
                                 "deployed_sha": deployed_sha},
            "target": {"name": tgt_name, "path": target, "commit": tgt_short,
                       "branch": tgt_branch, "dirty": tgt_dirty},
            "usage": result.get("usage"), "modelUsage": result.get("modelUsage"),
            "total_cost_usd": result.get("total_cost_usd"),
            "duration_ms": result.get("duration_ms"), "num_turns": result.get("num_turns"),
            "wall_ms": result.get("wall_ms"),
            "result_segments": result.get("result_segments"),
            "is_error": result.get("is_error"),
            "partial": partial,
            "judgments_patched": judgments_patched,
            "summary": summary,
        }
        with open(os.path.join(run_dir, "run-meta.json"), "w") as f:
            json.dump(meta, f, indent=2)
    finally:
        if orig_market is not None:
            log(f"▶ restoring {MARKET_NAME} to original ({orig_market['km_install']})")
            restore_marketplace(orig_market)

    u = result.get("usage") or {}
    log("\n== run-meta ==")
    log(f" cost  : ${result.get('total_cost_usd')}")
    log(f" tokens: in={u.get('input_tokens')} out={u.get('output_tokens')} "
        f"cache_w={u.get('cache_creation_input_tokens')} "
        f"cache_r={u.get('cache_read_input_tokens')}")
    log(f" time  : {result.get('duration_ms')} ms / {result.get('num_turns')} turns")
    if summary.get("mode") == "single":
        log(f" score : audit_total={summary.get('audit_total')} "
            f"coverage={summary.get('coverage')}")
    elif summary.get("mode") == "org":
        log(f" org   : repos={summary.get('repos')} "
            f"metrics={summary.get('portfolio_metrics')}")
    if partial:
        log(f"\n✗ run INCOMPLETE (claude rc={rc}, is_error={result.get('is_error')}) "
            f"-> {run_dir}")
    else:
        log(f"\n✓ run complete (claude rc={rc}) -> {run_dir}")
    if judgments_patched is False:
        log("  ⚠ judgments_patched=false — PENDING_JUDGMENT left in the archived "
            "audit.json (Step 6 never patched the judgment categories)")
    log(f"  compare:  python3 {os.path.join(os.path.dirname(os.path.abspath(__file__)), 'compare_audit_runs.py')} --target {tgt_name}")

    # Loud, non-zero exit when the MODEL skipped the engine, even if the harness
    # salvaged a correct audit.json. This is the QA hole the guard closes: such a
    # run must never quietly report success.
    if not args.no_engine_guard and not comp.get("model_complied", True):
        salvaged = comp.get("engine_seeded_by_harness")
        log(f"\n✗ ENGINE-SKIP REGRESSION: the model never ran audit-core across "
            f"{attempts} attempt(s) — it reconstructed the per-dimension fan-out "
            f"(dimension-auditor spawns={comp.get('fanout_agent_spawns')}). "
            f"{'Harness seeded audit-core so the artifact is correct, but ' if salvaged else ''}"
            f"this is a product regression (CLAUDE.md 'Known gap'). Exiting non-zero.")
        sys.exit(3)

    # A crashed / errored session must never exit 0, even when the archive was
    # salvaged (fallback render etc.) — the run is partial, not successful.
    if partial:
        sys.exit(1)


if __name__ == "__main__":
    main()
