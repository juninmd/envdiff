# AGENTS.md

Guidance for AI agents and contributors working in this repo.

## What this is

`envdiff` — a zero-dependency CLI that diffs two `.env` files. Single-purpose, small surface area. Keep it that way.

## Stack & commands

- **Runtime:** [Bun](https://bun.sh) (never npm/node for dev tasks here).
- **Bundler:** tsdown → `dist/cli.js` (the published `bin`).
- **Tests:** `bun test`.

```bash
bun install
bun test                          # must stay green
bun run start .env .env.example   # run from source
bun run build                     # bundle before publishing
```

## Layout

| File           | Responsibility                                              |
| -------------- | ----------------------------------------------------------- |
| `src/cli.ts`   | Arg parsing, output formatting, exit codes. No parse logic. |
| `src/parse.ts` | `.env` text → `Map<string,string>`.                         |
| `src/diff.ts`  | Diff two maps; value masking (`maskValue`).                 |
| `tests/`       | `bun test` specs — cover every branch you touch.            |

## Conventions

- **No runtime dependencies.** Anything new must be dev-only, or it doesn't land.
- Secrets are **masked by default**; never change a default that would leak raw values.
- Keep exit codes stable: `0` ok, `1` diffs (with `--exit-code`), `2` usage/IO error.
- Match the existing terse style; every changed line maps to the request.
- Add/adjust a test for any behavior change before committing.

## Definition of done

`bun test` green, `bun run build` succeeds, README reflects any new flag.
