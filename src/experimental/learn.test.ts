import { describe, expect, it } from "vitest";
import { inferSpec, mergeSpecs, serializeSpec } from "./learn.js";
import { loadSpec } from "../kernel/spec.js";
import { harden } from "./harden.js";
import type { JSONLEvent, RunState } from "../types.js";

function ev(partial: Partial<JSONLEvent> & { tool: string; result: string }): JSONLEvent {
  return {
    timestamp: "2026-07-01T00:00:00.000Z",
    runId: "amr_test",
    ...partial,
  };
}

describe("inferSpec", () => {
  it("empty events → version-only spec", () => {
    expect(inferSpec([])).toEqual({ version: "1.0" });
  });

  it("single requires violation → requires rule", () => {
    const spec = inferSpec([
      ev({
        tool: "issue_refund",
        result: "blocked",
        reason: "requires",
        details: '"lookup_order" must be called before "issue_refund"',
      }),
    ]);
    expect(spec.tools?.issue_refund?.requires).toEqual(["lookup_order"]);
  });

  it("single cross_ref violation → cross_ref rule", () => {
    const spec = inferSpec([
      ev({
        tool: "issue_refund",
        result: "warned",
        reason: "cross_ref",
        details: 'order_id: expected "ORD-100" (from lookup_order.input.order_id), got "ORD-999"',
      }),
    ]);
    expect(spec.tools?.issue_refund?.input?.properties?.order_id?.cross_ref).toBe(
      "lookup_order.input.order_id",
    );
  });

  it("single max_ref violation → max_ref rule", () => {
    const spec = inferSpec([
      ev({
        tool: "issue_refund",
        result: "warned",
        reason: "max_ref",
        details: "amount: 200 exceeds max 49.99 (from lookup_order.output.total)",
      }),
    ]);
    expect(spec.tools?.issue_refund?.input?.properties?.amount?.max_ref).toBe(
      "lookup_order.output.total",
    );
  });

  it("loop breaker trip → breaker config", () => {
    const spec = inferSpec([
      ev({
        tool: "run_tests",
        result: "blocked",
        reason: "loop_breaker",
        details: "run_tests called 3 times with identical args (limit: 3)",
      }),
    ]);
    expect(spec.breakers?.loop?.max_identical_calls).toBe(3);
    expect(spec.breakers?.loop?.action).toBe("block");
  });

  it("velocity breaker trip → breaker config", () => {
    const spec = inferSpec([
      ev({
        tool: "check_eligibility",
        result: "blocked",
        reason: "velocity_breaker",
        details: "13 calls in last 30s (limit: 12)",
      }),
    ]);
    expect(spec.breakers?.velocity?.max_calls_per_window).toBe(12);
    expect(spec.breakers?.velocity?.window_seconds).toBe(30);
  });

  it("multiple violations across tools → all tools covered", () => {
    const spec = inferSpec([
      ev({
        tool: "issue_refund",
        result: "blocked",
        reason: "requires",
        details: '"lookup_order" must be called before "issue_refund"',
      }),
      ev({
        tool: "git_push",
        result: "blocked",
        reason: "blocked_value",
        details: 'branch has blocked value "main"',
      }),
    ]);
    expect(Object.keys(spec.tools ?? {}).sort()).toEqual(["git_push", "issue_refund"]);
    expect(spec.tools?.git_push?.input?.properties?.branch?.blocked_values).toEqual(["main"]);
  });

  it("duplicate violations → deduplicated", () => {
    const violation = ev({
      tool: "issue_refund",
      result: "blocked",
      reason: "requires",
      details: '"lookup_order" must be called before "issue_refund"',
    });
    const spec = inferSpec([violation, { ...violation }]);
    expect(spec.tools?.issue_refund?.requires).toEqual(["lookup_order"]);
  });
});

describe("serializeSpec", () => {
  it("round-trips through loadSpec identically", () => {
    const spec = inferSpec([
      ev({
        tool: "issue_refund",
        result: "blocked",
        reason: "requires",
        details: '"lookup_order" must be called before "issue_refund"',
      }),
      ev({
        tool: "issue_refund",
        result: "warned",
        reason: "cross_ref",
        details: 'order_id: expected "ORD-100" (from lookup_order.input.order_id), got "ORD-999"',
      }),
      ev({
        tool: "run_command",
        result: "blocked",
        reason: "blocked_pattern",
        details: 'command contains blocked pattern "rm -rf"',
      }),
      ev({
        tool: "git_push",
        result: "blocked",
        reason: "blocked_value",
        details: 'branch has blocked value "main"',
      }),
      ev({
        tool: "run_tests",
        result: "blocked",
        reason: "loop_breaker",
        details: "run_tests called 3 times with identical args (limit: 3)",
      }),
    ]);
    const roundTripped = loadSpec(serializeSpec(spec));
    expect(roundTripped).toEqual(spec);
  });
});

describe("mergeSpecs", () => {
  it("preserves existing rules and adds new ones", () => {
    const existing = loadSpec(`
version: "1.0"
tools:
  issue_refund:
    requires:
      - lookup_order
`);
    const inferred = inferSpec([
      ev({
        tool: "git_push",
        result: "blocked",
        reason: "blocked_value",
        details: 'branch has blocked value "main"',
      }),
    ]);
    const merged = mergeSpecs(existing, inferred);
    expect(merged.tools?.issue_refund?.requires).toEqual(["lookup_order"]);
    expect(merged.tools?.git_push?.input?.properties?.branch?.blocked_values).toEqual(["main"]);
  });
});

describe("round-trip enforcement", () => {
  it("a spec learned from a violation catches that violation again", async () => {
    const spec = inferSpec([
      ev({
        tool: "issue_refund",
        result: "blocked",
        reason: "requires",
        details: '"lookup_order" must be called before "issue_refund"',
      }),
    ]);
    const loaded = loadSpec(serializeSpec(spec));

    const tools = harden(
      {
        lookup_order: async () => ({ total: 49.99 }),
        issue_refund: async () => ({ ok: true }),
      },
      { spec: loaded, silent: true },
    );

    await (tools as Record<string, Function>).issue_refund!({ order_id: "ORD-1", amount: 10 });
    const state = (tools as unknown as { __state(): RunState }).__state();
    expect(state.blockedCount).toBeGreaterThan(0);
  });
});
