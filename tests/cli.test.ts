import { test, expect } from "bun:test";
import { run, type Io } from "../src/run";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function createFakeIo(files: Record<string, string> = {}, isTTY = true) {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const io: Io = {
    readFile(path: string): string {
      if (path in files) return files[path]!;
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    },
    stdout(line: string) {
      stdoutLines.push(line);
    },
    stderr(line: string) {
      stderrLines.push(line);
    },
    env: {},
    isTTY,
  };
  return { io, stdoutLines, stderrLines };
}

test("run handles -h and --help with exit code 0", () => {
  const { io: io1, stdoutLines: out1 } = createFakeIo();
  expect(run(["-h"], io1)).toBe(0);
  expect(out1.join("\n")).toContain("envdiff — compare two .env files");

  const { io: io2, stdoutLines: out2 } = createFakeIo();
  expect(run(["--help"], io2)).toBe(0);
  expect(out2.join("\n")).toContain("envdiff — compare two .env files");
});

test("run handles invalid argument counts with exit code 2", () => {
  const { io: io1, stderrLines: err1 } = createFakeIo();
  expect(run([], io1)).toBe(2);
  expect(err1.join("\n")).toContain("error: need exactly two files");

  const { io: io2, stderrLines: err2 } = createFakeIo();
  expect(run(["a.env"], io2)).toBe(2);
  expect(err2.join("\n")).toContain("error: need exactly two files");
});

test("run handles file read error with exit code 2", () => {
  const { io, stderrLines } = createFakeIo();
  expect(run(["missing.env", "other.env"], io)).toBe(2);
  expect(stderrLines.join("\n")).toContain("error: ENOENT");
});

test("run exit codes: 0 without --exit-code, 1 with --exit-code when diffs exist", () => {
  const files = {
    "a.env": "FOO=bar\nSAME=1",
    "b.env": "FOO=baz\nSAME=1",
  };

  const { io: io0 } = createFakeIo(files);
  expect(run(["a.env", "b.env"], io0)).toBe(0);

  const { io: io1 } = createFakeIo(files);
  expect(run(["a.env", "b.env", "--exit-code"], io1)).toBe(1);

  const sameFiles = {
    "a.env": "FOO=bar",
    "b.env": "FOO=bar",
  };
  const { io: ioSame } = createFakeIo(sameFiles);
  expect(run(["a.env", "b.env", "--exit-code"], ioSame)).toBe(0);
});

test("run --json formats diff as JSON object", () => {
  const files = {
    "a.env": "ONLY_A=1\nCHANGED=1",
    "b.env": "ONLY_B=2\nCHANGED=2",
  };
  const { io, stdoutLines } = createFakeIo(files);
  expect(run(["a.env", "b.env", "--json"], io)).toBe(0);

  const json = JSON.parse(stdoutLines.join("\n"));
  expect(json.onlyInA).toEqual(["ONLY_A"]);
  expect(json.onlyInB).toEqual(["ONLY_B"]);
  expect(json.changed).toEqual([{ key: "CHANGED", a: "1", b: "2" }]);
});

test("run --keys-only compares only keys and affects exit code", () => {
  const filesValDiffOnly = {
    "a.env": "KEY=val1",
    "b.env": "KEY=val2",
  };

  const { io: ioTxt, stdoutLines: txtOut } = createFakeIo(filesValDiffOnly);
  expect(run(["a.env", "b.env", "--keys-only"], ioTxt)).toBe(0);
  expect(txtOut.join("\n")).not.toContain("changed");

  const { io: ioJson, stdoutLines: jsonOut } = createFakeIo(filesValDiffOnly);
  expect(run(["a.env", "b.env", "--keys-only", "--json"], ioJson)).toBe(0);
  const parsed = JSON.parse(jsonOut.join("\n"));
  expect(parsed).toEqual({ onlyInA: [], onlyInB: [] });

  const { io: ioExitVal } = createFakeIo(filesValDiffOnly);
  expect(run(["a.env", "b.env", "--keys-only", "--exit-code"], ioExitVal)).toBe(0);

  const filesKeyDiff = {
    "a.env": "KEY_A=1",
    "b.env": "KEY_B=1",
  };
  const { io: ioExitKey } = createFakeIo(filesKeyDiff);
  expect(run(["a.env", "b.env", "--keys-only", "--exit-code"], ioExitKey)).toBe(1);
});

test("run --no-mask toggles value masking", () => {
  const files = {
    "a.env": "SECRET=supersecret123",
    "b.env": "SECRET=supersecret456",
  };

  const { io: ioMask, stdoutLines: maskOut } = createFakeIo(files);
  expect(run(["a.env", "b.env"], ioMask)).toBe(0);
  expect(maskOut.join("\n")).toContain("su******23");
  expect(maskOut.join("\n")).not.toContain("supersecret123");

  const { io: ioNoMask, stdoutLines: noMaskOut } = createFakeIo(files);
  expect(run(["a.env", "b.env", "--no-mask"], ioNoMask)).toBe(0);
  expect(noMaskOut.join("\n")).toContain("supersecret123");
  expect(noMaskOut.join("\n")).toContain("supersecret456");
});

test("subprocess test: >64 KB JSON output completes without truncation", async () => {
  const pathA = join(tmpdir(), `envdiff_test_a_${Date.now()}.env`);
  const pathB = join(tmpdir(), `envdiff_test_b_${Date.now()}.env`);

  try {
    const linesA: string[] = [];
    const linesB: string[] = [];
    // Generate ~1500 key-value pairs so JSON output exceeds 64 KB
    for (let i = 0; i < 1500; i++) {
      const valueA = `value_a_long_string_padding_${i}_${"x".repeat(40)}`;
      const valueB = `value_b_long_string_padding_${i}_${"y".repeat(40)}`;
      linesA.push(`LARGE_KEY_${i}=${valueA}`);
      linesB.push(`LARGE_KEY_${i}=${valueB}`);
    }
    writeFileSync(pathA, linesA.join("\n"));
    writeFileSync(pathB, linesB.join("\n"));

    const proc = Bun.spawn(["bun", "run", "src/cli.ts", pathA, pathB, "--json"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdoutText = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(stdoutText.length).toBeGreaterThan(64 * 1024);

    const parsed = JSON.parse(stdoutText);
    expect(parsed.changed.length).toBe(1500);
  } finally {
    try { unlinkSync(pathA); } catch {}
    try { unlinkSync(pathB); } catch {}
  }
});
