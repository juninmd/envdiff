#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseEnvDetailed, ParseWarning } from "./parse";
import { diffEnv, maskValue, hasDifferences } from "./diff";
import { colorEnabled, createColors } from "./colors";

function formatWarning(filePath: string, w: ParseWarning): string {
  let msg = "";
  switch (w.kind) {
    case "duplicate":
      msg = `duplicate key ${w.key} (first at line ${w.firstLine}); the last value is used.`;
      break;
    case "malformed":
      msg = "malformed line";
      break;
    case "invalid-key":
      msg = `invalid key ${w.key}`;
      break;
    case "unclosed-quote":
      msg = `unclosed quote for key ${w.key}`;
      break;
  }
  return `warning: ${filePath}:${w.line}: ${msg}`;
}

function parseFile(filePath: string): Map<string, string> {
  const content = readFileSync(filePath, "utf8");
  const { values, warnings } = parseEnvDetailed(content);
  for (const w of warnings) {
    console.error(formatWarning(filePath, w));
  }
  return values;
}

const C = createColors(colorEnabled(process.env, Boolean(process.stdout?.isTTY)));

const HELP = `envdiff — compare two .env files

Usage:
  envdiff <a.env> <b.env> [options]

Options:
  --json          machine-readable output
  --no-mask       show raw values (default: masked)
  --keys-only     ignore values; only compare which keys exist
  --exit-code     exit 1 when there are differences (for CI)
  -h, --help      show this help

Examples:
  envdiff .env .env.example --keys-only --exit-code
  envdiff prod.env staging.env`;

function main(argv: string[]): number {
  const flags = new Set(argv.filter((a) => a.startsWith("-")));
  if (flags.has("-h") || flags.has("--help")) {
    console.log(HELP);
    return 0;
  }
  const files = argv.filter((a) => !a.startsWith("-"));
  if (files.length !== 2) {
    console.error(C.red("error: need exactly two files"));
    console.error(HELP);
    return 2;
  }

  const mask = !flags.has("--no-mask");
  const keysOnly = flags.has("--keys-only");
  const show = (v: string) => (mask ? maskValue(v) : v);

  let a: Map<string, string>, b: Map<string, string>;
  try {
    a = parseFile(files[0]!);
    b = parseFile(files[1]!);
  } catch (err) {
    console.error(C.red(`error: ${err instanceof Error ? err.message : err}`));
    return 2;
  }

  const diff = diffEnv(a, b);
  const differs = keysOnly ? diff.onlyInA.length > 0 || diff.onlyInB.length > 0 : hasDifferences(diff);

  if (flags.has("--json")) {
    console.log(JSON.stringify(keysOnly ? { onlyInA: diff.onlyInA, onlyInB: diff.onlyInB } : diff, null, 2));
  } else {
    const [nameA, nameB] = files as [string, string];
    console.log(C.bold(`\n${nameA}  ↔  ${nameB}\n`));
    if (diff.onlyInA.length) {
      console.log(C.red(`  only in ${nameA} (${diff.onlyInA.length}):`));
      for (const k of diff.onlyInA) console.log(`    - ${k}`);
    }
    if (diff.onlyInB.length) {
      console.log(C.green(`  only in ${nameB} (${diff.onlyInB.length}):`));
      for (const k of diff.onlyInB) console.log(`    + ${k}`);
    }
    if (!keysOnly && diff.changed.length) {
      console.log(C.yellow(`  changed (${diff.changed.length}):`));
      for (const c of diff.changed) console.log(`    ~ ${c.key}: ${C.dim(show(c.a))} → ${C.dim(show(c.b))}`);
    }
    if (!differs) console.log(C.green("  ✓ no differences"));
    console.log(C.dim(`\n  ${diff.same.length} identical key(s)\n`));
  }

  return flags.has("--exit-code") && differs ? 1 : 0;
}

process.exit(main(process.argv.slice(2)));
