import { harden } from "./harden.js";
import { loadSpec } from "../kernel/spec.js";
import type { AgentMintConfig, RunState } from "../types.js";

/** A single behavioural test case run against a hardened tool set. */
export interface Scenario {
  name: string;
  description: string;
  tools: Record<string, Function>;
  spec: string;
  config?: Partial<AgentMintConfig>;
  steps: Array<{ tool: string; args: Record<string, unknown> }>;
  expected: "pass" | "block" | "warn";
}

/** Outcome of a single scenario. */
export interface ScenarioResult {
  name: string;
  description: string;
  expected: "pass" | "block" | "warn";
  actual: "pass" | "block" | "warn";
  passed: boolean;
  reason: string;
  blockedCount: number;
  warnedCount: number;
  heldCount: number;
  steps: number;
}

/** Aggregate result of running a suite of scenarios. */
export interface SuiteResult {
  total: number;
  passed: number;
  failed: number;
  results: ScenarioResult[];
}

/**
 * Classify a completed run into one of the three observable outcomes.
 *
 * - `block` — at least one call was denied.
 * - `warn`  — nothing was blocked, but a warning fired or a call was held
 *   at a checkpoint (a held call is a soft-stop, so it counts as a warning).
 * - `pass`  — the run completed cleanly with no violations.
 */
export function classify(state: RunState): "pass" | "block" | "warn" {
  if (state.blockedCount > 0) return "block";
  if (state.warnedCount > 0 || state.heldCount > 0) return "warn";
  return "pass";
}

export async function runSuite(scenarios: Scenario[]): Promise<SuiteResult> {
  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    const spec = loadSpec(scenario.spec);
    const tools = harden(scenario.tools, {
      spec,
      ...scenario.config,
      silent: true,
    });

    for (const step of scenario.steps) {
      const fn = (tools as Record<string, Function>)[step.tool];
      if (typeof fn !== "function") continue;
      try {
        await fn(step.args);
      } catch {
        // A throwing mock tool is not an enforcement decision; ignore it so
        // the scenario is judged purely on AgentMint's own outcome counters.
      }
    }

    const state = (
      tools as unknown as { __state(): RunState }
    ).__state();
    const actual = classify(state);
    const passed = actual === scenario.expected;

    results.push({
      name: scenario.name,
      description: scenario.description,
      expected: scenario.expected,
      actual,
      passed,
      reason: passed
        ? `expected ${scenario.expected}, got ${actual}`
        : `expected ${scenario.expected}, got ${actual} ` +
          `(blocked=${state.blockedCount}, warned=${state.warnedCount}, held=${state.heldCount})`,
      blockedCount: state.blockedCount,
      warnedCount: state.warnedCount,
      heldCount: state.heldCount,
      steps: scenario.steps.length,
    });
  }

  const passed = results.filter((r) => r.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}
