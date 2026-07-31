#!/usr/bin/env python3
"""Reference renderer for /awos:status — a deterministic kanban board.

This is the worked example behind `commands/status.md`. The command is a prompt
an agent follows, but the board it describes is fully mechanical, so this script
produces the exact layout the prompt specifies. Run it directly for a
reproducible board, or read it as the canonical spec for the card/grid rules.

    python3 status-board.py <project-dir> [spec-number-or-name]

It is read-only and depends only on the Python 3 standard library plus `git`
(used to date each spec's current status). Everything it reads lives under the
project's `context/` directory:

    context/spec/NNN-*/functional-spec.md   # title, Status, Author, ticket
    context/spec/NNN-*/tasks.md             # atomic-task count (drives size)

Card (25 columns wide, ~21 of text):

    ┌───────────────────────┐
    │ PROJ-101          012 │  ticket (left) · spec number (right; left when no ticket)
    │ Checkout redesign fo… │  title (full width)
    │ Dusty                 │  author
    │ 🟥 HUGE         1d ⚪ │  size (emoji+word) · days in current status (n+emoji)
    └───────────────────────┘

Size is relative to the project (task-count terciles): 🟥 HUGE / 🟨 Medium /
🟩 small. Days-in-status colour: ⚪ <3, 🟡 ≥3, 🔴 ≥5, 🟤 ≥7. The lifecycle
columns (Draft · In Review · Approved · Completed, then Other) are laid out
side by side in a single row — a wide terminal shows the whole flow at once.
"""

import glob
import os
import re
import subprocess
import sys
import time

BOX = 25  # card width in display columns
F = BOX - 4  # inner text field width
SIZE_SQUARE = {"HUGE": "🟥", "Medium": "🟨", "small": "🟩"}
CANON = ("Draft", "In Review", "Approved", "Completed")


def wide(s):
    """Display width, counting emoji as two columns."""
    return sum(2 if ord(c) >= 0x1F000 or 0x2600 <= ord(c) <= 0x27BF else 1 for c in s)


def clip(s):
    while wide(s) > F:
        s = s[:-2] + "…"
    return s


def pad(s):
    s = clip(s)
    return s + " " * (F - wide(s))


def justify(left, right):
    """left-aligned + right-aligned within the inner field. Right is kept whole
    (clipped only if it alone overflows); left is clipped to make room."""
    if wide(right) > F:
        right = clip(right)
    while left and wide(left) + 1 + wide(right) > F:
        left = left[:-2] + "…" if wide(left) > 1 else ""
    gap = F - wide(left) - wide(right)
    return left + " " * max(gap, 1 if left else 0) + right


def days_circle(d):
    return "🟤" if d >= 7 else ("🔴" if d >= 5 else ("🟡" if d >= 3 else "⚪"))


def field(pat, text):
    m = re.search(pat, text, re.I | re.M)
    return m.group(1).strip() if m else None


def count_atomic_tasks(path):
    """Atomic tasks only: a checkbox is counted when it carries an [Agent:] tag
    or sits under a slice header. Composite slice headers themselves, and stray
    top-level checklist items outside any slice, are excluded.

    A slice's scope ends at its structural boundary, so tasks under a later peer
    section (e.g. a `## Notes` heading, or a checklist that dedents back to the
    slice item's level) are not misattributed to it: a heading-form slice closes
    on the next heading at its level or shallower, and a list-form slice closes
    on the next heading or on a list item at or above the slice item's indent."""
    total = 0
    slice_head = None  # heading level of an active "## Slice …" heading
    slice_indent = None  # indent of an active "- [ ] **Slice …**" composite item
    for ln in open(path, encoding="utf-8", errors="replace"):
        head = re.match(r"\s*(#{1,6})\s+(.*)", ln)
        if head:
            # any heading closes a list-form slice; a peer/ancestor heading also
            # closes a heading-form slice
            slice_indent = None
            level = len(head.group(1))
            if slice_head is not None and level <= slice_head:
                slice_head = None
            if re.match(r"Slice\b", head.group(2)):
                slice_head = level
            continue
        item = re.match(r"(\s*)- \[[ xX]\]\s*(.*)", ln)
        if not item:
            continue
        indent = len(item.group(1))
        if re.match(r"\*\*Slice", item.group(2)):  # composite slice item
            slice_indent = indent
            continue
        if slice_indent is not None and indent <= slice_indent:
            slice_indent = None  # dedented back to the slice's level → out of it
        if "[Agent:" in ln or slice_head is not None or slice_indent is not None:
            total += 1
    return total


def _git_epoch(args):
    """First epoch-looking timestamp from `git log -1 --format=%ct <args>`, or None."""
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%ct", *args],
            capture_output=True,
            text=True,
            timeout=10,
        ).stdout
    except (OSError, subprocess.TimeoutExpired):
        return None
    for tok in out.split():
        if tok.isdigit() and len(tok) >= 9:  # a plausible unix timestamp
            return int(tok)
    return None


