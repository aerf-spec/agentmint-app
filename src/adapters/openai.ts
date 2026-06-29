import type { EnforcerFn } from "../types.js";

export function wrapAll(tools: unknown[], enforcer: EnforcerFn): unknown[] {
  return tools.map((tool) => {
    const t = tool as {
      function?: { name?: string; execute?: Function };
      execute?: Function;
      [key: string]: unknown;
    };
    const name = t.function?.name ?? (t as { name?: string }).name ?? "unknown";
    const origExec = t.function?.execute ?? t.execute;
    if (typeof origExec !== "function") return tool;
    const wrappedExec = async (args: unknown) => {
      const params =
        typeof args === "string" ? (JSON.parse(args) as Record<string, unknown>) : ((args as Record<string, unknown>) ?? {});
      return enforcer(name, params, () => origExec(args));
    };
    if (t.function) return { ...t, function: { ...t.function, execute: wrappedExec } };
    return { ...t, execute: wrappedExec };
  });
}
