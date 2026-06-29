import { enforce } from "./enforce.js";
import { formatReceipt } from "./receipt.js";
import { createRunState } from "./log.js";
import { wrapAll as rawWrapAll } from "./adapters/raw.js";
import { wrapAll as openaiWrapAll } from "./adapters/openai.js";
import { wrapAll as langchainWrapAll } from "./adapters/langchain.js";
import { wrapAll as vercelWrapAll } from "./adapters/vercel.js";
import type { AgentMintConfig, RunState, Event, EnforcerFn } from "./types.js";

export function harden<T extends Record<string, unknown> | unknown[]>(
  tools: T,
  config: AgentMintConfig = {},
): T & { __state(): RunState; __receipt(): string; __log(): Event[] } {
  const state = createRunState(config);

  const enforcer: EnforcerFn = (tool, params, exec) =>
    enforce(tool, params, exec, config, state);

  let wrapped: unknown;

  if (Array.isArray(tools)) {
    const first = tools[0];
    if (first && typeof first === "object" && first !== null) {
      const f = first as Record<string, unknown>;
      if (typeof (f.function as Record<string, unknown>)?.name === "string") {
        wrapped = openaiWrapAll(tools, enforcer);
      } else if (typeof f.name === "string" && typeof f._call === "function") {
        wrapped = langchainWrapAll(tools, enforcer);
      } else {
        wrapped = tools;
      }
    } else {
      wrapped = tools;
    }
  } else {
    const vals = Object.values(tools);
    const first = vals[0];
    if (
      first &&
      typeof first === "object" &&
      first !== null &&
      "execute" in (first as object)
    ) {
      wrapped = vercelWrapAll(tools as any, enforcer);
    } else {
      wrapped = rawWrapAll(tools as any, enforcer);
    }
  }

  Object.defineProperties(wrapped as object, {
    __state: {
      value: () => state,
      enumerable: false,
    },
    __receipt: {
      value: () => {
        if (state.status === "running") state.status = "completed";
        return formatReceipt(state, config);
      },
      enumerable: false,
    },
    __log: {
      value: () => state.events,
      enumerable: false,
    },
  });

  return wrapped as T & {
    __state(): RunState;
    __receipt(): string;
    __log(): Event[];
  };
}
