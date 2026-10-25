#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseEnv } from "./parse";
import { diffEnv, maskValue, hasDifferences } from "./diff";

const C = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

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
    a = parseEnv(readFileSync(files[0]!, "utf8"));
    b = parseEnv(readFileSync(files[1]!, "utf8"));
  } catch (err) {
    console.error(C.red(`error: ${err instanceof Error ? err.message : err}`));
    return 2;
  }

  const diff = diffEnv(a, b);
  const differs = keysOnly ? diff.onlyInA.length > 0 || diff.onlyInB.length > 0 : hasDifferences(diff);

  if (flags.has("--json")) {
    const payload = keysOnly
      ? { onlyInA: diff.onlyInA, onlyInB: diff.onlyInB }
      : {
          ...diff,
          changed: diff.changed.map((c) => ({ key: c.key, a: show(c.a), b: show(c.b) })),
        };
    console.log(JSON.stringify(payload, null, 2));
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
