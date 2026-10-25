export function colorEnabled(
  env: Record<string, string | undefined>,
  isTTY: boolean
): boolean {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") {
    return false;
  }
  if (env.FORCE_COLOR !== undefined) {
    return env.FORCE_COLOR !== "0";
  }
  if (env.TERM === "dumb") {
    return false;
  }
  return Boolean(isTTY);
}

export interface Colors {
  red: (s: string) => string;
  green: (s: string) => string;
  yellow: (s: string) => string;
  dim: (s: string) => string;
  bold: (s: string) => string;
}

export function createColors(enabled: boolean): Colors {
  if (!enabled) {
    return {
      red: (s) => s,
      green: (s) => s,
      yellow: (s) => s,
      dim: (s) => s,
      bold: (s) => s,
    };
  }
  return {
    red: (s: string) => `\x1b[31m${s}\x1b[0m`,
    green: (s: string) => `\x1b[32m${s}\x1b[0m`,
    yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
    dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
    bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  };
}
