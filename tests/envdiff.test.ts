import { test, expect } from "bun:test";
import { parseEnv } from "../src/parse";
import { diffEnv, maskValue, hasDifferences } from "../src/diff";

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

test("maskValue hides the middle", () => {
  expect(maskValue("")).toBe("(empty)");
  expect(maskValue("ab")).toBe("**");
  expect(maskValue("secret")).toBe("s*****");
  expect(maskValue("supersecrettoken")).toBe("su******en (16)");
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
      { key: "B", a: "su******et (11)", b: "di******et (15)" },
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
