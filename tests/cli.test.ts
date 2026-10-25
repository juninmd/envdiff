import { test, expect, beforeEach, afterEach } from "bun:test";
import { main } from "../src/cli";
import pkg from "../package.json" with { type: "json" };
import { writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

let logOutput: string[] = [];
let errorOutput: string[] = [];
let originalLog = console.log;
let originalError = console.error;

beforeEach(() => {
  logOutput = [];
  errorOutput = [];
  console.log = (...args: any[]) => {
    logOutput.push(args.join(" "));
  };
  console.error = (...args: any[]) => {
    errorOutput.push(args.join(" "));
  };
});

afterEach(() => {
  console.log = originalLog;
  console.error = originalError;
});

function runCli(args: string[]) {
  const code = main(args);
  const stdout = logOutput.join("\n");
  const stderr = errorOutput.join("\n");
  return { exitCode: code, stdout, stderr };
}

const fixtureDir = resolve(import.meta.dir, "fixtures");
const fixtureA = join(fixtureDir, "a.env");
const fixtureB = join(fixtureDir, "b.env");

test("--exit-codes exits with 2 and writes unknown option in stderr", () => {
  const code = main(["--exit-codes"]);
  expect(code).toBe(2);
  const err = errorOutput.join("\n");
  expect(err).toContain("unknown option '--exit-codes'");
  expect(err).toContain("(did you mean '--exit-code'?)");
});

test("--keysonly exits with 2 and writes unknown option in stderr", () => {
  const code = main(["--keysonly"]);
  expect(code).toBe(2);
  const err = errorOutput.join("\n");
  expect(err).toContain("unknown option '--keysonly'");
  expect(err).toContain("(did you mean '--keys-only'?)");
});

test("unknown option without close match", () => {
  const code = main(["--foobar"]);
  expect(code).toBe(2);
  const err = errorOutput.join("\n");
  expect(err).toContain("unknown option '--foobar'");
  expect(err).not.toContain("did you mean");
});

test("--version and -V print package.json version and exit with 0", () => {
  let code = main(["--version"]);
  expect(code).toBe(0);
  expect(logOutput.join("\n")).toBe(pkg.version);

  logOutput = [];
  code = main(["-V"]);
  expect(code).toBe(0);
  expect(logOutput.join("\n")).toBe(pkg.version);
});

test("--help and -h contain Exit codes and masked", () => {
  let code = main(["--help"]);
  expect(code).toBe(0);
  let out = logOutput.join("\n");
  expect(out).toContain("Exit codes");
  expect(out).toContain("masked");

  logOutput = [];
  code = main(["-h"]);
  expect(code).toBe(0);
  out = logOutput.join("\n");
  expect(out).toContain("Exit codes");
  expect(out).toContain("masked");
});

test("-- -arquivo treats -arquivo as file path", () => {
  const fileA = "test_a.env";
  const fileB = "-arquivo";
  writeFileSync(fileA, "A=1");
  writeFileSync(fileB, "A=1");

  try {
    const code = main(["--", fileA, fileB]);
    expect(code).toBe(0);
    expect(errorOutput.length).toBe(0);
  } finally {
    try {
      unlinkSync(fileA);
    } catch {}
    try {
      unlinkSync(fileB);
    } catch {}
  }
});

test("existing exit codes remain stable", () => {
  const fileA = "test_a_exist.env";
  const fileB = "test_b_exist.env";
  writeFileSync(fileA, "KEY=value1");
  writeFileSync(fileB, "KEY=value2");

  try {
    // Diff exists, without --exit-code -> exit 0
    let code = main([fileA, fileB]);
    expect(code).toBe(0);

    // Diff exists, with --exit-code -> exit 1
    code = main([fileA, fileB, "--exit-code"]);
    expect(code).toBe(1);

    // Identical files with --exit-code -> exit 0
    code = main([fileA, fileA, "--exit-code"]);
    expect(code).toBe(0);

    // Missing second file argument -> exit 2
    code = main([fileA]);
    expect(code).toBe(2);
  } finally {
    try {
      unlinkSync(fileA);
    } catch {}
    try {
      unlinkSync(fileB);
    } catch {}
  }
});

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
