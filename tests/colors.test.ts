import { test, expect } from "bun:test";
import { colorEnabled, createColors } from "../src/colors";
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";

test("colorEnabled unit rules", () => {
  // TTY without variables (on)
  expect(colorEnabled({}, true)).toBe(true);

  // non-TTY (off)
  expect(colorEnabled({}, false)).toBe(false);

  // NO_COLOR defined and not empty with TTY (off)
  expect(colorEnabled({ NO_COLOR: "1" }, true)).toBe(false);
  expect(colorEnabled({ NO_COLOR: "true" }, true)).toBe(false);

  // NO_COLOR empty string should not turn off color
  expect(colorEnabled({ NO_COLOR: "" }, true)).toBe(true);

  // FORCE_COLOR=1 without TTY (on)
  expect(colorEnabled({ FORCE_COLOR: "1" }, false)).toBe(true);
  expect(colorEnabled({ FORCE_COLOR: "true" }, false)).toBe(true);

  // FORCE_COLOR=0 (off)
  expect(colorEnabled({ FORCE_COLOR: "0" }, true)).toBe(false);
  expect(colorEnabled({ FORCE_COLOR: "0" }, false)).toBe(false);

  // NO_COLOR takes precedence over FORCE_COLOR
  expect(colorEnabled({ NO_COLOR: "1", FORCE_COLOR: "1" }, true)).toBe(false);

  // TERM=dumb (off)
  expect(colorEnabled({ TERM: "dumb" }, true)).toBe(false);
  expect(colorEnabled({ TERM: "dumb" }, false)).toBe(false);
});

test("createColors output with and without colors", () => {
  const colored = createColors(true);
  const plain = createColors(false);

  expect(colored.red("text")).toBe("\x1b[31mtext\x1b[0m");
  expect(plain.red("text")).toBe("text");
});

test("CLI redirected output contains no ANSI escape sequences and matches stripped colored text", () => {
  const fileA = "test_a.env";
  const fileB = "test_b.env";
  writeFileSync(fileA, "FOO=1\nBAR=2\nCHANGED=1");
  writeFileSync(fileB, "FOO=1\nBAZ=3\nCHANGED=2");

  try {
    // Non-TTY execution (execFileSync runs without TTY stdout)
    const stdoutNoColor = execFileSync("bun", ["run", "src/cli.ts", fileA, fileB], {
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: undefined, FORCE_COLOR: undefined, TERM: undefined },
    });

    // Forced color execution
    const stdoutColor = execFileSync("bun", ["run", "src/cli.ts", fileA, fileB], {
      encoding: "utf8",
      env: { ...process.env, FORCE_COLOR: "1", NO_COLOR: undefined, TERM: undefined },
    });

    // 1. Redirected output (non-TTY) must not contain ANSI escape sequences \x1b
    expect(stdoutNoColor).not.toContain("\x1b");

    // 2. Text without color is equal to text with color after removing ANSI escape sequences
    const ansiRegex = /\x1b\[\d+m/g;
    expect(stdoutNoColor).toBe(stdoutColor.replace(ansiRegex, ""));
  } finally {
    unlinkSync(fileA);
    unlinkSync(fileB);
  }
});
