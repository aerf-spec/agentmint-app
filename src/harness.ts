import { harden } from "./harden.js";
import { loadSpec } from "./spec.js";
import type { AgentMintConfig, AgentMintSpec, RunState } from "./types.js";

/** The three observable outcomes AgentMint can produce for a single call. */
export type StepOutcome = "allowed" | "warned" | "blocked";

/** One call to drive through a hardened tool set. */
export interface HarnessStep {
  tool: string;
  args?: Record<string, unknown>;
  /** Human-readable label for this step (used in logs / reports). */
  note?: string;
  /** When set, the runner records whether the real outcome matched. */
  expect?: StepOutcome;
}

/** What actually happened for a single step. */
export interface StepResult {
  index: number;
  tool: string;
  args: Record<string, unknown>;
  note?: string;
  outcome: StepOutcome;
  /** Reason/detail from the enforcement decision, when one fired. */
  detail?: string;
  /** Raw value returned by the (possibly blocked) tool call. */
  result: unknown;
  expect?: StepOutcome;
  /** True when there was no expectation, or the outcome matched it. */
  ok: boolean;
}

/** Per-run tallies. Always partition the run: allowed + warned + blocked === calls. */
export interface HarnessCounts {
  calls: number;
  allowed: number;
  warned: number;
  blocked: number;
}

/** Structured result of a whole harness run. */
export interface HarnessResult {
  steps: StepResult[];
  counts: HarnessCounts;
  /** Final run state — receipt, event log and evidence chain live here. */
  state: RunState;
  /** True when every step that carried an expectation matched it. */
  passed: boolean;
  failures: StepResult[];
}

export interface HarnessOptions {
  /** Spec as a parsed object, or YAML text / path (passed to loadSpec). */
  spec?: AgentMintSpec | string;
  /** Extra harden() config (bind, callbacks, budget, etc.). */
  config?: Partial<AgentMintConfig>;
  /** Called after each step resolves — use for live rendering / pacing. */
  onStep?: (result: StepResult, index: number) => void | Promise<void>;
}

type ToolMap = Record<string, (params: Record<string, unknown>) => Promise<unknown>>;

/**
 * Run a fixed sequence of tool calls through a hardened tool set and return a
 * structured, per-step record of what AgentMint did with each one.
 *
 * Each step's outcome is derived from AgentMint's own decision counters, not
 * the tool's return value — so a tool that legitimately returns an
 * `{ error: ... }` payload is never mistaken for a blocked call.
 *
 * The runner never throws on an enforcement decision; a blocked call is just a
 * `StepResult` with `outcome: "blocked"`. It only throws on a misconfigured
 * step (a tool name that isn't in the set).
 */
export async function runHarness(
  tools: ToolMap,
  steps: HarnessStep[],
  options: HarnessOptions = {},
): Promise<HarnessResult> {
  const spec =
    typeof options.spec === "string" ? loadSpec(options.spec) : options.spec;

  const user = options.config ?? {};
  let detail: string | undefined;
  const config: AgentMintConfig = {
    ...user,
    ...(spec ? { spec } : {}),
    silent: user.silent ?? true,
    // Wrap any caller-supplied callbacks so we can capture the decision detail
    // without clobbering their handlers.
    onWarn: (t, r, d) => { detail = d ?? r; user.onWarn?.(t, r, d); },
    onBlock: (t, r, d) => { detail = d ?? r; user.onBlock?.(t, r, d); },
  };

  const hardened = harden(tools, config) as ToolMap & { __state(): RunState };
  const state = hardened.__state();
  const results: StepResult[] = [];

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]!;
    const args = step.args ?? {};
    const fn = hardened[step.tool];
    if (typeof fn !== "function") {
      throw new Error(`runHarness: no tool named "${step.tool}"`);
    }

    detail = undefined;
    const beforeBlocked = state.blockedCount;
    const beforeWarned = state.warnedCount;

    let result: unknown;
    try {
      result = await fn(args);
    } catch (err) {
      // A throwing mock is the tool's own failure, not an enforcement
      // decision — record its message but let the counters classify the step.
      detail = err instanceof Error ? err.message : String(err);
    }

    let outcome: StepOutcome;
    if (state.blockedCount > beforeBlocked) outcome = "blocked";
    else if (state.warnedCount > beforeWarned) outcome = "warned";
    else outcome = "allowed";

    const stepResult: StepResult = {
      index,
      tool: step.tool,
      args,
      ...(step.note !== undefined && { note: step.note }),
      outcome,
      ...(detail !== undefined && { detail }),
      result,
      ...(step.expect !== undefined && { expect: step.expect }),
      ok: step.expect === undefined ? true : outcome === step.expect,
    };
    results.push(stepResult);
    await options.onStep?.(stepResult, index);
  }

  const counts: HarnessCounts = {
    calls: results.length,
    allowed: results.filter((r) => r.outcome === "allowed").length,
    warned: results.filter((r) => r.outcome === "warned").length,
    blocked: results.filter((r) => r.outcome === "blocked").length,
  };

  return {
    steps: results,
    counts,
    state,
    passed: results.every((r) => r.ok),
    failures: results.filter((r) => !r.ok),
  };
}
