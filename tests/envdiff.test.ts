import { test, expect } from "bun:test";
import { parseEnv, parseEnvDetailed } from "../src/parse";
import { diffEnv, maskValue, hasDifferences } from "../src/diff";
import { writeFileSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";

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
