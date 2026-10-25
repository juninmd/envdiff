// Minimal .env parser: KEY=VALUE, `export` prefix, quotes, inline comments,
// and `\n` escapes inside double quotes. Order-preserving.
export function parseEnv(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const withoutExport = line.replace(/^export\s+/, "");
    const eq = withoutExport.indexOf("=");
    if (eq < 1) continue; // no key or malformed

    const key = withoutExport.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key)) continue;

    let value = withoutExport.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"');
    } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      value = value.slice(1, -1);
    } else {
      // Strip an unquoted inline comment ("  # ...").
      const hash = value.indexOf(" #");
      if (hash > -1) value = value.slice(0, hash).trim();
    }
    out.set(key, value);
  }
  return out;
}
