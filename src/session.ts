import { createHash } from "node:crypto";
import type { SessionStore } from "./types.js";
import { canonicalize } from "./merkle.js";

export function createSession(): SessionStore {
  return {
    inputs: new Map(),
    outputs: new Map(),
    callHistory: [],
  };
}

export function recordInput(
  session: SessionStore,
  tool: string,
  params: Record<string, unknown>,
): void {
  session.inputs.set(tool, { ...params });
  session.callHistory.push({
    tool,
    timestamp: Date.now(),
    args: { ...params },
    argsHash: hashArgs(tool, params),
  });
}

export function recordOutput(
  session: SessionStore,
  tool: string,
  output: unknown,
): void {
  session.outputs.set(tool, output);
}

export function hashArgs(
  tool: string,
  params: Record<string, unknown>,
): string {
  return createHash("sha256")
    .update(canonicalize({ tool, params }))
    .digest("hex")
    .slice(0, 16);
}

/** Resolve a dotted reference like "get_order_details.output.total" */
export function resolveRef(
  session: SessionStore,
  ref: string,
): { found: boolean; value: unknown } {
  const parts = ref.split(".");
  if (parts.length < 3) return { found: false, value: undefined };

  const toolName = parts[0]!;
  const direction = parts[1]!;
  const fieldPath = parts.slice(2);

  let root: unknown;
  if (direction === "input") {
    root = session.inputs.get(toolName);
  } else if (direction === "output") {
    root = session.outputs.get(toolName);
  } else {
    return { found: false, value: undefined };
  }

  if (root === undefined) return { found: false, value: undefined };

  let current: unknown = root;
  for (const key of fieldPath) {
    if (current === null || current === undefined || typeof current !== "object") {
      return { found: false, value: undefined };
    }
    current = (current as Record<string, unknown>)[key];
  }

  return { found: true, value: current };
}
