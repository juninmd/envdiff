import { test, expect } from "bun:test";
import { join } from "node:path";

const cliPath = join(import.meta.dir, "../src/cli.ts");
const fixtureA = join(import.meta.dir, "fixtures/a.env");
const fixtureB = join(import.meta.dir, "fixtures/b.env");

function runCli(args: string[]) {
  const result = Bun.spawnSync(["bun", "run", cliPath, ...args]);
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

test("--json without --no-mask masks changed values", () => {
  const { exitCode, stdout } = runCli([fixtureA, fixtureB, "--json"]);
  expect(exitCode).toBe(0);
  expect(stdout).not.toContain("segredo-falso-123");
  expect(stdout).not.toContain("outro-falso-456");

  const json = JSON.parse(stdout);
  expect(json.changed).toEqual([
    {
      key: "TOKEN",
      a: "se******23 (17)",
      b: "ou******56 (15)",
    },
  ]);
});

test("--json with --no-mask outputs raw values", () => {
  const { exitCode, stdout } = runCli([fixtureA, fixtureB, "--json", "--no-mask"]);
  expect(exitCode).toBe(0);
  expect(stdout).toContain("segredo-falso-123");
  expect(stdout).toContain("outro-falso-456");

  const json = JSON.parse(stdout);
  expect(json.changed).toEqual([
    {
      key: "TOKEN",
      a: "segredo-falso-123",
      b: "outro-falso-456",
    },
  ]);
});

test("--keys-only --json contains no values", () => {
  const { exitCode, stdout } = runCli([fixtureA, fixtureB, "--keys-only", "--json"]);
  expect(exitCode).toBe(0);
  expect(stdout).not.toContain("segredo-falso-123");
  expect(stdout).not.toContain("outro-falso-456");

  const json = JSON.parse(stdout);
  expect(json.changed).toBeUndefined();
  expect(json.onlyInA).toEqual(["ONLY_A"]);
  expect(json.onlyInB).toEqual(["ONLY_B"]);
});

test("exit code 0 when differences exist without --exit-code", () => {
  const { exitCode } = runCli([fixtureA, fixtureB, "--json"]);
  expect(exitCode).toBe(0);
});

test("exit code 1 when differences exist with --exit-code", () => {
  const { exitCode } = runCli([fixtureA, fixtureB, "--exit-code", "--json"]);
  expect(exitCode).toBe(1);
});

test("exit code 0 when no differences exist with --exit-code", () => {
  const { exitCode } = runCli([fixtureA, fixtureA, "--exit-code", "--json"]);
  expect(exitCode).toBe(0);
});

test("exit code 2 on usage / file reading error", () => {
  const { exitCode } = runCli(["non-existent-file-1.env", "non-existent-file-2.env", "--json"]);
  expect(exitCode).toBe(2);

  const { exitCode: exitCodeArgErr } = runCli([fixtureA]);
  expect(exitCodeArgErr).toBe(2);
});
