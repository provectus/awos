#!/usr/bin/env node

// node_modules/smol-toml/dist/date.js
var DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})?[T ]?(?:(\d{2}):\d{2}(?::\d{2}(?:\.\d+)?)?)?(Z|[-+]\d{2}:\d{2})?$/i;
var TomlDate = class _TomlDate extends Date {
  #hasDate = false;
  #hasTime = false;
  #offset = null;
  constructor(date) {
    let hasDate = true;
    let hasTime = true;
    let offset = "Z";
    if (typeof date === "string") {
      let match = date.match(DATE_TIME_RE);
      if (match) {
        if (!match[1]) {
          hasDate = false;
          date = `0000-01-01T${date}`;
        }
        hasTime = !!match[2];
        hasTime && date[10] === " " && (date = date.replace(" ", "T"));
        if (match[2] && +match[2] > 23) {
          date = "";
        } else {
          offset = match[3] || null;
          date = date.toUpperCase();
          if (!offset && hasTime)
            date += "Z";
        }
      } else {
        date = "";
      }
    }
    super(date);
    if (!isNaN(this.getTime())) {
      this.#hasDate = hasDate;
      this.#hasTime = hasTime;
      this.#offset = offset;
    }
  }
  isDateTime() {
    return this.#hasDate && this.#hasTime;
  }
  isLocal() {
    return !this.#hasDate || !this.#hasTime || !this.#offset;
  }
  isDate() {
    return this.#hasDate && !this.#hasTime;
  }
  isTime() {
    return this.#hasTime && !this.#hasDate;
  }
  isValid() {
    return this.#hasDate || this.#hasTime;
  }
  toISOString() {
    let iso = super.toISOString();
    if (this.isDate())
      return iso.slice(0, 10);
    if (this.isTime())
      return iso.slice(11, 23);
    if (this.#offset === null)
      return iso.slice(0, -1);
    if (this.#offset === "Z")
      return iso;
    let offset = +this.#offset.slice(1, 3) * 60 + +this.#offset.slice(4, 6);
    offset = this.#offset[0] === "-" ? offset : -offset;
    let offsetDate = new Date(this.getTime() - offset * 6e4);
    return offsetDate.toISOString().slice(0, -1) + this.#offset;
  }
  static wrapAsOffsetDateTime(jsDate, offset = "Z") {
    let date = new _TomlDate(jsDate);
    date.#offset = offset;
    return date;
  }
  static wrapAsLocalDateTime(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#offset = null;
    return date;
  }
  static wrapAsLocalDate(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#hasTime = false;
    date.#offset = null;
    return date;
  }
  static wrapAsLocalTime(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#hasDate = false;
    date.#offset = null;
    return date;
  }
};

// node_modules/smol-toml/dist/error.js
function getLineColFromPtr(string, ptr) {
  let lines = string.slice(0, ptr).split(/\r\n|\n|\r/g);
  return [lines.length, lines.pop().length + 1];
}
function makeCodeBlock(string, line, column) {
  let lines = string.split(/\r\n|\n|\r/g);
  let codeblock = "";
  let numberLen = (Math.log10(line + 1) | 0) + 1;
  for (let i = line - 1; i <= line + 1; i++) {
    let l = lines[i - 1];
    if (!l)
      continue;
    codeblock += i.toString().padEnd(numberLen, " ");
    codeblock += ":  ";
    codeblock += l;
    codeblock += "\n";
    if (i === line) {
      codeblock += " ".repeat(numberLen + column + 2);
      codeblock += "^\n";
    }
  }
  return codeblock;
}
var TomlError = class extends Error {
  line;
  column;
  codeblock;
  constructor(message, options) {
    const [line, column] = getLineColFromPtr(options.toml, options.ptr);
    const codeblock = makeCodeBlock(options.toml, line, column);
    super(`Invalid TOML document: ${message}

${codeblock}`, options);
    this.line = line;
    this.column = column;
    this.codeblock = codeblock;
  }
};

// node_modules/smol-toml/dist/primitive.js
var INT_REGEX = /^((0x[0-9a-fA-F](_?[0-9a-fA-F])*)|(([+-]|0[ob])?\d(_?\d)*))$/;
var FLOAT_REGEX = /^[+-]?\d(_?\d)*(\.\d(_?\d)*)?([eE][+-]?\d(_?\d)*)?$/;
var LEADING_ZERO = /^[+-]?0[0-9_]/;
function parseString(str, ptr) {
  let c = str[ptr++];
  let first = c;
  let isLiteral = c === "'";
  let isMultiline = c === str[ptr] && c === str[ptr + 1];
  if (isMultiline) {
    if (str[ptr += 2] === "\n")
      ptr++;
    else if (str[ptr] === "\r" && str[ptr + 1] === "\n")
      ptr += 2;
  }
  let parsed = "";
  let sliceStart = ptr;
  let state = 0;
  for (let i = ptr; i < str.length; i++) {
    c = str[i];
    if (isMultiline && (c === "\n" || c === "\r" && str[i + 1] === "\n")) {
      state = state && 3;
    } else if (c < " " && c !== "	" || c === "\x7F") {
      throw new TomlError("control characters are not allowed in strings", {
        toml: str,
        ptr: i
      });
    } else if ((!state || state === 3) && c === first && (!isMultiline || str[i + 1] === first && str[i + 2] === first)) {
      if (isMultiline) {
        if (str[i + 3] === first)
          i++;
        if (str[i + 3] === first)
          i++;
      }
      return [
        // If we're in a newline escape still, then there's nothing to add.
        // Also try to avoid concat if there's nothing to add to parsed, or nothing has been added to parsed.
        state ? parsed : parsed + str.slice(sliceStart, i),
        i + (isMultiline ? 3 : 1)
      ];
    } else if (!state) {
      if (!isLiteral && c === "\\") {
        parsed += str.slice(sliceStart, sliceStart = i);
        state = 1;
      }
    } else if (state === 1) {
      if (c === "x" || c === "u" || c === "U") {
        let value = 0;
        let len = c === "x" ? 2 : c === "u" ? 4 : 8;
        for (let j = 0; j < len; j++, i++) {
          let hex = str.charCodeAt(i + 1);
          let digit = (
            /* 0-9 */
            hex >= 48 && hex <= 57 ? hex - 48 : (
              /* A-F */
              hex >= 65 && hex <= 70 ? hex - 65 + 10 : (
                /* a-f */
                hex >= 97 && hex <= 102 ? hex - 97 + 10 : -1
              )
            )
          );
          if (digit < 0)
            throw new TomlError("invalid non-hex character in unicode escape", { toml: str, ptr: i + 1 });
          value = value << 4 | digit;
        }
        if (value < 0 || value > 1114111 || value >= 55296 && value <= 57343) {
          throw new TomlError("invalid unicode escape", { toml: str, ptr: i });
        }
        parsed += String.fromCodePoint(value);
        sliceStart = i + 1;
        state = 0;
      } else if (c === " " || c === "	") {
        state = 2;
      } else {
        if (c === "b")
          parsed += "\b";
        else if (c === "t")
          parsed += "	";
        else if (c === "n")
          parsed += "\n";
        else if (c === "f")
          parsed += "\f";
        else if (c === "r")
          parsed += "\r";
        else if (c === "e")
          parsed += "\x1B";
        else if (c === '"')
          parsed += '"';
        else if (c === "\\")
          parsed += "\\";
        else
          throw new TomlError("unrecognized escape sequence", { toml: str, ptr: i });
        sliceStart = i + 1;
        state = 0;
      }
    } else if (c !== " " && c !== "	") {
      if (state === 2) {
        throw new TomlError("invalid escape: only line-ending whitespace may be escaped", {
          toml: str,
          ptr: sliceStart
        });
      }
      state = !isLiteral && c === "\\" ? 1 : 0;
      sliceStart = i;
    }
  }
  throw new TomlError("unfinished string", { toml: str, ptr });
}
function parseValue(value, toml, ptr, integersAsBigInt) {
  if (value === "true")
    return true;
  if (value === "false")
    return false;
  if (value === "-inf")
    return -Infinity;
  if (value === "inf" || value === "+inf")
    return Infinity;
  if (value === "nan" || value === "+nan" || value === "-nan")
    return NaN;
  if (value === "-0")
    return integersAsBigInt ? 0n : 0;
  let isInt = INT_REGEX.test(value);
  if (isInt || FLOAT_REGEX.test(value)) {
    if (LEADING_ZERO.test(value)) {
      throw new TomlError("leading zeroes are not allowed", {
        toml,
        ptr
      });
    }
    value = value.replace(/_/g, "");
    let numeric = +value;
    if (isNaN(numeric)) {
      throw new TomlError("invalid number", {
        toml,
        ptr
      });
    }
    if (isInt) {
      if ((isInt = !Number.isSafeInteger(numeric)) && !integersAsBigInt) {
        throw new TomlError("integer value cannot be represented losslessly", {
          toml,
          ptr
        });
      }
      if (isInt || integersAsBigInt === true)
        numeric = BigInt(value);
    }
    return numeric;
  }
  const date = new TomlDate(value);
  if (!date.isValid()) {
    throw new TomlError("invalid value", {
      toml,
      ptr
    });
  }
  return date;
}

// node_modules/smol-toml/dist/util.js
function indexOfNewline(str, start = 0, end = str.length) {
  let idx = str.indexOf("\n", start);
  if (str[idx - 1] === "\r")
    idx--;
  return idx <= end ? idx : -1;
}
function skipComment(str, ptr) {
  for (let i = ptr; i < str.length; i++) {
    let c = str[i];
    if (c === "\n")
      return i;
    if (c === "\r" && str[i + 1] === "\n")
      return i + 1;
    if (c < " " && c !== "	" || c === "\x7F") {
      throw new TomlError("control characters are not allowed in comments", {
        toml: str,
        ptr
      });
    }
  }
  return str.length;
}
function skipVoid(str, ptr, banNewLines, banComments) {
  let c;
  while (1) {
    while ((c = str[ptr]) === " " || c === "	" || !banNewLines && (c === "\n" || c === "\r" && str[ptr + 1] === "\n"))
      ptr++;
    if (banComments || c !== "#")
      break;
    ptr = skipComment(str, ptr);
  }
  return ptr;
}
function skipUntil(str, ptr, sep, end, banNewLines = false) {
  if (!end) {
    ptr = indexOfNewline(str, ptr);
    return ptr < 0 ? str.length : ptr;
  }
  for (let i = ptr; i < str.length; i++) {
    let c = str[i];
    if (c === "#") {
      i = indexOfNewline(str, i);
    } else if (c === sep) {
      return i + 1;
    } else if (c === end || banNewLines && (c === "\n" || c === "\r" && str[i + 1] === "\n")) {
      return i;
    }
  }
  throw new TomlError("cannot find end of structure", {
    toml: str,
    ptr
  });
}

// node_modules/smol-toml/dist/extract.js
function sliceAndTrimEndOf(str, startPtr, endPtr) {
  let value = str.slice(startPtr, endPtr);
  let commentIdx = value.indexOf("#");
  if (commentIdx > -1) {
    skipComment(str, commentIdx);
    value = value.slice(0, commentIdx);
  }
  return [value.trimEnd(), commentIdx];
}
function extractValue(str, ptr, end, depth, integersAsBigInt) {
  if (depth === 0) {
    throw new TomlError("document contains excessively nested structures. aborting.", {
      toml: str,
      ptr
    });
  }
  let c = str[ptr];
  if (c === "[" || c === "{") {
    let [value, endPtr2] = c === "[" ? parseArray(str, ptr, depth, integersAsBigInt) : parseInlineTable(str, ptr, depth, integersAsBigInt);
    if (end) {
      endPtr2 = skipVoid(str, endPtr2);
      if (str[endPtr2] === ",")
        endPtr2++;
      else if (str[endPtr2] !== end) {
        throw new TomlError("expected comma or end of structure", {
          toml: str,
          ptr: endPtr2
        });
      }
    }
    return [value, endPtr2];
  }
  if (c === '"' || c === "'") {
    let [parsed, endPtr2] = parseString(str, ptr);
    if (end) {
      endPtr2 = skipVoid(str, endPtr2);
      if (str[endPtr2] && str[endPtr2] !== "," && str[endPtr2] !== end && str[endPtr2] !== "\n" && str[endPtr2] !== "\r") {
        throw new TomlError("unexpected character encountered", {
          toml: str,
          ptr: endPtr2
        });
      }
      if (str[endPtr2] === ",")
        endPtr2++;
    }
    return [parsed, endPtr2];
  }
  let endPtr = skipUntil(str, ptr, ",", end);
  let slice = sliceAndTrimEndOf(str, ptr, endPtr - (str[endPtr - 1] === "," ? 1 : 0));
  if (!slice[0]) {
    throw new TomlError("incomplete key-value declaration: no value specified", {
      toml: str,
      ptr
    });
  }
  if (end && slice[1] > -1) {
    endPtr = skipVoid(str, ptr + slice[1]);
    if (str[endPtr] === ",")
      endPtr++;
  }
  return [
    parseValue(slice[0], str, ptr, integersAsBigInt),
    endPtr
  ];
}

// node_modules/smol-toml/dist/struct.js
var KEY_PART_RE = /^[a-zA-Z0-9-_]+[ \t]*$/;
function parseKey(str, ptr, end = "=") {
  let dot = ptr - 1;
  let parsed = [];
  let endPtr = str.indexOf(end, ptr);
  if (endPtr < 0) {
    throw new TomlError("incomplete key-value: cannot find end of key", {
      toml: str,
      ptr
    });
  }
  do {
    let c = str[ptr = ++dot];
    if (c !== " " && c !== "	") {
      if (c === '"' || c === "'") {
        if (c === str[ptr + 1] && c === str[ptr + 2]) {
          throw new TomlError("multiline strings are not allowed in keys", {
            toml: str,
            ptr
          });
        }
        let [part, eos] = parseString(str, ptr);
        dot = str.indexOf(".", eos);
        let strEnd = str.slice(eos, dot < 0 || dot > endPtr ? endPtr : dot);
        let newLine = indexOfNewline(strEnd);
        if (newLine > -1) {
          throw new TomlError("newlines are not allowed in keys", {
            toml: str,
            ptr: ptr + dot + newLine
          });
        }
        if (strEnd.trimStart()) {
          throw new TomlError("found extra tokens after the string part", {
            toml: str,
            ptr: eos
          });
        }
        if (endPtr < eos) {
          endPtr = str.indexOf(end, eos);
          if (endPtr < 0) {
            throw new TomlError("incomplete key-value: cannot find end of key", {
              toml: str,
              ptr
            });
          }
        }
        parsed.push(part);
      } else {
        dot = str.indexOf(".", ptr);
        let part = str.slice(ptr, dot < 0 || dot > endPtr ? endPtr : dot);
        if (!KEY_PART_RE.test(part)) {
          throw new TomlError("only letter, numbers, dashes and underscores are allowed in keys", {
            toml: str,
            ptr
          });
        }
        parsed.push(part.trimEnd());
      }
    }
  } while (dot + 1 && dot < endPtr);
  return [parsed, skipVoid(str, endPtr + 1, true, true)];
}
function parseInlineTable(str, ptr, depth, integersAsBigInt) {
  let res = {};
  let seen = /* @__PURE__ */ new Set();
  let c;
  ptr++;
  while ((c = str[ptr++]) !== "}" && c) {
    if (c === ",") {
      throw new TomlError("expected value, found comma", {
        toml: str,
        ptr: ptr - 1
      });
    } else if (c === "#")
      ptr = skipComment(str, ptr);
    else if (c !== " " && c !== "	" && c !== "\n" && c !== "\r") {
      let k;
      let t = res;
      let hasOwn = false;
      let [key, keyEndPtr] = parseKey(str, ptr - 1);
      for (let i = 0; i < key.length; i++) {
        if (i)
          t = hasOwn ? t[k] : t[k] = {};
        k = key[i];
        if ((hasOwn = Object.hasOwn(t, k)) && (typeof t[k] !== "object" || seen.has(t[k]))) {
          throw new TomlError("trying to redefine an already defined value", {
            toml: str,
            ptr
          });
        }
        if (!hasOwn && k === "__proto__") {
          Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        }
      }
      if (hasOwn) {
        throw new TomlError("trying to redefine an already defined value", {
          toml: str,
          ptr
        });
      }
      let [value, valueEndPtr] = extractValue(str, keyEndPtr, "}", depth - 1, integersAsBigInt);
      seen.add(value);
      t[k] = value;
      ptr = valueEndPtr;
    }
  }
  if (!c) {
    throw new TomlError("unfinished table encountered", {
      toml: str,
      ptr
    });
  }
  return [res, ptr];
}
function parseArray(str, ptr, depth, integersAsBigInt) {
  let res = [];
  let c;
  ptr++;
  while ((c = str[ptr++]) !== "]" && c) {
    if (c === ",") {
      throw new TomlError("expected value, found comma", {
        toml: str,
        ptr: ptr - 1
      });
    } else if (c === "#")
      ptr = skipComment(str, ptr);
    else if (c !== " " && c !== "	" && c !== "\n" && c !== "\r") {
      let e = extractValue(str, ptr - 1, "]", depth - 1, integersAsBigInt);
      res.push(e[0]);
      ptr = e[1];
    }
  }
  if (!c) {
    throw new TomlError("unfinished array encountered", {
      toml: str,
      ptr
    });
  }
  return [res, ptr];
}

// node_modules/smol-toml/dist/parse.js
function peekTable(key, table, meta, type) {
  let t = table;
  let m = meta;
  let k;
  let hasOwn = false;
  let state;
  for (let i = 0; i < key.length; i++) {
    if (i) {
      t = hasOwn ? t[k] : t[k] = {};
      m = (state = m[k]).c;
      if (type === 0 && (state.t === 1 || state.t === 2)) {
        return null;
      }
      if (state.t === 2) {
        let l = t.length - 1;
        t = t[l];
        m = m[l].c;
      }
    }
    k = key[i];
    if ((hasOwn = Object.hasOwn(t, k)) && m[k]?.t === 0 && m[k]?.d) {
      return null;
    }
    if (!hasOwn) {
      if (k === "__proto__") {
        Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        Object.defineProperty(m, k, { enumerable: true, configurable: true, writable: true });
      }
      m[k] = {
        t: i < key.length - 1 && type === 2 ? 3 : type,
        d: false,
        i: 0,
        c: {}
      };
    }
  }
  state = m[k];
  if (state.t !== type && !(type === 1 && state.t === 3)) {
    return null;
  }
  if (type === 2) {
    if (!state.d) {
      state.d = true;
      t[k] = [];
    }
    t[k].push(t = {});
    state.c[state.i++] = state = { t: 1, d: false, i: 0, c: {} };
  }
  if (state.d) {
    return null;
  }
  state.d = true;
  if (type === 1) {
    t = hasOwn ? t[k] : t[k] = {};
  } else if (type === 0 && hasOwn) {
    return null;
  }
  return [k, t, state.c];
}
function parse(toml, { maxDepth = 1e3, integersAsBigInt } = {}) {
  let res = {};
  let meta = {};
  let tbl = res;
  let m = meta;
  for (let ptr = skipVoid(toml, 0); ptr < toml.length; ) {
    if (toml[ptr] === "[") {
      let isTableArray = toml[++ptr] === "[";
      let k = parseKey(toml, ptr += +isTableArray, "]");
      if (isTableArray) {
        if (toml[k[1] - 1] !== "]") {
          throw new TomlError("expected end of table declaration", {
            toml,
            ptr: k[1] - 1
          });
        }
        k[1]++;
      }
      let p = peekTable(
        k[0],
        res,
        meta,
        isTableArray ? 2 : 1
        /* Type.EXPLICIT */
      );
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr
        });
      }
      m = p[2];
      tbl = p[1];
      ptr = k[1];
    } else {
      let k = parseKey(toml, ptr);
      let p = peekTable(
        k[0],
        tbl,
        m,
        0
        /* Type.DOTTED */
      );
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr
        });
      }
      let v = extractValue(toml, k[1], void 0, maxDepth, integersAsBigInt);
      p[1][p[0]] = v[0];
      ptr = v[1];
    }
    ptr = skipVoid(toml, ptr, true);
    if (toml[ptr] && toml[ptr] !== "\n" && toml[ptr] !== "\r") {
      throw new TomlError("each key-value declaration must be followed by an end-of-line", {
        toml,
        ptr
      });
    }
    ptr = skipVoid(toml, ptr);
  }
  return res;
}

// plugins/awos/skills/ai-readiness-audit/cli.ts
import { readFileSync as readFileSync28, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as join28, dirname as dirname3 } from "node:path";
import { fileURLToPath } from "node:url";

// plugins/awos/skills/ai-readiness-audit/collectors/git.ts
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join as join2 } from "node:path";

// plugins/awos/skills/ai-readiness-audit/collectors/_base.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
function makeArtifact(source, available, reasonIfAbsent, period, raw) {
  return {
    source,
    available: Boolean(available),
    reason_if_absent: reasonIfAbsent,
    period: {
      bucket_days: period.bucket_days,
      lookback_days: period.lookback_days,
      history_available_days: period.history_available_days
    },
    raw
  };
}
function writeArtifact(artifact, outDir) {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `${artifact.source}.json`);
  writeFileSync(path, JSON.stringify(artifact, null, 2));
  return path;
}

// plugins/awos/skills/ai-readiness-audit/collectors/git.ts
function run(args, cwd) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8" });
  } catch {
    return "";
  }
}
function parseDate(s) {
  return new Date(s.trim());
}
function daysBetween(d1, d2) {
  return Math.round((d2.getTime() - d1.getTime()) / 864e5);
}
function getDefaultBranch(cwd) {
  const out = run(["symbolic-ref", "--short", "HEAD"], cwd).trim();
  return out || "main";
}
function getTotalCommits(cwd) {
  const out = run(["rev-list", "--count", "HEAD"], cwd).trim();
  const n = parseInt(out, 10);
  return isNaN(n) ? 0 : n;
}
function getAiMarkedCommits(cwd) {
  const patterns = [
    "Co-authored-by: Claude",
    "Co-authored-by:.*[Aa]ssistant",
    "Co-authored-by:.*claude@anthropic"
  ];
  const matchedSHAs = /* @__PURE__ */ new Set();
  for (const pat of patterns) {
    const out = run(
      [
        "log",
        "--all-match",
        "--regexp-ignore-case",
        `--grep=${pat}`,
        "--format=%H"
      ],
      cwd
    );
    for (const sha of out.trim().split("\n").filter(Boolean)) {
      matchedSHAs.add(sha);
    }
  }
  return matchedSHAs.size;
}
var TOOLING_CANDIDATES = [
  "CLAUDE.md",
  "AGENTS.md",
  ".claude/skills",
  ".claude/commands",
  ".claude/hooks",
  ".mcp.json"
];
function getToolingPaths(repoPath) {
  return TOOLING_CANDIDATES.filter((p) => existsSync(join2(repoPath, p)));
}
function getMergeStats(cwd) {
  const allMerges = run(
    ["log", "--first-parent", "--merges", "--format=%H"],
    cwd
  ).trim().split("\n").filter(Boolean);
  const total_merges = allMerges.length;
  const revertOut = run(
    [
      "log",
      "--first-parent",
      "--merges",
      "--grep=^Revert\\|hotfix\\|rollback",
      "--format=%H"
    ],
    cwd
  ).trim().split("\n").filter(Boolean);
  const revert_merges = revertOut.length;
  return { total_merges, revert_merges };
}
function getMergeRecords(cwd) {
  const mergeOut = run(
    ["log", "--first-parent", "--merges", "--format=%H %cI"],
    cwd
  ).trim().split("\n").filter(Boolean);
  const records = [];
  for (const line of mergeOut) {
    const [sha, mergedAt] = line.split(" ");
    if (!sha || !mergedAt) continue;
    const sideOut = run(["log", "--format=%cI", `${sha}^1..${sha}^2`], cwd).trim().split("\n").filter(Boolean);
    if (sideOut.length === 0) continue;
    const dates = sideOut.map((d) => new Date(d)).filter((d) => !isNaN(d.getTime()));
    if (dates.length === 0) continue;
    const earliest = new Date(Math.min(...dates.map((d) => d.getTime())));
    records.push({
      merged_at: mergedAt,
      branch_first_commit_at: earliest.toISOString()
    });
  }
  return records;
}
function buildMonthlyBuckets(cwd, period) {
  const latestDateStr = run(
    ["log", "--all", "--format=%cI", "--max-count=1"],
    cwd
  ).trim();
  if (!latestDateStr) return [];
  const latestCommitDate = parseDate(latestDateStr);
  if (isNaN(latestCommitDate.getTime())) return [];
  const lookback = period.lookback_days;
  const since = new Date(
    latestCommitDate.getTime() - lookback * 864e5
  ).toISOString();
  const logOut = run(
    ["log", "--all", `--since=${since}`, "--format=%H	%aN	%cI	%P"],
    cwd
  ).trim().split("\n").filter(Boolean);
  if (logOut.length === 0) return [];
  const rows = [];
  for (const line of logOut) {
    const parts = line.split("	");
    const [sha, author, dateStr, parents = ""] = parts;
    if (!sha || !author || !dateStr) continue;
    const date = parseDate(dateStr);
    if (isNaN(date.getTime())) continue;
    rows.push({
      sha,
      author,
      date,
      isMerge: parents.trim().split(" ").length > 1
    });
  }
  if (rows.length === 0) return [];
  const newest = new Date(Math.max(...rows.map((r) => r.date.getTime())));
  const oldest = new Date(Math.min(...rows.map((r) => r.date.getTime())));
  const bucketMs = period.bucket_days * 864e5;
  const buckets = [];
  let bucketEnd = newest;
  while (bucketEnd >= oldest) {
    const bucketStart = new Date(bucketEnd.getTime() - bucketMs);
    const inBucket = rows.filter(
      (r) => r.date > bucketStart && r.date <= bucketEnd
    );
    if (inBucket.length > 0) {
      const authors = new Set(inBucket.map((r) => r.author)).size;
      buckets.push({
        bucket_start: bucketStart.toISOString(),
        authors,
        commits: inBucket.length,
        merges: inBucket.filter((r) => r.isMerge).length
      });
    }
    bucketEnd = bucketStart;
  }
  return buckets.reverse();
}
function getNumstatTotals(cwd) {
  const out = run(["log", "--numstat", "--format="], cwd);
  let added = 0;
  let deleted = 0;
  for (const line of out.split("\n")) {
    const m = line.match(/^(\d+)\s+(\d+)\s+/);
    if (m) {
      added += parseInt(m[1], 10);
      deleted += parseInt(m[2], 10);
    }
  }
  return { added, deleted };
}
function getHistoryAvailableDays(cwd) {
  const allDates = run(["log", "--all", "--format=%cI"], cwd).trim().split("\n").filter(Boolean).map((s) => parseDate(s)).filter((d) => !isNaN(d.getTime()));
  if (allDates.length < 2) return 0;
  const ts = allDates.map((d) => d.getTime());
  const earliest = new Date(Math.min(...ts));
  const latest = new Date(Math.max(...ts));
  return Math.max(0, daysBetween(earliest, latest));
}
function collect(repoPath, period) {
  const default_branch = getDefaultBranch(repoPath);
  const total_commits = getTotalCommits(repoPath);
  const ai_marked_commits = getAiMarkedCommits(repoPath);
  const tooling_paths = getToolingPaths(repoPath);
  const { total_merges, revert_merges } = getMergeStats(repoPath);
  const merge_records = getMergeRecords(repoPath);
  const monthly_buckets = buildMonthlyBuckets(repoPath, period);
  const numstat_totals = getNumstatTotals(repoPath);
  const history_available_days = getHistoryAvailableDays(repoPath);
  const raw = {
    default_branch,
    total_commits,
    ai_marked_commits,
    total_merges,
    revert_merges,
    tooling_paths,
    merge_records,
    monthly_buckets,
    numstat_totals
  };
  return makeArtifact(
    "git",
    true,
    null,
    { ...period, history_available_days },
    raw
  );
}

