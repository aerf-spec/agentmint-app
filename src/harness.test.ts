import { describe, it, expect } from "vitest";
import { runHarness } from "./harness.js";
import {
  makeStressTools,
  STRESS_SPEC,
  stressSteps,
} from "./scenarios/coding-agent-stress.js";

describe("runHarness", () => {
  it("classifies the coding-agent stress run step by step", async () => {
    const run = await runHarness(makeStressTools(), stressSteps, {
      spec: STRESS_SPEC,
    });

    expect(run.steps.map((s) => s.outcome)).toEqual([
      "allowed", "allowed", "blocked", "warned", "blocked",
      "allowed", "allowed", "blocked", "blocked", "blocked",
      "allowed", "allowed",
    ]);
    // Every step carried an `expect`, and they all match the real engine.
    expect(run.passed).toBe(true);
    expect(run.failures).toEqual([]);
  });

  it("produces counts that partition the run", async () => {
    const run = await runHarness(makeStressTools(), stressSteps, {
      spec: STRESS_SPEC,
    });
    const { calls, allowed, warned, blocked } = run.counts;

    expect(calls).toBe(stressSteps.length);
    expect(allowed + warned + blocked).toBe(calls);
    expect({ allowed, warned, blocked }).toEqual({ allowed: 6, warned: 1, blocked: 5 });
  });

  it("classifies by the enforcement decision, not the tool's return shape", async () => {
    // run_tests legitimately returns an `error` field; it must stay "allowed".
    const run = await runHarness(makeStressTools(), [
      { tool: "run_tests", args: { suite: "unit" } },
    ], { spec: STRESS_SPEC });

    expect(run.steps[0]!.outcome).toBe("allowed");
    expect((run.steps[0]!.result as { error: string }).error).toContain("daysInMonth");
  });

  it("fires onStep for every step and captures the decision detail", async () => {
    const seen: string[] = [];
    const run = await runHarness(makeStressTools(), [
      { tool: "read_file", args: { path: ".env" }, expect: "blocked" },
    ], {
      spec: STRESS_SPEC,
      onStep: (r) => { seen.push(r.outcome); },
    });

    expect(seen).toEqual(["blocked"]);
    expect(run.steps[0]!.detail).toBeTruthy();
    expect(run.steps[0]!.ok).toBe(true);
  });

  it("records expectation mismatches in failures without throwing", async () => {
    const run = await runHarness(makeStressTools(), [
      { tool: "read_file", args: { path: "src/app.ts" }, expect: "blocked" },
    ], { spec: STRESS_SPEC });

    expect(run.passed).toBe(false);
    expect(run.failures).toHaveLength(1);
    expect(run.failures[0]!.outcome).toBe("allowed");
  });

  it("allows everything when no spec is supplied", async () => {
    const run = await runHarness(makeStressTools(), [
      { tool: "read_file", args: { path: ".env" } },
      { tool: "run_command", args: { command: "rm -rf /" } },
    ]);

    expect(run.counts.blocked).toBe(0);
    expect(run.steps.every((s) => s.outcome === "allowed")).toBe(true);
  });

  it("throws on an unknown tool name", async () => {
    await expect(
      runHarness(makeStressTools(), [{ tool: "no_such_tool", args: {} }], {
        spec: STRESS_SPEC,
      }),
    ).rejects.toThrow(/no_such_tool/);
  });

  it("exposes the final run state for receipts and logs", async () => {
    const run = await runHarness(makeStressTools(), stressSteps, {
      spec: STRESS_SPEC,
    });

    expect(run.state.callCount).toBe(stressSteps.length);
    expect(run.state.events.length).toBeGreaterThan(0);
  });
});
