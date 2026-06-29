import type { EnforcerFn } from "../types.js";

export function wrapAll(
  tools: Record<string, (...args: unknown[]) => Promise<unknown>>,
  enforcer: EnforcerFn,
): Record<string, (...args: unknown[]) => Promise<unknown>> {
  return Object.fromEntries(
    Object.entries(tools).map(([name, fn]) => {
      const wrapped = async (...args: unknown[]) => {
        const params =
          args.length === 1 && typeof args[0] === "object" && args[0] !== null
            ? (args[0] as Record<string, unknown>)
            : { args };
        return enforcer(name, params, () => fn(...args));
      };
      Object.defineProperty(wrapped, "name", { value: name });
      return [name, wrapped];
    }),
  );
}
