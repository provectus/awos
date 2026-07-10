#!/usr/bin/env node
/**
 * AWOS containment guard — a Claude Code PreToolUse hook.
 *
 * Reads the PreToolUse hook JSON on stdin and exits 2 (block) when a proposed
 * tool action crosses a containment boundary:
 *
 *   - a Write/Edit/MultiEdit/NotebookEdit whose target path resolves OUTSIDE
 *     the project directory (an out-of-tree write), or
 *   - a Write/Edit to a PROTECTED in-tree path — the guard's own script, the
 *     hook registration in .claude/settings.json, or a persistence sink
 *     (.git/hooks/, .github/workflows/) — a write that would disarm the guard
 *     or plant durable execution, or
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
 *   (c) protected-in-tree deny — Write/Edit to the guard's own files, the hook
 *       registration, and persistence sinks (self-protection), and
 *   (d) secret-read deny — Read/Glob/Grep of credential/key files (basename).
 * (b) and (c) hold whenever the tool path and the project root are in the SAME
 * path namespace (case-folded on case-insensitive hosts); (a) and (d) do not
 * depend on path resolution. The Bash secret-read check (`cat .env`, `grep x
 * .env`, `< key.pem`) that backstops (d) is BEST-EFFORT — an interpreter
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
 * Cross-namespace ambiguity → FAIL OPEN. When the model emits a POSIX path
 * (`/tmp/…`) on a Windows box whose project root is `C:\…` (or vice versa), the
 * two paths live in different namespaces and cannot be resolved against one
 * root reliably. In that case the guard ALLOWS the write: a false block breaks
 * a legitimate in-tree write, which is worse than the rare miss of an
 * out-of-tree write the guard could not confidently prove.
 *
 * Escape hatch. If a run legitimately needs an out-of-tree write or a network
 * egress, set `AWOS_CONTAINMENT_OFF=1` in the environment and the guard fails
 * open for every tool call (it exits 0 immediately). This is the documented
 * bypass — prefer it over deleting the hook from `.claude/settings.json`.
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
// carry real blast radius — the ones that DISARM the guard (its own script, the
// hook registration that arms it) or plant PERSISTENCE (a git hook, a CI
// workflow) that turns a one-shot poisoned write into durable execution.
// Matched on the target's path relative to the project root (forward-slashed);
// a trailing '/' entry matches that directory and anything under it. Ordinary
// in-tree source/test writes name none of these and stay allowed.
const PROTECTED_INTREE = [
  '.awos/scripts/awos-containment-guard.js',
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

const EGRESS_RE = new RegExp(
  '(?:^|[\\s;|&(){}`])(' +
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
 * Two known best-effort residuals (both escape-hatch-mitigated): a loopback
 * request that also carries a second http(s) URL inside a `-d`/`-H`/query value
 * is over-refused (every URL is checked, not just the request target); and a
 * scheme-less egress to a DOTLESS single-label host (`internalbox/collect`) with
 * a bare `localhost` decoy can pass, since only dotted domains / IPv4 are
 * recognized as foreign. The scheme-ful form of the latter is still blocked.
 */
