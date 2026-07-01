export function matches(tool: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("*")) return tool.startsWith(pattern.slice(0, -1));
  return tool === pattern;
}

export function matchesAny(tool: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => matches(tool, p));
}
