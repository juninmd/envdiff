export type ParseWarningKind =
  | "malformed"
  | "invalid-key"
  | "duplicate"
  | "unclosed-quote";

export interface ParseWarning {
  line: number;
  kind: ParseWarningKind;
  key?: string;
  firstLine?: number;
}

export interface ParseResult {
  values: Map<string, string>;
  warnings: ParseWarning[];
}

export function parseEnvDetailed(text: string): ParseResult {
  const values = new Map<string, string>();
  const warnings: ParseWarning[] = [];
  const firstLines = new Map<string, number>();

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const rawLine = lines[index]!;
    const lineNum = index + 1;
    const line = rawLine.trim();

    if (line === "" || line.startsWith("#")) continue;

    const withoutExport = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = withoutExport.indexOf("=");
    if (eq < 1) {
      warnings.push({ line: lineNum, kind: "malformed" });
      continue;
    }

    const key = withoutExport.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(key)) {
      warnings.push({ line: lineNum, kind: "invalid-key", key });
      continue;
    }

    if (firstLines.has(key)) {
      warnings.push({
        line: lineNum,
        kind: "duplicate",
        key,
        firstLine: firstLines.get(key)!,
      });
    } else {
      firstLines.set(key, lineNum);
    }

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

    if (value === null) {
      value = "";
    }

    values.set(key, value);
  }

  return { values, warnings };
}

export function parseEnv(text: string): Map<string, string> {
  return parseEnvDetailed(text).values;
}
