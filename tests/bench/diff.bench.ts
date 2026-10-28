import { diffEnv } from "../../src/diff";

function generateKey(i: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_";
  let str = "";
  let num = i;
  while (num > 0 || str.length < 8) {
    str += chars[num % chars.length];
    num = Math.floor(num / chars.length);
  }
  return str;
}

function createMap(size: number, seedOffset: number): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i < size; i++) {
    const key = generateKey(i + seedOffset);
    const val = `val_${i % 10}`;
    map.set(key, val);
  }
  return map;
}

console.log("Generating maps with 100,000 keys each...");
const mapA = createMap(100000, 0);
const mapB = createMap(100000, 20000);

console.log(`Bun version: ${Bun.version}`);
console.log(`OS: ${process.platform} ${process.arch}`);

const runs = 5;
const times: number[] = [];

// Warmup
diffEnv(mapA, mapB);

for (let i = 0; i < runs; i++) {
  const start = performance.now();
  diffEnv(mapA, mapB);
  const end = performance.now();
  const duration = end - start;
  times.push(duration);
  console.log(`Run ${i + 1}: ${duration.toFixed(2)} ms`);
}

times.sort((a, b) => a - b);
const median = times[Math.floor(times.length / 2)];
console.log(`\nMedian execution time: ${median.toFixed(2)} ms`);
