import { test, expect } from "bun:test";
import { parseEnv } from "../src/parse";

test("parseEnv accepts keys with hyphens and export with tab/spaces", () => {
  const m = parseEnv(`
MY-KEY=1
export\tFOO=bar
export  BAR=baz
1BAD=x
BAD LINE
`);
  expect(m.get("MY-KEY")).toBe("1");
  expect(m.get("FOO")).toBe("bar");
  expect(m.get("BAR")).toBe("baz");
  expect(m.has("1BAD")).toBe(false);
  expect(m.has("BAD LINE")).toBe(false);
});
