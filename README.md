# envdiff

> Diff two `.env` files (or an `.env` against its `.env.example`): missing keys, extra keys, changed values — with secret masking.

A tiny, dependency-free CLI to catch config drift before it bites you in production. Values are **masked by default**, so it's safe to run and paste the output into a PR or CI log.

## Install

```bash
# run without installing
bunx envdiff .env .env.example --keys-only --exit-code

# or install globally
npm i -g envdiff
```

## Usage

```bash
envdiff <a.env> <b.env> [options]
```

| Option        | Description                                          |
| ------------- | ---------------------------------------------------- |
| `--json`      | Machine-readable output                              |
| `--no-mask`   | Show raw values (default: masked)                    |
| `--keys-only` | Ignore values; only compare which keys exist         |
| `--exit-code` | Exit `1` when there are differences (for CI)         |
| `-h, --help`  | Show help                                            |

### Examples

```bash
# Verify your local .env has every key the example declares (CI-friendly)
envdiff .env .env.example --keys-only --exit-code

# Compare two environments, keeping secrets masked
envdiff prod.env staging.env

# Emit JSON for scripting
envdiff .env .env.example --json
```

### Output

For each pair envdiff reports three buckets:

- **only in A** — keys present in the first file, missing from the second
- **only in B** — keys present in the second file, missing from the first
- **changed** — keys in both with different values (skipped with `--keys-only`)

Exit codes: `0` no differences (or differences without `--exit-code`), `1` differences with `--exit-code`, `2` usage/IO error.

## Development

Built with [Bun](https://bun.sh) and bundled with [tsdown](https://github.com/rolldown/tsdown). No runtime dependencies.

```bash
bun install
bun test          # run the test suite
bun run start .env .env.example   # run from source
bun run build     # bundle to dist/
```

See [AGENTS.md](./AGENTS.md) for contributor and agent guidance.

## License

MIT
