import { test, expect, beforeEach, afterEach } from "bun:test";
import { main } from "../src/cli";
import pkg from "../package.json" with { type: "json" };
import { writeFileSync, unlinkSync } from "node:fs";

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
