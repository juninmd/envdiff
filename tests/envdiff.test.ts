import { test, expect } from "bun:test";
import { parseEnv, parseEnvDetailed } from "../src/parse";
import { diffEnv, maskValue, hasDifferences } from "../src/diff";
import { writeFileSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";

test("diffEnv sorts keys by code unit, not by locale collation", () => {
  const a = new Map([["b", "1"], ["B", "1"], ["a", "1"]]);
  const b = new Map([["b", "1"], ["B", "1"], ["a", "1"]]);
  expect(diffEnv(a, b).same).toEqual(["B", "a", "b"]);
});

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
A="x" # c
A2='x' # c
B=x\t# c
C=x#y
D="a#b"
E=""
`);
  expect(m.get("FOO")).toBe("bar");
  expect(m.get("QUOTED")).toBe("he llo");
  expect(m.get("SINGLE")).toBe("raw#notcomment");
  expect(m.get("INLINE")).toBe("value");
  expect(m.get("EMPTY")).toBe("");
  expect(m.get("NUM.KEY")).toBe("1");
  expect(m.has("BAD LINE")).toBe(false);
  expect(m.get("A")).toBe("x");
  expect(m.get("A2")).toBe("x");
  expect(m.get("B")).toBe("x");
  expect(m.get("C")).toBe("x#y");
  expect(m.get("D")).toBe("a#b");
  expect(m.get("E")).toBe("");
});

test("files differing only in comments result in no differences", () => {
  const file1 = `
A="x" # comment 1
B='y' \t# comment 2
C=z\t# comment 3
D=val#hash
E=""
`;
  const file2 = `
A="x"
B='y'
C=z
D=val#hash
E="" # comment
`;
  const env1 = parseEnv(file1);
  const env2 = parseEnv(file2);
  expect(hasDifferences(diffEnv(env1, env2))).toBe(false);
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

test("maskValue returns fixed 8 asterisks or (empty)", () => {
  expect(maskValue("")).toBe("(empty)");
  expect(maskValue("ab")).toBe("********");
  expect(maskValue("secret")).toBe("********");
  expect(maskValue("supersecrettoken")).toBe("********");
});

test("property test: mask does not contain 2-char substrings for 200 random values", () => {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-$#@!";
  let testedCount = 0;

  for (let i = 0; i < 200; i++) {
    const len = Math.floor(Math.random() * (20 - 8 + 1)) + 8; // 8 to 20
    let randomVal = "";
    for (let j = 0; j < len; j++) {
      randomVal += chars[Math.floor(Math.random() * chars.length)];
    }

    const masked = maskValue(randomVal);
    expect(masked).toBe("********");

    for (let k = 0; k < randomVal.length - 1; k++) {
      const sub = randomVal.slice(k, k + 2);
      expect(masked.includes(sub)).toBe(false);
    }
    testedCount++;
  }

  console.log(`Property test verified ${testedCount} random values.`);
  expect(testedCount).toBe(200);
});

test("--no-mask shows raw values", () => {
  const a = parseEnv("SECRET=supersecrettoken");
  const b = parseEnv("SECRET=differentsecret");
  const diff = diffEnv(a, b);

  expect(diff.changed[0].a).toBe("supersecrettoken");
  expect(diff.changed[0].b).toBe("differentsecret");
  expect(maskValue(diff.changed[0].a)).toBe("********");
  // raw value remains unchanged when mask is disabled (diff stores raw values, maskValue is bypassed)
});

test("--json output without --keys-only includes schemaVersion 1 and masked changed values", () => {
  const pathA = `${import.meta.dir}/a_${Date.now()}.env`;
  const pathB = `${import.meta.dir}/b_${Date.now()}.env`;
  const { writeFileSync, unlinkSync } = require("node:fs");
  writeFileSync(pathA, "A=1\nB=supersecret\nSAME=value");
  writeFileSync(pathB, "B=differentsecret\nC=2\nSAME=value");

  try {
    const proc = Bun.spawnSync(["bun", "src/cli.ts", pathA, pathB, "--json"]);
    expect(proc.exitCode).toBe(0);
    const json = JSON.parse(proc.stdout.toString());

    expect(Object.keys(json)).toEqual(["schemaVersion", "onlyInA", "onlyInB", "changed", "same"]);
    expect(json.schemaVersion).toBe(1);
    expect(json.onlyInA).toEqual(["A"]);
    expect(json.onlyInB).toEqual(["C"]);
    expect(json.same).toEqual(["SAME"]);
    expect(json.changed).toEqual([
      { key: "B", a: "********", b: "********" },
    ]);
  } finally {
    unlinkSync(pathA);
    unlinkSync(pathB);
  }
});

test("--json output with --keys-only has changed === null and preserves onlyInA, onlyInB, same", () => {
  const pathA = `${import.meta.dir}/a_keys_${Date.now()}.env`;
  const pathB = `${import.meta.dir}/b_keys_${Date.now()}.env`;
  const { writeFileSync, unlinkSync } = require("node:fs");
  writeFileSync(pathA, "A=1\nB=supersecret\nSAME=value");
  writeFileSync(pathB, "B=differentsecret\nC=2\nSAME=value");

  try {
    const proc = Bun.spawnSync(["bun", "src/cli.ts", pathA, pathB, "--json", "--keys-only"]);
    expect(proc.exitCode).toBe(0);
    const json = JSON.parse(proc.stdout.toString());

    expect(Object.keys(json)).toEqual(["schemaVersion", "onlyInA", "onlyInB", "changed", "same"]);
    expect(json.schemaVersion).toBe(1);
    expect(json.onlyInA).toEqual(["A"]);
    expect(json.onlyInB).toEqual(["C"]);
    expect(json.same).toEqual(["SAME"]);
    expect(json.changed).toBeNull();
  } finally {
    unlinkSync(pathA);
    unlinkSync(pathB);
  }
});

test("--json output with --no-mask returns raw values in changed", () => {
  const pathA = `${import.meta.dir}/a_nomask_${Date.now()}.env`;
  const pathB = `${import.meta.dir}/b_nomask_${Date.now()}.env`;
  const { writeFileSync, unlinkSync } = require("node:fs");
  writeFileSync(pathA, "SECRET=rawA");
  writeFileSync(pathB, "SECRET=rawB");

  try {
    const proc = Bun.spawnSync(["bun", "src/cli.ts", pathA, pathB, "--json", "--no-mask"]);
    expect(proc.exitCode).toBe(0);
    const json = JSON.parse(proc.stdout.toString());

    expect(json.schemaVersion).toBe(1);
    expect(json.changed).toEqual([
      { key: "SECRET", a: "rawA", b: "rawB" },
    ]);
  } finally {
    unlinkSync(pathA);
    unlinkSync(pathB);
  }
});

test("parseEnvDetailed detects duplicates, malformed, invalid keys, unclosed quotes", () => {
  const duplicateRes = parseEnvDetailed("A=1\nA=2");
  expect(duplicateRes.values.get("A")).toBe("2");
  expect(duplicateRes.warnings).toEqual([
    { line: 2, kind: "duplicate", key: "A", firstLine: 1 },
  ]);

  const malformedRes = parseEnvDetailed("VALID=1\nBAD LINE\nOTHER=2");
  expect(malformedRes.warnings).toEqual([
    { line: 2, kind: "malformed" },
  ]);

  const invalidKeyRes = parseEnvDetailed("1BAD=x");
  expect(invalidKeyRes.warnings).toEqual([
    { line: 1, kind: "invalid-key", key: "1BAD" },
  ]);

  const unclosedQuoteRes = parseEnvDetailed('A="abc');
  expect(unclosedQuoteRes.warnings).toEqual([
    { line: 1, kind: "unclosed-quote", key: "A" },
  ]);

  const cleanRes = parseEnvDetailed("FOO=bar\nBAZ=qux");
  expect(cleanRes.warnings.length).toBe(0);
});

test("CLI stdout is identical with/without warnings and warnings go to stderr", () => {
  const cleanA = "tests/test_clean_a.env";
  const cleanB = "tests/test_clean_b.env";
  const warnA = "tests/test_warn_a.env";

  writeFileSync(cleanA, "A=2\nC=\"abc\n");
  writeFileSync(cleanB, "A=1\nB=3\n");
  writeFileSync(warnA, "# comment\nA=1\nBAD LINE\n1BAD=x\nA=2\nC=\"abc\n");

  try {
    const stdoutClean = execSync(`bun run src/cli.ts ${cleanA} ${cleanB} 2>/dev/null`).toString();
    const stdoutWarn = execSync(`bun run src/cli.ts ${warnA} ${cleanB} 2>/dev/null`).toString();

    // Standard stdout should match except for file names if file names are different in header
    // So replace cleanA path with warnA path in stdoutClean
    const stdoutCleanNormalized = stdoutClean.replaceAll(cleanA, warnA);
    expect(stdoutWarn).toBe(stdoutCleanNormalized);

    // Verify stderr contains the expected warnings
    let stderrOutput = "";
    try {
      execSync(`bun run src/cli.ts ${warnA} ${cleanB} 2> tests/test_stderr.tmp`);
      stderrOutput = require("node:fs").readFileSync("tests/test_stderr.tmp", "utf8");
      unlinkSync("tests/test_stderr.tmp");
    } catch (e: any) {
      stderrOutput = e.stderr ? e.stderr.toString() : "";
    }

    expect(stderrOutput).toContain(`warning: ${warnA}:3: malformed line`);
    expect(stderrOutput).toContain(`warning: ${warnA}:4: invalid key 1BAD`);
    expect(stderrOutput).toContain(`warning: ${warnA}:5: duplicate key A (first at line 2); the last value is used.`);
    expect(stderrOutput).toContain(`warning: ${warnA}:6: unclosed quote for key C`);

    // Verify --json mode stdout is identical and warnings go to stderr
    const stdoutCleanJson = execSync(`bun run src/cli.ts ${cleanA} ${cleanB} --json 2>/dev/null`).toString();
    const stdoutWarnJson = execSync(`bun run src/cli.ts ${warnA} ${cleanB} --json 2>/dev/null`).toString();
    expect(stdoutWarnJson).toBe(stdoutCleanJson);
  } finally {
    try { unlinkSync(cleanA); } catch {}
    try { unlinkSync(cleanB); } catch {}
    try { unlinkSync(warnA); } catch {}
  }
});
