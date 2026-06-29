import { describe, expect, it, vi } from "vitest";
import { wrapAll as wrapLangChain } from "./langchain.js";
import { wrapAll as wrapOpenAI } from "./openai.js";
import { wrapAll as wrapRaw } from "./raw.js";
import { wrapAll as wrapVercel } from "./vercel.js";
import type { EnforcerFn } from "../types.js";

describe("adapters", () => {
  it("raw_enforcement", async () => {
    const enforcer: EnforcerFn = async () => "intercepted";
    const wrapped = wrapRaw({ greet: async () => "hi" }, enforcer) as {
      greet: () => Promise<unknown>;
    };

    await expect(wrapped.greet()).resolves.toBe("intercepted");
  });

  it("raw_params", async () => {
    const seen = vi.fn();
    const enforcer: EnforcerFn = async (_tool, params, exec) => {
      seen(params);
      return exec();
    };
    const wrapped = wrapRaw({ greet: async (_params: unknown) => "hi" }, enforcer) as {
      greet: (params: Record<string, unknown>) => Promise<unknown>;
    };

    await wrapped.greet({ x: 1 });

    expect(seen).toHaveBeenCalledWith({ x: 1 });
  });

  it("openai_enforcement", async () => {
    const enforcer: EnforcerFn = async () => "intercepted";
    const tools = [{ function: { name: "foo", execute: async () => "real" } }];
    const wrapped = wrapOpenAI(tools, enforcer) as Array<{
      function: { name: string; execute: (args: unknown) => Promise<unknown> };
    }>;

    await expect(wrapped[0]!.function.execute({})).resolves.toBe("intercepted");
  });

  it("openai_preserves_schema", () => {
    const enforcer: EnforcerFn = async (_tool, _params, exec) => exec();
    const tools = [
      {
        function: {
          name: "foo",
          parameters: { type: "object" },
          execute: async () => "real",
        },
      },
    ];
    const wrapped = wrapOpenAI(tools, enforcer) as Array<{
      function: { name: string; parameters: unknown };
    }>;

    expect(wrapped[0]!.function.name).toBe("foo");
    expect(wrapped[0]!.function.parameters).toEqual({ type: "object" });
  });

  it("langchain_enforcement", async () => {
    const enforcer: EnforcerFn = async () => "intercepted";
    const tools = [{ name: "bar", _call: async () => "real" }];
    const wrapped = wrapLangChain(tools, enforcer) as Array<{
      _call: (input: unknown) => Promise<unknown>;
    }>;

    await expect(wrapped[0]!._call({})).resolves.toBe("intercepted");
  });

  it("langchain_preserves_name", () => {
    const enforcer: EnforcerFn = async (_tool, _params, exec) => exec();
    const tools = [{ name: "bar", _call: async () => "real" }];
    const wrapped = wrapLangChain(tools, enforcer) as Array<{ name: string }>;

    expect(wrapped[0]!.name).toBe("bar");
  });

  it("vercel_enforcement", async () => {
    const enforcer: EnforcerFn = async () => "intercepted";
    const wrapped = wrapVercel(
      {
        baz: {
          execute: async () => "real",
          description: "test",
        },
      },
      enforcer,
    ) as { baz: { execute: (params: Record<string, unknown>) => Promise<unknown> } };

    await expect(wrapped.baz.execute({})).resolves.toBe("intercepted");
  });
});