def status_age_days(fs, spec_dir, txt, now):
    """Days the spec has sat in its current Status. Prefer the commit that last
    touched the `Status:` line; fall back to the spec dir's last commit, then to
    the file's mtime, then to 0 when nothing is available."""
    ts = None
    for i, ln in enumerate(txt.splitlines(), 1):
        if re.match(r"\s*-\s*\*\*status", ln, re.I):
            ts = _git_epoch([f"-L{i},{i}:{fs}"])  # history of just that line
            break
    if ts is None:
        ts = _git_epoch(["--", spec_dir])
    if ts is None and os.path.exists(fs):
        ts = os.path.getmtime(fs)
    return max(int((now - ts) // 86400), 0) if ts else 0


def read_specs(root):
    specs = []
    now = time.time()
    for d in sorted(glob.glob("context/spec/[0-9][0-9][0-9]-*/")):
        base = os.path.basename(d.rstrip("/"))
        num, short = base.split("-", 1)
        fs = os.path.join(d, "functional-spec.md")
        txt = (
            open(fs, encoding="utf-8", errors="replace").read()
            if os.path.exists(fs)
            else ""
        )
        title = field(r"^#\s+Functional Specification:?\s*(.+)$", txt) or short
        status = field(r"^\s*-\s*\*\*status:?\*\*\s*(.+)$", txt) or "(none)"
        author = field(r"^\s*-\s*\*\*author:?\*\*\s*(.+)$", txt) or "—"
        tline = field(r"^\s*-\s*\*\*(?:jira|linear)[^*]*\*\*\s*(.+)$", txt) or ""
        # dedupe ids: a markdown-link ticket repeats its id in text and URL
        ids = list(dict.fromkeys(re.findall(r"[A-Z]{3,}-\d+", tline)))
        ticket = ids[0] + (f" +{len(ids) - 1}" if len(ids) > 1 else "") if ids else ""
        tm = os.path.join(d, "tasks.md")
        tasks = count_atomic_tasks(tm) if os.path.exists(tm) else 0
        days = status_age_days(fs, d, txt, now)
        specs.append(
            dict(
                num=num,
                short=short,
                title=title,
                status=status,
                author=author,
                ticket=ticket,
                tasks=tasks,
                days=days,
            )
        )
    return specs


def sizer(specs):
    counts = sorted(s["tasks"] for s in specs)
    n = len(counts) or 1
    lo, hi = counts[n // 3], counts[2 * n // 3]
    return lambda t: "HUGE" if t >= hi else ("Medium" if t >= lo else "small")


def column_of(s):
    st = s["status"]
    return "Draft" if st == "(none)" else (st if st in CANON else "Other")


def card(s, size):
    st = s["status"]
    flag = " *" if st == "(none)" else (f" [{st}]" if st not in CANON else "")
    num = f"{s['num']}{flag}"
    # Spec number leads the top line: right of the ticket when one exists, else
    # alone on the left. Freeing the number off the title line lets the title
    # itself use the card's full inner width.
    top = justify(s["ticket"], num) if s["ticket"] else pad(num)
    sz = size(s["tasks"])
    left = SIZE_SQUARE[sz] + " " + sz
    right = f"{s['days']}d " + days_circle(s["days"])
    return [
        "┌" + "─" * (BOX - 2) + "┐",
        "│ " + top + " │",
        "│ " + pad(s["title"]) + " │",
        "│ " + pad(s["author"]) + " │",
        "│ " + justify(left, right) + " │",
        "└" + "─" * (BOX - 2) + "┘",
    ]


def header(name, count):
    t = f"══ {name} ({count}) ══"
    room = BOX - wide(t)
    return (" " * max(room // 2, 0)) + t + (" " * max(room - room // 2, 0))


def build_column(name, specs, size):
    group = [s for s in specs if column_of(s) == name]
    lines = [header(name, len(group))]
    if not group:
        lines.append(("(none)").center(BOX))
    for s in group:
        lines += card(s, size)
    return lines


def band(names, specs, size, gutter="  "):
    cols = [build_column(n, specs, size) for n in names]
    height = max(len(c) for c in cols)
    for c in cols:
        c += [" " * BOX] * (height - len(c))
    return "\n".join(gutter.join(c[i] for c in cols) for i in range(height))


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: status-board.py <project-dir> [spec-number-or-name]")
    os.chdir(sys.argv[1])
    specs = read_specs(".")
    if not specs:
        print("No specs found — run /awos:spec to create the first one.")
        return
    # Size tiers are relative to the whole project, so compute them before any
    # focus filter — otherwise a one-spec view always renders as HUGE.
    size = sizer(specs)
    if len(sys.argv) > 2:
        key = sys.argv[2].lower()
        # focus by directory index or short name (not the free-text title)
        specs = [s for s in specs if key in f"{s['num']} {s['short']}".lower()]
        if not specs:
            print(f"No spec matches '{sys.argv[2]}'.")
            return
    name = os.path.basename(os.path.abspath("."))
    print(
        f"{name} — {len(specs)} features   "
        f"[🟥 HUGE · 🟨 Medium · 🟩 small │ ⚪<3 🟡≥3 🔴≥5 🟤≥7 days]\n"
    )
    cols = ["Draft", "In Review", "Approved", "Completed"]
    if any(column_of(s) == "Other" for s in specs):
        cols.append("Other")
    print(band(cols, specs, size))


if __name__ == "__main__":
    main()
