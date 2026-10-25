import { test, expect } from "bun:test";
import { parseEnv } from "../src/parse";

test("parseEnv handles double-quote escapes and single-quote literals", () => {
  const env = parseEnv(`
P="C:\\\\new"
Q="a\\nb"
R="say \\"hi\\""
S='a\\nb'
T="x\\\\"
U="a\\tb"
V="a\\rb"
W="a\\xb"
`);

  expect(env.get("P")).toBe("C:\\new");
  expect(env.get("Q")).toBe("a\nb");
  expect(env.get("R")).toBe('say "hi"');
  expect(env.get("S")).toBe("a\\nb");
  expect(env.get("T")).toBe("x\\");
  expect(env.get("U")).toBe("a\tb");
  expect(env.get("V")).toBe("a\rb");
  expect(env.get("W")).toBe("a\\xb");
});
