export function redact(
  params: Record<string, unknown>,
  boundKeys: readonly string[],
): Record<string, unknown> {
  const boundSet = new Set(boundKeys);
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      if (boundSet.has(key)) return [key, value];
      if (typeof value === "string" && value.length > 50) return [key, "[REDACTED]"];
      if (typeof value === "object" && value !== null) return [key, "[REDACTED]"];
      return [key, value];
    }),
  );
}
