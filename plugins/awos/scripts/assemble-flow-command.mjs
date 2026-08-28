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
  const errors = validateFills(parsed, fills);
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
  const baselineDir =
    opts['baseline-dir'] || path.join('context', 'product', '.flow');
  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  fs.mkdirSync(baselineDir, { recursive: true });
  const base = path.basename(opts.out);
  fs.writeFileSync(opts.out, output);
  fs.writeFileSync(path.join(baselineDir, `${base}.baseline.md`), output);
  fs.writeFileSync(
    path.join(baselineDir, `${base}.fills.json`),
    `${JSON.stringify(fills, null, 2)}\n`
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        written: opts.out,
        baseline: path.join(baselineDir, `${base}.baseline.md`),
        stages: parsed.stages.length - (fills.omitStages || []).length,
      },
      null,
      2
    )}\n`
  );
} else if (verb === 'diff') {
  const [generatedPath, baselinePath] = rest;
  if (!generatedPath || !baselinePath) fail(USAGE, 2);
  const generated = fs.readFileSync(generatedPath, 'utf8');
  const baseline = fs.existsSync(baselinePath)
    ? fs.readFileSync(baselinePath, 'utf8')
    : null;
  process.stdout.write(
    `${JSON.stringify(diffStages(generated, baseline), null, 2)}\n`
  );
} else {
  fail(USAGE, 2);
}
