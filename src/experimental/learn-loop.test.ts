// The failure→regression-test loop, end to end: structured inference for
// every rule type, clustering, policy-diff safety (--check), and repair.
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { harden } from "./harden.js";
import { loadSpec } from "../kernel/spec.js";
import { eventToJSONL } from "../jsonl.js";
import {
  inferSpec,
  serializeSpec,
  generateTestFile,
  checkPolicy,
  suggestRepair,
  hasMissingRules,
  specDiffMissing,
  clusterKey,
} from "./learn.js";
import type { JSONLEvent } from "../types.js";

/** Run a tool sequence through harden() and return the recorded corpus. */
async function record(
  specYaml: string,
  calls: Array<[string, Record<string, unknown>]>,
  toolImpls: Record<string, () => Promise<unknown>>,
  config: Record<string, unknown> = {},
): Promise<JSONLEvent[]> {
  const tools = harden(toolImpls, { spec: loadSpec(specYaml), silent: true, ...config });
  for (const [tool, params] of calls) {
    await (tools as unknown as Record<string, (p: unknown) => Promise<unknown>>)[tool]!(params);
  }
  return tools.__log().map((e) => eventToJSONL(e, "run_test"));
}

describe("structured inference covers every rule type", () => {
  it("requires / cross_ref / max_ref / blocked_pattern / blocked_value round-trip", async () => {
    const spec = `version: "1.0"
tools:
  lookup: {}
  refund:
    requires:
      - "lookup"
    input:
      properties:
        amount:
          max_ref: "lookup.output.balance"
          action: block
        account:
          cross_ref: "lookup.output.account"
          action: block
        note:
          blocked_patterns:
            - "*password*"
          action: block
        region:
          blocked_values:
            - "EU"
          action: block
`;
    const events = await record(
      spec,
      [
        ["refund", { amount: 10 }], // requires fires
        ["lookup", {}],
        ["refund", { amount: 500 }], // max_ref fires (balance 100)
        ["refund", { amount: 10, account: "acct-2" }], // cross_ref fires
        ["refund", { amount: 10, note: "my password here" }], // blocked_pattern
        ["refund", { amount: 10, region: "EU" }], // blocked_value
      ],
      {
        lookup: async () => ({ balance: 100, account: "acct-1" }),
        refund: async () => ({ ok: true }),
      },
    );

    // Every violation event carries structured violations[] with no regex needed.
    const denied = events.filter((e) => e.result === "blocked");
    expect(denied.length).toBe(5);
    for (const e of denied) {
      expect(e.violations?.length).toBeGreaterThan(0);
    }
    const maxRef = denied.find((e) => e.reason === "max_ref")!.violations![0]!;
    expect(maxRef).toMatchObject({ field: "amount", expected: "100", actual: "500", ref: "lookup.output.balance" });

    const inferred = inferSpec(events);
    const refund = inferred.tools!["refund"]!;
    expect(refund.requires).toEqual(["lookup"]);
    expect(refund.input!.properties!["amount"]).toMatchObject({ max_ref: "lookup.output.balance" });
    expect(refund.input!.properties!["account"]).toMatchObject({ cross_ref: "lookup.output.account" });
    expect(refund.input!.properties!["note"]!.blocked_patterns).toEqual(["*password*"]);
    expect(refund.input!.properties!["region"]!.blocked_values).toEqual(["EU"]);

    // The inferred spec serializes to YAML that loads back identically.
    expect(loadSpec(serializeSpec(inferred)).tools!["refund"]).toBeTruthy();
  });

  it("loop / velocity / cost breakers, budget_cap, usage_cap, cost_cap, action_block", async () => {
    const loopEvents = await record(
      `version: "1.0"\nbreakers:\n  loop:\n    max_identical_calls: 2\n    action: block\n`,
      [["ping", { n: 1 }], ["ping", { n: 1 }], ["ping", { n: 1 }]],
      { ping: async () => "pong" },
    );
    const velocityEvents = await record(
      `version: "1.0"\nbreakers:\n  velocity:\n    max_calls_per_window: 3\n    window_seconds: 60\n    action: block\n`,
      [["a", { i: 1 }], ["a", { i: 2 }], ["a", { i: 3 }], ["a", { i: 4 }]],
      { a: async () => "ok" },
    );
    const costEvents = await record(
      `version: "1.0"\nbreakers:\n  cost:\n    max_usd: 1\n    action: block\n`,
      [["b", { i: 1 }], ["b", { i: 2 }]],
      { b: async () => "ok" },
      { costEstimator: () => 1 },
    );
    const budgetEvents = await record(
      `version: "1.0"\ntools:\n  cheap:\n    cost:\n      estimate_usd: 2\nbreakers:\n  budget:\n    max_total_usd: 3\n    action: block\n`,
      [["cheap", { i: 1 }], ["cheap", { i: 2 }]],
      { cheap: async () => "ok" },
    );
    const capEvents = await record(
      `version: "1.0"\ntools:\n  spam:\n    limits:\n      max_calls_per_run: 1\n      action: block\n  expensive:\n    cost:\n      estimate_usd: 5\n      max_cost_usd: 1\n      action: block\n  forbidden:\n    action: block\n`,
      [["spam", {}], ["spam", {}], ["expensive", {}], ["forbidden", {}]],
      { spam: async () => "ok", expensive: async () => "ok", forbidden: async () => "ok" },
    );
    const bindEvents = await record(
      `version: "1.0"\n`,
      [["fetch", { account: "acct-999" }]],
      { fetch: async () => "ok" },
      { bind: { account: "acct-1" } },
    );

    const all = [...loopEvents, ...velocityEvents, ...costEvents, ...budgetEvents, ...capEvents, ...bindEvents];
    const reasons = new Set(all.filter((e) => e.result === "blocked").map((e) => e.reason));
    expect([...reasons].sort()).toEqual(
      ["action_block", "bind_violation", "budget_cap", "cost_breaker", "cost_cap", "loop_breaker", "usage_cap", "velocity_breaker"].sort(),
    );

    const inferred = inferSpec(all);
    expect(inferred.breakers!.loop).toMatchObject({ max_identical_calls: 2, action: "block" });
    expect(inferred.breakers!.velocity).toMatchObject({ max_calls_per_window: 3, window_seconds: 60 });
    expect(inferred.breakers!.cost).toMatchObject({ max_usd: 1 });
    expect(inferred.breakers!.budget).toMatchObject({ max_total_usd: 3 });
    expect(inferred.tools!["spam"]!.limits).toMatchObject({ max_calls_per_run: 1 });
    expect(inferred.tools!["expensive"]!.cost).toMatchObject({ max_cost_usd: 1 });
    expect(inferred.tools!["forbidden"]!.action).toBe("block");

    // The full inferred spec round-trips through YAML.
    const reloaded = loadSpec(serializeSpec(inferred));
    expect(reloaded.breakers!.budget).toMatchObject({ max_total_usd: 3 });
    expect(reloaded.tools!["spam"]!.limits).toMatchObject({ max_calls_per_run: 1 });
  });
});

