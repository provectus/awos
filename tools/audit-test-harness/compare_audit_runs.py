#!/usr/bin/env python3
"""
compare_audit_runs.py — diff two archived audit runs.

  compare_audit_runs.py <runDirA> <runDirB>
  compare_audit_runs.py --target <repo-name>     # two newest runs for that repo

Prints side by side: phase, skill commit, tokens, cost, wall-clock, audit_total,
coverage, and per-dimension score deltas — so a skill change's effect on the numbers
is visible at a glance. A = older, B = newer.
"""
import argparse
import json
import os
import subprocess
import sys

HOME = os.path.expanduser("~")
SETTINGS = os.path.join(HOME, ".claude/settings.json")


def _awos_main_checkout():
    """awos main checkout = the awos-marketplace directory source (where runs are archived).
    Falls back to this script's repo root."""
    try:
        s = json.load(open(SETTINGS))
        p = s["extraKnownMarketplaces"]["awos-marketplace"]["source"]["path"]
        if p and os.path.isdir(p):
            return p
    except Exception:
        pass
    here = os.path.dirname(os.path.abspath(__file__))
    r = subprocess.run(["git", "-C", here, "rev-parse", "--show-toplevel"],
                       text=True, capture_output=True)
    return r.stdout.strip() or os.path.abspath(os.path.join(here, "..", ".."))


ARCHIVE_ROOT = os.path.join(_awos_main_checkout(), "tmp", "audit-runs")


def load(run):
    with open(os.path.join(run, "run-meta.json")) as f:
        return json.load(f)


def two_newest(name):
    base = os.path.join(ARCHIVE_ROOT, name)
    if not os.path.isdir(base):
        sys.exit(f"no runs under {base}")
    runs = sorted((os.path.join(base, d) for d in os.listdir(base)
                   if os.path.isfile(os.path.join(base, d, "run-meta.json"))),
                  key=lambda p: os.path.basename(p), reverse=True)
    if len(runs) < 2:
        sys.exit(f"need >=2 runs under {base}")
    return runs[1], runs[0]  # older, newer


def g(m, *path, default=None):
    for p in path:
        m = m.get(p) if isinstance(m, dict) else None
    return m if m is not None else default


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("runs", nargs="*", help="two run dirs (older newer)")
    ap.add_argument("--target", help="pick the two newest runs for this repo name")
    args = ap.parse_args()

    if args.target:
        ra, rb = two_newest(args.target)
    elif len(args.runs) == 2:
        ra, rb = args.runs
    else:
        ap.error("pass two run dirs or --target <repo-name>")

    A, B = load(ra), load(rb)
    W = 30

    def row(label, a, b):
        print(f"  {label:<22} {str(a):<{W}} {str(b):<{W}}")

    print("=" * 86)
    print(f"  {'':<22} {'A (older)':<{W}} {'B (newer)':<{W}}")
    print("=" * 86)
    row("phase", A.get("phase"), B.get("phase"))
    row("skill commit", g(A, "skill_under_test", "short"), g(B, "skill_under_test", "short"))
    row("skill dirty", g(A, "skill_under_test", "dirty"), g(B, "skill_under_test", "dirty"))
    row("label", A.get("label"), B.get("label"))
    row("target commit", g(A, "target", "commit"), g(B, "target", "commit"))
    row("cost_usd", A.get("total_cost_usd"), B.get("total_cost_usd"))
    row("duration_ms", A.get("duration_ms"), B.get("duration_ms"))
    row("turns", A.get("num_turns"), B.get("num_turns"))
    for k in ("input_tokens", "output_tokens",
              "cache_creation_input_tokens", "cache_read_input_tokens"):
        row(k, g(A, "usage", k), g(B, "usage", k))

    sA, sB = A.get("summary", {}) or {}, B.get("summary", {}) or {}
    mode = sA.get("mode") or sB.get("mode")
    print("-" * 86)
    if mode == "single":
        row("audit_total", sA.get("audit_total"), sB.get("audit_total"))
        row("coverage", sA.get("coverage"), sB.get("coverage"))
        print("-" * 86)
        print("  per-dimension score (A -> B, Δ):")
        dims = sorted(set(sA.get("dimensions", {})) | set(sB.get("dimensions", {})))
        for d in dims:
            av = (sA.get("dimensions", {}).get(d) or {}).get("score")
            bv = (sB.get("dimensions", {}).get(d) or {}).get("score")
            delta = ""
            if isinstance(av, (int, float)) and isinstance(bv, (int, float)):
                diff = bv - av
                delta = f"  ({'+' if diff >= 0 else ''}{diff})" if diff else "  (=)"
            print(f"    {d:<28} {str(av):>6} -> {str(bv):>6}{delta}")
    elif mode == "org":
        row("repos", sA.get("repos"), sB.get("repos"))
        print("  portfolio_metrics A:", json.dumps(sA.get("portfolio_metrics")))
        print("  portfolio_metrics B:", json.dumps(sB.get("portfolio_metrics")))
    else:
        print("  (no comparable summary — audit output missing in one run)")
    print("=" * 86)


if __name__ == "__main__":
    main()
