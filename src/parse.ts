// Minimal .env parser: KEY=VALUE, `export` prefix, quotes, inline comments,
// and `\n` escapes inside double quotes. Order-preserving.
export function parseEnv(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const withoutExport = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = withoutExport.indexOf("=");
    if (eq < 1) continue; // no key or malformed

    const key = withoutExport.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(key)) continue;

    const rawVal = withoutExport.slice(eq + 1).trim();
    let value: string | null = null;

    if (rawVal.startsWith('"') || rawVal.startsWith("'")) {
      const quoteChar = rawVal[0];
      let closingIdx = -1;
      for (let i = 1; i < rawVal.length; i++) {
        if (quoteChar === '"' && rawVal[i] === "\\") {
          i++;
        } else if (rawVal[i] === quoteChar) {
          closingIdx = i;
          break;
        }
      }

      if (closingIdx !== -1) {
        const rest = rawVal.slice(closingIdx + 1);
        if (/^(?:[ \t]+#.*|[ \t]*)$/.test(rest)) {
          const inner = rawVal.slice(1, closingIdx);
          value = quoteChar === '"'
            ? inner.replace(/\\n/g, "\n").replace(/\\"/g, '"')
            : inner;
        }
      }
    }

    if (value === null) {
      const hash = rawVal.search(/[ \t]+#/);
      value = hash > -1 ? rawVal.slice(0, hash).trim() : rawVal.trim();
    }
    out.set(key, value);
  }
  return out;
}