describe("clustering (7C)", () => {
  it("50 receipts tripping the same rule generate ONE representative test", async () => {
    const spec = `version: "1.0"\ntools:\n  forbidden:\n    action: block\n`;
    const events = await record(
      spec,
      Array.from({ length: 50 }, (_, i) => ["forbidden", { i }] as [string, Record<string, unknown>]),
      { forbidden: async () => "ok" },
    );
    expect(events.filter((e) => e.result === "blocked").length).toBe(50);
    const keys = new Set(events.map(clusterKey).filter(Boolean));
    expect(keys.size).toBe(1);

    const file = generateTestFile({
      events,
      spec: inferSpec(events),
      fromPath: "corpus.jsonl",
      testPath: "out.test.ts",
      timestamp: "2026-01-01T00:00:00Z",
      sourceHash: "ab".repeat(32),
    });
    const testCount = (file.match(/^  it\(/gm) ?? []).length;
    expect(testCount).toBe(2); // 1 representative denial test + 1 allow-regression test
    expect(file).toContain("+49 duplicates collapsed");
    expect(file).toContain(`source corpus sha256: ${"ab".repeat(32)}`);
    expect(file).toContain("hermetic");
  });

  it("distinct (tool, rule, field) clusters each get their own test", async () => {
    const spec = `version: "1.0"
tools:
  refund:
    input:
      properties:
        note:
          blocked_patterns:
            - "*password*"
          action: block
        region:
          blocked_values:
            - "EU"
          action: block
`;
    const events = await record(
      spec,
      [
        ["refund", { note: "password1" }],
        ["refund", { note: "password2" }],
        ["refund", { region: "EU" }],
      ],
      { refund: async () => "ok" },
    );
    const file = generateTestFile({
      events,
      spec: inferSpec(events),
      fromPath: "corpus.jsonl",
      testPath: "out.test.ts",
      timestamp: "2026-01-01T00:00:00Z",
    });
    const testCount = (file.match(/^  it\(/gm) ?? []).length;
    expect(testCount).toBe(3); // blocked_pattern cluster + blocked_value cluster + allow test
  });
});

describe("policy-diff safety: checkPolicy (7D)", () => {
  const strictSpec = `version: "1.0"
tools:
  lookup: {}
  refund:
    input:
      properties:
        amount:
          max_ref: "lookup.output.balance"
          action: block
  forbidden:
    action: block
`;
  // The "edited" policy quietly drops the max_ref rule — a reopened hole.
  const holedSpec = `version: "1.0"
tools:
  lookup: {}
  refund: {}
  forbidden:
    action: block
`;

  async function corpus(): Promise<JSONLEvent[]> {
    return record(
      strictSpec,
      [
        ["lookup", {}],
        ["refund", { amount: 500 }], // blocked: max_ref (balance 100)
        ["forbidden", {}], // blocked: action_block
        ["refund", { amount: 50 }], // allowed
      ],
      { lookup: async () => ({ balance: 100 }), refund: async () => ({ ok: true }), forbidden: async () => "x" },
    );
  }

  it("passes when the policy still catches every recorded failure", async () => {
    const events = await corpus();
    const result = await checkPolicy(events, loadSpec(strictSpec));
    expect(result.reopened).toEqual([]);
    expect(result.clustersChecked).toBe(2);
  });

  it("reports the reopened hole when a rule was dropped", async () => {
    const events = await corpus();
    const result = await checkPolicy(events, loadSpec(holedSpec));
    expect(result.reopened.length).toBe(1);
    expect(result.reopened[0]).toMatchObject({
      tool: "refund",
      originalReason: "max_ref",
      nowResult: "allowed",
    });
  });

  it("CLI --check exits non-zero on a reopened hole, zero otherwise", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentmint-check-"));
    try {
      const events = await corpus();
      const corpusPath = join(dir, "corpus.jsonl");
      writeFileSync(corpusPath, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
      writeFileSync(join(dir, "strict.yaml"), strictSpec);
      writeFileSync(join(dir, "holed.yaml"), holedSpec);

      const run = (policy: string) =>
        spawnSync(
          "npx",
          ["tsx", "src/cli/entry.ts", "learn", "--from", corpusPath, "--check", join(dir, policy)],
          { encoding: "utf-8", cwd: process.cwd() },
        );
      const good = run("strict.yaml");
      expect(good.status, good.stdout + good.stderr).toBe(0);
      expect(good.stdout).toContain("still catches every recorded failure");

      const bad = run("holed.yaml");
      expect(bad.status).toBe(1);
      expect(bad.stderr).toContain("REOPENS");
      expect(bad.stderr).toContain("max_ref");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("repair suggestion (7E)", () => {
  it("emits the missing YAML with a receipt citation and a valid merged policy", async () => {
    const events = await record(
      `version: "1.0"
tools:
  lookup: {}
  refund:
    input:
      properties:
        amount:
          max_ref: "lookup.output.balance"
          action: block
`,
      [["lookup", {}], ["refund", { amount: 500 }]],
      { lookup: async () => ({ balance: 100 }), refund: async () => ({ ok: true }) },
    );

    // Current policy is missing the max_ref rule entirely.
    const existing = loadSpec(`version: "1.0"\ntools:\n  lookup: {}\n`);
    const suggestion = suggestRepair(events, existing);
    expect(hasMissingRules(suggestion.missing)).toBe(true);
    expect(suggestion.missing.tools!["refund"]!.input!.properties!["amount"]).toMatchObject({
      max_ref: "lookup.output.balance",
    });
    expect(suggestion.snippet).toContain("# learned from run run_test");
    expect(suggestion.snippet).toContain("max_ref");

    // Merged policy loads and now catches the failure.
    const merged = loadSpec(serializeSpec(suggestion.merged));
    const recheck = await checkPolicy(events, merged);
    expect(recheck.reopened).toEqual([]);
  });

  it("reports nothing to repair when the policy already covers the corpus", async () => {
    const spec = `version: "1.0"\ntools:\n  forbidden:\n    action: block\n`;
    const events = await record(spec, [["forbidden", {}]], { forbidden: async () => "x" });
    const suggestion = suggestRepair(events, loadSpec(spec));
    expect(hasMissingRules(suggestion.missing)).toBe(false);
  });

  it("specDiffMissing keeps only genuinely-new rules", () => {
    const existing = loadSpec(
      `version: "1.0"\ntools:\n  t:\n    requires:\n      - "a"\n    input:\n      properties:\n        x:\n          blocked_values:\n            - "1"\n`,
    );
    const inferred = loadSpec(
      `version: "1.0"\ntools:\n  t:\n    requires:\n      - "a"\n      - "b"\n    input:\n      properties:\n        x:\n          blocked_values:\n            - "1"\n            - "2"\n`,
    );
    const missing = specDiffMissing(existing, inferred);
    expect(missing.tools!["t"]!.requires).toEqual(["b"]);
    expect(missing.tools!["t"]!.input!.properties!["x"]!.blocked_values).toEqual(["2"]);
  });
});
