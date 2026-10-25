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

  const s = (arr: string[]) => arr.sort((x, y) => x.localeCompare(y));
  return { onlyInA: s(onlyInA), onlyInB: s(onlyInB), changed: changed.sort((x, y) => x.key.localeCompare(y.key)), same: s(same) };
}

/** Mask a secret-ish value: hide value with fixed 8 asterisks, without revealing length or characters. */
export function maskValue(v: string): string {
  if (v === "") return "(empty)";
  return "********";
}

export function hasDifferences(d: EnvDiff): boolean {
  return d.onlyInA.length > 0 || d.onlyInB.length > 0 || d.changed.length > 0;
}
