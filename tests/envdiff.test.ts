import { test, expect } from "bun:test";
import { parseEnv } from "../src/parse";
import { diffEnv, maskValue, hasDifferences } from "../src/diff";
import { readEnvFile } from "../src/read";
import { spawnSync } from "node:child_process";

test("parseEnv handles export, quotes, comments", () => {
  const m = parseEnv(`
# comment
export FOO=bar
QUOTED="he llo"
SINGLE='raw#notcomment'
INLINE=value # trailing comment
EMPTY=
BAD LINE
=noKey
NUM.KEY=1
`);
  expect(m.get("FOO")).toBe("bar");
  expect(m.get("QUOTED")).toBe("he llo");
  expect(m.get("SINGLE")).toBe("raw#notcomment");
  expect(m.get("INLINE")).toBe("value");
  expect(m.get("EMPTY")).toBe("");
  expect(m.get("NUM.KEY")).toBe("1");
  expect(m.has("BAD LINE")).toBe(false);
});

test("diffEnv classifies keys", () => {
  const a = parseEnv("A=1\nB=2\nC=3");
  const b = parseEnv("B=2\nC=changed\nD=4");
  const d = diffEnv(a, b);
  expect(d.onlyInA).toEqual(["A"]);
  expect(d.onlyInB).toEqual(["D"]);
  expect(d.changed).toEqual([{ key: "C", a: "3", b: "changed" }]);
  expect(d.same).toEqual(["B"]);
  expect(hasDifferences(d)).toBe(true);
});

test("identical files show no differences", () => {
  const a = parseEnv("X=1\nY=2");
  expect(hasDifferences(diffEnv(a, parseEnv("Y=2\nX=1")))).toBe(false);
});

test("maskValue hides the middle", () => {
  expect(maskValue("")).toBe("(empty)");
  expect(maskValue("ab")).toBe("**");
  expect(maskValue("secret")).toBe("s*****");
  expect(maskValue("supersecrettoken")).toBe("su******en (16)");
});

test("readEnvFile reads utf16le-bom and utf8 as identical logical content", () => {
  const utf8Text = readEnvFile("tests/fixtures/utf8.env");
  const utf16Text = readEnvFile("tests/fixtures/utf16le-bom.env");
  const env8 = parseEnv(utf8Text);
  const env16 = parseEnv(utf16Text);
  expect(hasDifferences(diffEnv(env8, env16))).toBe(false);
  expect(env16.get("FOO")).toBe("bar");
  expect(env16.get("BAZ")).toBe("qux");
});

test("readEnvFile reads utf8-bom correctly", () => {
  const utf8BomText = readEnvFile("tests/fixtures/utf8-bom.env");
  const env = parseEnv(utf8BomText);
  expect(env.has("FOO")).toBe(true);
  expect(env.get("FOO")).toBe("bar");
});

test("readEnvFile throws unsupported encoding on binary junk", () => {
  expect(() => readEnvFile("tests/fixtures/binary-junk.env")).toThrow(
    "unsupported encoding in tests/fixtures/binary-junk.env (expected UTF-8 or UTF-16 with BOM)"
  );
});

test("CLI exits with code 2 on binary-junk.env", () => {
  const res = spawnSync("bun", ["run", "src/cli.ts", "tests/fixtures/binary-junk.env", "tests/fixtures/utf8.env"], {
    encoding: "utf8",
  });
  expect(res.status).toBe(2);
  expect(res.stderr).toContain("error: unsupported encoding in tests/fixtures/binary-junk.env (expected UTF-8 or UTF-16 with BOM)");
});
