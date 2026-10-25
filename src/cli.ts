#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseEnv } from "./parse";
import { diffEnv, maskValue, hasDifferences } from "./diff";
import pkg from "../package.json" with { type: "json" };
import { colorEnabled, createColors } from "./colors";

const C = createColors(colorEnabled(process.env, Boolean(process.stdout?.isTTY)));

const KNOWN_FLAGS = [
  "--json",
  "--no-mask",
  "--keys-only",
  "--exit-code",
  "-h",
  "--help",
  "-V",
  "--version",
];

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]!;
      } else {
        dp[i]![j] = 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
      }
    }
  }
  return dp[m]![n]!;
}

function getClosestFlag(arg: string): string | undefined {
  let bestFlag: string | undefined;
  let minDistance = Infinity;

  for (const flag of KNOWN_FLAGS) {
    const dist = levenshtein(arg, flag);
    if (dist < minDistance) {
      minDistance = dist;
      bestFlag = flag;
    }
  }

  return minDistance <= 2 ? bestFlag : undefined;
}

const HELP = `envdiff — compare two .env files

Usage:
  envdiff <a.env> <b.env> [options]

Options:
  --json          machine-readable output
  --no-mask       show raw values (default: masked)
  --keys-only     ignore values; only compare which keys exist
  --exit-code     exit 1 when there are differences (for CI)
  -V, --version   show version number
  -h, --help      show this help

Exit codes:
  0               no differences (or differences without --exit-code)
  1               differences found (with --exit-code)
  2               usage or I/O error

Note:
  Values are masked by default, including in --json.

Examples:
  envdiff .env .env.example --keys-only --exit-code
  envdiff prod.env staging.env`;

export function main(argv: string[]): number {
  const flags = new Set<string>();
  const files: string[] = [];
  let doubleDashSeen = false;

  for (const arg of argv) {
    if (doubleDashSeen) {
      files.push(arg);
    } else if (arg === "--") {
      doubleDashSeen = true;
    } else if (arg.startsWith("-")) {
      if (KNOWN_FLAGS.includes(arg)) {
        flags.add(arg);
      } else {
        const suggestion = getClosestFlag(arg);
        const didYouMean = suggestion ? ` (did you mean '${suggestion}'?)` : "";
        console.error(C.red(`error: unknown option '${arg}'${didYouMean}`));
        return 2;
      }
    } else {
      files.push(arg);
    }
  }

  if (flags.has("-V") || flags.has("--version")) {
    console.log(pkg.version);
    return 0;
  }

  if (flags.has("-h") || flags.has("--help")) {
    console.log(HELP);
    return 0;
  }

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

  const jsonDiff = {
    ...diff,
    changed: diff.changed.map((c) => ({
      key: c.key,
      a: show(c.a),
      b: show(c.b),
    })),
  };

  if (flags.has("--json")) {
    const jsonOutput = {
      schemaVersion: 1,
      onlyInA: diff.onlyInA,
      onlyInB: diff.onlyInB,
      changed: keysOnly
        ? null
        : diff.changed.map((c) => ({
            key: c.key,
            a: show(c.a),
            b: show(c.b),
          })),
      same: diff.same,
    };
    console.log(JSON.stringify(jsonOutput, null, 2));
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

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