function isLoopbackOnlyEgress(command) {
  const cmd = command.replace(/#.*$/gm, '');
  const urls = [...cmd.matchAll(URL_RE)].map((m) => m[1]);
  if (urls.length > 0) return urls.every(urlHostIsLoopback);
  return LOOPBACK_RE.test(cmd) && !hasForeignHost(cmd);
}

function readStdin() {
  try {
    // fd 0 is stdin; synchronous read keeps the guard a single pass.
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

/** Best-effort canonicalization; realpath throws on a non-existent path. */
function canonical(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
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
 * True when `root` and `target` are clearly in different path namespaces
 * (one Windows-absolute, the other POSIX-absolute). In that case we cannot
 * resolve them against a single root reliably, so the caller must fail open.
 */
function namespacesDiffer(root, target) {
  return (
    (isWindowsAbsolute(root) && isPosixAbsolute(target)) ||
    (isPosixAbsolute(root) && isWindowsAbsolute(target))
  );
}

/**
 * True when `target`, resolved against `root`, lands outside `root` — i.e.
 * it climbs out with `..` or points at a different filesystem root/drive.
 *
 * Fails open (returns false) when `root` and `target` are in different path
 * namespaces (POSIX target under a Windows root, or vice versa): those cannot
 * be compared reliably, and a false block is worse than a rare miss.
 */
function isOutsideRoot(root, target) {
  if (namespacesDiffer(root, target)) return false;
  const resolvedRoot = path.resolve(canonical(root));
  const resolvedTarget = path.resolve(resolvedRoot, target);
  const rel = path.relative(resolvedRoot, resolvedTarget);
  return (
    rel === '..' ||
    rel.startsWith('..' + path.sep) ||
    rel.startsWith('../') ||
    path.isAbsolute(rel)
  );
}

/**
 * True when `target`, resolved against `root`, is one of the PROTECTED_INTREE
 * paths (exact file, or under a protected directory prefix). Fails open on
 * namespace mismatch, same as isOutsideRoot — and returns false for anything
 * out of tree (that is isOutsideRoot's job, with its own message).
 */
function isProtectedInTree(root, target) {
  if (namespacesDiffer(root, target)) return false;
  const resolvedRoot = path.resolve(canonical(root));
  const resolvedTarget = path.resolve(resolvedRoot, target);
  let rel = path.relative(resolvedRoot, resolvedTarget);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return false;
  rel = rel.split(path.sep).join('/');
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
const REDIRECT_RE =
  /(?:^|[\s;|&(])(?:[0-9]+|&)?>>?\s*("[^"]*"|'[^']*'|[^\s;|&<>()]+)/g;
// `tee [-opts] FILE` — first non-option token after tee.
const TEE_RE =
  /(?:^|[\s;|&(])tee\b((?:\s+-{1,2}\S+)*)\s+("[^"]*"|'[^']*'|[^\s;|&<>()]+)/g;
// `dd … of=FILE`.
const DD_RE =
  /(?:^|[\s;|&(])dd\b[^;|&]*?\bof=("[^"]*"|'[^']*'|[^\s;|&<>()]+)/gi;

/**
 * Collect candidate write-target paths from a Bash command string: output
 * redirections, `tee`, `dd of=`, and the destination of `cp`/`mv`. Best-effort
 * — see the file header. Device sinks (`/dev/null`, …) are filtered out.
 */
function collectBashWriteTargets(command) {
  const targets = [];
  let m;

  REDIRECT_RE.lastIndex = 0;
  while ((m = REDIRECT_RE.exec(command)) !== null) {
    targets.push(stripQuotes(m[1]));
  }
  TEE_RE.lastIndex = 0;
  while ((m = TEE_RE.exec(command)) !== null) {
    targets.push(stripQuotes(m[2]));
  }
  DD_RE.lastIndex = 0;
  while ((m = DD_RE.exec(command)) !== null) {
    targets.push(stripQuotes(m[1]));
  }

  // cp / mv destination: the last non-option token of the command segment.
  for (const segment of command.split(/(?:;|\|\||&&|\||&)/)) {
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
        for (const t of toks.slice(1)) {
          if (t.startsWith('-')) continue;
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
  // sets AWOS_CONTAINMENT_OFF=1 and the guard fails open for every call.
  if (process.env.AWOS_CONTAINMENT_OFF === '1') {
    process.exit(EXIT_ALLOW);
  }

  const raw = readStdin();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    // Unparseable input: fail open. The guard never breaks tools on
    // unexpected payloads — it only ever denies a clearly-identified crossing.
    process.exit(EXIT_ALLOW);
  }

  const tool = payload.tool_name;
  const input = payload.tool_input || {};
  // The containment boundary is the project directory. Claude Code exposes it
  // as CLAUDE_PROJECT_DIR; fall back to the hook payload's cwd, then process cwd.
  const root = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();

  // Out-of-tree + protected-in-tree write check (Write/Edit family).
  if (WRITE_TOOLS.has(tool)) {
    const target = input.file_path || input.notebook_path;
    if (target && isOutsideRoot(root, String(target))) {
      block(
        `blocked an out-of-tree ${tool} to "${target}" — the target resolves ` +
          `outside the project directory (${root}). If this is intentional, ` +
          `set AWOS_CONTAINMENT_OFF=1 or remove the AWOS PreToolUse hook from ` +
          `.claude/settings.json.`
      );
    }
    if (target && isProtectedInTree(root, String(target))) {
      block(
        `blocked a ${tool} to protected in-tree path "${target}" — writing the ` +
          `guard's own script, the hook registration in .claude/settings.json, ` +
          `or a persistence sink (.git/hooks, .github/workflows) would disarm ` +
          `containment or plant durable execution. If intentional, set ` +
          `AWOS_CONTAINMENT_OFF=1 or remove the AWOS PreToolUse hook.`
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
          `is intentional, set AWOS_CONTAINMENT_OFF=1 or remove the hook. ` +
          `(Best-effort check: an interpreter can still evade it.)`
      );
    }
    const protTarget = bashProtectedTarget(input.command, root);
    if (protTarget) {
      block(
        `blocked a ${tool} command that writes protected in-tree path ` +
          `"${protTarget}": ${input.command.trim().slice(0, 200)}. A ` +
          `redirect/copy into the guard's own files, the hook registration, ` +
          `or a persistence sink (.git/hooks, .github/workflows) would disarm ` +
          `containment or plant durable execution. If intentional, set ` +
          `AWOS_CONTAINMENT_OFF=1. (Best-effort check: an interpreter can ` +
          `still evade it.)`
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

  process.exit(EXIT_ALLOW);
}

main();
