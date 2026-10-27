export interface EnvDiff {
  onlyInA: string[]; // keys present in A, missing in B
  onlyInB: string[]; // keys present in B, missing in A
  changed: Array<{ key: string; a: string; b: string }>;
  same: string[];
}

/** Structural diff of two parsed env maps. Sorted keys. */
export function diffEnv(a: Map<string, string>, b: Map<string, string>): EnvDiff {
  const onlyInA: string[] = [];
  const onlyInB: string[] = [];
  const changed: EnvDiff["changed"] = [];
  const same: string[] = [];

  for (const [key, av] of a) {
    if (!b.has(key)) onlyInA.push(key);
    else if (b.get(key) !== av) changed.push({ key, a: av, b: b.get(key)! });
    else same.push(key);
  }
  for (const key of b.keys()) if (!a.has(key)) onlyInB.push(key);

  const s = (arr: string[]) => arr.sort(byCodeUnit);
  return { onlyInA: s(onlyInA), onlyInB: s(onlyInB), changed: changed.sort((x, y) => byCodeUnit(x.key, y.key)), same: s(same) };
}

/** Locale-independent order (code units), so output does not depend on the host's ICU locale. */
function byCodeUnit(x: string, y: string): number {
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Mask a secret-ish value: keep 1st/last char, hide the middle. */
export function maskValue(v: string): string {
  if (v.length === 0) return "(empty)";
  if (v.length <= 2) return "*".repeat(v.length);
  if (v.length <= 6) return v[0] + "*".repeat(v.length - 1);
  return `${v.slice(0, 2)}${"*".repeat(6)}${v.slice(-2)} (${v.length})`;
}

export function hasDifferences(d: EnvDiff): boolean {
  return d.onlyInA.length > 0 || d.onlyInB.length > 0 || d.changed.length > 0;
}
