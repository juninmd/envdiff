import { readFileSync } from "node:fs";

export function readEnvFile(path: string): string {
  const buf = readFileSync(path);
  let text: string;

  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    text = new TextDecoder("utf-16le").decode(buf.subarray(2));
  } else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    text = new TextDecoder("utf-16be").decode(buf.subarray(2));
  } else if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    text = new TextDecoder("utf-8").decode(buf.subarray(3));
  } else {
    text = new TextDecoder("utf-8").decode(buf);
  }

  if (text.includes("\uFFFD") || text.includes("\0")) {
    throw new Error(`unsupported encoding in ${path} (expected UTF-8 or UTF-16 with BOM)`);
  }

  return text;
}
