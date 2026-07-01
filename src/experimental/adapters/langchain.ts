import type { EnforcerFn } from "../../types.js";

export function wrapAll(tools: unknown[], enforcer: EnforcerFn): unknown[] {
  return tools.map((tool) => {
    const t = tool as { name: string; _call: (input: unknown) => Promise<unknown> };
    const wrapped = Object.create(t) as typeof t;
    wrapped._call = async (input: unknown) => {
      const params =
        typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
      return enforcer(t.name, params, () => t._call(input));
    };
    return wrapped;
  });
}
