#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseTemplate } from './lib/template.mjs';
import { assemble } from './lib/assemble.mjs';
import { validateFills } from './lib/validate.mjs';
import { diffStages } from './lib/diff.mjs';

const USAGE = `usage:
  assemble-flow-command.mjs slots <template>
  assemble-flow-command.mjs assemble <template> <fills.json> --out <path> --version <v> --date <YYYY-MM-DD> --source <path> [--baseline-dir <dir>]
  assemble-flow-command.mjs diff <generated> <baseline>`;

// The stage-open markers in an assembled command, counted to report what a
// run actually emitted. Same id character class as diff.mjs's STAGE_RE, so
// a repeat instance ("delivery#prod") and an inserted stage both count; the
// close marker carries no "=" and so cannot be double-counted, and
// validate.mjs rejects any fill that contains a marker of its own.
const EMITTED_STAGE_RE = /<!--\s*awos:flow:stage=[a-z0-9#-]+\s*-->/g;

function fail(message, code = 1) {
  process.stderr.write(message.endsWith('\n') ? message : `${message}\n`);
  process.exit(code);
}

function flags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      out[argv[i].slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

const [verb, ...rest] = process.argv.slice(2);

if (verb === 'slots') {
  const [templatePath] = rest;
  if (!templatePath) fail(USAGE, 2);
  const parsed = parseTemplate(fs.readFileSync(templatePath, 'utf8'));
  process.stdout.write(
    `${JSON.stringify(
      {
        template: path.basename(templatePath),
        stages: parsed.stages.map((s) => ({
          id: s.id,
          title: s.title,
          optional: s.optional,
        })),
        sections: parsed.sections.map((s) => ({
          id: s.id,
          optional: s.optional,
        })),
        slots: parsed.slots.map((s) => ({
          id: s.id,
          stage: s.stage,
          section: s.section,
          optional: s.optional,
          inline: s.inline,
          instruction: s.instruction,
          context: s.context,
        })),
      },
      null,
      2
    )}\n`
  );
} else if (verb === 'assemble') {
  const [templatePath, fillsPath] = rest;
  const opts = flags(rest);
  if (
    !templatePath ||
    !fillsPath ||
    !opts.out ||
    !opts.version ||
    !opts.date ||
    !opts.source
  ) {
    fail(USAGE, 2);
  }
  const src = fs.readFileSync(templatePath, 'utf8');
  const fills = JSON.parse(fs.readFileSync(fillsPath, 'utf8'));
  const parsed = parseTemplate(src);
  const baselineDir =
    opts['baseline-dir'] || path.join('context', 'product', '.flow');
  const base = path.basename(opts.out);
  const baselinePath = path.join(baselineDir, `${base}.baseline.md`);
  // A target that already exists with no baseline predates the assembler —
  // there is nothing to diff a hand-edit against, so this is the migration
  // case flow.md Step 6 item 2 falls back for. Gate it in validateFills so
  // it fails the same way (and as early as) any other invalid fill: nothing
  // written. A fresh install (no existing --out) and a normal re-run
  // (baseline present) both skip the gate.
  const migrationGate = fs.existsSync(opts.out) && !fs.existsSync(baselinePath);
  const errors = validateFills(parsed, fills, { migrationGate });
  if (errors.length) {
    fail(
      `fills are invalid — nothing was written:\n  - ${errors.join('\n  - ')}`
    );
  }
  const output = assemble(src, fills, {
    version: opts.version,
    date: opts.date,
    source: opts.source,
  });
  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  fs.mkdirSync(baselineDir, { recursive: true });
  fs.writeFileSync(opts.out, output);
  fs.writeFileSync(baselinePath, output);
  fs.writeFileSync(
    path.join(baselineDir, `${base}.fills.json`),
    `${JSON.stringify(fills, null, 2)}\n`
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        written: opts.out,
        baseline: baselinePath,
        // Counted from the text that was just written, not derived from the
        // template: repeat expands one stage into N instances and insert
        // adds stages the template has none of, so any formula over
        // parsed.stages misreports every run that uses a hatch.
        stages: (output.match(EMITTED_STAGE_RE) || []).length,
      },
      null,
      2
    )}\n`
  );
} else if (verb === 'diff') {
  const [generatedPath, baselinePath] = rest;
  if (!generatedPath || !baselinePath) fail(USAGE, 2);
  if (!fs.existsSync(generatedPath)) {
    // A first-ever generation has no on-disk command yet, and flow.md's
    // Step 6 item 2 calls diff unconditionally — this is a state to
    // report, exit 0, the same way an absent baseline is, not a crash.
    process.stdout.write(
      `${JSON.stringify({ generated: 'absent' }, null, 2)}\n`
    );
  } else {
    const generated = fs.readFileSync(generatedPath, 'utf8');
    const baseline = fs.existsSync(baselinePath)
      ? fs.readFileSync(baselinePath, 'utf8')
      : null;
    process.stdout.write(
      `${JSON.stringify(diffStages(generated, baseline), null, 2)}\n`
    );
  }
} else {
  fail(USAGE, 2);
}