// plugins/awos/skills/ai-readiness-audit/collectors/ci.ts
import { existsSync as existsSync2 } from "node:fs";
import { join as join3 } from "node:path";
var CI_CONFIG_CANDIDATES = [
  ".github/workflows",
  ".gitlab-ci.yml",
  "Jenkinsfile"
];
function detectCiConfig(repoPath) {
  for (const candidate of CI_CONFIG_CANDIDATES) {
    if (existsSync2(join3(repoPath, candidate))) {
      return candidate;
    }
  }
  return null;
}
function collect2(repoPath, period, connector) {
  const configPath = detectCiConfig(repoPath);
  const hasConfig = configPath !== null;
  const hasConnector = connector !== void 0 && connector !== null;
  if (!hasConfig && !hasConnector) {
    return makeArtifact(
      "ci",
      false,
      "no CI config (.github/workflows, .gitlab-ci.yml, Jenkinsfile) or connector found",
      { ...period, history_available_days: period.history_available_days },
      {}
    );
  }
  const runs = connector?.runs ?? [];
  const raw = {
    config_detected: hasConfig,
    config_path: configPath,
    runs
  };
  return makeArtifact("ci", true, null, period, raw);
}

// plugins/awos/skills/ai-readiness-audit/collectors/tracker.ts
function buildTypeCounts(tickets) {
  const counts = {};
  for (const t of tickets) {
    const key = (t.type ?? "unknown").toLowerCase();
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
function countResolved(tickets) {
  return tickets.filter(
    (t) => t.status?.toLowerCase() === "done" || t.resolved_at != null
  ).length;
}
function collect3(_repoPath, period, connector) {
  if (connector === void 0 || connector === null) {
    return makeArtifact(
      "tracker",
      false,
      "no tracker connector provided; supply a Jira/Linear/GitHub Issues connector to enable work-mix and throughput metrics",
      { ...period, history_available_days: period.history_available_days },
      {}
    );
  }
  const tickets = connector.tickets ?? [];
  const incident_source = connector.incident_source ?? null;
  const raw = {
    tickets,
    type_counts: buildTypeCounts(tickets),
    resolved_count: countResolved(tickets),
    incident_source
  };
  return makeArtifact("tracker", true, null, period, raw);
}

// plugins/awos/skills/ai-readiness-audit/collectors/docs.ts
function countRecentlyUpdated(pages, lookbackDays) {
  const cutoff = new Date(Date.now() - lookbackDays * 864e5);
  return pages.filter((p) => {
    if (!p.updated_at) return false;
    const d = new Date(p.updated_at);
    return !isNaN(d.getTime()) && d >= cutoff;
  }).length;
}
function collect4(_repoPath, period, connector) {
  if (connector === void 0 || connector === null) {
    return makeArtifact(
      "docs",
      false,
      "no docs connector provided; supply a Confluence/Notion/GitBook connector to enable documentation coverage metrics",
      { ...period, history_available_days: period.history_available_days },
      {}
    );
  }
  const pages = connector.pages ?? [];
  const recently_updated_count = countRecentlyUpdated(
    pages,
    period.lookback_days
  );
  const raw = {
    pages,
    page_count: pages.length,
    recently_updated_count
  };
  return makeArtifact("docs", true, null, period, raw);
}

// plugins/awos/skills/ai-readiness-audit/detectors/_base.ts
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { execFileSync as execFileSync2 } from "node:child_process";
var VALID_STATUS = /* @__PURE__ */ new Set(["PASS", "WARN", "FAIL", "SKIP"]);
var DEFAULT_IGNORE = [
  ".git",
  "node_modules",
  "dist",
  "build",
  ".venv",
  "__pycache__",
  ".next",
  "target"
];
function makeResult(status, value, evidence, method = "detected") {
  if (!VALID_STATUS.has(status)) {
    throw new Error(
      `status must be one of ${[...VALID_STATUS].sort()}, got ${status}`
    );
  }
  return { status, value, evidence: [...evidence], method };
}
function iterFiles(repoPath, globs, ignore = DEFAULT_IGNORE) {
  const pruneArgs = ignore.flatMap((d) => ["-name", d, "-prune", "-o"]);
  const nameArgs = globs.flatMap((g, i) => {
    const bare = g.replace(/^\*\*\//, "");
    return i === 0 ? ["-name", bare] : ["-o", "-name", bare];
  });
  const out = execFileSync2(
    "find",
    [repoPath, ...pruneArgs, "(", ...nameArgs, ")", "-type", "f", "-print"],
    { encoding: "utf8" }
  );
  return out.split("\n").filter(Boolean).sort();
}
function grep(repoPath, pattern, globs, flags = "") {
  const hits = [];
  const rx = new RegExp(pattern.source, pattern.flags || flags);
  for (const p of iterFiles(repoPath, globs)) {
    let text;
    try {
      text = readFileSync(p, "utf8");
    } catch {
      continue;
    }
    text.split("\n").forEach((line, i) => {
      if (rx.test(line))
        hits.push({
          file: relative(repoPath, p),
          line: i + 1,
          text: line.trim()
        });
    });
  }
  return hits.sort(
    (a, b) => a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1
  );
}

// plugins/awos/skills/ai-readiness-audit/detectors/software_best_practices.ts
import { basename, relative as relative2 } from "node:path";
import { readFileSync as readFileSync2 } from "node:fs";
var LINTER_CONFIGS = [
  // JavaScript / TypeScript
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.yaml",
  ".eslintrc.yml",
  ".eslintrc.json",
  "tslint.json",
  // Python
  ".flake8",
  ".pylintrc",
  "pylintrc",
  // Ruby
  ".rubocop.yml",
  // Go
  ".golangci.yml",
  ".golangci.yaml",
  ".golangci.toml"
];
var PYPROJECT_LINTER_RX = /^\[tool\.(ruff|pylint|flake8)\]/m;
function detectLinting(repoPath, _params) {
  const found = iterFiles(repoPath, LINTER_CONFIGS).map((p) => basename(p));
  if (found.length) {
    const uniq = [...new Set(found)].sort();
    return makeResult(
      "PASS",
      uniq.length,
      uniq.map((n) => `linter config found: ${n}`)
    );
  }
  const pyprojects = iterFiles(repoPath, ["pyproject.toml"]);
  for (const p of pyprojects) {
    try {
      const content = readFileSync2(p, "utf8");
      if (PYPROJECT_LINTER_RX.test(content)) {
        return makeResult("PASS", 1, [
          `linter config found in ${relative2(repoPath, p)} ([tool.ruff] or [tool.pylint])`
        ]);
      }
    } catch {
    }
  }
  return makeResult("FAIL", 0, ["no linter configuration found"]);
}
var FORMATTER_CONFIGS = [
  // Prettier
  ".prettierrc",
  ".prettierrc.js",
  ".prettierrc.cjs",
  ".prettierrc.mjs",
  ".prettierrc.json",
  ".prettierrc.json5",
  ".prettierrc.yaml",
  ".prettierrc.yml",
  ".prettierrc.toml",
  "prettier.config.js",
  "prettier.config.cjs",
  "prettier.config.mjs",
  "prettier.config.ts",
  // Rust
  "rustfmt.toml",
  ".rustfmt.toml"
];
var PYPROJECT_FORMATTER_RX = /^\[tool\.(black|ruff\.format)\]/m;
var PRECOMMIT_FORMATTER_RX = /\b(prettier|black|ruff|gofmt|rustfmt|clang-format|autopep8|isort)\b/;
function detectFormatting(repoPath, _params) {
  const found = iterFiles(repoPath, FORMATTER_CONFIGS).map((p) => basename(p));
  if (found.length) {
    const uniq = [...new Set(found)].sort();
    return makeResult(
      "PASS",
      uniq.length,
      uniq.map((n) => `formatter config found: ${n}`)
    );
  }
  const pyprojects = iterFiles(repoPath, ["pyproject.toml"]);
  for (const p of pyprojects) {
    try {
      const content = readFileSync2(p, "utf8");
      if (PYPROJECT_FORMATTER_RX.test(content)) {
        return makeResult("PASS", 1, [
          `formatter config found in ${relative2(repoPath, p)} ([tool.black] or [tool.ruff.format])`
        ]);
      }
    } catch {
    }
  }
  const precommit = iterFiles(repoPath, [".pre-commit-config.yaml"]);
  for (const p of precommit) {
    try {
      const content = readFileSync2(p, "utf8");
      if (PRECOMMIT_FORMATTER_RX.test(content)) {
        return makeResult("PASS", 1, [
          `formatting hook found in ${relative2(repoPath, p)}`
        ]);
      }
    } catch {
    }
  }
  return makeResult("FAIL", 0, ["no formatter configuration found"]);
}
var TYPE_SAFETY_CONFIGS = [
  "mypy.ini",
  ".mypy.ini",
  "pyrightconfig.json",
  "sorbet"
];
var TSCONFIG_STRICT_RX = /"strict"\s*:\s*true|"noImplicitAny"\s*:\s*true/;
function detectTypeSafety(repoPath, _params) {
  const pyTyping = iterFiles(repoPath, TYPE_SAFETY_CONFIGS);
  if (pyTyping.length) {
    const names = pyTyping.map((p) => basename(p)).sort();
    return makeResult(
      "PASS",
      names.length,
      names.map((n) => `type-safety config found: ${n}`)
    );
  }
  const pyprojects = iterFiles(repoPath, ["pyproject.toml"]);
  for (const p of pyprojects) {
    try {
      const content = readFileSync2(p, "utf8");
      if (/^\[tool\.mypy\]/m.test(content)) {
        return makeResult("PASS", 1, [
          `type-safety config found in ${relative2(repoPath, p)} ([tool.mypy])`
        ]);
      }
    } catch {
    }
  }
  const tsconfigs = iterFiles(repoPath, ["tsconfig.json", "tsconfig.*.json"]);
  if (tsconfigs.length) {
    const strictConfigs = [];
    for (const p of tsconfigs) {
      try {
        const content = readFileSync2(p, "utf8");
        if (TSCONFIG_STRICT_RX.test(content)) {
          strictConfigs.push(relative2(repoPath, p));
        }
      } catch {
      }
    }
    if (strictConfigs.length) {
      return makeResult(
        "PASS",
        strictConfigs.length,
        strictConfigs.map((n) => `strict TypeScript config: ${n}`)
      );
    }
    return makeResult("WARN", 0, [
      `tsconfig.json found but strict / noImplicitAny not enabled (${tsconfigs.map((p) => relative2(repoPath, p)).join(", ")})`
    ]);
  }
  return makeResult("FAIL", 0, ["no type-safety configuration found"]);
}
var CICD_ROOT_FILES = [
  ".gitlab-ci.yml",
  ".gitlab-ci.yaml",
  "Jenkinsfile",
  "azure-pipelines.yml",
  "azure-pipelines.yaml"
];
var CICD_SUBDIR_FILENAMES = ["*.yml", "*.yaml"];
function detectCiCd(repoPath, _params) {
  const found = iterFiles(repoPath, CICD_ROOT_FILES);
  if (found.length) {
    const names = [...new Set(found.map((p) => relative2(repoPath, p)))].sort();
    return makeResult(
      "PASS",
      names.length,
      names.map((n) => `CI/CD config found: ${n}`)
    );
  }
  const yamlFiles = iterFiles(repoPath, CICD_SUBDIR_FILENAMES);
  const ciFiles = yamlFiles.filter((p) => {
    const rel = relative2(repoPath, p);
    return rel.startsWith(".github/workflows/") || rel.startsWith(".circleci/") || rel.startsWith(".github\\workflows\\") || rel.startsWith(".circleci\\");
  });
  if (ciFiles.length) {
    const names = ciFiles.map((p) => relative2(repoPath, p)).sort();
    return makeResult(
      "PASS",
      names.length,
      names.map((n) => `CI/CD workflow found: ${n}`)
    );
  }
  return makeResult("FAIL", 0, ["no CI/CD pipeline configuration found"]);
}
var PY2_EXCEPT = /except\s+[A-Za-z_][\w.]*(\s*,\s*[A-Za-z_][\w.]*)+\s*:/;
function detectExceptClauseDefect(repoPath, _params) {
  const hits = grep(repoPath, PY2_EXCEPT, ["**/*.py"]);
  const realHits = hits.filter((h) => !/^\s*#/.test(h.text));
  if (realHits.length) {
    const ev = realHits.map((h) => `${h.file}:${h.line} ${h.text}`);
    return makeResult("FAIL", realHits.length, ev);
  }
  return makeResult("PASS", 0, ["no Python-2 except-clause syntax found"]);
}
var LOCKFILES = [
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  "gradle.lockfile",
  "poetry.lock",
  "uv.lock",
  "Cargo.lock",
  "go.sum"
];
function detectLockfiles(repoPath, _params) {
  const found = iterFiles(repoPath, LOCKFILES).map((p) => basename(p));
  if (found.length) {
    const uniq = [...new Set(found)].sort();
    return makeResult(
      "PASS",
      uniq.length,
      uniq.map((n) => `lock file present: ${n}`)
    );
  }
  return makeResult("FAIL", 0, ["no dependency lock file found"]);
}
var HANDLED_RX = /\b(log|logger|logging|print|console\.(log|warn|error|debug)|raise|throw|re-?raise|return|traceback|sys\.exit|abort|panic)\b/i;
var EXCEPT_OPENER_RX = /^\s*(except\b|catch\s*\(|catch\s*$)/;
var EMPTY_BODY_RX = /^\s*(pass|}\s*$|{\s*}\s*)$/;
function analyseFile(repoPath, filePath) {
  let src;
  try {
    src = readFileSync2(filePath, "utf8");
  } catch {
    return [];
  }
  const lines = src.split("\n");
  const samples = [];
  const rel = relative2(repoPath, filePath);
  for (let i = 0; i < lines.length; i++) {
    if (!EXCEPT_OPENER_RX.test(lines[i])) continue;
    const body = lines.slice(i + 1, i + 5).join("\n");
    const isEmptyFirst = lines[i + 1] !== void 0 && EMPTY_BODY_RX.test(lines[i + 1]);
    const hasHandled = HANDLED_RX.test(body);
    const bad = isEmptyFirst || !hasHandled;
    samples.push({ file: rel, line: i + 1, bad });
  }
  return samples;
}
var SOURCE_GLOBS = [
  "*.py",
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.java",
  "*.kt"
];
function detectErrorHandling(repoPath, _params) {
  const files = iterFiles(repoPath, SOURCE_GLOBS);
  const allSamples = files.flatMap(
    (f) => analyseFile(repoPath, f)
  );
  if (allSamples.length === 0) {
    return makeResult("PASS", 0, [
      "no catch/except blocks found \u2014 nothing to assess"
    ]);
  }
  const badSamples = allSamples.filter((s) => s.bad);
  const badRatio = badSamples.length / allSamples.length;
  const evidence = badSamples.slice(0, 10).map((s) => `${s.file}:${s.line} empty or unhandled catch/except block`);
  if (badRatio >= 0.5) {
    return makeResult("FAIL", badSamples.length, [
      `${badSamples.length}/${allSamples.length} catch/except blocks are empty or unhandled (${Math.round(badRatio * 100)}%)`,
      ...evidence
    ]);
  }
  if (badRatio >= 0.1) {
    return makeResult("WARN", badSamples.length, [
      `${badSamples.length}/${allSamples.length} catch/except blocks are empty or unhandled (${Math.round(badRatio * 100)}%) \u2014 mixed patterns`,
      ...evidence
    ]);
  }
  return makeResult("PASS", allSamples.length - badSamples.length, [
    `${allSamples.length - badSamples.length}/${allSamples.length} catch/except blocks are properly handled`
  ]);
}
var DETECTORS = {
  2700: detectLinting,
  // SBP-01 linting configured
  2701: detectFormatting,
  // SBP-02 formatting automated
  2702: detectTypeSafety,
  // SBP-03 type safety enforced
  2703: detectCiCd,
  // SBP-05 CI/CD pipeline exists
  2704: detectErrorHandling,
  // SBP-06 error-handling consistency
  2705: detectLockfiles,
  // SBP-07 dependency lockfiles
  2706: detectExceptClauseDefect
  // SBP-06 sibling: Python-2 except-clause syntax
};

// plugins/awos/skills/ai-readiness-audit/detectors/code_architecture.ts
import { readFileSync as readFileSync3 } from "node:fs";
import { basename as basename2, dirname, relative as relative3 } from "node:path";
import { execFileSync as execFileSync3 } from "node:child_process";
var ARCH_DOC_PATTERNS = [
  "ARCHITECTURE.md",
  "ARCHITECTURE.rst",
  "architecture.md",
  "architecture.rst"
];
var LAYERED_DIRS = [
  "routes",
  "controllers",
  "handlers",
  "services",
  "repositories",
  "models",
  "domain",
  "infra",
  "infrastructure",
  "application",
  "api",
  "lib",
  "core",
  "adapters",
  "ports",
  "usecases"
];
function detectArchPattern(repoPath, _params) {
  const archDocs = iterFiles(repoPath, ARCH_DOC_PATTERNS);
  if (archDocs.length > 0) {
    const found = archDocs.map((p) => relative3(repoPath, p));
    return makeResult("PASS", archDocs.length, [
      `architecture documentation found: ${found.join(", ")}`
    ]);
  }
  let out;
  try {
    out = execFileSync3(
      "find",
      [repoPath, "-maxdepth", "3", "-type", "d", "-print"],
      { encoding: "utf8" }
    );
  } catch {
    out = "";
  }
  const dirs = out.split("\n").filter(Boolean).map((d) => basename2(d).toLowerCase());
  const layeredMatches = LAYERED_DIRS.filter((layer) => dirs.includes(layer));
  if (layeredMatches.length >= 3) {
    return makeResult("WARN", layeredMatches.length, [
      `recognizable layered directory structure detected (${layeredMatches.length} canonical dirs: ${layeredMatches.join(", ")}) but no explicit architecture document`
    ]);
  }
  return makeResult("FAIL", 0, [
    "no architecture documentation or recognizable layered directory structure found"
  ]);
}
var LAYER_TIERS = {
  models: 0,
  model: 0,
  domain: 0,
  entities: 0,
  entity: 0,
  repositories: 1,
  repository: 1,
  repos: 1,
  repo: 1,
  services: 2,
  service: 2,
  usecases: 2,
  usecase: 2,
  controllers: 3,
  controller: 3,
  handlers: 4,
  handler: 4,
  routes: 5,
  route: 5,
  api: 5
};
var IMPORT_RX = /(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\)|from\s+([^\s]+)\s+import)/;
var SOURCE_GLOBS2 = ["*.ts", "*.tsx", "*.js", "*.jsx", "*.py"];
function getLayerTier(dir) {
  const lower = dir.toLowerCase();
  for (const [key, tier] of Object.entries(LAYER_TIERS)) {
    if (lower === key) return tier;
  }
  for (const [key, tier] of Object.entries(LAYER_TIERS)) {
    if (lower.startsWith(key)) return tier;
  }
  return void 0;
}
function detectImportGraph(repoPath, _params) {
  const files = iterFiles(repoPath, SOURCE_GLOBS2);
  if (files.length === 0) {
    return makeResult("PASS", 0, [
      "no source files found \u2014 no import violations possible"
    ]);
  }
  const violations = [];
  for (const filePath of files) {
    const relPath = relative3(repoPath, filePath);
    const fileDir = basename2(dirname(relPath)).toLowerCase();
    const sourceTier = getLayerTier(fileDir);
    if (sourceTier === void 0) continue;
    let src;
    try {
      src = readFileSync3(filePath, "utf8");
    } catch {
      continue;
    }
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = IMPORT_RX.exec(line);
      if (!m) continue;
      const importPath = (m[1] || m[2] || m[3] || "").trim();
      if (!importPath) continue;
      const parts = importPath.replace(/^(?:\.\.\/)+/, "").replace(/^\.\//, "").split("/");
      const targetDir = parts[0].toLowerCase();
      const targetTier = getLayerTier(targetDir);
      if (targetTier !== void 0 && targetTier > sourceTier) {
        violations.push({
          file: relPath,
          line: i + 1,
          importPath,
          sourceLayer: fileDir,
          targetLayer: targetDir
        });
      }
    }
  }
  if (violations.length === 0) {
    return makeResult("PASS", 0, ["no import layer violations detected"]);
  }
  const evidence = violations.slice(0, 10).map(
    (v) => `${v.file}:${v.line} layer violation: ${v.sourceLayer}/ imports from ${v.targetLayer}/ (${v.importPath})`
  );
  return makeResult("FAIL", violations.length, [
    `${violations.length} import layer violation(s) detected`,
    ...evidence
  ]);
}
var PRESENTATION_DIRS = [
  "routes",
  "route",
  "controllers",
  "controller",
  "handlers",
  "handler",
  "views",
  "view",
  "templates",
  "template",
  "pages",
  "page"
];
var DATA_ACCESS_RX = /\b(?:db|conn|cursor|session|repository|repo)\s*\.\s*(?:query|execute|find|findOne|findAll|filter|get|update|delete|insert|save|add|commit|remove|all|fetchone|fetchall|fetch_one|fetch_all|run)\s*\(/i;
var ORM_STATIC_RX = /\b\w+\s*\.\s*(?:objects\s*\.\s*(?:filter|get|all|exclude|create|update|delete)\s*\(|find(?:One|All|By\w+)\s*\()/i;
var RAW_SQL_RX = /(?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP)\s+\w+/i;
function countDataAccessCalls(content) {
  const lines = content.split("\n");
  let count = 0;
  for (const line of lines) {
    if (/^\s*(?:#|\/\/|\/\*)/.test(line)) continue;
    if (DATA_ACCESS_RX.test(line) || ORM_STATIC_RX.test(line) || RAW_SQL_RX.test(line)) {
      count++;
    }
  }
  return count;
}
function detectSeparationOfConcerns(repoPath, _params) {
  const files = iterFiles(repoPath, SOURCE_GLOBS2);
  const presentationFiles = files.filter((f) => {
    const dir = basename2(dirname(relative3(repoPath, f))).toLowerCase();
    return PRESENTATION_DIRS.some((pd) => dir === pd || dir.startsWith(pd));
  });
  if (presentationFiles.length === 0) {
    return makeResult("PASS", 0, [
      "no route/controller/handler files found \u2014 separation of concerns not checkable"
    ]);
  }
  const failFiles = [];
  const warnFiles = [];
  for (const filePath of presentationFiles) {
    const relPath = relative3(repoPath, filePath);
    let content;
    try {
      content = readFileSync3(filePath, "utf8");
    } catch {
      continue;
    }
    const count = countDataAccessCalls(content);
    if (count >= 3) {
      failFiles.push({ file: relPath, count });
    } else if (count >= 1) {
      warnFiles.push({ file: relPath, count });
    }
  }
  if (failFiles.length > 0) {
    const evidence = failFiles.map(
      (f) => `${f.file}: ${f.count} inline data-access call(s) in presentation layer`
    );
    return makeResult("FAIL", failFiles.length, [
      `${failFiles.length} presentation-layer file(s) have >= 3 inline data-access calls`,
      ...evidence
    ]);
  }
  if (warnFiles.length > 0) {
    const evidence = warnFiles.map(
      (f) => `${f.file}: ${f.count} inline data-access call(s) in presentation layer`
    );
    return makeResult("WARN", warnFiles.length, [
      `${warnFiles.length} presentation-layer file(s) have 1-2 inline data-access calls`,
      ...evidence
    ]);
  }
  return makeResult("PASS", presentationFiles.length, [
    `${presentationFiles.length} presentation-layer file(s) checked \u2014 no inline data-access calls found`
  ]);
}
function classifyName(name) {
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name)) return "snake_case";
  if (/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) return "kebab-case";
  if (/^[A-Z][A-Za-z0-9]*$/.test(name)) return "PascalCase";
  if (/^[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*$/.test(name)) return "camelCase";
  return "other";
}
var NAMING_SOURCE_GLOBS = [
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.py",
  "*.java",
  "*.kt",
  "*.go",
  "*.rb"
];
function detectNamingConventions(repoPath, _params) {
  const files = iterFiles(repoPath, NAMING_SOURCE_GLOBS);
  const relevantFiles = files.filter((f) => {
    const base = basename2(f).replace(/\.[^.]+$/, "");
    return !["index", "__init__", "main", "app", "setup", "config"].includes(
      base
    );
  });
  if (relevantFiles.length === 0) {
    return makeResult("PASS", 0, [
      "no source files found \u2014 naming convention check skipped"
    ]);
  }
  const counts = {
    snake_case: 0,
    "kebab-case": 0,
    camelCase: 0,
    PascalCase: 0,
    other: 0
  };
  for (const f of relevantFiles) {
    const base = basename2(f).replace(/\.[^.]+$/, "");
    counts[classifyName(base)]++;
  }
  const total = relevantFiles.length;
  const conventions = [
    "snake_case",
    "kebab-case",
    "camelCase",
    "PascalCase"
  ];
  const dominant = conventions.reduce(
    (best, c) => counts[c] > counts[best] ? c : best,
    conventions[0]
  );
  const dominantCount = counts[dominant];
  const ratio = dominantCount / total;
  const evidence = [
    `dominant convention: ${dominant} (${dominantCount}/${total} = ${Math.round(ratio * 100)}%)`,
    ...conventions.filter((c) => counts[c] > 0).map((c) => `  ${c}: ${counts[c]} file(s)`)
  ];
  if (ratio >= 0.9) {
    return makeResult("PASS", ratio, evidence);
  }
  if (ratio >= 0.7) {
    return makeResult("WARN", ratio, [
      `inconsistent file naming: dominant convention ${dominant} at ${Math.round(ratio * 100)}% (below 90% threshold)`,
      ...evidence
    ]);
  }
  return makeResult("FAIL", ratio, [
    `inconsistent file naming: dominant convention ${dominant} at only ${Math.round(ratio * 100)}% (below 70% threshold)`,
    ...evidence
  ]);
}
var FILE_SIZE_GLOBS = [
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.py",
  "*.java",
  "*.kt",
  "*.go",
  "*.rb",
  "*.cs"
];
var LOC_THRESHOLD = 300;
function countLines(filePath) {
  try {
    const content = readFileSync3(filePath, "utf8");
    return content.split("\n").length;
  } catch {
    return 0;
  }
}
function detectFileSizes(repoPath, _params) {
  const files = iterFiles(repoPath, FILE_SIZE_GLOBS);
  if (files.length === 0) {
    return makeResult(
      "PASS",
      0,
      ["no source files found \u2014 file-size check skipped"],
      "computed"
    );
  }
  const oversized = [];
  for (const filePath of files) {
    const lines = countLines(filePath);
    if (lines > LOC_THRESHOLD) {
      oversized.push({ file: relative3(repoPath, filePath), lines });
    }
  }
  const total = files.length;
  const ratio = Math.round(oversized.length / total * 1e10) / 1e10;
  const evidence = [
    `${oversized.length}/${total} source files exceed ${LOC_THRESHOLD} lines`,
    ...oversized.slice(0, 10).map((f) => `${f.file}: ${f.lines} lines`)
  ];
  if (ratio > 0.3) {
    return makeResult(
      "FAIL",
      ratio,
      [
        `${Math.round(ratio * 100)}% of source files exceed ${LOC_THRESHOLD} lines (threshold: 30%)`,
        ...evidence
      ],
      "computed"
    );
  }
  if (ratio > 0.1) {
    return makeResult(
      "WARN",
      ratio,
      [
        `${Math.round(ratio * 100)}% of source files exceed ${LOC_THRESHOLD} lines (threshold: 10%)`,
        ...evidence
      ],
      "computed"
    );
  }
  return makeResult(
    "PASS",
    ratio,
    [
      `${Math.round(ratio * 100)}% of source files exceed ${LOC_THRESHOLD} lines \u2014 within threshold`,
      ...evidence
    ],
    "computed"
  );
}
var DETECTORS2 = {
  2100: detectArchPattern,
  // ARCH-01 declared/recognizable pattern
  2101: detectImportGraph,
  // ARCH-02 import direction / no tangled cross-imports
  // 2102 intentionally omitted — ARCH-03 is method=judgment
  2103: detectSeparationOfConcerns,
  // ARCH-04 separation of concerns
  2104: detectNamingConventions,
  // ARCH-05 consistent naming conventions
  2105: detectFileSizes
  // ARCH-06 file sizes (computed)
};

// plugins/awos/skills/ai-readiness-audit/detectors/spec_driven_development.ts
import { readFileSync as readFileSync4, existsSync as existsSync3, readdirSync, statSync } from "node:fs";
import { join as join5, relative as relative4 } from "node:path";
import { execFileSync as execFileSync4 } from "node:child_process";
function detectAwosInstalled(repoPath, _params) {
  const hasAwos = existsSync3(join5(repoPath, ".awos"));
  const hasContext = existsSync3(join5(repoPath, "context"));
  if (hasAwos && hasContext) {
    return makeResult("PASS", 2, [
      ".awos/ directory present \u2014 AWOS framework installed",
      "context/ directory present \u2014 spec workspace initialised"
    ]);
  }
  if (hasAwos) {
    return makeResult("WARN", 1, [
      ".awos/ directory present but context/ is missing \u2014 AWOS installed but workspace not initialised"
    ]);
  }
  if (hasContext) {
    return makeResult("WARN", 1, [
      "context/ directory present but .awos/ is missing \u2014 workspace exists but AWOS framework not installed"
    ]);
  }
  return makeResult("FAIL", 0, [
    "neither .awos/ nor context/ found \u2014 AWOS framework is not installed"
  ]);
}
var MIN_SUBSTANTIVE_LINES = 5;
function isSubstantive(filePath) {
  try {
    const content = readFileSync4(filePath, "utf8");
    const nonBlankLines = content.split("\n").filter((l) => l.trim().length > 0);
    return nonBlankLines.length > MIN_SUBSTANTIVE_LINES;
  } catch {
    return false;
  }
}
var FOUNDATIONAL_DOC_CANDIDATES = [
  ["context/product/product-definition.md"],
  ["context/product/roadmap.md"],
  ["context/architecture/architecture.md", "context/product/architecture.md"]
];
function detectProductContextDocs(repoPath, _params) {
  const found = [];
  const missing = [];
  for (const candidates of FOUNDATIONAL_DOC_CANDIDATES) {
    let matched = false;
    for (const candidate of candidates) {
      const fullPath = join5(repoPath, candidate);
      if (existsSync3(fullPath) && isSubstantive(fullPath)) {
        found.push(candidate);
        matched = true;
        break;
      }
    }
    if (!matched) {
      missing.push(candidates[0]);
    }
  }
  const count = found.length;
  const evidence = [
    ...found.map((f) => `present and substantive: ${f}`),
    ...missing.map((m) => `missing or trivial: ${m}`)
  ];
  if (count === 3) {
    return makeResult("PASS", count, [
      "all 3 foundational AWOS documents present with substantive content",
      ...evidence
    ]);
  }
  if (count === 2) {
    return makeResult("WARN", count, [
      "2 of 3 foundational AWOS documents present",
      ...evidence
    ]);
  }
  return makeResult("FAIL", count, [
    `only ${count} of 3 foundational AWOS documents present`,
    ...evidence
  ]);
}
var TECH_SIGNALS = [
  {
    name: "typescript",
    detect: (r) => iterFiles(r, ["*.ts", "*.tsx", "tsconfig.json"]).length > 0
  },
  {
    name: "python",
    detect: (r) => iterFiles(r, ["*.py"]).length > 0
  },
  {
    name: "django",
    detect: (r) => iterFiles(r, ["manage.py", "settings.py", "urls.py"]).length > 0
  },
  {
    name: "react",
    detect: (r) => iterFiles(r, ["*.tsx", "*.jsx"]).length > 0 || (() => {
      const pkg = join5(r, "package.json");
      if (!existsSync3(pkg)) return false;
      try {
        return readFileSync4(pkg, "utf8").includes('"react"');
      } catch {
        return false;
      }
    })()
  },
  {
    name: "node",
    detect: (r) => existsSync3(join5(r, "package.json")) || iterFiles(r, ["*.js"]).length > 0
  },
  {
    name: "javascript",
    detect: (r) => iterFiles(r, ["*.js", "*.jsx"]).length > 0
  },
  {
    name: "postgresql",
    detect: (r) => iterFiles(r, ["*.sql"]).length > 0 || (() => {
      try {
        const out = execFileSync4(
          "grep",
          [
            "-rl",
            "--include=*.py",
            "--include=*.ts",
            "--include=*.js",
            "psycopg2",
            r
          ],
          { encoding: "utf8" }
        );
        return out.trim().length > 0;
      } catch {
        return false;
      }
    })()
  },
  {
    name: "postgres",
    detect: (r) => iterFiles(r, ["*.sql"]).length > 0 || (() => {
      try {
        const out = execFileSync4(
          "grep",
          [
            "-rl",
            "--include=*.py",
            "--include=*.ts",
            "--include=*.js",
            "psycopg",
            r
          ],
          { encoding: "utf8" }
        );
        return out.trim().length > 0;
      } catch {
        return false;
      }
    })()
  },
  {
    name: "go",
    detect: (r) => iterFiles(r, ["*.go", "go.mod"]).length > 0
  },
  {
    name: "java",
    detect: (r) => iterFiles(r, ["*.java"]).length > 0
  },
  {
    name: "docker",
    detect: (r) => iterFiles(r, ["Dockerfile", "docker-compose.yml", "docker-compose.yaml"]).length > 0
  },
  {
    name: "terraform",
    detect: (r) => iterFiles(r, ["*.tf"]).length > 0
  },
  {
    name: "kubernetes",
    detect: (r) => {
      try {
        const out = execFileSync4(
          "grep",
          ["-rl", "--include=*.yaml", "--include=*.yml", "apiVersion:", r],
          { encoding: "utf8" }
        );
        return out.trim().length > 0;
      } catch {
        return false;
      }
    }
  }
];
function findArchDoc(repoPath) {
  for (const candidate of [
    join5(repoPath, "context", "architecture", "architecture.md"),
    join5(repoPath, "context", "product", "architecture.md"),
    join5(repoPath, "ARCHITECTURE.md")
  ]) {
    if (existsSync3(candidate)) return candidate;
  }
  return null;
}
function detectArchTechMatch(repoPath, _params) {
  const archDoc = findArchDoc(repoPath);
  if (!archDoc) {
    return makeResult("PASS", 0, [
      "no architecture document found \u2014 tech-match check skipped"
    ]);
  }
  let content;
  try {
    content = readFileSync4(archDoc, "utf8").toLowerCase();
  } catch {
    return makeResult("PASS", 0, ["could not read architecture document"]);
  }
  const unverified = [];
  const verified = [];
  for (const signal of TECH_SIGNALS) {
    if (!content.includes(signal.name.toLowerCase())) continue;
    if (signal.detect(repoPath)) {
      verified.push(signal.name);
    } else {
      unverified.push(signal.name);
    }
  }
  const evidence = [
    `architecture document: ${relative4(repoPath, archDoc)}`,
    ...verified.map((t) => `verified in codebase: ${t}`),
    ...unverified.map((t) => `mentioned but not evidenced in codebase: ${t}`)
  ];
  if (unverified.length >= 3) {
    return makeResult("FAIL", unverified.length, [
      `${unverified.length} technology mention(s) in architecture doc not evidenced in codebase`,
      ...evidence
    ]);
  }
  if (unverified.length >= 1) {
    return makeResult("WARN", unverified.length, [
      `${unverified.length} technology mention(s) in architecture doc not evidenced in codebase`,
      ...evidence
    ]);
  }
  return makeResult("PASS", 0, [
    "all technology mentions in architecture doc are evidenced in the codebase",
    ...evidence
  ]);
}
var TRUNK_BRANCHES = /* @__PURE__ */ new Set(["main", "master", "develop", "development"]);
function detectTrunk(repoPath) {
  for (const candidate of ["main", "master", "develop", "development"]) {
    try {
      execFileSync4("git", ["rev-parse", "--verify", candidate], {
        cwd: repoPath,
        encoding: "utf8"
      });
      return candidate;
    } catch {
    }
  }
  return "main";
}
function listLocalBranches(repoPath) {
  try {
    const out = execFileSync4("git", ["branch", "--format=%(refname:short)"], {
      cwd: repoPath,
      encoding: "utf8"
    });
    return out.split("\n").map((b) => b.trim()).filter((b) => b.length > 0 && !TRUNK_BRANCHES.has(b));
  } catch {
    return [];
  }
}
function branchTouchedSpec(repoPath, branch, trunk) {
  try {
    const out = execFileSync4(
      "git",
      [
        "log",
        branch,
        "--not",
        trunk,
        "--name-only",
        "--format=",
        "--diff-filter=ACDMR"
      ],
      { cwd: repoPath, encoding: "utf8" }
    );
    return out.split("\n").some((line) => line.startsWith("context/spec/"));
  } catch {
    return false;
  }
}
function detectBranchSpecRatio(repoPath, _params) {
  const branches = listLocalBranches(repoPath);
  if (branches.length === 0) {
    return makeResult(
      "SKIP",
      null,
      ["no feature branches found \u2014 branch\u2192spec ratio not computable"],
      "computed"
    );
  }
  const trunk = detectTrunk(repoPath);
  const specBranches = [];
  const plainBranches = [];
  for (const branch of branches) {
    if (branchTouchedSpec(repoPath, branch, trunk)) {
      specBranches.push(branch);
    } else {
      plainBranches.push(branch);
    }
  }
  const total = branches.length;
  const ratio = Math.round(specBranches.length / total * 1e10) / 1e10;
  const evidence = [
    `${specBranches.length}/${total} feature branches touched context/spec/ (ratio: ${Math.round(ratio * 100)}%)`,
    ...specBranches.slice(0, 10).map((b) => `spec branch: ${b}`),
    ...plainBranches.slice(0, 10).map((b) => `plain branch: ${b}`)
  ];
  if (ratio >= 0.7) {
    return makeResult(
      "PASS",
      ratio,
      [
        `${Math.round(ratio * 100)}% of feature branches used spec workflow (threshold: 70%)`,
        ...evidence
      ],
      "computed"
    );
  }
  if (ratio >= 0.4) {
    return makeResult(
      "WARN",
      ratio,
      [
        `${Math.round(ratio * 100)}% of feature branches used spec workflow (below 70% threshold)`,
        ...evidence
      ],
      "computed"
    );
  }
  return makeResult(
    "FAIL",
    ratio,
    [
      `only ${Math.round(ratio * 100)}% of feature branches used spec workflow (threshold: 70%)`,
      ...evidence
    ],
    "computed"
  );
}
var SPEC_TRIAD = [
  "functional-spec.md",
  "technical-considerations.md",
  "tasks.md"
];
function listSpecDirs(repoPath) {
  const specBase = join5(repoPath, "context", "spec");
  if (!existsSync3(specBase)) return [];
  try {
    return readdirSync(specBase).filter((name) => /^\d{3}-/.test(name)).sort().map((name) => join5(specBase, name)).filter((p) => {
      try {
        return statSync(p).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}
function detectSpecTriadComplete(repoPath, _params) {
  const specDirs = listSpecDirs(repoPath);
  if (specDirs.length === 0) {
    return makeResult("PASS", 0, [
      "no spec directories found \u2014 triad check skipped"
    ]);
  }
  const statuses = [];
  for (const dir of specDirs) {
    const present = SPEC_TRIAD.filter((f) => existsSync3(join5(dir, f)));
    const missing = SPEC_TRIAD.filter((f) => !existsSync3(join5(dir, f)));
    statuses.push({ dir: relative4(repoPath, dir), present, missing });
  }
  const empty = statuses.filter((s) => s.present.length === 0);
  const incomplete = statuses.filter(
    (s) => s.present.length > 0 && s.missing.length > 0
  );
  const complete = statuses.filter((s) => s.missing.length === 0);
  const evidence = [
    `${complete.length}/${specDirs.length} spec dirs have all 3 files`,
    ...incomplete.map(
      (s) => `incomplete: ${s.dir} \u2014 missing: ${s.missing.join(", ")}`
    ),
    ...empty.map((s) => `empty: ${s.dir} \u2014 has none of the 3 required files`)
  ];
  if (empty.length > 0) {
    return makeResult("FAIL", empty.length, [
      `${empty.length} spec dir(s) have none of the 3 required files`,
      ...evidence
    ]);
  }
  if (incomplete.length > 0) {
    return makeResult("WARN", incomplete.length, [
      `${incomplete.length} spec dir(s) are incomplete (have some but not all 3 files)`,
      ...evidence
    ]);
  }
  return makeResult("PASS", specDirs.length, [
    `all ${specDirs.length} spec dir(s) have the complete triad`,
    ...evidence
  ]);
}
var TASK_LINE_RX = /^\s*-\s*\[[ xX]\]/m;
var UNCHECKED_RX = /^\s*-\s*\[ \]/m;
function detectStaleSpecs(repoPath, _params) {
  const specDirs = listSpecDirs(repoPath);
  if (specDirs.length === 0) {
    return makeResult("PASS", 0, [
      "no spec directories found \u2014 stale-spec check skipped"
    ]);
  }
  const stale = [];
  const active = [];
  const done = [];
  for (const dir of specDirs) {
    const tasksPath = join5(dir, "tasks.md");
    if (!existsSync3(tasksPath)) continue;
    let content;
    try {
      content = readFileSync4(tasksPath, "utf8");
    } catch {
      continue;
    }
    const hasTasks = TASK_LINE_RX.test(content);
    if (!hasTasks) {
      stale.push(relative4(repoPath, dir));
    } else if (UNCHECKED_RX.test(content)) {
      active.push(relative4(repoPath, dir));
    } else {
      done.push(relative4(repoPath, dir));
    }
  }
  const evidence = [
    ...active.map((d) => `active (has open tasks): ${d}`),
    ...done.map((d) => `done (all tasks complete): ${d}`),
    ...stale.map((d) => `stale (tasks.md has no task items): ${d}`)
  ];
  if (stale.length === 0) {
    return makeResult("PASS", 0, ["no stale specs found", ...evidence]);
  }
  if (stale.length === 1) {
    return makeResult("WARN", stale.length, [
      `1 stale spec detected (tasks.md is an empty stub)`,
      ...evidence
    ]);
  }
  return makeResult("FAIL", stale.length, [
    `${stale.length} stale specs detected (tasks.md empty stubs)`,
    ...evidence
  ]);
}
var TASK_CHECKBOX_RX = /^\s*-\s*\[[ xX]\]/;
var AGENT_ANNOTATION_RX = /\*\*\[Agent:\s*[^\]]+\]\*\*/;
function detectAgentAnnotations(repoPath, _params) {
  const specDirs = listSpecDirs(repoPath);
  let totalTasks = 0;
  let annotatedTasks = 0;
  for (const dir of specDirs) {
    const tasksPath = join5(dir, "tasks.md");
    if (!existsSync3(tasksPath)) continue;
    let content;
    try {
      content = readFileSync4(tasksPath, "utf8");
    } catch {
      continue;
    }
    for (const line of content.split("\n")) {
      if (TASK_CHECKBOX_RX.test(line)) {
        totalTasks++;
        if (AGENT_ANNOTATION_RX.test(line)) {
          annotatedTasks++;
        }
      }
    }
  }
  if (totalTasks === 0) {
    return makeResult("SKIP", null, [
      "no task checkbox lines found in any tasks.md \u2014 agent-annotation check skipped"
    ]);
  }
  const ratio = Math.round(annotatedTasks / totalTasks * 1e10) / 1e10;
  const evidence = [
    `${annotatedTasks}/${totalTasks} task lines have **[Agent: ...]** annotations (${Math.round(ratio * 100)}%)`
  ];
  if (ratio >= 0.7) {
    return makeResult("PASS", ratio, [
      `${Math.round(ratio * 100)}% of tasks annotated with agent assignments (threshold: 70%)`,
      ...evidence
    ]);
  }
  if (ratio >= 0.4) {
    return makeResult("WARN", ratio, [
      `only ${Math.round(ratio * 100)}% of tasks annotated with agent assignments (below 70%)`,
      ...evidence
    ]);
  }
  return makeResult("FAIL", ratio, [
    `only ${Math.round(ratio * 100)}% of tasks annotated with agent assignments (threshold: 70%)`,
    ...evidence
  ]);
}
var DETECTORS3 = {
  2800: detectAwosInstalled,
  // SDD-01 AWOS installed
  2801: detectProductContextDocs,
  // SDD-02 foundational product docs
  2802: detectArchTechMatch,
  // SDD-03 tech choices match codebase
  2803: detectBranchSpecRatio,
  // SDD-04 branch→spec ratio (computed)
  2804: detectSpecTriadComplete,
  // SDD-05 spec triad completeness
  2805: detectStaleSpecs,
  // SDD-06 no stale specs
  2806: detectAgentAnnotations
  // SDD-07 agent annotations in tasks.md
};

// plugins/awos/skills/ai-readiness-audit/detectors/ai_development_tooling.ts
import { existsSync as existsSync4, readFileSync as readFileSync5 } from "node:fs";
import { join as join6, relative as relative5 } from "node:path";
function detectCustomCommands(repoPath, _params) {
  const commandsDir = join6(repoPath, ".claude", "commands");
  if (!existsSync4(commandsDir)) {
    return makeResult("FAIL", 0, [
      "no .claude/commands/ directory found \u2014 no custom slash commands defined"
    ]);
  }
  const files = iterFiles(commandsDir, ["*.md"]);
  if (files.length > 0) {
    const names = files.map((p) => relative5(repoPath, p));
    return makeResult("PASS", files.length, [
      `${files.length} custom command file(s) found under .claude/commands/`,
      ...names.slice(0, 10).map((n) => `command: ${n}`)
    ]);
  }
  return makeResult("FAIL", 0, [
    "no custom command files found in .claude/commands/ \u2014 define slash commands for common workflows"
  ]);
}
function detectClaudeSkills(repoPath, _params) {
  const skillsRoot = join6(repoPath, ".claude", "skills");
  if (!existsSync4(skillsRoot)) {
    return makeResult("FAIL", 0, [
      "no .claude/skills/ directory found \u2014 no Claude Code skills configured"
    ]);
  }
  const files = iterFiles(skillsRoot, ["SKILL.md"]);
  if (files.length > 0) {
    const names = files.map((p) => relative5(repoPath, p));
    return makeResult("PASS", files.length, [
      `${files.length} SKILL.md file(s) found under .claude/skills/`,
      ...names.slice(0, 10).map((n) => `skill: ${n}`)
    ]);
  }
  return makeResult("FAIL", 0, [
    "no SKILL.md files found under .claude/skills/ \u2014 no Claude Code skills configured"
  ]);
}
var MCP_CONFIG_PATHS = [".mcp.json", ".claude/mcp.json"];
function detectMcpConfig(repoPath, _params) {
  const found = [];
  for (const relPath of MCP_CONFIG_PATHS) {
    if (existsSync4(join6(repoPath, relPath))) {
      found.push(relPath);
    }
  }
  if (found.length > 0) {
    return makeResult("PASS", found.length, [
      `MCP configuration found: ${found.join(", ")}`,
      ...found.map((f) => `MCP config: ${f}`)
    ]);
  }
  return makeResult("FAIL", 0, [
    "no MCP configuration found (.mcp.json or .claude/mcp.json) \u2014 no MCP servers configured"
  ]);
}
function detectClaudeHooks(repoPath, _params) {
  const hooksDir = join6(repoPath, ".claude", "hooks");
  if (existsSync4(hooksDir)) {
    const hookFiles = iterFiles(hooksDir, [
      "*.sh",
      "*.js",
      "*.ts",
      "*.py",
      "*.bash"
    ]);
    if (hookFiles.length > 0) {
      const names = hookFiles.map((p) => relative5(repoPath, p));
      return makeResult("PASS", hookFiles.length, [
        `${hookFiles.length} hook file(s) found in .claude/hooks/`,
        ...names.slice(0, 10).map((n) => `hook file: ${n}`)
      ]);
    }
  }
  const settingsFiles = [
    join6(repoPath, ".claude", "settings.json"),
    join6(repoPath, ".claude", "settings.local.json")
  ];
  for (const settingsPath of settingsFiles) {
    if (!existsSync4(settingsPath)) continue;
    let content;
    try {
      content = readFileSync5(settingsPath, "utf8");
    } catch {
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      if (/"hooks"\s*:/.test(content)) {
        return makeResult("PASS", 1, [
          `"hooks" key found in ${relative5(repoPath, settingsPath)}`
        ]);
      }
      continue;
    }
    if (parsed !== null && typeof parsed === "object" && "hooks" in parsed) {
      return makeResult("PASS", 1, [
        `"hooks" key configured in ${relative5(repoPath, settingsPath)}`
      ]);
    }
  }
  return makeResult("FAIL", 0, [
    'no Claude Code hooks found \u2014 neither .claude/hooks/ files nor "hooks" key in settings'
  ]);
}
var ROOT_RUN_FILES = [
  "Makefile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "run.sh",
  "start.sh",
  "justfile",
  "Justfile",
  "Taskfile.yml",
  "Taskfile.yaml"
];
function hasPackageJsonRunScript(repoPath) {
  const pkgPath = join6(repoPath, "package.json");
  if (!existsSync4(pkgPath)) return false;
  let pkg;
  try {
    pkg = JSON.parse(readFileSync5(pkgPath, "utf8"));
  } catch {
    return false;
  }
  if (pkg === null || typeof pkg !== "object") return false;
  const scripts = pkg.scripts;
  if (scripts === null || typeof scripts !== "object") return false;
  return "start" in scripts || "dev" in scripts;
}
function detectCanRunApp(repoPath, _params) {
  const found = [];
  for (const f of ROOT_RUN_FILES) {
    if (existsSync4(join6(repoPath, f))) {
      found.push(f);
    }
  }
  if (hasPackageJsonRunScript(repoPath)) {
    found.push("package.json (start/dev script)");
  }
  if (found.length > 0) {
    return makeResult("PASS", found.length, [
      `run mechanism(s) found: ${found.join(", ")}`,
      ...found.map((f) => `run signal: ${f}`)
    ]);
  }
  return makeResult("FAIL", 0, [
    "no run mechanism found \u2014 no Makefile, docker-compose, or package.json start script; Claude Code cannot run the application without human involvement"
  ]);
}
var DETECTORS4 = {
  2001: detectCustomCommands,
  // AI-02 custom slash commands
  2002: detectClaudeSkills,
  // AI-03 Claude Code skills
  2003: detectMcpConfig,
  // AI-04 MCP server config
  2004: detectClaudeHooks,
  // AI-05 Claude Code hooks
  2006: detectCanRunApp
  // AI-07 agent can run/observe app
};

// plugins/awos/skills/ai-readiness-audit/detectors/end_to_end_delivery.ts
import { existsSync as existsSync5, readFileSync as readFileSync6, statSync as statSync2 } from "node:fs";
import { join as join7, relative as relative6 } from "node:path";
import { execFileSync as execFileSync5 } from "node:child_process";
var TRUNK_NAMES = /* @__PURE__ */ new Set(["main", "master", "develop", "development"]);
var LAYER_PATTERNS = [
  {
    name: "api/backend",
    patterns: /\/(api|backend|server|services?|routes?|controllers?|handlers?|endpoints?)\//i
  },
  {
    name: "frontend/ui",
    patterns: /\/(frontend|ui|web|client|app|pages?|components?|views?)\//i
  },
  {
    name: "database",
    patterns: /\/(db|database|migrations?|schemas?|sql|models?)\//i
  },
  {
    name: "infra",
    patterns: /\/(infra|infrastructure|terraform|k8s|kubernetes|helm|deploy)\//i
  }
];
function detectTrunk2(repoPath) {
  for (const candidate of ["main", "master", "develop", "development"]) {
    try {
      execFileSync5("git", ["rev-parse", "--verify", candidate], {
        cwd: repoPath,
        encoding: "utf8"
      });
      return candidate;
    } catch {
    }
  }
  return "main";
}
function listFeatureBranches(repoPath) {
  try {
    const out = execFileSync5("git", ["branch", "--format=%(refname:short)"], {
      cwd: repoPath,
      encoding: "utf8"
    });
    return out.split("\n").map((b) => b.trim()).filter((b) => b.length > 0 && !TRUNK_NAMES.has(b));
  } catch {
    return [];
  }
}
function branchLayerCount(repoPath, branch, trunk) {
  let paths;
  try {
    const out = execFileSync5(
      "git",
      [
        "log",
        branch,
        "--not",
        trunk,
        "--name-only",
        "--format=",
        "--diff-filter=ACDMR"
      ],
      { cwd: repoPath, encoding: "utf8" }
    );
    paths = out.split("\n").filter(Boolean);
  } catch {
    return 0;
  }
  const layers = /* @__PURE__ */ new Set();
  for (const p of paths) {
    const withSlash = "/" + p;
    for (const { name, patterns } of LAYER_PATTERNS) {
      if (patterns.test(withSlash)) {
        layers.add(name);
        break;
      }
    }
  }
  return layers.size;
}
function detectVerticalDelivery(repoPath, _params) {
  const branches = listFeatureBranches(repoPath);
  if (branches.length === 0) {
    return makeResult(
      "SKIP",
      null,
      ["no feature branches found \u2014 vertical delivery ratio not computable"],
      "computed"
    );
  }
  const trunk = detectTrunk2(repoPath);
  const verticalBranches = [];
  const singleLayerBranches = [];
  for (const branch of branches) {
    const layerCount = branchLayerCount(repoPath, branch, trunk);
    if (layerCount >= 2) {
      verticalBranches.push(branch);
    } else {
      singleLayerBranches.push(branch);
    }
  }
  const total = branches.length;
  const ratio = Math.round(verticalBranches.length / total * 1e10) / 1e10;
  const evidence = [
    `${verticalBranches.length}/${total} feature branches touch \u2265 2 layers (ratio: ${Math.round(ratio * 100)}%)`,
    ...verticalBranches.slice(0, 10).map((b) => `vertical branch: ${b}`),
    ...singleLayerBranches.slice(0, 5).map((b) => `single-layer branch: ${b}`)
  ];
  if (ratio >= 0.5) {
    return makeResult(
      "PASS",
      ratio,
      [
        `${Math.round(ratio * 100)}% of feature branches touch multiple layers (threshold: 50%)`,
        ...evidence
      ],
      "computed"
    );
  }
  if (ratio >= 0.25) {
    return makeResult(
      "WARN",
      ratio,
      [
        `only ${Math.round(ratio * 100)}% of feature branches touch multiple layers (below 50%)`,
        ...evidence
      ],
      "computed"
    );
  }
  return makeResult(
    "FAIL",
    ratio,
    [
      `only ${Math.round(ratio * 100)}% of feature branches touch multiple layers (threshold: 50%)`,
      ...evidence
    ],
    "computed"
  );
}
var BACKEND_RX = /-backend$|[-_]api$|[-_]server$/i;
var FRONTEND_RX = /-frontend$|[-_]ui$|[-_]client$|[-_]web$/i;
function stripLayerSuffix(name) {
  return name.replace(
    /-backend$|-frontend$|[-_]api$|[-_]server$|[-_]ui$|[-_]client$|[-_]web$/i,
    ""
  ).toLowerCase();
}
function detectNoLayerSplit(repoPath, _params) {
  let branches;
  try {
    const out = execFileSync5("git", ["branch", "--format=%(refname:short)"], {
      cwd: repoPath,
      encoding: "utf8"
    });
    branches = out.split("\n").map((b) => b.trim()).filter((b) => b.length > 0 && !TRUNK_NAMES.has(b));
  } catch {
    return makeResult("SKIP", null, [
      "no git branches available \u2014 layer-split detection skipped"
    ]);
  }
  if (branches.length === 0) {
    return makeResult("SKIP", null, [
      "no feature branches found \u2014 layer-split detection skipped"
    ]);
  }
  const backendBranches = branches.filter((b) => BACKEND_RX.test(b));
  const frontendBranches = branches.filter((b) => FRONTEND_RX.test(b));
  const pairedRoots = [];
  for (const b of backendBranches) {
    const root = stripLayerSuffix(b);
    const hasFrontendPair = frontendBranches.some(
      (f) => stripLayerSuffix(f) === root
    );
    if (hasFrontendPair) {
      pairedRoots.push(root);
    }
  }
  if (pairedRoots.length === 0) {
    return makeResult("PASS", 0, [
      "no paired backend/frontend branch split patterns detected",
      `${branches.length} feature branch(es) inspected`
    ]);
  }
  const evidence = [
    `${pairedRoots.length} paired layer-split branch pattern(s) detected`,
    ...pairedRoots.slice(0, 10).map((r) => `split pattern root: ${r}`)
  ];
  if (pairedRoots.length >= 3) {
    return makeResult("FAIL", pairedRoots.length, [
      `${pairedRoots.length} feature(s) split into separate backend/frontend branches \u2014 vertical delivery anti-pattern`,
      ...evidence
    ]);
  }
  return makeResult("WARN", pairedRoots.length, [
    `${pairedRoots.length} feature(s) split into separate backend/frontend branches`,
    ...evidence
  ]);
}
var IMPL_PATH_RX = /\b(src|app|lib|packages?)\//i;
var SPEC_REF_RX = /context\/spec\/\d{3}-|(?<!\/)spec\/\d{3}-/;
function detectBidirectionalLinks(repoPath, _params) {
  const specBase = join7(repoPath, "context", "spec");
  if (!existsSync5(specBase)) {
    return makeResult("FAIL", 0, [
      "no context/spec/ directory found \u2014 spec\u2194impl bidirectional links not possible"
    ]);
  }
  let specFiles = [];
  try {
    specFiles = iterFiles(specBase, ["*.md"]);
  } catch {
    specFiles = [];
  }
  if (specFiles.length === 0) {
    return makeResult("FAIL", 0, [
      "no spec markdown files found \u2014 bidirectional links not detectable"
    ]);
  }
  let specRefsImpl = false;
  const specImplEvidence = [];
  for (const f of specFiles) {
    let content;
    try {
      content = readFileSync6(f, "utf8");
    } catch {
      continue;
    }
    if (IMPL_PATH_RX.test(content)) {
      specRefsImpl = true;
      specImplEvidence.push(`spec\u2192impl reference in: ${relative6(repoPath, f)}`);
      if (specImplEvidence.length >= 3) break;
    }
  }
  const SOURCE_GLOBS3 = [
    "*.ts",
    "*.tsx",
    "*.js",
    "*.jsx",
    "*.py",
    "*.go",
    "*.java",
    "*.kt"
  ];
  let implRefsSpec = false;
  const implSpecEvidence = [];
  let sourceFiles = [];
  try {
    sourceFiles = iterFiles(repoPath, SOURCE_GLOBS3);
  } catch {
    sourceFiles = [];
  }
  for (const f of sourceFiles) {
    let content;
    try {
      content = readFileSync6(f, "utf8");
    } catch {
      continue;
    }
    if (SPEC_REF_RX.test(content)) {
      implRefsSpec = true;
      implSpecEvidence.push(`impl\u2192spec reference in: ${relative6(repoPath, f)}`);
      if (implSpecEvidence.length >= 3) break;
    }
  }
  const evidence = [...specImplEvidence, ...implSpecEvidence];
  if (specRefsImpl && implRefsSpec) {
    return makeResult("PASS", 2, [
      "bidirectional spec\u2194impl cross-references detected",
      ...evidence
    ]);
  }
  if (specRefsImpl || implRefsSpec) {
    return makeResult("WARN", 1, [
      "only one direction of spec\u2194impl cross-references found",
      specRefsImpl ? "spec files reference implementation paths" : "no spec files reference implementation paths",
      implRefsSpec ? "implementation files reference spec directories" : "no implementation files reference spec directories",
      ...evidence
    ]);
  }
  return makeResult("FAIL", 0, [
    "no bidirectional spec\u2194impl cross-references found",
    `${specFiles.length} spec file(s) found but none reference implementation paths`,
    `${sourceFiles.length} source file(s) found but none reference context/spec/`
  ]);
}
var API_DIRS = [
  "api",
  "routes",
  "server",
  "backend",
  "controllers",
  "handlers",
  "endpoints"
];
var UI_DIRS = ["frontend", "ui", "web", "client"];
var DB_FILES_GLOBS = ["*.sql", "schema.prisma", "*.prisma"];
var DB_DIRS = ["migrations", "db", "database", "models"];
function hasAnyDir(repoPath, dirs) {
  for (const d of dirs) {
    if (existsSync5(join7(repoPath, d)) && statSync2(join7(repoPath, d)).isDirectory()) {
      return d;
    }
  }
  return null;
}
function detectLayerCoverage(repoPath, _params) {
  const apiDir = hasAnyDir(repoPath, API_DIRS);
  const hasApi = apiDir !== null;
  const uiDir = hasAnyDir(repoPath, UI_DIRS);
  let hasUi = uiDir !== null;
  let uiSignal = uiDir ? `directory: ${uiDir}/` : null;
  if (!hasUi) {
    let uiFiles = [];
    try {
      uiFiles = iterFiles(repoPath, ["*.tsx", "*.jsx"]);
    } catch {
      uiFiles = [];
    }
    if (uiFiles.length > 0) {
      hasUi = true;
      uiSignal = `${uiFiles.length} .tsx/.jsx file(s)`;
    }
  }
  const dbDir = hasAnyDir(repoPath, DB_DIRS);
  let hasDb = dbDir !== null;
  let dbSignal = dbDir ? `directory: ${dbDir}/` : null;
  if (!hasDb) {
    let dbFiles = [];
    try {
      dbFiles = iterFiles(repoPath, DB_FILES_GLOBS);
    } catch {
      dbFiles = [];
    }
    if (dbFiles.length > 0) {
      hasDb = true;
      dbSignal = `${dbFiles.length} schema/SQL file(s)`;
    }
  }
  const layerCount = [hasApi, hasUi, hasDb].filter(Boolean).length;
  if (layerCount < 2) {
    return makeResult("SKIP", layerCount, [
      "fewer than 2 distinct layers detected \u2014 single-layer project, E2E-04 not applicable",
      hasApi ? `API layer: ${apiDir}/` : "API layer: not detected",
      hasUi ? `UI layer: ${uiSignal}` : "UI layer: not detected",
      hasDb ? `DB layer: ${dbSignal}` : "DB layer: not detected"
    ]);
  }
  const evidence = [
    hasApi ? `API layer: ${apiDir}/` : "API layer: not detected",
    hasUi ? `UI layer: ${uiSignal}` : "UI layer: not detected",
    hasDb ? `DB layer: ${dbSignal}` : "DB layer: not detected"
  ];
  if (layerCount === 3) {
    return makeResult("PASS", layerCount, [
      "API, UI, and DB layers all detected \u2014 full vertical coverage",
      ...evidence
    ]);
  }
  return makeResult("WARN", layerCount, [
    `only ${layerCount} of 3 layers detected \u2014 partial vertical coverage`,
    ...evidence
  ]);
}
var ROOT_TOOLING_FILES = [
  "Makefile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "Taskfile.yml",
  "Taskfile.yaml",
  "justfile",
  "Justfile",
  ".gitlab-ci.yml",
  ".gitlab-ci.yaml"
];
var CI_DIRS = [".github/workflows", ".circleci", ".buildkite", ".drone"];
function detectCrossLayerTooling(repoPath, _params) {
  const found = [];
  for (const f of ROOT_TOOLING_FILES) {
    if (existsSync5(join7(repoPath, f))) {
      found.push(f);
    }
  }
  for (const ciDir of CI_DIRS) {
    const ciDirPath = join7(repoPath, ciDir);
    if (!existsSync5(ciDirPath)) continue;
    let ciFiles = [];
    try {
      ciFiles = iterFiles(ciDirPath, ["*.yml", "*.yaml"]);
    } catch {
      ciFiles = [];
    }
    if (ciFiles.length > 0) {
      found.push(`${ciDir}/ (${ciFiles.length} workflow file(s))`);
    }
  }
  if (found.length > 0) {
    return makeResult("PASS", found.length, [
      `cross-layer tooling found: ${found.join(", ")}`,
      ...found.map((f) => `tooling: ${f}`)
    ]);
  }
  return makeResult("FAIL", 0, [
    "no cross-layer tooling found \u2014 no Makefile, docker-compose, or shared CI config at repo root"
  ]);
}
var DETECTORS5 = {
  2300: detectVerticalDelivery,
  // E2E-01 vertical delivery (computed)
  2301: detectNoLayerSplit,
  // E2E-02 no paired layer-split branches
  2302: detectBidirectionalLinks,
  // E2E-03 spec↔impl bidirectional links
  2303: detectLayerCoverage,
  // E2E-04 API + UI + DB layer coverage
  2304: detectCrossLayerTooling
  // E2E-05 cross-layer unified tooling
};

// plugins/awos/skills/ai-readiness-audit/detectors/security.ts
import { readFileSync as readFileSync7, existsSync as existsSync6 } from "node:fs";
import { join as join8, relative as relative7 } from "node:path";
var ENV_GITIGNORE_RX = /^\s*(\.env(\.\*)?|\*\.env|\*\*\/\.env|\/\.env)\s*(?:#.*)?$/m;
function detectEnvGitignored(repoPath, _params) {
  const gitignorePath = join8(repoPath, ".gitignore");
  if (!existsSync6(gitignorePath)) {
    return makeResult("FAIL", 0, [
      "no .gitignore file found \u2014 .env files are not excluded from version control"
    ]);
  }
  let content;
  try {
    content = readFileSync7(gitignorePath, "utf8");
  } catch {
    return makeResult("FAIL", 0, [".gitignore could not be read"]);
  }
  if (ENV_GITIGNORE_RX.test(content)) {
    return makeResult("PASS", 1, [
      ".gitignore covers .env files \u2014 environment secrets excluded from version control"
    ]);
  }
  return makeResult("FAIL", 0, [
    ".gitignore exists but does not cover .env files \u2014 add .env or .env.* to .gitignore"
  ]);
}
var HOOK_FILES_GLOBS = ["*.sh", "*.js", "*.ts", "*.py", "*.bash"];
var HOOK_SENSITIVE_RX = /\.env|secret|credential|\.pem|\.key/i;
function detectAgentSafetyHooks(repoPath, _params) {
  const settingsPaths = [
    join8(repoPath, ".claude", "settings.json"),
    join8(repoPath, ".claude", "settings.local.json")
  ];
  for (const sp of settingsPaths) {
    if (!existsSync6(sp)) continue;
    let content;
    try {
      content = readFileSync7(sp, "utf8");
    } catch {
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      if (/"hooks"\s*:/.test(content)) {
        return makeResult("PASS", 1, [
          `hooks key found in ${relative7(repoPath, sp)} \u2014 agent reads guarded by pre-tool hooks`
        ]);
      }
      continue;
    }
    if (parsed !== null && typeof parsed === "object" && "hooks" in parsed) {
      return makeResult("PASS", 1, [
        `hooks configured in ${relative7(repoPath, sp)} \u2014 agent file-read actions can be controlled`
      ]);
    }
  }
  const hooksDir = join8(repoPath, ".claude", "hooks");
  if (existsSync6(hooksDir)) {
    const hookFiles = iterFiles(hooksDir, HOOK_FILES_GLOBS);
    for (const f of hookFiles) {
      let src;
      try {
        src = readFileSync7(f, "utf8");
      } catch {
        continue;
      }
      if (HOOK_SENSITIVE_RX.test(src)) {
        return makeResult("PASS", 1, [
          `hook script references sensitive file patterns: ${relative7(repoPath, f)}`
        ]);
      }
    }
    if (hookFiles.length > 0) {
      return makeResult("WARN", hookFiles.length, [
        `${hookFiles.length} hook file(s) found but none explicitly reference .env/secret patterns`,
        ...hookFiles.slice(0, 5).map((f) => `hook: ${relative7(repoPath, f)}`)
      ]);
    }
  }
  return makeResult("FAIL", 0, [
    "no Claude Code hooks configured \u2014 AI agents are not blocked from reading sensitive files"
  ]);
}
var ENV_EXAMPLE_GLOBS = [
  ".env.example",
  ".env.template",
  ".env.sample",
  ".env.dist",
  "env.example",
  "env.template"
];
function detectEnvExample(repoPath, _params) {
  const found = [];
  for (const name of ENV_EXAMPLE_GLOBS) {
    const full = join8(repoPath, name);
    if (existsSync6(full)) {
      found.push(name);
    }
  }
  if (found.length > 0) {
    return makeResult("PASS", found.length, [
      `environment template file(s) found: ${found.join(", ")}`,
      ...found.map((f) => `env template: ${f}`)
    ]);
  }
  return makeResult("FAIL", 0, [
    "no .env.example or .env.template file found \u2014 developers have no reference for required environment variables"
  ]);
}
var SECRET_PATTERNS = [
  // AWS access/secret keys (long alphanumeric tokens)
  /AKIA[0-9A-Z]{16}/,
  // Generic assignment: key/secret/token/password/credential = "non-trivial-value"
  /(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|credential|private[_-]?key)\s*[:=]\s*["']([A-Za-z0-9/+\-_.]{12,})["']/i
];
var PLACEHOLDER_RX = /test|fake|example|dummy|xxx|your[_-]|placeholder|changeme|replace|<[^>]+>|\$\{[^}]+\}|env\(|process\.env|os\.environ|getenv/i;
var SOURCE_GLOBS_SEC = [
  "*.py",
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.java",
  "*.kt",
  "*.go",
  "*.rb",
  "*.php",
  "*.env",
  "*.yaml",
  "*.yml",
  "*.json",
  "*.toml",
  "*.ini",
  "*.cfg",
  "*.conf"
];
var SEC_IGNORE = [
  ".git",
  "node_modules",
  "dist",
  "build",
  ".venv",
  "__pycache__",
  ".next",
  "target",
  "vendor",
  "fixtures",
  "testdata",
  "__tests__",
  "test",
  "tests"
];
function detectNoSecretsCommitted(repoPath, _params) {
  const files = iterFiles(repoPath, SOURCE_GLOBS_SEC, SEC_IGNORE);
  const hits = [];
  for (const filePath of files) {
    let content;
    try {
      content = readFileSync7(filePath, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*(#|\/\/|\/\*)/.test(line)) continue;
      for (const pat of SECRET_PATTERNS) {
        if (!pat.test(line)) continue;
        if (PLACEHOLDER_RX.test(line)) continue;
        hits.push({
          file: relative7(repoPath, filePath),
          line: i + 1,
          pattern: pat.source.slice(0, 40)
        });
        break;
      }
    }
    if (hits.length >= 20) break;
  }
  if (hits.length === 0) {
    return makeResult("PASS", 0, [
      "no hardcoded secret patterns found in tracked source files"
    ]);
  }
  const evidence = hits.slice(0, 10).map((h) => `${h.file}:${h.line} possible secret (pattern: ${h.pattern})`);
  if (hits.length <= 2) {
    return makeResult("WARN", hits.length, [
      `${hits.length} possible secret pattern(s) found \u2014 review manually`,
      ...evidence
    ]);
  }
  return makeResult("FAIL", hits.length, [
    `${hits.length} possible hardcoded secret pattern(s) found in committed files`,
    ...evidence
  ]);
}
var SENSITIVE_PATTERNS = [
  { name: "*.pem", rx: /^\s*\*\.pem\s*(?:#.*)?$/m },
  { name: "*.key", rx: /^\s*\*\.key\s*(?:#.*)?$/m },
  { name: "*.p12", rx: /^\s*\*\.p12\s*(?:#.*)?$/m },
  { name: "*.pfx", rx: /^\s*\*\.pfx\s*(?:#.*)?$/m },
  { name: "*.jks", rx: /^\s*\*\.jks\s*(?:#.*)?$/m },
  { name: "*.keystore", rx: /^\s*\*\.keystore\s*(?:#.*)?$/m },
  { name: "credentials.json", rx: /^\s*credentials\.json\s*(?:#.*)?$/m },
  { name: "secrets.yaml", rx: /^\s*(secrets\.yaml|secrets\.yml)\s*(?:#.*)?$/m },
  { name: "kubeconfig", rx: /^\s*kubeconfig\s*(?:#.*)?$/m }
];
function detectSensitiveFilesGitignored(repoPath, _params) {
  const gitignorePath = join8(repoPath, ".gitignore");
  if (!existsSync6(gitignorePath)) {
    return makeResult("FAIL", 0, [
      "no .gitignore file found \u2014 sensitive file types are not excluded from version control"
    ]);
  }
  let content;
  try {
    content = readFileSync7(gitignorePath, "utf8");
  } catch {
    return makeResult("FAIL", 0, [".gitignore could not be read"]);
  }
  const covered = SENSITIVE_PATTERNS.filter(({ rx }) => rx.test(content));
  if (covered.length >= 3) {
    return makeResult("PASS", covered.length, [
      `${covered.length} sensitive file type pattern(s) covered in .gitignore`,
      ...covered.map(({ name }) => `gitignored: ${name}`)
    ]);
  }
  if (covered.length >= 1) {
    const missing = SENSITIVE_PATTERNS.filter(({ rx }) => !rx.test(content));
    return makeResult("WARN", covered.length, [
      `only ${covered.length} sensitive pattern(s) covered \u2014 add *.pem, *.key, *.p12, *.pfx to .gitignore`,
      ...covered.map(({ name }) => `covered: ${name}`),
      ...missing.slice(0, 5).map(({ name }) => `not covered: ${name}`)
    ]);
  }
  return makeResult("FAIL", 0, [
    "no sensitive file type patterns (*.pem, *.key, *.p12, *.pfx \u2026) found in .gitignore"
  ]);
}
var DETECTORS6 = {
  2600: detectEnvGitignored,
  // SEC-01 .env gitignored
  2601: detectAgentSafetyHooks,
  // SEC-02 agent safety hooks
  2602: detectEnvExample,
  // SEC-03 .env.example present
  2603: detectNoSecretsCommitted,
  // SEC-04 no secrets committed
  2604: detectSensitiveFilesGitignored
  // SEC-05 sensitive file types gitignored
};

// plugins/awos/skills/ai-readiness-audit/detectors/supply_chain_security.ts
import { readFileSync as readFileSync8, existsSync as existsSync7 } from "node:fs";
import { join as join9, relative as relative8, basename as basename4 } from "node:path";
var LOCKFILES2 = [
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  "gradle.lockfile",
  "poetry.lock",
  "uv.lock",
  "Cargo.lock",
  "go.sum",
  "Gemfile.lock",
  "composer.lock",
  "mix.lock",
  "pdm.lock",
  "requirements.txt",
  // pip freeze output commonly committed as lockfile
  "pip.lock"
];
function detectScsLockfiles(repoPath, _params) {
  const found = iterFiles(repoPath, LOCKFILES2).map((p) => basename4(p));
  if (found.length > 0) {
    const uniq = [...new Set(found)].sort();
    return makeResult(
      "PASS",
      uniq.length,
      uniq.map((n) => `lockfile present: ${n}`)
    );
  }
  return makeResult("FAIL", 0, ["no dependency lockfile found"]);
}
var LOCKFILE_INTEGRITY_CHECKS = [
  {
    name: /package-lock\.json$/,
    integrityRx: /"integrity"\s*:\s*"sha\d+-/
  },
  {
    name: /pnpm-lock\.yaml$/,
    integrityRx: /^\s*integrity:\s*sha\d+-/m
  },
  {
    name: /yarn\.lock$/,
    integrityRx: /^\s+(checksum|integrity):\s/m
  },
  {
    name: /poetry\.lock$/,
    integrityRx: /hash\s*=\s*"sha256:/m
  },
  {
    name: /Cargo\.lock$/,
    integrityRx: /^checksum\s*=\s*"/m
  },
  {
    name: /uv\.lock$/,
    integrityRx: /hash\s*=\s*"sha256:/m
  },
  {
    name: /go\.sum$/,
    // go.sum lines are always hashes — the file is the integrity manifest.
    integrityRx: /\s+h1:/
  },
  {
    name: /Gemfile\.lock$/,
    integrityRx: /^\s+[A-Za-z0-9+/]+=$/m
  }
];
function detectLockfileIntegrity(repoPath, _params) {
  const lockfileNames = LOCKFILES2.filter((n) => !n.includes("requirements"));
  const presentLockfiles = iterFiles(repoPath, lockfileNames);
  if (presentLockfiles.length === 0) {
    return makeResult("SKIP", 0, [
      "no lockfiles found \u2014 lockfile integrity check skipped"
    ]);
  }
  const withHashes = [];
  const withoutHashes = [];
  for (const filePath of presentLockfiles) {
    const name = basename4(filePath);
    const check = LOCKFILE_INTEGRITY_CHECKS.find(
      ({ name: rx }) => rx.test(name)
    );
    if (!check) continue;
    let content;
    try {
      content = readFileSync8(filePath, "utf8");
    } catch {
      continue;
    }
    if (check.integrityRx.test(content)) {
      withHashes.push(name);
    } else {
      withoutHashes.push(name);
    }
  }
  if (withHashes.length > 0) {
    return makeResult("PASS", withHashes.length, [
      `${withHashes.length} lockfile(s) include cryptographic integrity hashes`,
      ...withHashes.map((n) => `lockfile with hashes: ${n}`),
      ...withoutHashes.map((n) => `lockfile without hashes: ${n}`)
    ]);
  }
  if (withoutHashes.length > 0) {
    return makeResult("WARN", 0, [
      `${withoutHashes.length} lockfile(s) found but none include integrity hashes`,
      ...withoutHashes.map((n) => `lockfile without hashes: ${n}`)
    ]);
  }
  return makeResult("SKIP", 0, [
    "lockfiles present but none matched known integrity-check format \u2014 skipped"
  ]);
}
function countPackageJsonRanges(content) {
  let pkg;
  try {
    pkg = JSON.parse(content);
  } catch {
    return { total: 0, ranged: 0 };
  }
  if (pkg === null || typeof pkg !== "object") return { total: 0, ranged: 0 };
  const rec = pkg;
  const depGroups = [
    rec["dependencies"],
    rec["devDependencies"],
    rec["peerDependencies"],
    rec["optionalDependencies"]
  ].filter(
    (g) => g !== null && typeof g === "object"
  );
  let total = 0;
  let ranged = 0;
  for (const group of depGroups) {
    for (const ver of Object.values(group)) {
      if (typeof ver !== "string") continue;
      total++;
      if (/^\^|^~|^>=|^>|^\*|^x$/.test(ver.trim())) ranged++;
    }
  }
  return { total, ranged };
}
function countRequirementsTxtRanges(content) {
  const lines = content.split("\n").filter((l) => {
    const t = l.trim();
    return t.length > 0 && !t.startsWith("#") && !t.startsWith("-");
  });
  let total = 0;
  let ranged = 0;
  for (const line of lines) {
    if (!/[A-Za-z]/.test(line)) continue;
    total++;
    if (!/==\s*[\d]/.test(line)) ranged++;
  }
  return { total, ranged };
}
function detectPinnedVersions(repoPath, _params) {
  let totalDeps = 0;
  let rangedDeps = 0;
  const evidence = [];
  const pkgJsonFiles = iterFiles(repoPath, ["package.json"]);
  for (const f of pkgJsonFiles) {
    if (f.includes("node_modules")) continue;
    let content;
    try {
      content = readFileSync8(f, "utf8");
    } catch {
      continue;
    }
    const counts = countPackageJsonRanges(content);
    totalDeps += counts.total;
    rangedDeps += counts.ranged;
    if (counts.ranged > 0) {
      evidence.push(
        `${relative8(repoPath, f)}: ${counts.ranged}/${counts.total} ranged deps`
      );
    }
  }
  const reqFiles = iterFiles(repoPath, [
    "requirements.txt",
    "requirements*.txt"
  ]);
  for (const f of reqFiles) {
    let content;
    try {
      content = readFileSync8(f, "utf8");
    } catch {
      continue;
    }
    const counts = countRequirementsTxtRanges(content);
    totalDeps += counts.total;
    rangedDeps += counts.ranged;
    if (counts.ranged > 0) {
      evidence.push(
        `${relative8(repoPath, f)}: ${counts.ranged}/${counts.total} unpinned deps`
      );
    }
  }
  if (totalDeps === 0) {
    return makeResult("SKIP", 0, [
      "no package manifests found \u2014 pinned-version check skipped"
    ]);
  }
  const ratio = rangedDeps / totalDeps;
  if (ratio >= 0.3) {
    return makeResult(
      "FAIL",
      rangedDeps,
      [
        `${rangedDeps}/${totalDeps} dependencies use open-ended version ranges (${Math.round(ratio * 100)}%)`,
        ...evidence
      ],
      "detected"
    );
  }
  if (ratio >= 0.1) {
    return makeResult(
      "WARN",
      rangedDeps,
      [
        `${rangedDeps}/${totalDeps} dependencies use open-ended version ranges (${Math.round(ratio * 100)}%)`,
        ...evidence
      ],
      "detected"
    );
  }
  return makeResult(
    "PASS",
    totalDeps - rangedDeps,
    [
      `${totalDeps - rangedDeps}/${totalDeps} dependencies are pinned to exact versions`,
      ...evidence
    ],
    "detected"
  );
}
function detectScsQuarantineAge(repoPath, _params) {
  return makeResult(
    "SKIP",
    null,
    [
      "SCS-04 (quarantine-age) requires live registry API calls to resolve per-version publish timestamps",
      "This check is non-deterministic offline \u2014 it is intentionally skipped by the static detector",
      "To evaluate: query npm/PyPI/crates.io registry APIs and verify each pinned version is \u22657 days old"
    ],
    "computed"
  );
}
var DEPENDABOT_PATHS = [".github/dependabot.yml", ".github/dependabot.yaml"];
var RENOVATE_PATHS = [
  "renovate.json",
  "renovate.json5",
  ".renovaterc",
  ".renovaterc.json",
  ".github/renovate.json"
];
var AUTOMERGE_ENABLED_RX = /"automerge"\s*:\s*true|automerge:\s*true/;
function detectDependencyAutomationReview(repoPath, _params) {
  const foundFiles = [];
  let automergeEnabled = false;
  for (const relPath of [...DEPENDABOT_PATHS, ...RENOVATE_PATHS]) {
    const full = join9(repoPath, relPath);
    if (!existsSync7(full)) continue;
    foundFiles.push(relPath);
    let content;
    try {
      content = readFileSync8(full, "utf8");
    } catch {
      continue;
    }
    if (AUTOMERGE_ENABLED_RX.test(content)) {
      automergeEnabled = true;
    }
  }
  if (foundFiles.length === 0) {
    return makeResult("FAIL", 0, [
      "no dependency automation configuration found (Dependabot or Renovate) \u2014 automated dependency review not configured"
    ]);
  }
  if (automergeEnabled) {
    return makeResult("WARN", foundFiles.length, [
      "dependency automation configured but automerge is enabled \u2014 updates may merge without human review",
      ...foundFiles.map((f) => `config: ${f}`)
    ]);
  }
  return makeResult("PASS", foundFiles.length, [
    `dependency automation configured with review required: ${foundFiles.join(", ")}`,
    ...foundFiles.map((f) => `config: ${f}`)
  ]);
}
var CI_WORKFLOW_GLOBS = ["*.yml", "*.yaml"];
var CI_DIRS2 = [".github/workflows", ".circleci", ".buildkite", ".drone"];
var VULN_SCANNER_RX = /\b(pip-audit|safety\s|snyk|trivy|grype|osv-scanner|dependency-check|dependabot|audit\s+--json|npm\s+audit|yarn\s+audit|pnpm\s+audit)\b/i;
function detectVulnerabilityScanning(repoPath, _params) {
  const scanners = [];
  for (const ciDir of CI_DIRS2) {
    const ciDirPath = join9(repoPath, ciDir);
    if (!existsSync7(ciDirPath)) continue;
    let files = [];
    try {
      files = iterFiles(ciDirPath, CI_WORKFLOW_GLOBS);
    } catch {
      continue;
    }
    for (const f of files) {
      let content;
      try {
        content = readFileSync8(f, "utf8");
      } catch {
        continue;
      }
      const match = content.match(VULN_SCANNER_RX);
      if (match) {
        scanners.push(`${relative8(repoPath, f)} (${match[1]})`);
      }
    }
  }
  for (const p of DEPENDABOT_PATHS) {
    const full = join9(repoPath, p);
    if (!existsSync7(full)) continue;
    let content;
    try {
      content = readFileSync8(full, "utf8");
    } catch {
      continue;
    }
    if (/package-ecosystem/i.test(content)) {
      scanners.push(`${p} (Dependabot security-updates)`);
    }
  }
  if (scanners.length > 0) {
    return makeResult("PASS", scanners.length, [
      `vulnerability scanning configured in ${scanners.length} location(s)`,
      ...scanners.slice(0, 10).map((s) => `scanner: ${s}`)
    ]);
  }
  return makeResult("FAIL", 0, [
    "no vulnerability scanning found in CI workflows \u2014 add pip-audit, Snyk, Trivy, or Grype to your CI pipeline"
  ]);
}
var OVERRIDE_PACKAGE_JSON_RX = /"(resolutions|overrides)"\s*:/;
var PNPM_OVERRIDES_RX = /"pnpm"\s*:\s*\{[^}]*"overrides"\s*:/s;
function detectDependencyOverrides(repoPath, _params) {
  const foundOverrides = [];
  const pkgJsonFiles = iterFiles(repoPath, ["package.json"]);
  for (const f of pkgJsonFiles) {
    if (f.includes("node_modules")) continue;
    let content;
    try {
      content = readFileSync8(f, "utf8");
    } catch {
      continue;
    }
    if (OVERRIDE_PACKAGE_JSON_RX.test(content) || PNPM_OVERRIDES_RX.test(content)) {
      foundOverrides.push(`${relative8(repoPath, f)}: overrides/resolutions`);
    }
  }
  const cargoFiles = iterFiles(repoPath, ["Cargo.toml"]);
  for (const f of cargoFiles) {
    let content;
    try {
      content = readFileSync8(f, "utf8");
    } catch {
      continue;
    }
    if (/^\[patch\s*\./m.test(content)) {
      foundOverrides.push(`${relative8(repoPath, f)}: [patch.*] section`);
    }
  }
  if (foundOverrides.length === 0) {
    return makeResult("PASS", 0, [
      "no dependency overrides/resolutions/patches found \u2014 clean dependency tree"
    ]);
  }
  return makeResult("WARN", foundOverrides.length, [
    `${foundOverrides.length} dependency override(s) found \u2014 review for suspicious or recently-published pins`,
    ...foundOverrides
  ]);
}
function countPackageJsonDeps(content) {
  let pkg;
  try {
    pkg = JSON.parse(content);
  } catch {
    return 0;
  }
  if (pkg === null || typeof pkg !== "object") return 0;
  const rec = pkg;
  const deps = rec["dependencies"];
  const devDeps = rec["devDependencies"];
  const depCount = deps !== null && typeof deps === "object" ? Object.keys(deps).length : 0;
  const devCount = devDeps !== null && typeof devDeps === "object" ? Object.keys(devDeps).length : 0;
  return depCount + devCount;
}
function countRequirementsDeps(content) {
  return content.split("\n").filter((l) => {
    const t = l.trim();
    return t.length > 0 && !t.startsWith("#") && !t.startsWith("-");
  }).length;
}
function detectDependencyAttackSurface(repoPath, _params) {
  let totalDeps = 0;
  const sources = [];
  const pkgJsonFiles = iterFiles(repoPath, ["package.json"]);
  for (const f of pkgJsonFiles) {
    if (f.includes("node_modules")) continue;
    let content;
    try {
      content = readFileSync8(f, "utf8");
    } catch {
      continue;
    }
    const count = countPackageJsonDeps(content);
    if (count > 0) {
      totalDeps += count;
      sources.push(`${relative8(repoPath, f)}: ${count} deps`);
    }
  }
  const reqFiles = iterFiles(repoPath, ["requirements.txt"]);
  for (const f of reqFiles) {
    let content;
    try {
      content = readFileSync8(f, "utf8");
    } catch {
      continue;
    }
    const count = countRequirementsDeps(content);
    if (count > 0) {
      totalDeps += count;
      sources.push(`${relative8(repoPath, f)}: ${count} entries`);
    }
  }
  if (totalDeps === 0) {
    return makeResult(
      "SKIP",
      null,
      ["no package manifests found \u2014 dependency attack surface check skipped"],
      "computed"
    );
  }
  if (totalDeps <= 100) {
    return makeResult(
      "PASS",
      totalDeps,
      [
        `${totalDeps} total direct dependencies \u2014 within healthy range (\u2264 100)`,
        ...sources
      ],
      "computed"
    );
  }
  if (totalDeps <= 200) {
    return makeResult(
      "WARN",
      totalDeps,
      [
        `${totalDeps} total direct dependencies \u2014 large attack surface (101\u2013200); review for unused deps`,
        ...sources
      ],
      "computed"
    );
  }
  return makeResult(
    "FAIL",
    totalDeps,
    [
      `${totalDeps} total direct dependencies \u2014 excessive attack surface (> 200); audit and prune`,
      ...sources
    ],
    "computed"
  );
}
var DETECTORS7 = {
  2900: detectScsLockfiles,
  // SCS-01 lockfiles committed
  2901: detectLockfileIntegrity,
  // SCS-02 lockfile integrity hashes
  2902: detectPinnedVersions,
  // SCS-03 pinned dependency versions (detected)
  2903: detectScsQuarantineAge,
  // SCS-04 quarantine age (SKIP — requires live registry)
  2904: detectDependencyAutomationReview,
  // SCS-05 dependency automation with review
  2905: detectVulnerabilityScanning,
  // SCS-06 vulnerability scanning in CI
  2906: detectDependencyOverrides,
  // SCS-07 dependency overrides/patches
  2907: detectDependencyAttackSurface
  // SCS-08 dependency attack surface (computed)
};

// plugins/awos/skills/ai-readiness-audit/detectors/prompt_agent_integrity.ts
import { readFileSync as readFileSync9, existsSync as existsSync8 } from "node:fs";
import { join as join10, relative as relative9 } from "node:path";
import { execFileSync as execFileSync6 } from "node:child_process";
function isInvisibleCodePoint(cp) {
  return cp >= 8203 && cp <= 8207 || cp >= 8232 && cp <= 8238 || cp >= 8288 && cp <= 8303 || cp === 173 || cp === 65279 || cp >= 917504 && cp <= 917631;
}
function countInvisible(content) {
  let count = 0;
  for (const ch of content) {
    const cp = ch.codePointAt(0);
    if (cp !== void 0 && isInvisibleCodePoint(cp)) count++;
  }
  return count;
}
var AGENT_FILE_GLOBS = [
  "CLAUDE.md",
  "AGENTS.md",
  "*.md",
  "*.json",
  "*.sh",
  "*.ts",
  "*.js",
  "*.bash",
  "*.py"
];
function listAgentFiles(repoPath) {
  const results = [];
  for (const name of ["CLAUDE.md", "AGENTS.md", ".mcp.json"]) {
    const full = join10(repoPath, name);
    if (existsSync8(full)) results.push(full);
  }
  const claudeDir = join10(repoPath, ".claude");
  if (existsSync8(claudeDir)) {
    try {
      const files = iterFiles(claudeDir, AGENT_FILE_GLOBS);
      results.push(...files);
    } catch {
    }
  }
  return [...new Set(results)].sort();
}
function detectInvisibleUnicode(repoPath, _params) {
  const agentFiles = listAgentFiles(repoPath);
  if (agentFiles.length === 0) {
    return makeResult(
      "SKIP",
      null,
      ["no AI agent instruction files found \u2014 PAI-01 not applicable"],
      "detected"
    );
  }
  const hitFiles = [];
  for (const filePath of agentFiles) {
    let content;
    try {
      content = readFileSync9(filePath, "utf8");
    } catch {
      continue;
    }
    const count = countInvisible(content);
    if (count > 0) {
      hitFiles.push({ file: relative9(repoPath, filePath), count });
    }
  }
  if (hitFiles.length === 0) {
    return makeResult("PASS", 0, [
      `${agentFiles.length} AI agent file(s) scanned \u2014 no invisible Unicode characters found`
    ]);
  }
  const maxCount = Math.max(...hitFiles.map((h) => h.count));
  const evidence = hitFiles.map(
    (h) => `${h.file}: ${h.count} invisible Unicode code point(s) (U+200B/U+200D/U+FEFF/tag range)`
  );
  if (hitFiles.length >= 3 || maxCount >= 5) {
    return makeResult("FAIL", hitFiles.length, [
      `${hitFiles.length} agent file(s) contain invisible Unicode characters \u2014 potential hidden-instruction attack`,
      ...evidence
    ]);
  }
  return makeResult("WARN", hitFiles.length, [
    `${hitFiles.length} agent file(s) contain invisible Unicode characters \u2014 review for hidden content`,
    ...evidence
  ]);
}
var INJECTION_PATTERNS = [
  {
    name: "override-instructions",
    rx: /ignore\s+(previous|above|all)\s+(instructions?|rules?|guidelines?)/i
  },
  {
    name: "new-instructions-override",
    rx: /^#+ new instructions:|^new system prompt:|^override:\s/im
  },
  {
    name: "exfiltrate-curl",
    rx: /\bcurl\s+https?:\/\/(?!localhost|127\.0\.0\.1)/i
  },
  {
    name: "exfiltrate-post",
    rx: /\b(?:POST|fetch|axios\.post|requests\.post)\s*\(\s*["']https?:\/\/(?!localhost|127\.0\.0\.1)/i
  },
  {
    name: "jailbreak-dan",
    rx: /\b(?:DAN\s+mode|act\s+as\s+DAN|you\s+are\s+now\s+(?:DAN|an\s+AI\s+without))/i
  },
  {
    name: "hidden-html-instruction",
    rx: /<!--\s*(?:ignore|system|override|instruction)/i
  }
];
function detectPromptInjection(repoPath, _params) {
  const agentFiles = listAgentFiles(repoPath);
  if (agentFiles.length === 0) {
    return makeResult(
      "SKIP",
      null,
      ["no AI agent instruction files found \u2014 PAI-02 not applicable"],
      "detected"
    );
  }
  const hits = [];
  for (const filePath of agentFiles) {
    let content;
    try {
      content = readFileSync9(filePath, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { name, rx } of INJECTION_PATTERNS) {
        if (rx.test(line)) {
          hits.push({
            file: relative9(repoPath, filePath),
            line: i + 1,
            pattern: name
          });
          break;
        }
      }
    }
    if (hits.length >= 20) break;
  }
  if (hits.length === 0) {
    return makeResult("PASS", 0, [
      `${agentFiles.length} agent file(s) scanned \u2014 no prompt injection patterns found`
    ]);
  }
  const evidence = hits.slice(0, 10).map((h) => `${h.file}:${h.line} [${h.pattern}]`);
  if (hits.length >= 3) {
    return makeResult("FAIL", hits.length, [
      `${hits.length} prompt injection pattern(s) found in agent instruction files`,
      ...evidence
    ]);
  }
  return makeResult("WARN", hits.length, [
    `${hits.length} possible prompt injection pattern(s) found \u2014 review manually`,
    ...evidence
  ]);
}
var HOOK_RED_FLAGS = [
  {
    name: "exfiltrate-curl-wget",
    rx: /\b(curl|wget)\s+(?:-[a-zA-Z]+\s+)*https?:\/\/(?!localhost|127\.0\.0\.1)/
  },
  {
    name: "eval-exec-dynamic",
    rx: /\beval\s+["'`]?\s*\$[({]/
  },
  {
    name: "base64-pipe-shell",
    rx: /base64\s+(?:-[a-zA-Z]+\s+)?(?:\S+\s+)?[|]\s*(?:sh|bash|zsh|exec)\b/i
  },
  {
    name: "netcat-exfiltration",
    rx: /\b(nc|ncat)\s+(?!-[lL])\S+\s+\d{2,5}/
  },
  {
    name: "download-execute",
    rx: /(?:curl|wget)\s+[^|]*\|\s*(?:sh|bash|zsh|python|node|ruby)/i
  }
];
var HOOK_SCRIPT_GLOBS = ["*.sh", "*.bash", "*.js", "*.ts", "*.py"];
function detectHookScriptSafety(repoPath, _params) {
  const hooksDir = join10(repoPath, ".claude", "hooks");
  if (!existsSync8(hooksDir)) {
    return makeResult(
      "SKIP",
      null,
      ["no .claude/hooks/ directory found \u2014 PAI-03 not applicable"],
      "detected"
    );
  }
  let hookFiles = [];
  try {
    hookFiles = iterFiles(hooksDir, HOOK_SCRIPT_GLOBS);
  } catch {
    hookFiles = [];
  }
  if (hookFiles.length === 0) {
    return makeResult("PASS", 0, [
      "no hook scripts found in .claude/hooks/ \u2014 PAI-03 not applicable"
    ]);
  }
  const flaggedFiles = [];
  for (const filePath of hookFiles) {
    let content;
    try {
      content = readFileSync9(filePath, "utf8");
    } catch {
      continue;
    }
    const flags = [];
    for (const { name, rx } of HOOK_RED_FLAGS) {
      if (rx.test(content)) flags.push(name);
    }
    if (flags.length > 0) {
      flaggedFiles.push({ file: relative9(repoPath, filePath), flags });
    }
  }
  if (flaggedFiles.length === 0) {
    return makeResult("PASS", hookFiles.length, [
      `${hookFiles.length} hook script(s) scanned \u2014 no exfiltration or obfuscation patterns found`
    ]);
  }
  const evidence = flaggedFiles.map(
    (f) => `${f.file}: suspicious patterns [${f.flags.join(", ")}]`
  );
  if (flaggedFiles.length >= 3) {
    return makeResult("FAIL", flaggedFiles.length, [
      `${flaggedFiles.length} hook script(s) contain exfiltration or obfuscation patterns`,
      ...evidence
    ]);
  }
  return makeResult("WARN", flaggedFiles.length, [
    `${flaggedFiles.length} hook script(s) contain suspicious patterns \u2014 review manually`,
    ...evidence
  ]);
}
var BARE_IP_RX = /https?:\/\/(?!localhost|127\.0\.0\.1)\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/;
var HTTP_REMOTE_RX = /http:\/\/(?!localhost|127\.0\.0\.1)/;
var EMBEDDED_CRED_RX = /https?:\/\/[^@\s]{3,}:[^@\s]{3,}@/;
var API_KEY_IN_URL_RX = /[?&](?:api_?key|token|secret|password)=[A-Za-z0-9]{8,}/i;
function detectMcpEndpointSafety(repoPath, _params) {
  const mcpPath = join10(repoPath, ".mcp.json");
  if (!existsSync8(mcpPath)) {
    return makeResult("SKIP", null, [
      "no .mcp.json found \u2014 PAI-04 not applicable"
    ]);
  }
  let content;
  try {
    content = readFileSync9(mcpPath, "utf8");
  } catch {
    return makeResult("SKIP", null, [
      ".mcp.json could not be read \u2014 PAI-04 skipped"
    ]);
  }
  const issues = [];
  if (BARE_IP_RX.test(content)) {
    issues.push(
      "bare IP address found in MCP endpoint URL \u2014 use hostname instead"
    );
  }
  if (HTTP_REMOTE_RX.test(content)) {
    issues.push(
      "HTTP (non-HTTPS) remote endpoint found in .mcp.json \u2014 use HTTPS for remote servers"
    );
  }
  if (EMBEDDED_CRED_RX.test(content)) {
    issues.push(
      "embedded credentials (user:pass@host) found in MCP URL \u2014 use environment variables instead"
    );
  }
  if (API_KEY_IN_URL_RX.test(content)) {
    issues.push(
      "API key or token embedded in MCP URL query string \u2014 use environment variables instead"
    );
  }
  if (issues.length === 0) {
    return makeResult("PASS", 1, [
      ".mcp.json uses safe endpoints (HTTPS or localhost only, no embedded credentials)"
    ]);
  }
  return makeResult("FAIL", issues.length, [
    `${issues.length} MCP endpoint safety issue(s) found in .mcp.json`,
    ...issues
  ]);
}
function isGitTracked(repoPath, filePath) {
  try {
    execFileSync6("git", ["ls-files", "--error-unmatch", filePath], {
      cwd: repoPath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    return true;
  } catch {
    return false;
  }
}
function detectAgentFilesTracked(repoPath, _params) {
  const agentFiles = listAgentFiles(repoPath);
  if (agentFiles.length === 0) {
    return makeResult(
      "SKIP",
      null,
      ["no AI agent instruction files found \u2014 PAI-05 not applicable"],
      "detected"
    );
  }
  try {
    execFileSync6("git", ["rev-parse", "--git-dir"], {
      cwd: repoPath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return makeResult("SKIP", null, [
      "not a git repository \u2014 git provenance check (PAI-05) skipped"
    ]);
  }
  const untracked = [];
  const tracked = [];
  for (const filePath of agentFiles) {
    if (isGitTracked(repoPath, filePath)) {
      tracked.push(relative9(repoPath, filePath));
    } else {
      untracked.push(relative9(repoPath, filePath));
    }
  }
  if (untracked.length === 0) {
    return makeResult("PASS", tracked.length, [
      `all ${tracked.length} AI agent file(s) are tracked in git \u2014 auditable change history`
    ]);
  }
  const evidence = untracked.map((f) => `untracked: ${f}`);
  if (untracked.length >= 3) {
    return makeResult("FAIL", untracked.length, [
      `${untracked.length} AI agent file(s) are not tracked in git \u2014 changes bypass code review`,
      ...evidence
    ]);
  }
  return makeResult("WARN", untracked.length, [
    `${untracked.length} AI agent file(s) are not tracked in git \u2014 add to git for auditability`,
    ...evidence
  ]);
}
var BYPASS_PATTERNS = [
  {
    name: "bypass-security",
    rx: /\b(?:bypass|skip|disable|circumvent)\s+(?:security|auth|authentication|authorization|ssl|tls|https?)\b/i
  },
  {
    name: "read-env-secrets",
    rx: /\b(?:cat|read|open|access)\s+\.env\b|read\s+(?:secrets?|credentials?)\b/i
  },
  {
    name: "chmod-world-writable",
    rx: /chmod\s+(?:0?777|a\+rwx|ugo\+rwx)/
  },
  {
    name: "git-no-verify",
    rx: /git\s+commit\s+.*--no-verify|git\s+push\s+.*--no-verify/
  },
  {
    name: "rm-root-destructive",
    rx: /rm\s+-[a-zA-Z]*r[a-zA-Z]*f?\s+\/(?:\s|$)|rm\s+-rf\s+\//
  },
  {
    name: "disable-ssl-verify",
    rx: /--no-check-certificate|ssl_verify\s*=\s*false|verify\s*=\s*false|insecure\s+https?/i
  }
];
var COMMAND_SKILL_GLOBS = ["*.md", "*.sh", "*.ts", "*.js", "*.py", "*.bash"];
function detectNoSecurityBypass(repoPath, _params) {
  const commandsDir = join10(repoPath, ".claude", "commands");
  const skillsDir = join10(repoPath, ".claude", "skills");
  const hasCmds = existsSync8(commandsDir);
  const hasSkills = existsSync8(skillsDir);
  if (!hasCmds && !hasSkills) {
    return makeResult(
      "SKIP",
      null,
      [
        "no .claude/commands/ or .claude/skills/ directories found \u2014 PAI-06 not applicable"
      ],
      "detected"
    );
  }
  const allFiles = [];
  for (const dir of [commandsDir, skillsDir]) {
    if (!existsSync8(dir)) continue;
    try {
      allFiles.push(...iterFiles(dir, COMMAND_SKILL_GLOBS));
    } catch {
    }
  }
  const hits = [];
  for (const filePath of allFiles) {
    let content;
    try {
      content = readFileSync9(filePath, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*(#|\/\/|<!--)/.test(line)) continue;
      for (const { name, rx } of BYPASS_PATTERNS) {
        if (rx.test(line)) {
          hits.push({
            file: relative9(repoPath, filePath),
            line: i + 1,
            pattern: name
          });
          break;
        }
      }
    }
    if (hits.length >= 20) break;
  }
  if (hits.length === 0) {
    return makeResult("PASS", allFiles.length, [
      `${allFiles.length} command/skill file(s) scanned \u2014 no security bypass instructions found`
    ]);
  }
  const evidence = hits.slice(0, 10).map((h) => `${h.file}:${h.line} [${h.pattern}]`);
  if (hits.length >= 3) {
    return makeResult("FAIL", hits.length, [
      `${hits.length} security bypass pattern(s) found in command/skill files`,
      ...evidence
    ]);
  }
  return makeResult("WARN", hits.length, [
    `${hits.length} possible security bypass pattern(s) found \u2014 review manually`,
    ...evidence
  ]);
}
var DETECTORS8 = {
  2400: detectInvisibleUnicode,
  // PAI-01 no invisible Unicode in agent files
  2401: detectPromptInjection,
  // PAI-02 no prompt injection patterns
  2402: detectHookScriptSafety,
  // PAI-03 hook script safety (SKIP if no hooks)
  2403: detectMcpEndpointSafety,
  // PAI-04 MCP endpoint safety (SKIP if no .mcp.json)
  2404: detectAgentFilesTracked,
  // PAI-05 agent files tracked in git
  2405: detectNoSecurityBypass
  // PAI-06 no security bypass in commands/skills
};

// plugins/awos/skills/ai-readiness-audit/detectors/quality_assurance.ts
import { readFileSync as readFileSync10, existsSync as existsSync9 } from "node:fs";
import { join as join11, relative as relative10, basename as basename5 } from "node:path";
var TEST_FILE_GLOBS = [
  "*.test.ts",
  "*.test.tsx",
  "*.test.js",
  "*.test.jsx",
  "*.spec.ts",
  "*.spec.tsx",
  "*.spec.js",
  "*.spec.jsx",
  "test_*.py",
  "*_test.py",
  "*_test.go",
  "*_test.java",
  "*Test.java",
  "*Test.kt",
  "*Spec.kt"
];
var SOURCE_FILE_GLOBS = [
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.py",
  "*.go",
  "*.java",
  "*.kt",
  "*.rb",
  "*.php"
];
var SOURCE_IGNORE = [
  ".git",
  "node_modules",
  "dist",
  "build",
  ".venv",
  "__pycache__",
  ".next",
  "target",
  "vendor",
  ".tox"
];
var INTEGRATION_DIR_RX = /\/(integration(?:[_-]?tests?)?|e2e[_-]?tests?|system[_-]?tests?|functional[_-]?tests?)\//i;
var INTEGRATION_FILE_RX = /[_.-](integration|contract|integration_test|it)[._-]/i;
var E2E_CONTENT_RX = /\b(playwright|cypress|puppeteer|selenium|webdriver|nightwatch|testcafe|detox|appium|supertest)\b/i;
var E2E_GLOBS = [
  "playwright.config.ts",
  "playwright.config.js",
  "cypress.json",
  "cypress.config.ts",
  "cypress.config.js",
  "nightwatch.conf.js",
  "wdio.conf.ts",
  "wdio.conf.js",
  "testcafe.config.js"
];
function detectTestInfrastructure(repoPath, _params) {
  let testFiles = [];
  try {
    testFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);
  } catch {
    testFiles = [];
  }
  let allSourceFiles = [];
  try {
    allSourceFiles = iterFiles(repoPath, SOURCE_FILE_GLOBS, SOURCE_IGNORE);
  } catch {
    allSourceFiles = [];
  }
  const testFileSet = new Set(testFiles);
  const pureSourceFiles = allSourceFiles.filter((f) => !testFileSet.has(f));
  const testCount = testFiles.length;
  const sourceCount = pureSourceFiles.length;
  if (sourceCount === 0) {
    return makeResult(
      "SKIP",
      null,
      ["no source files found \u2014 test infrastructure check skipped"],
      "computed"
    );
  }
  const ratio = testCount / sourceCount;
  const pct = Math.round(ratio * 100);
  const evidence = [
    `${testCount} test file(s) found for ${sourceCount} source module(s) (${pct}% ratio)`,
    ...testFiles.slice(0, 5).map((f) => `test file: ${relative10(repoPath, f)}`)
  ];
  if (ratio >= 0.6) {
    return makeResult(
      "PASS",
      ratio,
      [
        `test coverage proxy: ${pct}% \u2014 meaningful tests covering \u2265 60% of source modules`,
        ...evidence
      ],
      "computed"
    );
  }
  if (ratio >= 0.3) {
    return makeResult(
      "WARN",
      ratio,
      [
        `test coverage proxy: ${pct}% \u2014 partial test coverage (below 60% threshold)`,
        ...evidence
      ],
      "computed"
    );
  }
  return makeResult(
    "FAIL",
    ratio,
    [
      `test coverage proxy: ${pct}% \u2014 insufficient test coverage (below 30% threshold)`,
      ...evidence
    ],
    "computed"
  );
}
var UNIT_DIR_RX = /\/(unit[_-]?tests?|__tests?__|spec)\//i;
var MOCK_CONTENT_RX = /\b(mock|stub|spy|jest\.fn|MagicMock|unittest\.mock|double|sinon|vitest\.fn)\b/i;
function detectUnitTests(repoPath, _params) {
  let testFiles = [];
  try {
    testFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);
  } catch {
    testFiles = [];
  }
  if (testFiles.length === 0) {
    return makeResult("FAIL", 0, [
      "no test files found \u2014 unit tests not detected"
    ]);
  }
  const unitSignals = [];
  for (const f of testFiles.slice(0, 50)) {
    const rel = relative10(repoPath, f);
    if (UNIT_DIR_RX.test("/" + rel)) {
      unitSignals.push(`unit dir: ${rel}`);
      continue;
    }
    let content;
    try {
      content = readFileSync10(f, "utf8");
    } catch {
      continue;
    }
    if (MOCK_CONTENT_RX.test(content)) {
      unitSignals.push(`mock/stub patterns in: ${rel}`);
    }
  }
  const evidence = unitSignals.length > 0 ? unitSignals.slice(0, 10) : testFiles.slice(0, 5).map((f) => `test file: ${relative10(repoPath, f)}`);
  return makeResult("PASS", testFiles.length, [
    `${testFiles.length} test file(s) found \u2014 unit test tier detected`,
    ...evidence
  ]);
}
var INTEGRATION_CONTENT_RX = /\b(TestContainers?|testcontainers|DatabaseTestCase|IntegrationTest|@SpringBootTest|@DataJpaTest|httptest\.NewServer|requests\.get|supertest|axios\.get\(|fetch\()\b/i;
var INTEGRATION_FILE_NAME_RX = /integration|contract|system[_-]test/i;
var TEST_DOCKER_GLOBS = ["docker-compose*.yml", "docker-compose*.yaml"];
function detectIntegrationTests(repoPath, _params) {
  const signals = [];
  let allTestFiles = [];
  try {
    allTestFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);
  } catch {
    allTestFiles = [];
  }
  for (const f of allTestFiles) {
    const rel = relative10(repoPath, f);
    if (INTEGRATION_DIR_RX.test("/" + rel)) {
      signals.push(`integration dir: ${rel}`);
    }
    if (INTEGRATION_FILE_NAME_RX.test(basename5(f))) {
      signals.push(`integration file name: ${rel}`);
    }
    if (signals.length >= 5) break;
  }
  if (signals.length < 5) {
    for (const f of allTestFiles.slice(0, 100)) {
      let content;
      try {
        content = readFileSync10(f, "utf8");
      } catch {
        continue;
      }
      if (INTEGRATION_CONTENT_RX.test(content)) {
        signals.push(`integration patterns in: ${relative10(repoPath, f)}`);
        if (signals.length >= 5) break;
      }
    }
  }
  const testsDir = join11(repoPath, "tests");
  const testDir2 = join11(repoPath, "test");
  for (const tDir of [testsDir, testDir2]) {
    if (!existsSync9(tDir)) continue;
    let dcFiles = [];
    try {
      dcFiles = iterFiles(tDir, TEST_DOCKER_GLOBS);
    } catch {
      dcFiles = [];
    }
    if (dcFiles.length > 0) {
      signals.push(
        `docker-compose in tests dir: ${relative10(repoPath, dcFiles[0])}`
      );
    }
  }
  if (signals.length === 0) {
    return makeResult("FAIL", 0, [
      "no integration test signals found \u2014 add tests that exercise real databases, HTTP calls, or message queues"
    ]);
  }
  return makeResult("PASS", signals.length, [
    `integration test tier detected (${signals.length} signal(s))`,
    ...signals.slice(0, 10)
  ]);
}
var E2E_DIR_RX = /\/(e2e[_-]?tests?|acceptance[_-]?tests?|ui[_-]?tests?)\//i;
function detectE2ETests(repoPath, _params) {
  const signals = [];
  for (const glob of E2E_GLOBS) {
    const matches = iterFiles(repoPath, [glob]);
    if (matches.length > 0) {
      signals.push(`E2E config: ${relative10(repoPath, matches[0])}`);
    }
  }
  let testFiles = [];
  try {
    testFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);
  } catch {
    testFiles = [];
  }
  for (const f of testFiles) {
    const rel = relative10(repoPath, f);
    if (E2E_DIR_RX.test("/" + rel)) {
      signals.push(`e2e dir: ${rel}`);
      if (signals.length >= 5) break;
    }
  }
  if (signals.length < 5) {
    for (const f of testFiles.slice(0, 100)) {
      let content;
      try {
        content = readFileSync10(f, "utf8");
      } catch {
        continue;
      }
      if (E2E_CONTENT_RX.test(content)) {
        signals.push(`E2E framework in: ${relative10(repoPath, f)}`);
        if (signals.length >= 5) break;
      }
    }
  }
  if (signals.length === 0) {
    return makeResult("FAIL", 0, [
      "no end-to-end test signals found \u2014 add E2E tests with Playwright, Cypress, or similar"
    ]);
  }
  return makeResult("PASS", signals.length, [
    `E2E test tier detected (${signals.length} signal(s))`,
    ...signals.slice(0, 10)
  ]);
}
function detectTestPyramid(repoPath, _params) {
  let testFiles = [];
  try {
    testFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);
  } catch {
    testFiles = [];
  }
  if (testFiles.length === 0) {
    return makeResult(
      "SKIP",
      null,
      ["no test files found \u2014 pyramid shape not computable"],
      "computed"
    );
  }
  let unitCount = 0;
  let integrationCount = 0;
  let e2eCount = 0;
  for (const f of testFiles) {
    const rel = "/" + relative10(repoPath, f);
    if (E2E_DIR_RX.test(rel)) {
      e2eCount++;
      continue;
    }
    if (INTEGRATION_DIR_RX.test(rel) || INTEGRATION_FILE_RX.test(basename5(f))) {
      integrationCount++;
      continue;
    }
    let isE2E = false;
    try {
      const content = readFileSync10(f, "utf8");
      isE2E = E2E_CONTENT_RX.test(content);
    } catch {
    }
    if (isE2E) {
      e2eCount++;
    } else {
      unitCount++;
    }
  }
  const evidence = [
    `unit: ${unitCount} | integration: ${integrationCount} | e2e: ${e2eCount}`
  ];
  const unitDominates = unitCount > integrationCount;
  const e2eSmallest = e2eCount === 0 || integrationCount >= e2eCount;
  if (unitDominates && e2eSmallest) {
    return makeResult(
      "PASS",
      unitCount,
      [`test pyramid shape is healthy`, ...evidence],
      "computed"
    );
  }
  if (!unitDominates && unitCount > 0) {
    return makeResult(
      "WARN",
      integrationCount,
      [
        `test pyramid may be inverted \u2014 integration (${integrationCount}) meets or exceeds unit (${unitCount})`,
        ...evidence
      ],
      "computed"
    );
  }
  return makeResult(
    "FAIL",
    0,
    [
      `test pyramid is inverted \u2014 unit (${unitCount}) is not the largest tier`,
      ...evidence
    ],
    "computed"
  );
}
var COVERAGE_CONFIG_FILES = [
  ".nycrc",
  ".nycrc.json",
  ".c8rc",
  ".coveragerc",
  "codecov.yml",
  ".codecov.yml",
  "jest.config.ts",
  "jest.config.js",
  "jest.config.json",
  "vitest.config.ts",
  "vitest.config.js"
];
var COVERAGE_CONTENT_RX = /coverageThreshold|coverage[_-]?report|coverage[_-]?min|(?:\[tool\.coverage)|codecov|nyc|c8\b|--coverage\b/i;
function detectCoverageConfig(repoPath, _params) {
  const signals = [];
  for (const name of COVERAGE_CONFIG_FILES) {
    const full = join11(repoPath, name);
    if (existsSync9(full)) {
      signals.push(`coverage config: ${name}`);
    }
  }
  const pkgJson = join11(repoPath, "package.json");
  if (existsSync9(pkgJson)) {
    let content;
    try {
      content = readFileSync10(pkgJson, "utf8");
    } catch {
      content = "";
    }
    if (COVERAGE_CONTENT_RX.test(content)) {
      signals.push("coverage settings in package.json");
    }
  }
  for (const name of ["pyproject.toml", "setup.cfg"]) {
    const full = join11(repoPath, name);
    if (!existsSync9(full)) continue;
    let content;
    try {
      content = readFileSync10(full, "utf8");
    } catch {
      continue;
    }
    if (/\[tool\.coverage|coverage_report|coveragerc/i.test(content)) {
      signals.push(`coverage config in ${name}`);
    }
  }
  if (signals.length > 0) {
    return makeResult("PASS", signals.length, [
      `coverage measurement configured (${signals.length} signal(s))`,
      ...signals
    ]);
  }
  return makeResult("FAIL", 0, [
    "no test coverage configuration found \u2014 add jest/vitest coverage, .coveragerc, or codecov"
  ]);
}
var FIXTURE_DIR_NAMES = [
  "fixtures",
  "testdata",
  "test-data",
  "test_data",
  "__fixtures__",
  "factories",
  "factory"
];
var FACTORY_CONTENT_RX = /\b(factory_boy|FactoryGirl|FactoryBot|faker|Faker|TestDataBuilder|test[_-]?factory|data[_-]?builder|use_factory|create_factory|generate_fake)\b/i;
var CONFTEST_GLOBS = ["conftest.py", "test_helpers.*", "test-helpers.*"];
function detectTestDataManagement(repoPath, _params) {
  const signals = [];
  for (const name of FIXTURE_DIR_NAMES) {
    const full = join11(repoPath, name);
    if (existsSync9(full)) {
      signals.push(`fixture directory: ${name}/`);
      break;
    }
    for (const testRoot of ["test", "tests", "__tests__"]) {
      const nested = join11(repoPath, testRoot, name);
      if (existsSync9(nested)) {
        signals.push(`fixture directory: ${testRoot}/${name}/`);
        break;
      }
    }
    if (signals.length > 0) break;
  }
  let testFiles = [];
  try {
    testFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);
  } catch {
    testFiles = [];
  }
  for (const f of testFiles.slice(0, 80)) {
    let content;
    try {
      content = readFileSync10(f, "utf8");
    } catch {
      continue;
    }
    if (FACTORY_CONTENT_RX.test(content)) {
      signals.push(`factory/faker patterns in: ${relative10(repoPath, f)}`);
      if (signals.length >= 3) break;
    }
  }
  const confFiles = iterFiles(repoPath, CONFTEST_GLOBS, SOURCE_IGNORE);
  if (confFiles.length > 0) {
    signals.push(`test setup/helper file: ${relative10(repoPath, confFiles[0])}`);
  }
  if (signals.length > 0) {
    return makeResult("PASS", signals.length, [
      `structured test data management detected (${signals.length} signal(s))`,
      ...signals
    ]);
  }
  return makeResult("FAIL", 0, [
    "no structured test data management found \u2014 add fixtures/ directory, factory patterns, or conftest.py"
  ]);
}
var MOCK_IMPORT_RX = /\b(?:jest\.mock|vi\.mock|sinon|mockery|unittest\.mock|from\s+unittest\s+import\s+mock|from\s+unittest\.mock|pytest[_-]mock|testify\/mock|mockito|EasyMock|Mockery|mocker\.patch|mock\.patch|@MockBean|@Mock\b)\b/i;
function detectMockingIsolation(repoPath, _params) {
  let testFiles = [];
  try {
    testFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);
  } catch {
    testFiles = [];
  }
  if (testFiles.length === 0) {
    return makeResult("FAIL", 0, [
      "no test files found \u2014 mocking/isolation not detectable"
    ]);
  }
  const signals = [];
  for (const f of testFiles.slice(0, 100)) {
    let content;
    try {
      content = readFileSync10(f, "utf8");
    } catch {
      continue;
    }
    if (MOCK_IMPORT_RX.test(content)) {
      signals.push(`mock/stub usage in: ${relative10(repoPath, f)}`);
      if (signals.length >= 5) break;
    }
  }
  if (signals.length > 0) {
    return makeResult("PASS", signals.length, [
      `mocking/stubbing patterns detected in ${signals.length} test file(s)`,
      ...signals
    ]);
  }
  return makeResult("FAIL", 0, [
    "no mocking/stubbing patterns found in test files \u2014 tests may have real I/O dependencies"
  ]);
}
var CONTRACT_CONFIG_GLOBS = ["pact.config.*", "*.pact.ts", "*.pact.js"];
var CONTRACT_DIR_NAMES = ["pacts", "contracts", "contract-tests"];
var CONTRACT_CONTENT_RX = /\b(?:Pact|pact|PactV[23]|InteractionBuilder|spring[_-]cloud[_-]contract|provider[_-]?verification|consumer[_-]?contract|@PactTestFor|@Provider|messageProvider)\b/i;
function detectContractTests(repoPath, _params) {
  const signals = [];
  const contractConfigs = iterFiles(
    repoPath,
    CONTRACT_CONFIG_GLOBS,
    SOURCE_IGNORE
  );
  if (contractConfigs.length > 0) {
    signals.push(`contract config: ${relative10(repoPath, contractConfigs[0])}`);
  }
  for (const name of CONTRACT_DIR_NAMES) {
    if (existsSync9(join11(repoPath, name))) {
      signals.push(`contract directory: ${name}/`);
      break;
    }
  }
  if (signals.length < 3) {
    let testFiles = [];
    try {
      testFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);
    } catch {
      testFiles = [];
    }
    for (const f of testFiles.slice(0, 100)) {
      let content;
      try {
        content = readFileSync10(f, "utf8");
      } catch {
        continue;
      }
      if (CONTRACT_CONTENT_RX.test(content)) {
        signals.push(`Pact/contract patterns in: ${relative10(repoPath, f)}`);
        if (signals.length >= 3) break;
      }
    }
  }
  if (signals.length > 0) {
    return makeResult("PASS", signals.length, [
      `contract testing detected (${signals.length} signal(s))`,
      ...signals
    ]);
  }
  return makeResult("FAIL", 0, [
    "no consumer-driven contract test signals found \u2014 add Pact or Spring Cloud Contract for multi-service verification"
  ]);
}
var ML_SOURCE_RX = /\b(?:sklearn|torch|tensorflow|keras|transformers|xgboost|lightgbm|catboost|mlflow|pandas|numpy)\b/i;
var ML_TEST_CONTENT_RX = /\b(?:assert.*(?:accuracy|f1[_-]score|precision|recall|rmse|mae|auc|roc_auc)|evidently|deepchecks|great_expectations|mlflow\.evaluate|ModelCard|alibi|check_model|model_performance)\b/i;
var ML_TEST_FILE_RX = /(?:test[_-]model|model[_-]test|test[_-]ml|ml[_-]test|test[_-]metrics)/i;
function detectMlIterationTests(repoPath, _params) {
  let hasML = false;
  const sourceSample = iterFiles(
    repoPath,
    ["*.py", "*.ipynb"],
    SOURCE_IGNORE
  ).slice(0, 50);
  for (const f of sourceSample) {
    let content;
    try {
      content = readFileSync10(f, "utf8");
    } catch {
      continue;
    }
    if (ML_SOURCE_RX.test(content)) {
      hasML = true;
      break;
    }
  }
  if (!hasML) {
    return makeResult(
      "SKIP",
      null,
      ["no ML framework usage detected \u2014 QA-10 not applicable"],
      "detected"
    );
  }
  const signals = [];
  let testFiles = [];
  try {
    testFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);
  } catch {
    testFiles = [];
  }
  for (const f of testFiles.slice(0, 100)) {
    const rel = relative10(repoPath, f);
    if (ML_TEST_FILE_RX.test(basename5(f))) {
      signals.push(`ML test file: ${rel}`);
      if (signals.length >= 5) break;
    }
    let content;
    try {
      content = readFileSync10(f, "utf8");
    } catch {
      continue;
    }
    if (ML_TEST_CONTENT_RX.test(content)) {
      signals.push(`ML quality assertions in: ${rel}`);
      if (signals.length >= 5) break;
    }
  }
  if (signals.length > 0) {
    return makeResult("PASS", signals.length, [
      `ML iteration testing detected (${signals.length} signal(s))`,
      ...signals
    ]);
  }
  return makeResult("FAIL", 0, [
    "ML framework detected but no quality metric testing found \u2014 add evidently, deepchecks, or assert metric thresholds"
  ]);
}
var DETECTORS9 = {
  2500: detectTestInfrastructure,
  // QA-01 test infrastructure + coverage proxy (computed)
  2501: detectUnitTests,
  // QA-02 unit test tier (detected)
  2502: detectIntegrationTests,
  // QA-03 integration test tier (detected)
  2503: detectE2ETests,
  // QA-04 E2E test tier (detected)
  2504: detectTestPyramid,
  // QA-05 pyramid shape (computed)
  2505: detectCoverageConfig,
  // QA-06 coverage reporting config (detected)
  2506: detectTestDataManagement,
  // QA-07 test data management (detected)
  2507: detectMockingIsolation,
  // QA-08 test isolation/mocking (detected)
  2508: detectContractTests,
  // QA-09 contract testing (detected)
  2509: detectMlIterationTests
  // QA-10 ML iteration testing (detected)
};

// plugins/awos/skills/ai-readiness-audit/detectors/documentation.ts
import { readFileSync as readFileSync11, existsSync as existsSync10, readdirSync as readdirSync3 } from "node:fs";
import { join as join12, relative as relative11, dirname as dirname2 } from "node:path";
var README_NAMES = [
  "README.md",
  "README.rst",
  "README.txt",
  "Readme.md",
  "readme.md"
];
var SETUP_CONTENT_RX = /\b(install|setup|usage|getting[_\s-]started|quick[_\s-]start|run|build|deploy|prerequisite|requirement)\b/i;
var HEADING_RX = /^#+ |\n#+ |^[=\-~^"'`]+\s*$/m;
function detectRootReadme(repoPath, _params) {
  let readmePath = null;
  for (const name of README_NAMES) {
    const full = join12(repoPath, name);
    if (existsSync10(full)) {
      readmePath = full;
      break;
    }
  }
  if (!readmePath) {
    return makeResult("FAIL", 0, [
      "no README file found at repository root \u2014 a new developer has no entry point"
    ]);
  }
  let content;
  try {
    content = readFileSync11(readmePath, "utf8");
  } catch {
    return makeResult("WARN", 0, [
      `README found but could not be read: ${relative11(repoPath, readmePath)}`
    ]);
  }
  const relPath = relative11(repoPath, readmePath);
  if (content.length <= 200) {
    return makeResult("WARN", content.length, [
      `${relPath} is too short (${content.length} bytes) \u2014 missing setup instructions`
    ]);
  }
  if (!SETUP_CONTENT_RX.test(content)) {
    return makeResult("WARN", content.length, [
      `${relPath} exists but contains no setup/install/usage instructions`
    ]);
  }
  if (!HEADING_RX.test(content)) {
    return makeResult("WARN", content.length, [
      `${relPath} lacks a Markdown heading structure \u2014 may not be well-organised`
    ]);
  }
  return makeResult("PASS", content.length, [
    `${relPath} present with headings and setup instructions (${content.length} bytes)`
  ]);
}
var SKIP_DIRS = /* @__PURE__ */ new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".venv",
  "__pycache__",
  ".next",
  "target",
  "vendor",
  ".github",
  ".claude",
  ".awos",
  "docs",
  "doc",
  "assets",
  "static",
  "public",
  "resources"
]);
var SERVICE_SOURCE_GLOBS = [
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.py",
  "*.go",
  "*.java",
  "*.kt"
];
function detectServiceReadmes(repoPath, _params) {
  let topDirs = [];
  try {
    const entries = readdirSync3(repoPath, { withFileTypes: true });
    topDirs = entries.filter(
      (e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith(".")
    ).map((e) => e.name).sort();
  } catch {
    topDirs = [];
  }
  if (topDirs.length === 0) {
    return makeResult("SKIP", null, [
      "no top-level service directories found \u2014 single-service project, DOC-02 not applicable"
    ]);
  }
  const serviceDirs = [];
  for (const dirName of topDirs) {
    const dirPath = join12(repoPath, dirName);
    let srcFiles = [];
    try {
      srcFiles = iterFiles(dirPath, SERVICE_SOURCE_GLOBS, [
        "node_modules",
        ".venv",
        "__pycache__",
        "dist",
        "build",
        "target"
      ]);
    } catch {
      srcFiles = [];
    }
    if (srcFiles.length < 5) continue;
    const hasReadme = existsSync10(join12(dirPath, "README.md"));
    serviceDirs.push({ path: dirPath, name: dirName, hasReadme });
  }
  if (serviceDirs.length === 0) {
    return makeResult("SKIP", null, [
      "no multi-service directory structure detected \u2014 DOC-02 not applicable"
    ]);
  }
  const withReadme = serviceDirs.filter((d) => d.hasReadme);
  const ratio = withReadme.length / serviceDirs.length;
  const evidence = [
    `${withReadme.length}/${serviceDirs.length} service directories have README.md`,
    ...serviceDirs.map(
      (d) => `${d.name}/: ${d.hasReadme ? "README present" : "README MISSING"}`
    )
  ];
  if (ratio >= 0.8) {
    return makeResult("PASS", withReadme.length, evidence);
  }
  if (ratio >= 0.5) {
    return makeResult("WARN", withReadme.length, [
      `only ${withReadme.length}/${serviceDirs.length} service directories have README.md`,
      ...evidence.slice(1)
    ]);
  }
  return makeResult("FAIL", withReadme.length, [
    `only ${withReadme.length}/${serviceDirs.length} service directories have README.md \u2014 most are missing docs`,
    ...evidence.slice(1)
  ]);
}
var API_DOC_GLOBS = [
  "openapi.yaml",
  "openapi.yml",
  "openapi.json",
  "swagger.yaml",
  "swagger.yml",
  "swagger.json",
  "asyncapi.yaml",
  "asyncapi.yml",
  "api-docs.yaml",
  "api-docs.json"
];
var API_SOURCE_RX = /\b(@RestController|@app\.route|@router\.|router\.get|router\.post|app\.get|app\.post|FastAPI\(|express\(\)|flask\.Flask\(|gin\.Default\(|chi\.NewRouter|http\.HandleFunc)\b/i;
var AUTO_DOCS_RX = /FastAPI\(|app\s*=\s*FastAPI\(|springdoc|springfox/i;
function detectApiDocs(repoPath, _params) {
  const apiSourceFiles = iterFiles(
    repoPath,
    ["*.py", "*.ts", "*.js", "*.java", "*.kt", "*.go"],
    [
      "node_modules",
      ".venv",
      "__pycache__",
      "dist",
      "build",
      "target",
      "tests",
      "test"
    ]
  );
  let hasApiSource = false;
  for (const f of apiSourceFiles.slice(0, 100)) {
    let content;
    try {
      content = readFileSync11(f, "utf8");
    } catch {
      continue;
    }
    if (API_SOURCE_RX.test(content)) {
      hasApiSource = true;
      break;
    }
  }
  if (!hasApiSource) {
    return makeResult("SKIP", null, [
      "no API source patterns detected \u2014 DOC-03 not applicable"
    ]);
  }
  const signals = [];
  const apiDocFiles = iterFiles(repoPath, API_DOC_GLOBS);
  if (apiDocFiles.length > 0) {
    signals.push(
      ...apiDocFiles.slice(0, 5).map((f) => `API spec: ${relative11(repoPath, f)}`)
    );
  }
  for (const f of apiSourceFiles.slice(0, 50)) {
    let content;
    try {
      content = readFileSync11(f, "utf8");
    } catch {
      continue;
    }
    if (AUTO_DOCS_RX.test(content)) {
      signals.push(`auto-docs framework in: ${relative11(repoPath, f)}`);
      break;
    }
  }
  if (signals.length > 0) {
    return makeResult("PASS", signals.length, [
      `API documentation present (${signals.length} signal(s))`,
      ...signals
    ]);
  }
  return makeResult("FAIL", 0, [
    "API source detected but no API documentation found \u2014 add OpenAPI/Swagger spec or use FastAPI auto-docs"
  ]);
}
var MAKE_TARGET_RX = /`make\s+([a-zA-Z0-9_-]+)`|\bmake\s+([a-zA-Z0-9_-]+)\b/g;
var MAKEFILE_TARGET_RX = /^([a-zA-Z0-9_-][a-zA-Z0-9_.-]*):/gm;
var LOCAL_LINK_RX = /\[(?:[^\]]+)\]\((?!https?:\/\/)(?!#)([^)]+)\)/g;
var BACKTICK_PATH_RX = /`((?:\.\/|\.\.\/|\/)[^`\s]+)`/g;
function extractMakeTargets(readmeContent) {
  const targets = /* @__PURE__ */ new Set();
  let m;
  MAKE_TARGET_RX.lastIndex = 0;
  while ((m = MAKE_TARGET_RX.exec(readmeContent)) !== null) {
    const target = m[1] ?? m[2];
    if (target && target !== "install" && target.length > 0) {
      targets.add(target);
    }
  }
  return [...targets].sort();
}
function loadMakefileTargets(repoPath) {
  const makefileNames = ["Makefile", "makefile", "GNUmakefile"];
  for (const name of makefileNames) {
    const full = join12(repoPath, name);
    if (!existsSync10(full)) continue;
    let content;
    try {
      content = readFileSync11(full, "utf8");
    } catch {
      continue;
    }
    const targets = /* @__PURE__ */ new Set();
    let m;
    MAKEFILE_TARGET_RX.lastIndex = 0;
    while ((m = MAKEFILE_TARGET_RX.exec(content)) !== null) {
      targets.add(m[1]);
    }
    return targets;
  }
  return /* @__PURE__ */ new Set();
}
function extractLocalLinks(readmeContent) {
  const links = [];
  let m;
  LOCAL_LINK_RX.lastIndex = 0;
  while ((m = LOCAL_LINK_RX.exec(readmeContent)) !== null) {
    const target = m[1].split("#")[0].trim();
    if (target.length > 0) links.push(target);
  }
  BACKTICK_PATH_RX.lastIndex = 0;
  while ((m = BACKTICK_PATH_RX.exec(readmeContent)) !== null) {
    const p = m[1].trim();
    if (p.length > 0) links.push(p);
  }
  return [...new Set(links)].sort();
}
function detectDocsAccuracy(repoPath, _params) {
  const readmePath = join12(repoPath, "README.md");
  if (!existsSync10(readmePath)) {
    return makeResult("SKIP", null, [
      "no README.md found \u2014 docs accuracy check (DOC-04) skipped"
    ]);
  }
  let readmeContent;
  try {
    readmeContent = readFileSync11(readmePath, "utf8");
  } catch {
    return makeResult("SKIP", null, [
      "README.md could not be read \u2014 DOC-04 skipped"
    ]);
  }
  const missing = [];
  const present = [];
  const makeTargetsInReadme = extractMakeTargets(readmeContent);
  if (makeTargetsInReadme.length > 0) {
    const makefileTargets = loadMakefileTargets(repoPath);
    const hasMakefile = existsSync10(join12(repoPath, "Makefile")) || existsSync10(join12(repoPath, "makefile")) || existsSync10(join12(repoPath, "GNUmakefile"));
    for (const target of makeTargetsInReadme) {
      if (!hasMakefile) {
        missing.push({ kind: "make-target", ref: `make ${target}` });
      } else if (!makefileTargets.has(target)) {
        missing.push({ kind: "make-target", ref: `make ${target}` });
      } else {
        present.push({ kind: "make-target", ref: `make ${target}` });
      }
    }
  }
  const localLinks = extractLocalLinks(readmeContent);
  for (const link of localLinks) {
    const readmeDir = dirname2(readmePath);
    const resolved = join12(readmeDir, link);
    if (existsSync10(resolved)) {
      present.push({ kind: "path", ref: link });
    } else {
      missing.push({ kind: "path", ref: link });
    }
  }
  if (missing.length === 0) {
    return makeResult("PASS", present.length, [
      `${present.length} README reference(s) verified \u2014 all referenced items exist`,
      ...present.slice(0, 10).map((r) => `verified: ${r.ref}`)
    ]);
  }
  const evidence = missing.map((r) => `missing: ${r.ref} (${r.kind})`);
  if (missing.length <= 2) {
    return makeResult("WARN", missing.length, [
      `${missing.length} README reference(s) point to non-existent items \u2014 docs may be stale`,
      ...evidence
    ]);
  }
  return makeResult("FAIL", missing.length, [
    `${missing.length} README reference(s) point to non-existent items \u2014 documentation is out of date`,
    ...evidence
  ]);
}
var DETECTORS10 = {
  2200: detectRootReadme,
  // DOC-01 root README with substance (detected)
  2201: detectServiceReadmes,
  // DOC-02 service-level READMEs (detected)
  2202: detectApiDocs,
  // DOC-03 API documentation (detected)
  2203: detectDocsAccuracy
  // DOC-04 docs accuracy via referenced path existence
};

// plugins/awos/skills/ai-readiness-audit/metrics/adp_g1_tooling_depth.ts
import { readFileSync as readFileSync13, existsSync as existsSync11 } from "node:fs";
import { join as join13 } from "node:path";

// plugins/awos/skills/ai-readiness-audit/metrics/_base.ts
import { readFileSync as readFileSync12 } from "node:fs";
function loadStandards(path) {
  return parse(readFileSync12(path, "utf8"));
}
function computeReliability(defaultTag, sourcesUsed, sourcesMissing) {
  if (sourcesMissing.length === 0) {
    return { tag: defaultTag, confidence: "HIGH", note: null };
  }
  if (sourcesUsed.length > 0) {
    return {
      tag: defaultTag,
      confidence: "MED",
      note: `missing sources: ${sourcesMissing.join(", ")}`
    };
  }
  return {
    tag: defaultTag,
    confidence: "LOW",
    note: `missing sources: ${sourcesMissing.join(", ")}`
  };
}
function makeMetricResult(metric, value, kind, categoriesAwarded, reliability, sourcesUsed, sourcesMissing, band = null, valueSeries) {
  const result = {
    metric,
    value,
    kind,
    band,
    categories_awarded: [...categoriesAwarded],
    reliability,
    sources_used: [...sourcesUsed],
    sources_missing: [...sourcesMissing],
    status: sourcesUsed.length === 0 ? "SKIP" : "OK"
  };
  if (valueSeries !== void 0) {
    result.value_series = valueSeries;
  }
  return result;
}
function capBucketsByHistory(buckets, maxDays, bucketDays) {
  if (maxDays <= 0 || bucketDays <= 0) return buckets;
  const maxBuckets = Math.floor(maxDays / bucketDays);
  if (maxBuckets <= 0) return [];
  if (buckets.length <= maxBuckets) return buckets;
  return buckets.slice(buckets.length - maxBuckets);
}
function awardCategories(standards, metricName, predicateCtx) {
  const categoryTable = standards["category"];
  if (!categoryTable) return [];
  const awarded = [];
  for (const cat of Object.values(categoryTable)) {
    if (cat["metric"] !== metricName) continue;
    const appliesWhen = cat["applies_when"];
    if (!appliesWhen || appliesWhen === "always") {
      awarded.push(cat["code"]);
      continue;
    }
    const topologyMatch = appliesWhen.match(/^topology\.(.+)$/);
    if (topologyMatch) {
      const flag = topologyMatch[1];
      if (predicateCtx[flag]) {
        awarded.push(cat["code"]);
      }
    }
  }
  return awarded;
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_g1_tooling_depth.ts
var TOOLING_MAP = [
  { paths: ["CLAUDE.md", "AGENTS.md"], code: 101 },
  { paths: [".claude/skills"], code: 102 },
  { paths: [".claude/commands"], code: 103 },
  { paths: [".claude/hooks"], code: 104 },
  { paths: [".mcp.json"], code: 105 },
  // Code 106: spec signals — context/, .awos/, or scripts/ in tooling_paths
  // (git collector does not include these but we detect them via the paths list)
  {
    paths: ["context/", ".awos/", "scripts/", "context", ".awos", "scripts"],
    code: 106
  }
];
var ALL_CODES = TOOLING_MAP.map((e) => e.code);
function compute(collectedDir, _standards, _topology) {
  const gitPath = join13(collectedDir, "git.json");
  if (!existsSync11(gitPath)) {
    return makeMetricResult(
      "adp_g1_tooling_depth",
      null,
      "coverage",
      [],
      computeReliability("maximal", [], ["git"]),
      [],
      ["git"]
    );
  }
  const artifact = JSON.parse(readFileSync13(gitPath, "utf8"));
  const raw = artifact?.raw;
  if (!raw || !Array.isArray(raw.tooling_paths)) {
    return makeMetricResult(
      "adp_g1_tooling_depth",
      null,
      "coverage",
      [],
      computeReliability("maximal", [], ["git"]),
      [],
      ["git"]
    );
  }
  const toolingPaths = raw.tooling_paths;
  const awarded = [];
  for (const entry of TOOLING_MAP) {
    const present = entry.paths.some(
      (p) => toolingPaths.some((tp) => tp === p || tp.startsWith(p.replace(/\/$/, "")))
    );
    if (present) {
      awarded.push(entry.code);
    }
  }
  const coverage = ALL_CODES.length > 0 ? awarded.length / ALL_CODES.length : 0;
  const reliability = computeReliability("maximal", ["git"], []);
  return makeMetricResult(
    "adp_g1_tooling_depth",
    coverage,
    "coverage",
    awarded,
    reliability,
    ["git"],
    []
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_g2_contributors.ts
import { readFileSync as readFileSync14, existsSync as existsSync12 } from "node:fs";
import { join as join14 } from "node:path";
function compute2(collectedDir, _standards, _topology) {
  const gitPath = join14(collectedDir, "git.json");
  if (!existsSync12(gitPath)) {
    return makeMetricResult(
      "adp_g2_contributors",
      null,
      "computed",
      [],
      computeReliability("not-reliable", [], ["git"]),
      [],
      ["git"]
    );
  }
  const artifact = JSON.parse(readFileSync14(gitPath, "utf8"));
  const raw = artifact?.raw;
  if (!raw || !Array.isArray(raw.monthly_buckets) || raw.monthly_buckets.length === 0) {
    return makeMetricResult(
      "adp_g2_contributors",
      null,
      "computed",
      [],
      computeReliability("not-reliable", [], ["git"]),
      [],
      ["git"]
    );
  }
  const historyAvailableDays = artifact?.period?.history_available_days ?? 0;
  const bucketDays = artifact?.period?.bucket_days ?? 30;
  const allBuckets = raw.monthly_buckets;
  const buckets = capBucketsByHistory(
    allBuckets,
    historyAvailableDays,
    bucketDays
  );
  const avg = buckets.reduce((sum, b) => sum + (b.authors ?? 0), 0) / buckets.length;
  const value_series = buckets.map((b) => ({
    bucket_start: b.bucket_start,
    value: b.authors ?? null
  }));
  const reliability = computeReliability("not-reliable", ["git"], []);
  return makeMetricResult(
    "adp_g2_contributors",
    avg,
    "computed",
    [201],
    reliability,
    ["git"],
    [],
    null,
    value_series
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_g3_deploy_frequency.ts
import { readFileSync as readFileSync15, existsSync as existsSync13 } from "node:fs";
import { join as join15 } from "node:path";
function doraDeployBand(mergesPerWeek) {
  if (mergesPerWeek >= 7) return "elite";
  if (mergesPerWeek >= 1) return "high";
  if (mergesPerWeek >= 0.25) return "medium";
  return "low";
}
function compute3(collectedDir, _standards, _topology) {
  const gitPath = join15(collectedDir, "git.json");
  if (!existsSync13(gitPath)) {
    return makeMetricResult(
      "adp_g3_deploy_frequency",
      null,
      "banded",
      [],
      computeReliability("not-reliable", [], ["git"]),
      [],
      ["git"]
    );
  }
  const artifact = JSON.parse(readFileSync15(gitPath, "utf8"));
  const raw = artifact?.raw;
  if (!raw || !Array.isArray(raw.monthly_buckets) || raw.monthly_buckets.length === 0) {
    return makeMetricResult(
      "adp_g3_deploy_frequency",
      null,
      "banded",
      [],
      computeReliability("not-reliable", [], ["git"]),
      [],
      ["git"]
    );
  }
  const bucketDays = artifact?.period?.bucket_days ?? 30;
  const historyAvailableDays = artifact?.period?.history_available_days ?? 0;
  const allBuckets = raw.monthly_buckets;
  const buckets = capBucketsByHistory(
    allBuckets,
    historyAvailableDays,
    bucketDays
  );
  const totalMerges = buckets.reduce((sum, b) => sum + (b.merges ?? 0), 0);
  const totalDays = buckets.length * bucketDays;
  const totalWeeks = totalDays / 7;
  const mergesPerWeek = totalWeeks > 0 ? totalMerges / totalWeeks : 0;
  const band = doraDeployBand(mergesPerWeek);
  const reliability = computeReliability("not-reliable", ["git"], []);
  const bucketWeeks = bucketDays / 7;
  const value_series = buckets.map((b) => ({
    bucket_start: b.bucket_start,
    value: bucketWeeks > 0 ? (b.merges ?? 0) / bucketWeeks : null
  }));
  return makeMetricResult(
    "adp_g3_deploy_frequency",
    mergesPerWeek,
    "banded",
    [301],
    reliability,
    ["git"],
    [],
    band,
    value_series
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_g4_lead_time.ts
import { readFileSync as readFileSync16, existsSync as existsSync14 } from "node:fs";
import { join as join16 } from "node:path";
function median(sorted) {
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}
function doraLeadTimeBand(hours) {
  if (hours < 24) return "elite";
  if (hours < 168) return "high";
  if (hours < 720) return "medium";
  return "low";
}
function compute4(collectedDir, _standards, _topology) {
  const gitPath = join16(collectedDir, "git.json");
  if (!existsSync14(gitPath)) {
    return makeMetricResult(
      "adp_g4_lead_time",
      null,
      "banded",
      [],
      computeReliability("minimal", [], ["git"]),
      [],
      ["git"]
    );
  }
  const artifact = JSON.parse(readFileSync16(gitPath, "utf8"));
  const raw = artifact?.raw;
  if (!raw || !Array.isArray(raw.merge_records) || raw.merge_records.length === 0) {
    return makeMetricResult(
      "adp_g4_lead_time",
      null,
      "banded",
      [],
      computeReliability("minimal", [], ["git"]),
      [],
      ["git"]
    );
  }
  const records = raw.merge_records;
  const leadTimesHours = [];
  for (const r of records) {
    const mergedAt = new Date(r.merged_at).getTime();
    const firstCommit = new Date(r.branch_first_commit_at).getTime();
    if (isNaN(mergedAt) || isNaN(firstCommit)) continue;
    const diffHours = (mergedAt - firstCommit) / 36e5;
    if (diffHours >= 0) {
      leadTimesHours.push(diffHours);
    }
  }
  if (leadTimesHours.length === 0) {
    return makeMetricResult(
      "adp_g4_lead_time",
      null,
      "banded",
      [],
      computeReliability("minimal", [], ["git"]),
      [],
      ["git"]
    );
  }
  leadTimesHours.sort((a, b) => a - b);
  const medianHours = median(leadTimesHours);
  const band = doraLeadTimeBand(medianHours);
  const reliability = computeReliability("minimal", ["git"], []);
  const historyAvailableDays = artifact?.period?.history_available_days ?? 0;
  const bucketDays = artifact?.period?.bucket_days ?? 30;
  const bucketMs = bucketDays * 864e5;
  const value_series = [];
  if (Array.isArray(raw.monthly_buckets) && raw.monthly_buckets.length > 0) {
    const allBuckets = raw.monthly_buckets;
    const cappedBuckets = capBucketsByHistory(
      allBuckets,
      historyAvailableDays,
      bucketDays
    );
    for (const bucket of cappedBuckets) {
      const bucketStart = new Date(bucket.bucket_start).getTime();
      const bucketEnd = bucketStart + bucketMs;
      const bucketLeadTimes = [];
      for (const r of records) {
        const mergedAt = new Date(r.merged_at).getTime();
        if (isNaN(mergedAt) || mergedAt <= bucketStart || mergedAt > bucketEnd)
          continue;
        const firstCommit = new Date(r.branch_first_commit_at).getTime();
        if (isNaN(firstCommit)) continue;
        const diffHours = (mergedAt - firstCommit) / 36e5;
        if (diffHours >= 0) bucketLeadTimes.push(diffHours);
      }
      bucketLeadTimes.sort((a, b) => a - b);
      value_series.push({
        bucket_start: bucket.bucket_start,
        value: bucketLeadTimes.length > 0 ? median(bucketLeadTimes) : null
      });
    }
  }
  return makeMetricResult(
    "adp_g4_lead_time",
    medianHours,
    "banded",
    [401],
    reliability,
    ["git"],
    [],
    band,
    value_series.length > 0 ? value_series : void 0
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_g5_pr_cycle_time.ts
import { readFileSync as readFileSync17, existsSync as existsSync15 } from "node:fs";
import { join as join17 } from "node:path";
function median2(sorted) {
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}
function doraCycleTimeBand(hours) {
  if (hours < 24) return "elite";
  if (hours < 168) return "high";
  if (hours < 720) return "medium";
  return "low";
}
function compute5(collectedDir, _standards, _topology) {
  const gitPath = join17(collectedDir, "git.json");
  if (!existsSync15(gitPath)) {
    return makeMetricResult(
      "adp_g5_pr_cycle_time",
      null,
      "banded",
      [],
      computeReliability("not-reliable", [], ["git"]),
      [],
      ["git"]
    );
  }
  const artifact = JSON.parse(readFileSync17(gitPath, "utf8"));
  const raw = artifact?.raw;
  if (!raw || !Array.isArray(raw.merge_records) || raw.merge_records.length === 0) {
    return makeMetricResult(
      "adp_g5_pr_cycle_time",
      null,
      "banded",
      [],
      computeReliability("not-reliable", [], ["git"]),
      [],
      ["git"]
    );
  }
  const records = raw.merge_records;
  const cycleTimesHours = [];
  for (const r of records) {
    const mergedAt = new Date(r.merged_at).getTime();
    const firstCommit = new Date(r.branch_first_commit_at).getTime();
    if (isNaN(mergedAt) || isNaN(firstCommit)) continue;
    const diffHours = (mergedAt - firstCommit) / 36e5;
    if (diffHours >= 0) {
      cycleTimesHours.push(diffHours);
    }
  }
  if (cycleTimesHours.length === 0) {
    return makeMetricResult(
      "adp_g5_pr_cycle_time",
      null,
      "banded",
      [],
      computeReliability("not-reliable", [], ["git"]),
      [],
      ["git"]
    );
  }
  cycleTimesHours.sort((a, b) => a - b);
  const medianHours = median2(cycleTimesHours);
  const band = doraCycleTimeBand(medianHours);
  const reliability = computeReliability("not-reliable", ["git"], []);
  const historyAvailableDays = artifact?.period?.history_available_days ?? 0;
  const bucketDays = artifact?.period?.bucket_days ?? 30;
  const bucketMs = bucketDays * 864e5;
  const value_series = [];
  if (Array.isArray(raw.monthly_buckets) && raw.monthly_buckets.length > 0) {
    const allBuckets = raw.monthly_buckets;
    const cappedBuckets = capBucketsByHistory(
      allBuckets,
      historyAvailableDays,
      bucketDays
    );
    for (const bucket of cappedBuckets) {
      const bucketStart = new Date(bucket.bucket_start).getTime();
      const bucketEnd = bucketStart + bucketMs;
      const bucketCycleTimes = [];
      for (const r of records) {
        const mergedAt = new Date(r.merged_at).getTime();
        if (isNaN(mergedAt) || mergedAt <= bucketStart || mergedAt > bucketEnd)
          continue;
        const firstCommit = new Date(r.branch_first_commit_at).getTime();
        if (isNaN(firstCommit)) continue;
        const diffHours = (mergedAt - firstCommit) / 36e5;
        if (diffHours >= 0) bucketCycleTimes.push(diffHours);
      }
      bucketCycleTimes.sort((a, b) => a - b);
      value_series.push({
        bucket_start: bucket.bucket_start,
        value: bucketCycleTimes.length > 0 ? median2(bucketCycleTimes) : null
      });
    }
  }
  return makeMetricResult(
    "adp_g5_pr_cycle_time",
    medianHours,
    "banded",
    [501],
    reliability,
    ["git"],
    [],
    band,
    value_series.length > 0 ? value_series : void 0
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_g6_churn.ts
import { readFileSync as readFileSync18, existsSync as existsSync16 } from "node:fs";
import { join as join18 } from "node:path";
function compute6(collectedDir, _standards, _topology) {
  const gitPath = join18(collectedDir, "git.json");
  if (!existsSync16(gitPath)) {
    return makeMetricResult(
      "adp_g6_churn",
      null,
      "computed",
      [],
      computeReliability("not-reliable", [], ["git"]),
      [],
      ["git"]
    );
  }
  const artifact = JSON.parse(readFileSync18(gitPath, "utf8"));
  const raw = artifact?.raw;
  if (!raw || typeof raw.numstat_totals !== "object" || raw.numstat_totals === null) {
    return makeMetricResult(
      "adp_g6_churn",
      null,
      "computed",
      [],
      computeReliability("not-reliable", [], ["git"]),
      [],
      ["git"]
    );
  }
  const { added, deleted } = raw.numstat_totals;
  const totalChurn = (added ?? 0) + (deleted ?? 0);
  const reliability = computeReliability("not-reliable", ["git"], []);
  return makeMetricResult(
    "adp_g6_churn",
    totalChurn,
    "computed",
    [601],
    reliability,
    ["git"],
    []
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_g7_change_fail_rate.ts
import { readFileSync as readFileSync19, existsSync as existsSync17 } from "node:fs";
import { join as join19 } from "node:path";
function doraChangeFailBand(rate) {
  if (rate < 0.05) return "elite";
  if (rate < 0.1) return "high";
  if (rate < 0.15) return "medium";
  return "low";
}
function compute7(collectedDir, _standards, _topology) {
  const gitPath = join19(collectedDir, "git.json");
  if (!existsSync17(gitPath)) {
    return makeMetricResult(
      "adp_g7_change_fail_rate",
      null,
      "banded",
      [],
      computeReliability("minimal", [], ["git"]),
      [],
      ["git"]
    );
  }
  const artifact = JSON.parse(readFileSync19(gitPath, "utf8"));
  const raw = artifact?.raw;
  if (!raw || typeof raw.total_merges !== "number" || raw.total_merges === 0) {
    return makeMetricResult(
      "adp_g7_change_fail_rate",
      null,
      "banded",
      [],
      computeReliability("minimal", [], ["git"]),
      [],
      ["git"]
    );
  }
  const totalMerges = raw.total_merges;
  const revertMerges = raw.revert_merges ?? 0;
  const rate = revertMerges / totalMerges;
  const band = doraChangeFailBand(rate);
  const reliability = computeReliability("minimal", ["git"], []);
  return makeMetricResult(
    "adp_g7_change_fail_rate",
    rate,
    "banded",
    [701],
    reliability,
    ["git"],
    [],
    band
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_g8_review_rework.ts
import { readFileSync as readFileSync20, existsSync as existsSync18 } from "node:fs";
import { join as join20 } from "node:path";
function compute8(collectedDir, _standards, _topology) {
  const gitPath = join20(collectedDir, "git.json");
  if (!existsSync18(gitPath)) {
    return makeMetricResult(
      "adp_g8_review_rework",
      null,
      "computed",
      [],
      computeReliability("not-reliable", [], ["git"]),
      [],
      ["git"]
    );
  }
  const artifact = JSON.parse(readFileSync20(gitPath, "utf8"));
  const raw = artifact?.raw;
  if (!raw || !Array.isArray(raw.merge_records) || raw.merge_records.length === 0) {
    return makeMetricResult(
      "adp_g8_review_rework",
      null,
      "computed",
      [],
      computeReliability("not-reliable", [], ["git"]),
      [],
      ["git"]
    );
  }
  const totalMerges = raw.merge_records.length;
  const totalCommits = raw.total_commits ?? 0;
  const commitsPerPr = totalMerges > 0 ? totalCommits / totalMerges : 0;
  const reworkProxy = Math.max(0, commitsPerPr - 1);
  const reliability = computeReliability("not-reliable", ["git"], []);
  return makeMetricResult(
    "adp_g8_review_rework",
    reworkProxy,
    "computed",
    [801],
    reliability,
    ["git"],
    []
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_g9_ai_attribution.ts
import { readFileSync as readFileSync21, existsSync as existsSync19 } from "node:fs";
import { join as join21 } from "node:path";
function compute9(collectedDir, _standards, _topology) {
  const gitPath = join21(collectedDir, "git.json");
  if (!existsSync19(gitPath)) {
    return makeMetricResult(
      "adp_g9_ai_attribution",
      null,
      "computed",
      [],
      computeReliability("minimal", [], ["git"]),
      [],
      ["git"]
    );
  }
  const artifact = JSON.parse(readFileSync21(gitPath, "utf8"));
  const raw = artifact?.raw;
  if (!raw || typeof raw.total_commits !== "number" || raw.total_commits === 0) {
    return makeMetricResult(
      "adp_g9_ai_attribution",
      null,
      "computed",
      [],
      computeReliability("minimal", [], ["git"]),
      [],
      ["git"]
    );
  }
  const totalCommits = raw.total_commits;
  const aiMarkedCommits = raw.ai_marked_commits ?? 0;
  const attributionRate = aiMarkedCommits / totalCommits;
  const reliability = computeReliability("minimal", ["git"], []);
  return makeMetricResult(
    "adp_g9_ai_attribution",
    attributionRate,
    "computed",
    [901],
    reliability,
    ["git"],
    []
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_c1_ci_pass_rate.ts
import { readFileSync as readFileSync22, existsSync as existsSync20 } from "node:fs";
import { join as join22 } from "node:path";
function ciPassBand(rate) {
  if (rate >= 0.99) return "elite";
  if (rate >= 0.95) return "high";
  if (rate >= 0.9) return "medium";
  return "low";
}
function countSuccessful(runs) {
  return runs.filter((r) => {
    const rec = r;
    return rec["conclusion"] === "success";
  }).length;
}
function compute10(collectedDir, standards, topology) {
  const ciPath = join22(collectedDir, "ci.json");
  if (!existsSync20(ciPath)) {
    return makeMetricResult(
      "adp_c1_ci_pass_rate",
      null,
      "banded",
      [],
      computeReliability("not-reliable", [], ["ci"]),
      [],
      ["ci"]
    );
  }
  const artifact = JSON.parse(readFileSync22(ciPath, "utf8"));
  if (!artifact?.available) {
    return makeMetricResult(
      "adp_c1_ci_pass_rate",
      null,
      "banded",
      [],
      computeReliability("not-reliable", [], ["ci"]),
      [],
      ["ci"]
    );
  }
  const raw = artifact?.raw ?? {};
  const runs = Array.isArray(raw.runs) ? raw.runs : [];
  const configDetected = Boolean(raw.config_detected);
  if (runs.length === 0) {
    const categories2 = awardCategories(
      standards,
      "adp_c1_ci_pass_rate",
      topology
    );
    const reliability2 = computeReliability("not-reliable", ["ci"], []);
    const partialReliability = {
      tag: reliability2.tag,
      confidence: "MED",
      note: configDetected ? "CI config detected but no run data available; pass rate cannot be computed" : "CI source available but no run data available; pass rate cannot be computed"
    };
    return makeMetricResult(
      "adp_c1_ci_pass_rate",
      null,
      "banded",
      categories2,
      partialReliability,
      ["ci"],
      []
    );
  }
  const successful = countSuccessful(runs);
  const rate = successful / runs.length;
  const band = ciPassBand(rate);
  const categories = awardCategories(
    standards,
    "adp_c1_ci_pass_rate",
    topology
  );
  const reliability = computeReliability("not-reliable", ["ci"], []);
  return makeMetricResult(
    "adp_c1_ci_pass_rate",
    rate,
    "banded",
    categories,
    reliability,
    ["ci"],
    [],
    band
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_c2_pipeline_duration.ts
import { readFileSync as readFileSync23, existsSync as existsSync21 } from "node:fs";
import { join as join23 } from "node:path";
function averageDuration(runs) {
  const durations = runs.map((r) => {
    const rec = r;
    const d = rec["duration_seconds"];
    return typeof d === "number" && isFinite(d) ? d : null;
  }).filter((d) => d !== null);
  if (durations.length === 0) return null;
  return durations.reduce((sum, d) => sum + d, 0) / durations.length;
}
function compute11(collectedDir, standards, topology) {
  const ciPath = join23(collectedDir, "ci.json");
  if (!existsSync21(ciPath)) {
    return makeMetricResult(
      "adp_c2_pipeline_duration",
      null,
      "duration_seconds",
      [],
      computeReliability("not-reliable", [], ["ci"]),
      [],
      ["ci"]
    );
  }
  const artifact = JSON.parse(readFileSync23(ciPath, "utf8"));
  if (!artifact?.available) {
    return makeMetricResult(
      "adp_c2_pipeline_duration",
      null,
      "duration_seconds",
      [],
      computeReliability("not-reliable", [], ["ci"]),
      [],
      ["ci"]
    );
  }
  const raw = artifact?.raw ?? {};
  const runs = Array.isArray(raw.runs) ? raw.runs : [];
  const configDetected = Boolean(raw.config_detected);
  if (runs.length === 0) {
    const categories2 = awardCategories(
      standards,
      "adp_c2_pipeline_duration",
      topology
    );
    const partialReliability = {
      tag: "not-reliable",
      confidence: "MED",
      note: configDetected ? "CI config detected but no run data available; pipeline duration cannot be computed" : "CI source available but no run data available; pipeline duration cannot be computed"
    };
    return makeMetricResult(
      "adp_c2_pipeline_duration",
      null,
      "duration_seconds",
      categories2,
      partialReliability,
      ["ci"],
      []
    );
  }
  const avgDuration = averageDuration(runs);
  const categories = awardCategories(
    standards,
    "adp_c2_pipeline_duration",
    topology
  );
  const reliability = computeReliability("not-reliable", ["ci"], []);
  return makeMetricResult(
    "adp_c2_pipeline_duration",
    avgDuration,
    "duration_seconds",
    categories,
    reliability,
    ["ci"],
    []
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_d1_spec_coverage.ts
import { readFileSync as readFileSync24, existsSync as existsSync22 } from "node:fs";
import { join as join24 } from "node:path";
function compute12(collectedDir, standards, topology) {
  const docsPath = join24(collectedDir, "docs.json");
  if (!existsSync22(docsPath)) {
    return makeMetricResult(
      "adp_d1_spec_coverage",
      null,
      "coverage",
      [],
      computeReliability("not-reliable", [], ["docs"]),
      [],
      ["docs"]
    );
  }
  const artifact = JSON.parse(readFileSync24(docsPath, "utf8"));
  if (!artifact?.available) {
    return makeMetricResult(
      "adp_d1_spec_coverage",
      null,
      "coverage",
      [],
      computeReliability("not-reliable", [], ["docs"]),
      [],
      ["docs"]
    );
  }
  const raw = artifact?.raw ?? {};
  const pageCount = typeof raw.page_count === "number" ? raw.page_count : 0;
  const recentlyUpdatedCount = typeof raw.recently_updated_count === "number" ? raw.recently_updated_count : 0;
  const coverage = pageCount > 0 ? recentlyUpdatedCount / pageCount : 0;
  const categories = awardCategories(
    standards,
    "adp_d1_spec_coverage",
    topology
  );
  const reliability = computeReliability("not-reliable", ["docs"], []);
  return makeMetricResult(
    "adp_d1_spec_coverage",
    coverage,
    "coverage",
    categories,
    reliability,
    ["docs"],
    []
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_i1_work_mix.ts
import { readFileSync as readFileSync25, existsSync as existsSync23 } from "node:fs";
import { join as join25 } from "node:path";
var GROWTH_TYPES = /* @__PURE__ */ new Set([
  "feature",
  "story",
  "enhancement",
  "task",
  "improvement"
]);
function workMixBand(growthFrac) {
  if (growthFrac >= 0.6) return "elite";
  if (growthFrac >= 0.45) return "high";
  if (growthFrac >= 0.3) return "medium";
  return "low";
}
function compute13(collectedDir, standards, topology) {
  const trackerPath = join25(collectedDir, "tracker.json");
  if (!existsSync23(trackerPath)) {
    return makeMetricResult(
      "adp_i1_work_mix",
      null,
      "banded",
      [],
      computeReliability("not-reliable", [], ["tracker"]),
      [],
      ["tracker"]
    );
  }
  const artifact = JSON.parse(readFileSync25(trackerPath, "utf8"));
  if (!artifact?.available) {
    return makeMetricResult(
      "adp_i1_work_mix",
      null,
      "banded",
      [],
      computeReliability("not-reliable", [], ["tracker"]),
      [],
      ["tracker"]
    );
  }
  const raw = artifact?.raw ?? {};
  const typeCounts = typeof raw.type_counts === "object" && raw.type_counts !== null ? raw.type_counts : {};
  const total = Object.values(typeCounts).reduce(
    (sum, n) => sum + n,
    0
  );
  if (total === 0) {
    const categories2 = awardCategories(standards, "adp_i1_work_mix", topology);
    const reliability2 = computeReliability("not-reliable", ["tracker"], []);
    return makeMetricResult(
      "adp_i1_work_mix",
      null,
      "banded",
      categories2,
      reliability2,
      ["tracker"],
      []
    );
  }
  const growthCount = Object.entries(typeCounts).filter(([type]) => GROWTH_TYPES.has(type.toLowerCase())).reduce((sum, [, n]) => sum + n, 0);
  const growthFrac = growthCount / total;
  const band = workMixBand(growthFrac);
  const categories = awardCategories(standards, "adp_i1_work_mix", topology);
  const reliability = computeReliability("not-reliable", ["tracker"], []);
  return makeMetricResult(
    "adp_i1_work_mix",
    growthFrac,
    "banded",
    categories,
    reliability,
    ["tracker"],
    [],
    band
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_i2_throughput.ts
import { readFileSync as readFileSync26, existsSync as existsSync24 } from "node:fs";
import { join as join26 } from "node:path";
function compute14(collectedDir, standards, topology) {
  const trackerPath = join26(collectedDir, "tracker.json");
  if (!existsSync24(trackerPath)) {
    return makeMetricResult(
      "adp_i2_throughput",
      null,
      "rate",
      [],
      computeReliability("not-reliable", [], ["tracker"]),
      [],
      ["tracker"]
    );
  }
  const artifact = JSON.parse(readFileSync26(trackerPath, "utf8"));
  if (!artifact?.available) {
    return makeMetricResult(
      "adp_i2_throughput",
      null,
      "rate",
      [],
      computeReliability("not-reliable", [], ["tracker"]),
      [],
      ["tracker"]
    );
  }
  const raw = artifact?.raw ?? {};
  const resolvedCount = typeof raw.resolved_count === "number" ? raw.resolved_count : 0;
  const categories = awardCategories(standards, "adp_i2_throughput", topology);
  const reliability = computeReliability("not-reliable", ["tracker"], []);
  return makeMetricResult(
    "adp_i2_throughput",
    resolvedCount,
    "rate",
    categories,
    reliability,
    ["tracker"],
    []
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_i3_mttr.ts
import { readFileSync as readFileSync27, existsSync as existsSync25 } from "node:fs";
import { join as join27 } from "node:path";
function mtttrBand(medianHours) {
  if (medianHours < 1) return "elite";
  if (medianHours < 24) return "high";
  if (medianHours < 168) return "medium";
  return "low";
}
function median3(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}
function computeGitProxyIntervals(mergeRecords) {
  const intervals = [];
  for (const rec of mergeRecords) {
    const mergedAt = new Date(rec.merged_at);
    const firstCommit = new Date(rec.branch_first_commit_at);
    if (isNaN(mergedAt.getTime()) || isNaN(firstCommit.getTime())) continue;
    const diffMs = mergedAt.getTime() - firstCommit.getTime();
    if (diffMs < 0) continue;
    intervals.push(diffMs / 36e5);
  }
  return intervals;
}
function compute15(collectedDir, standards, topology) {
  const gitPath = join27(collectedDir, "git.json");
  const trackerPath = join27(collectedDir, "tracker.json");
  let incidentSource = null;
  if (existsSync25(trackerPath)) {
    try {
      const trackerArtifact = JSON.parse(readFileSync27(trackerPath, "utf8"));
      if (trackerArtifact?.available && trackerArtifact?.raw?.incident_source) {
        incidentSource = trackerArtifact.raw.incident_source;
      }
    } catch {
    }
  }
  if (!existsSync25(gitPath)) {
    if (incidentSource) {
      const categories2 = awardCategories(standards, "adp_i3_mttr", topology);
      const reliability3 = {
        tag: "not-reliable",
        confidence: "HIGH",
        note: null
      };
      return makeMetricResult(
        "adp_i3_mttr",
        null,
        "banded",
        categories2,
        reliability3,
        ["tracker"],
        ["git"]
      );
    }
    const reliability2 = {
      tag: "not-reliable",
      confidence: "LOW",
      note: "git-proxy, true value may differ; no git history found"
    };
    return makeMetricResult(
      "adp_i3_mttr",
      null,
      "banded",
      [],
      reliability2,
      ["git"],
      []
    );
  }
  const gitArtifact = JSON.parse(readFileSync27(gitPath, "utf8"));
  const raw = gitArtifact?.raw ?? {};
  const mergeRecords = Array.isArray(raw.merge_records) ? raw.merge_records : [];
  const allIntervals = computeGitProxyIntervals(mergeRecords);
  const medianHours = median3(allIntervals);
  let reliability;
  if (incidentSource) {
    reliability = {
      tag: "not-reliable",
      confidence: "HIGH",
      note: null
    };
  } else {
    reliability = {
      tag: "not-reliable",
      confidence: allIntervals.length > 0 ? "MED" : "LOW",
      note: "git-proxy, true value may differ"
    };
  }
  const band = medianHours !== null ? mtttrBand(medianHours) : null;
  const categories = awardCategories(standards, "adp_i3_mttr", topology);
  const sourcesUsed = incidentSource ? ["git", "tracker"] : ["git"];
  const sourcesMissing = [];
  return makeMetricResult(
    "adp_i3_mttr",
    medianHours,
    "banded",
    categories,
    reliability,
    sourcesUsed,
    sourcesMissing,
    band
  );
}

// plugins/awos/skills/ai-readiness-audit/cli.ts
var COLLECTORS = {
  git: collect,
  ci: collect2,
  tracker: collect3,
  docs: collect4
};
var DETECTORS11 = {
  ...DETECTORS,
  ...DETECTORS2,
  ...DETECTORS3,
  ...DETECTORS4,
  ...DETECTORS5,
  ...DETECTORS6,
  ...DETECTORS7,
  ...DETECTORS8,
  ...DETECTORS9,
  ...DETECTORS10
};
var METRICS = {
  adp_g1_tooling_depth: compute,
  adp_g2_contributors: compute2,
  adp_g3_deploy_frequency: compute3,
  adp_g4_lead_time: compute4,
  adp_g5_pr_cycle_time: compute5,
  adp_g6_churn: compute6,
  adp_g7_change_fail_rate: compute7,
  adp_g8_review_rework: compute8,
  adp_g9_ai_attribution: compute9,
  adp_c1_ci_pass_rate: compute10,
  adp_c2_pipeline_duration: compute11,
  adp_d1_spec_coverage: compute12,
  adp_i1_work_mix: compute13,
  adp_i2_throughput: compute14,
  adp_i3_mttr: compute15
};
var DEFAULT_PERIOD = {
  bucket_days: 30,
  lookback_days: 730,
  history_available_days: 0
};
function printJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}
function main() {
  const [, , command, arg1, arg2] = process.argv;
  if (!command) {
    printJson({
      error: "no command given",
      usage: "collect|detect|metric <arg> <repoPath>"
    });
    process.exit(1);
  }
  switch (command) {
    case "collect": {
      const source = arg1;
      const repoPath = arg2;
      if (!source || !repoPath) {
        printJson({ error: "collect requires <source> and <repoPath>" });
        process.exit(1);
      }
      const fn = COLLECTORS[source];
      if (!fn) {
        printJson({
          error: `unknown collector source "${source}"`,
          known: Object.keys(COLLECTORS)
        });
        process.exit(1);
      }
      printJson(fn(repoPath, DEFAULT_PERIOD));
      break;
    }
    case "detect": {
      const codeStr = arg1;
      const repoPath = arg2;
      if (!codeStr || !repoPath) {
        printJson({ error: "detect requires <code> and <repoPath>" });
        process.exit(1);
      }
      const code = Number(codeStr);
      if (!Number.isInteger(code)) {
        printJson({
          error: `detector code must be an integer, got "${codeStr}"`
        });
        process.exit(1);
      }
      const fn = DETECTORS11[code];
      if (!fn) {
        printJson({
          error: `unknown detector code ${code}`,
          known: Object.keys(DETECTORS11).map(Number).sort((a, b) => a - b)
        });
        process.exit(1);
      }
      printJson(fn(repoPath));
      break;
    }
    case "standards": {
      const tomlPath = arg1;
      if (!tomlPath) {
        printJson({ error: "standards requires <path-to-standards.toml>" });
        process.exit(1);
      }
      let raw;
      try {
        raw = readFileSync28(tomlPath, "utf8");
      } catch (err) {
        const e = err;
        printJson({
          error: `cannot read standards file: ${e.message}`,
          path: tomlPath
        });
        process.exit(1);
      }
      const parsed = parse(raw);
      printJson(parsed);
      break;
    }
    case "metric": {
      const id = arg1;
      const repoPath = arg2;
      const [, , , , , arg3] = process.argv;
      const preCollectedDir = arg3;
      if (!id || !repoPath) {
        printJson({ error: "metric requires <id> and <repoPath>" });
        process.exit(1);
      }
      const metricFn = METRICS[id];
      if (!metricFn) {
        printJson({
          error: `unknown metric "${id}"`,
          known: Object.keys(METRICS).sort()
        });
        process.exit(1);
      }
      let collectedDir;
      if (preCollectedDir) {
        collectedDir = preCollectedDir;
      } else {
        const tmpRoot = mkdtempSync(join28(tmpdir(), "awos-metric-"));
        collectedDir = join28(tmpRoot, "collected");
        const gitArtifact = collect(repoPath, DEFAULT_PERIOD);
        writeArtifact(gitArtifact, collectedDir);
        if (id.startsWith("adp_c")) {
          const ciArtifact = collect2(repoPath, DEFAULT_PERIOD);
          writeArtifact(ciArtifact, collectedDir);
        }
        if (id.startsWith("adp_d")) {
          const docsArtifact = collect4(repoPath, DEFAULT_PERIOD);
          writeArtifact(docsArtifact, collectedDir);
        }
        if (id.startsWith("adp_i")) {
          const trackerArtifact = collect3(repoPath, DEFAULT_PERIOD);
          writeArtifact(trackerArtifact, collectedDir);
        }
      }
      const cliDir = dirname3(fileURLToPath(import.meta.url));
      const skillRoot = cliDir.endsWith("/dist") || cliDir.endsWith("\\dist") ? dirname3(cliDir) : cliDir;
      const standardsPath = join28(skillRoot, "references", "standards.toml");
      const standards = loadStandards(standardsPath);
      const result = metricFn(collectedDir, standards, {});
      printJson(result);
      break;
    }
    default: {
      printJson({
        error: `unknown command "${command}"`,
        usage: "collect|detect|metric|standards <arg> [repoPath]"
      });
      process.exit(1);
    }
  }
}
var isMain = typeof process !== "undefined" && process.argv[1] !== void 0 && (process.argv[1] === fileURLToPath(import.meta.url) || // When bundled as dist/cli.js the resolved path is the bundle itself.
process.argv[1].endsWith("/dist/cli.js") || process.argv[1].endsWith("\\dist\\cli.js"));
if (isMain) {
  main();
}
export {
  DETECTORS11 as DETECTORS,
  METRICS
};
/*! Bundled license information:

smol-toml/dist/date.js:
smol-toml/dist/error.js:
smol-toml/dist/primitive.js:
smol-toml/dist/util.js:
smol-toml/dist/extract.js:
smol-toml/dist/struct.js:
smol-toml/dist/parse.js:
smol-toml/dist/stringify.js:
smol-toml/dist/index.js:
  (*!
   * Copyright (c) Squirrel Chat et al., All rights reserved.
   * SPDX-License-Identifier: BSD-3-Clause
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * 1. Redistributions of source code must retain the above copyright notice, this
   *    list of conditions and the following disclaimer.
   * 2. Redistributions in binary form must reproduce the above copyright notice,
   *    this list of conditions and the following disclaimer in the
   *    documentation and/or other materials provided with the distribution.
   * 3. Neither the name of the copyright holder nor the names of its contributors
   *    may be used to endorse or promote products derived from this software without
   *    specific prior written permission.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
   * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
   * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
   * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
   * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
   * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
   * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
   * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
   * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
   * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   *)
*/
