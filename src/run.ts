import { parseEnv } from "./parse";
import { diffEnv, maskValue, hasDifferences } from "./diff";

export interface Io {
  readFile(path: string): string;
  stdout(line: string): void;
  stderr(line: string): void;
  env: Record<string, string | undefined>;
  isTTY: boolean;
}

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

export function run(argv: string[], io: Io): number {
  const flags = new Set(argv.filter((a) => a.startsWith("-")));
  if (flags.has("-h") || flags.has("--help")) {
    io.stdout(HELP);
    return 0;
  }
  const files = argv.filter((a) => !a.startsWith("-"));
  if (files.length !== 2) {
    io.stderr(C.red("error: need exactly two files"));
    io.stderr(HELP);
    return 2;
  }

  const mask = !flags.has("--no-mask");
  const keysOnly = flags.has("--keys-only");
  const show = (v: string) => (mask ? maskValue(v) : v);

  let a: Map<string, string>, b: Map<string, string>;
  try {
    a = parseEnv(io.readFile(files[0]!));
    b = parseEnv(io.readFile(files[1]!));
  } catch (err) {
    io.stderr(C.red(`error: ${err instanceof Error ? err.message : err}`));
    return 2;
  }

  const diff = diffEnv(a, b);
  const differs = keysOnly ? diff.onlyInA.length > 0 || diff.onlyInB.length > 0 : hasDifferences(diff);

  if (flags.has("--json")) {
    io.stdout(JSON.stringify(keysOnly ? { onlyInA: diff.onlyInA, onlyInB: diff.onlyInB } : diff, null, 2));
  } else {
    const [nameA, nameB] = files as [string, string];
    io.stdout(C.bold(`\n${nameA}  ↔  ${nameB}\n`));
    if (diff.onlyInA.length) {
      io.stdout(C.red(`  only in ${nameA} (${diff.onlyInA.length}):`));
      for (const k of diff.onlyInA) io.stdout(`    - ${k}`);
    }
    if (diff.onlyInB.length) {
      io.stdout(C.green(`  only in ${nameB} (${diff.onlyInB.length}):`));
      for (const k of diff.onlyInB) io.stdout(`    + ${k}`);
    }
    if (!keysOnly && diff.changed.length) {
      io.stdout(C.yellow(`  changed (${diff.changed.length}):`));
      for (const c of diff.changed) io.stdout(`    ~ ${c.key}: ${C.dim(show(c.a))} → ${C.dim(show(c.b))}`);
    }
    if (!differs) io.stdout(C.green("  ✓ no differences"));
    io.stdout(C.dim(`\n  ${diff.same.length} identical key(s)\n`));
  }

  return flags.has("--exit-code") && differs ? 1 : 0;
}
