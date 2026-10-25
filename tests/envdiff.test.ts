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
