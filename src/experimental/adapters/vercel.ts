import type { EnforcerFn } from "../../types.js";

export function wrapAll(
  tools: Record<string, { execute?: (...args: unknown[]) => Promise<unknown>; [key: string]: unknown }>,
  enforcer: EnforcerFn,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => {
      if (typeof tool.execute !== "function") return [name, tool];
      return [name, { ...tool, execute: async (params: Record<string, unknown>) => enforcer(name, params, () => tool.execute!(params)) }];
    }),
  );
}
