#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { run } from "./run";

process.exitCode = run(process.argv.slice(2), {
  readFile: (p) => readFileSync(p, "utf8"),
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
  env: process.env,
  isTTY: Boolean(process.stdout.isTTY),
});
