import type {
  AgentMintSpec,
  JSONLEvent,
  RuleAction,
  SpecBreakerConfig,
  SpecPropertyConfig,
  SpecToolConfig,
} from "../types.js";

// ── Violation extraction ───────────────────────────────────────────
// A receipt event records a violation via its `reason` (the violation type)
// and `details` (a human-readable description we parse structured data back
// out of). Newer events may also carry a structured `violations[]` array.

type VioType =
  | "requires"
  | "cross_ref"
  | "max_ref"
  | "blocked_pattern"
  | "blocked_value"
  | "loop_breaker"
  | "velocity_breaker"
  | "cost_breaker"
  | "budget_cap"
  | "usage_cap"
  | "cost_cap"
  | "bind_violation"
  | "action_block";

const VIO_TYPES = new Set<string>([
  "requires",
  "cross_ref",
  "max_ref",
  "blocked_pattern",
  "blocked_value",
  "loop_breaker",
  "velocity_breaker",
  "cost_breaker",
  "budget_cap",
  "usage_cap",
  "cost_cap",
  "bind_violation",
  "action_block",
]);

interface Descriptor {
  type: VioType;
  tool: string;
  action: RuleAction;
  field?: string;
  ref?: string;
  pattern?: string;
  value?: string;
  req?: string;
  limit?: number;
  windowSeconds?: number;
  maxUsd?: number;
}

type StructuredViolation = NonNullable<JSONLEvent["violations"]>[number] & {
  ref?: string;
  windowSeconds?: number;
};

/**
 * Build a descriptor from a STRUCTURED violation — no string parsing. Every
 * producer-side rule type carries its field/expected/actual/ref data on the
 * violation itself; the regex path below exists only for legacy corpora
 * recorded before violations[] existed.
 */
function descriptorFromStructured(v: StructuredViolation, tool: string): Descriptor | null {
  const action: RuleAction = v.action === "warn" ? "warn" : "block";
  const base = { tool, action } as Descriptor;
  switch (v.type as VioType) {
    case "requires":
      return v.expected ? { ...base, type: "requires", req: v.expected } : null;
    case "cross_ref":
      if (!v.field || !v.ref) return null;
      return { ...base, type: "cross_ref", field: v.field.replace(/^output\./, ""), ref: v.ref };
    case "max_ref":
      if (!v.field || !v.ref) return null;
      return { ...base, type: "max_ref", field: v.field, ref: v.ref };
    case "blocked_pattern":
      if (!v.field || v.expected === undefined) return null;
      return { ...base, type: "blocked_pattern", field: v.field, pattern: v.expected };
    case "blocked_value":
      if (!v.field || v.expected === undefined) return null;
      return { ...base, type: "blocked_value", field: v.field, value: v.expected };
    case "loop_breaker":
      return { ...base, type: "loop_breaker", limit: numberOr(v.expected, 3) };
    case "velocity_breaker":
      return {
        ...base,
        type: "velocity_breaker",
        limit: numberOr(v.expected, 10),
        windowSeconds: v.windowSeconds ?? 60,
      };
    case "cost_breaker":
      return { ...base, type: "cost_breaker", maxUsd: numberOr(v.expected, 0) };
    case "budget_cap":
      return { ...base, type: "budget_cap", maxUsd: numberOr(v.expected, 0) };
    case "cost_cap":
      return { ...base, type: "cost_cap", field: v.field, maxUsd: numberOr(v.expected, 0) };
    case "usage_cap":
      return { ...base, type: "usage_cap", limit: numberOr(v.expected, 1) };
    case "action_block":
      return { ...base, type: "action_block" };
    case "bind_violation":
      return { ...base, type: "bind_violation" };
    default:
      return null;
  }
}

function numberOr(value: string | undefined, fallback: number): number {
  const n = value !== undefined ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function actionFromResult(result: string): RuleAction {
  return result === "warned" ? "warn" : "block";
}

/** Parse a single (type, details) pair into a structured descriptor. */
function parseDetails(
  type: VioType,
  tool: string,
  action: RuleAction,
  field: string | undefined,
  details: string | undefined,
): Descriptor | null {
  const d = details ?? "";
  const base = { type, tool, action } as Descriptor;

  switch (type) {
    case "requires": {
      const m = d.match(/"([^"]+)" must be called before/);
      if (!m) return null;
      return { ...base, req: m[1] };
    }
    case "cross_ref": {
      const f = field ?? d.match(/^([\w.]+):/)?.[1];
      const ref = d.match(/\(from ([^)]+)\)/)?.[1];
      if (!f || !ref) return null;
      return { ...base, field: f.replace(/^output\./, ""), ref };
    }
    case "max_ref": {
      const f = field ?? d.match(/^([\w.]+):/)?.[1];
      const ref = d.match(/\(from ([^)]+)\)/)?.[1];
      if (!f || !ref) return null;
      return { ...base, field: f, ref };
    }
    case "blocked_pattern": {
      const f = field ?? d.match(/^(\w+) contains blocked pattern/)?.[1];
      const pattern = d.match(/blocked pattern "([^"]*)"/)?.[1];
      if (!f || pattern === undefined) return null;
      return { ...base, field: f, pattern };
    }
    case "blocked_value": {
      const f = field ?? d.match(/^(\w+) has blocked value/)?.[1];
      const value = d.match(/blocked value "([^"]*)"/)?.[1];
      if (!f || value === undefined) return null;
      return { ...base, field: f, value };
    }
    case "loop_breaker": {
      const limit = d.match(/limit: (\d+)/)?.[1];
      return { ...base, limit: limit ? parseInt(limit, 10) : 3 };
    }
    case "velocity_breaker": {
      const window = d.match(/last (\d+)s/)?.[1];
      const limit = d.match(/limit: (\d+)/)?.[1];
      return {
        ...base,
        limit: limit ? parseInt(limit, 10) : 10,
        windowSeconds: window ? parseInt(window, 10) : 60,
      };
    }
    case "cost_breaker": {
      const usd = d.match(/limit \$([\d.]+)/)?.[1];
      return { ...base, maxUsd: usd ? parseFloat(usd) : 0 };
    }
    case "action_block":
      // A tool blocked outright by a bare spec `action: block` — no details to
      // parse; the rule is simply "this tool is denied".
      return { ...base };
    case "bind_violation":
      // Bind is a run-time config constraint, not a spec rule — noted but not
      // representable in AgentMintSpec, so it does not shape the inferred spec.
      return { ...base };
    default:
      return null;
  }
}

function descriptorsFor(event: JSONLEvent): Descriptor[] {
  const out: Descriptor[] = [];

  if (event.violations && event.violations.length > 0) {
    for (const v of event.violations) {
      if (!VIO_TYPES.has(v.type)) continue;
      // Structured data first; the details-string parser is the legacy path.
      const desc =
        descriptorFromStructured(v as StructuredViolation, event.tool) ??
        parseDetails(
          v.type as VioType,
          event.tool,
          v.action === "warn" ? "warn" : "block",
          v.field,
          v.details,
        );
      if (desc) out.push(desc);
    }
    return out;
  }

  if (event.reason && VIO_TYPES.has(event.reason)) {
    const desc = parseDetails(
      event.reason as VioType,
      event.tool,
      actionFromResult(event.result),
      undefined,
      event.details,
    );
    if (desc) out.push(desc);
  }
  return out;
}

// ── Spec inference ─────────────────────────────────────────────────

function ensureTool(spec: AgentMintSpec, tool: string): SpecToolConfig {
  if (!spec.tools) spec.tools = {};
  if (!spec.tools[tool]) spec.tools[tool] = {};
  return spec.tools[tool]!;
}

function ensureProp(
  spec: AgentMintSpec,
  tool: string,
  field: string,
): SpecPropertyConfig {
  const t = ensureTool(spec, tool);
  if (!t.input) t.input = {};
  if (!t.input.properties) t.input.properties = {};
  if (!t.input.properties[field]) t.input.properties[field] = {};
  return t.input.properties[field]!;
}

function addUnique(list: string[] | undefined, value: string): string[] {
  const arr = list ?? [];
  if (!arr.includes(value)) arr.push(value);
  return arr;
}

export function inferSpec(events: JSONLEvent[]): AgentMintSpec {
  const spec: AgentMintSpec = { version: "1.0" };

  for (const event of events) {
    for (const desc of descriptorsFor(event)) {
      switch (desc.type) {
        case "requires": {
          if (!desc.req) break;
          const t = ensureTool(spec, desc.tool);
          t.requires = addUnique(t.requires, desc.req);
          if (desc.action === "warn") t.action = "warn";
          break;
        }
        case "cross_ref": {
          if (!desc.field || !desc.ref) break;
          const p = ensureProp(spec, desc.tool, desc.field);
          p.cross_ref = desc.ref;
          if (desc.action === "block") p.action = "block";
          break;
        }
        case "max_ref": {
          if (!desc.field || !desc.ref) break;
          const p = ensureProp(spec, desc.tool, desc.field);
          p.max_ref = desc.ref;
          if (desc.action === "block") p.action = "block";
          break;
        }
        case "blocked_pattern": {
          if (!desc.field || desc.pattern === undefined) break;
          const p = ensureProp(spec, desc.tool, desc.field);
          p.blocked_patterns = addUnique(p.blocked_patterns, desc.pattern);
          if (desc.action === "block") p.action = "block";
          break;
        }
        case "blocked_value": {
          if (!desc.field || desc.value === undefined) break;
          const p = ensureProp(spec, desc.tool, desc.field);
          p.blocked_values = addUnique(p.blocked_values, desc.value);
          if (desc.action === "block") p.action = "block";
          break;
        }
        case "loop_breaker": {
          if (!spec.breakers) spec.breakers = {};
          spec.breakers.loop = {
            max_identical_calls: desc.limit ?? 3,
            action: desc.action,
          };
          break;
        }
        case "velocity_breaker": {
          if (!spec.breakers) spec.breakers = {};
          spec.breakers.velocity = {
            max_calls_per_window: desc.limit ?? 10,
            window_seconds: desc.windowSeconds ?? 60,
            action: desc.action,
          };
          break;
        }
        case "cost_breaker": {
          if (!spec.breakers) spec.breakers = {};
          spec.breakers.cost = { max_usd: desc.maxUsd ?? 0, action: desc.action };
          break;
        }
        case "budget_cap": {
          if (!spec.breakers) spec.breakers = {};
          spec.breakers.budget = { max_total_usd: desc.maxUsd ?? 0, action: desc.action };
          break;
        }
        case "cost_cap": {
          const t = ensureTool(spec, desc.tool);
          t.cost = { ...t.cost, max_cost_usd: desc.maxUsd ?? 0, action: desc.action };
          break;
        }
        case "usage_cap": {
          const t = ensureTool(spec, desc.tool);
          t.limits = { max_calls_per_run: desc.limit ?? 1, action: desc.action };
          break;
        }
        case "action_block": {
          const t = ensureTool(spec, desc.tool);
          t.action = "block";
          break;
        }
        case "bind_violation":
          break;
      }
    }
  }

  return spec;
}

/** True when an event records a policy violation that shapes the inferred spec. */
export function isViolation(event: JSONLEvent): boolean {
  return descriptorsFor(event).length > 0;
}

/** Count the distinct rules an inferred spec expresses (tools + breakers). */
export function countRules(spec: AgentMintSpec): number {
  let n = 0;
  for (const t of Object.values(spec.tools ?? {})) {
    if (t.action) n++;
    if (t.requires && t.requires.length > 0) n++;
    if (t.cost?.max_cost_usd !== undefined) n++;
    if (t.limits?.max_calls_per_run !== undefined) n++;
    n += Object.keys(t.input?.properties ?? {}).length;
    n += Object.keys(t.output?.properties ?? {}).length;
  }
  const b = spec.breakers;
  if (b) n += (["loop", "velocity", "cost", "budget"] as const).filter((k) => b[k]).length;
  return n;
}

// ── Merge ──────────────────────────────────────────────────────────

/** Merge inferred rules into an existing spec, preserving existing rules. */
export function mergeSpecs(base: AgentMintSpec, add: AgentMintSpec): AgentMintSpec {
  const out: AgentMintSpec = {
    version: base.version || add.version || "1.0",
  };
  if (base.defaults || add.defaults) {
    out.defaults = { ...add.defaults, ...base.defaults };
  }

  const tools: Record<string, SpecToolConfig> = {};
  for (const [name, cfg] of Object.entries(add.tools ?? {})) {
    tools[name] = structuredCloneTool(cfg);
  }
  for (const [name, cfg] of Object.entries(base.tools ?? {})) {
    tools[name] = mergeTool(tools[name], cfg);
  }
  if (Object.keys(tools).length > 0) out.tools = tools;

  if (base.breakers || add.breakers) {
    out.breakers = { ...add.breakers, ...base.breakers } as SpecBreakerConfig;
  }
  return out;
}

function structuredCloneTool(cfg: SpecToolConfig): SpecToolConfig {
  return JSON.parse(JSON.stringify(cfg)) as SpecToolConfig;
}

function mergeTool(add: SpecToolConfig | undefined, base: SpecToolConfig): SpecToolConfig {
  const merged: SpecToolConfig = add ? structuredCloneTool(add) : {};
  if (base.action) merged.action = base.action;
  if (base.requires) {
    let requires = merged.requires ?? [];
    for (const r of base.requires) if (!requires.includes(r)) requires = [...requires, r];
    merged.requires = requires;
  }
  for (const dir of ["input", "output"] as const) {
    const baseDir = base[dir];
    if (!baseDir?.properties) continue;
    if (!merged[dir]) merged[dir] = {};
    if (!merged[dir]!.properties) merged[dir]!.properties = {};
    for (const [field, prop] of Object.entries(baseDir.properties)) {
      merged[dir]!.properties![field] = {
        ...merged[dir]!.properties![field],
        ...prop,
      };
    }
  }
  return merged;
}

// ── Serialization ──────────────────────────────────────────────────
// Emits a YAML subset that round-trips through spec.ts's parseYaml.

function q(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function scalar(value: unknown): string {
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return q(String(value));
}

export function serializeSpec(spec: AgentMintSpec): string {
  const lines: string[] = [];
  lines.push(`version: ${q(String(spec.version ?? "1.0"))}`);

  if (spec.defaults?.action) {
    lines.push("defaults:");
    lines.push(`  action: ${spec.defaults.action}`);
  }

  if (spec.tools && Object.keys(spec.tools).length > 0) {
    lines.push("tools:");
    for (const [tool, cfg] of Object.entries(spec.tools)) {
      lines.push(`  ${tool}:`);
      if (cfg.action) lines.push(`    action: ${cfg.action}`);
      if (cfg.requires && cfg.requires.length > 0) {
        lines.push("    requires:");
        for (const r of cfg.requires) lines.push(`      - ${scalar(r)}`);
      }
      if (cfg.cost && (cfg.cost.max_cost_usd !== undefined || cfg.cost.estimate_usd !== undefined)) {
        lines.push("    cost:");
        if (cfg.cost.estimate_usd !== undefined) lines.push(`      estimate_usd: ${cfg.cost.estimate_usd}`);
        if (cfg.cost.max_cost_usd !== undefined) lines.push(`      max_cost_usd: ${cfg.cost.max_cost_usd}`);
        if (cfg.cost.action) lines.push(`      action: ${cfg.cost.action}`);
      }
      if (cfg.limits?.max_calls_per_run !== undefined) {
        lines.push("    limits:");
        lines.push(`      max_calls_per_run: ${cfg.limits.max_calls_per_run}`);
        if (cfg.limits.action) lines.push(`      action: ${cfg.limits.action}`);
      }
      serializeProps(lines, "input", cfg.input?.properties);
      serializeProps(lines, "output", cfg.output?.properties);
    }
  }

  if (spec.breakers && Object.keys(spec.breakers).length > 0) {
    lines.push("breakers:");
    const b = spec.breakers;
    if (b.loop) {
      lines.push("  loop:");
      lines.push(`    max_identical_calls: ${b.loop.max_identical_calls}`);
      if (b.loop.action) lines.push(`    action: ${b.loop.action}`);
    }
    if (b.velocity) {
      lines.push("  velocity:");
      lines.push(`    max_calls_per_window: ${b.velocity.max_calls_per_window}`);
      lines.push(`    window_seconds: ${b.velocity.window_seconds}`);
      if (b.velocity.action) lines.push(`    action: ${b.velocity.action}`);
    }
    if (b.cost) {
      lines.push("  cost:");
      lines.push(`    max_usd: ${b.cost.max_usd}`);
      if (b.cost.action) lines.push(`    action: ${b.cost.action}`);
    }
    if (b.budget) {
      lines.push("  budget:");
      lines.push(`    max_total_usd: ${b.budget.max_total_usd}`);
      if (b.budget.action) lines.push(`    action: ${b.budget.action}`);
    }
  }

  return lines.join("\n") + "\n";
}

// ── Regression-test generation ─────────────────────────────────────
// From the same receipts we infer the spec, emit a self-contained vitest file
// that reloads the spec, replays the recorded call sequence through harden(),
// and asserts each blocked call is re-blocked (with its reason) and each allowed
// call still passes. The file is runnable as-is: `npx vitest run <file>`.

interface ReplayCall {
  tool: string;
  params: Record<string, unknown>;
  result: string;
  reason?: string;
}

/**
 * Seed values for stub outputs referenced by cross_ref/max_ref rules. For a rule
 * like `amount.max_ref: lookup_customer.output.balance`, the producing tool's
 * stub must return a `balance` that reproduces the violation on replay. We read
 * the exact figure back out of the recorded violation details.
 */
export function outputSeeds(events: JSONLEvent[]): Record<string, Record<string, unknown>> {
  const seeds: Record<string, Record<string, unknown>> = {};
  const put = (ref: string | undefined, value: unknown) => {
    if (!ref) return;
    const [tool, kind, field] = ref.split(".");
    if (kind === "output" && tool && field) (seeds[tool] ??= {})[field] = value;
  };
  for (const e of events) {
    // Structured violations carry the ref path and the recorded ref value.
    for (const v of e.violations ?? []) {
      const sv = v as StructuredViolation;
      if (sv.type === "max_ref") put(sv.ref, Number(sv.expected));
      else if (sv.type === "cross_ref") put(sv.ref, sv.expected);
    }
    if (e.violations && e.violations.length > 0) continue;
    // Legacy corpora: parse the details string.
    const d = e.details ?? "";
    if (e.reason === "max_ref") {
      const m = d.match(/exceeds max ([\d.]+) \(from ([\w.]+)\)/);
      if (m) put(m[2], Number(m[1]));
    } else if (e.reason === "cross_ref") {
      const m = d.match(/expected "([^"]*)" \(from ([\w.]+)\)/);
      if (m) put(m[2], m[1]);
    }
  }
  return seeds;
}

/**
 * Cluster key for a denial: (tool, rule, field). Fifty receipts tripping the
 * same rule on the same tool produce ONE representative regression test.
 */
export function clusterKey(event: JSONLEvent): string | null {
  if (!DENIED_RESULTS.has(event.result)) return null;
  const first = event.violations?.[0];
  const rule = first?.type ?? event.reason ?? "unknown";
  const field = first?.field ?? "";
  return `${event.tool} ${rule} ${field}`;
}

const DENIED_RESULTS = new Set(["blocked", "rejected", "killed"]);

export function generateTestFile(opts: {
  events: JSONLEvent[];
  spec: AgentMintSpec;
  fromPath: string;
  testPath: string;
  timestamp: string;
  /** SHA-256 of the source corpus, linking the test back to its receipts. */
  sourceHash?: string;
  importSpecifier?: string;
}): string {
  const { events, spec, fromPath, testPath, timestamp } = opts;
  const importFrom = opts.importSpecifier ?? "@npmsai/agentmint";

  const calls: ReplayCall[] = events.map((e) => ({
    tool: e.tool,
    params: e.params ?? {},
    result: e.result,
    ...(e.result !== "allowed" && e.reason ? { reason: e.reason } : {}),
  }));

  const violations = events.filter(isViolation).length;
  const toolNames = [...new Set(events.map((e) => e.tool))];
  const seeds = outputSeeds(events);

  const stubLines = toolNames.map((name) => {
    const ret = seeds[name] ?? { ok: true };
    return `    ${JSON.stringify(name)}: async () => (${JSON.stringify(ret)}),`;
  });

  const yaml = serializeSpec(spec);

  // Cluster denials by (tool, rule, field): one representative test per
  // cluster, replaying the EXACT recorded prefix up to its first occurrence.
  const clusters = new Map<string, { firstIndex: number; count: number; call: ReplayCall }>();
  events.forEach((e, i) => {
    const key = clusterKey(e);
    if (!key) return;
    const existing = clusters.get(key);
    if (existing) existing.count++;
    else clusters.set(key, { firstIndex: i, count: 1, call: calls[i]! });
  });

  const denialTests = [...clusters.entries()]
    .map(([key, { firstIndex: i, count, call: c }]) => {
      const label = `re-blocks ${key.trim()} (call ${i + 1}${count > 1 ? `, +${count - 1} duplicate${count > 2 ? "s" : ""} collapsed` : ""})`;
      return `  it(${JSON.stringify(label)}, async () => {
    const tools = harden(makeTools(), { spec: loadSpec(SPEC), silent: true });
    let last;
    for (let k = 0; k <= ${i}; k++) {
      const call = CALLS[k];
      await (tools)[call.tool](call.params);
      const log = (tools).__log();
      last = log[log.length - 1];
    }
    expect(last.tool).toBe(${JSON.stringify(c.tool)});
    expect(last.result).toBe(${JSON.stringify(c.result)});
    expect(last.reason).toBe(${JSON.stringify(c.reason)});
  });`;
    })
    .join("\n\n");

  return `// generated by: agentmint learn --from ${fromPath} --test ${testPath}
// source: ${events.length} events, ${violations} violations, ${timestamp}
${opts.sourceHash ? `// source corpus sha256: ${opts.sourceHash}\n` : ""}// hermetic: replays recorded calls against stub tools — no network, no model.
// re-run the learn command to regenerate after policy changes
import { describe, it, expect } from "vitest";
import { harden, loadSpec } from ${JSON.stringify(importFrom)};

const SPEC = ${JSON.stringify(yaml)};

// The recorded call sequence, replayed in order so stateful rules (requires,
// cross_ref/max_ref, loop breakers, usage caps) reproduce exactly.
const CALLS = ${JSON.stringify(calls, null, 2)};

// Stub tools. Return values don't matter for blocked calls (enforcement runs
// before execution); outputs referenced by cross_ref/max_ref rules are seeded
// from the recorded violations so stateful rules re-fire deterministically.
function makeTools() {
  return {
${stubLines.join("\n")}
  };
}

describe("learned policy regression (from ${fromPath})", () => {
${denialTests}

  it("still allows every call the policy does not forbid", async () => {
    const tools = harden(makeTools(), { spec: loadSpec(SPEC), silent: true });
    const seen = [];
    for (const call of CALLS) {
      await (tools)[call.tool](call.params);
      const log = (tools).__log();
      seen.push(log[log.length - 1]);
    }
    CALLS.forEach((call, i) => {
      if (call.result === "allowed") expect(seen[i].result).toBe("allowed");
    });
  });
});
`;
}

// ── Replay engine + policy-diff safety ──────────────────────────────

export interface ReplayOutcome {
  tool: string;
  /** Events appended to the log by replaying this one call. */
  delta: Array<{ result: string; reason?: string }>;
  /** True when the call reached execution (an "allowed" event was logged). */
  executed: boolean;
}

/**
 * Replay a recorded corpus through harden() with a given policy, in-process
 * and hermetic (stub tools, outputs seeded from the recorded violations).
 * Returns one outcome per corpus event.
 */
export async function replayCorpus(
  events: JSONLEvent[],
  spec: AgentMintSpec,
): Promise<ReplayOutcome[]> {
  const { harden } = await import("./harden.js");
  const seeds = outputSeeds(events);
  const stubs: Record<string, () => Promise<unknown>> = {};
  for (const name of new Set(events.map((e) => e.tool))) {
    stubs[name] = async () => seeds[name] ?? { ok: true };
  }
  const tools = harden(stubs, { spec, silent: true });
  const outcomes: ReplayOutcome[] = [];
  let logStart = 0;
  for (const event of events) {
    await (tools as unknown as Record<string, (p: unknown) => Promise<unknown>>)[event.tool]!(
      event.params ?? {},
    );
    const log = tools.__log();
    const delta = log.slice(logStart).map((e) => ({ result: e.result as string, reason: e.reason }));
    logStart = log.length;
    outcomes.push({
      tool: event.tool,
      delta,
      executed: delta.some((d) => d.result === "allowed"),
    });
  }
  return outcomes;
}

export interface ReopenedHole {
  /** 0-based index into the corpus. */
  index: number;
  tool: string;
  /** The rule that caught this call in the recorded corpus. */
  originalReason: string;
  /** What the new policy does with the same call. */
  nowResult: string;
}

export interface PolicyCheckResult {
  /** Previously-blocked failures the new policy would now let execute. */
  reopened: ReopenedHole[];
  /** Distinct (tool, rule, field) clusters checked. */
  clustersChecked: number;
}

/**
 * Policy-diff safety: replay a receipt corpus against a NEW policy and report
 * every previously-caught failure the new policy would now ALLOW — the "you
 * just reopened a hole" detector.
 */
export async function checkPolicy(
  events: JSONLEvent[],
  newSpec: AgentMintSpec,
): Promise<PolicyCheckResult> {
  const outcomes = await replayCorpus(events, newSpec);
  const reopened: ReopenedHole[] = [];
  const clusters = new Set<string>();
  events.forEach((event, index) => {
    const key = clusterKey(event);
    if (!key) return;
    clusters.add(key);
    const outcome = outcomes[index]!;
    if (outcome.executed) {
      reopened.push({
        index,
        tool: event.tool,
        originalReason: event.violations?.[0]?.type ?? event.reason ?? "unknown",
        nowResult: outcome.delta[outcome.delta.length - 1]?.result ?? "allowed",
      });
    }
  });
  return { reopened, clustersChecked: clusters.size };
}

// ── Repair suggestion ───────────────────────────────────────────────

/** Deep "does the existing spec already express this rule" checks. */
function toolRuleMissing(existing: SpecToolConfig | undefined, inferred: SpecToolConfig): SpecToolConfig | null {
  const missing: SpecToolConfig = {};
  if (inferred.action && !existing?.action) missing.action = inferred.action;
  const missingReqs = (inferred.requires ?? []).filter((r) => !(existing?.requires ?? []).includes(r));
  if (missingReqs.length > 0) missing.requires = missingReqs;
  if (inferred.cost?.max_cost_usd !== undefined && existing?.cost?.max_cost_usd === undefined) {
    missing.cost = inferred.cost;
  }
  if (inferred.limits?.max_calls_per_run !== undefined && existing?.limits?.max_calls_per_run === undefined) {
    missing.limits = inferred.limits;
  }
  for (const dir of ["input", "output"] as const) {
    for (const [field, prop] of Object.entries(inferred[dir]?.properties ?? {})) {
      const have = existing?.[dir]?.properties?.[field];
      const missingProp: SpecPropertyConfig = {};
      if (prop.cross_ref && have?.cross_ref !== prop.cross_ref) missingProp.cross_ref = prop.cross_ref;
      if (prop.max_ref && have?.max_ref !== prop.max_ref) missingProp.max_ref = prop.max_ref;
      const missingPatterns = (prop.blocked_patterns ?? []).filter(
        (x) => !(have?.blocked_patterns ?? []).includes(x),
      );
      if (missingPatterns.length > 0) missingProp.blocked_patterns = missingPatterns;
      const missingValues = (prop.blocked_values ?? []).filter(
        (x) => !(have?.blocked_values ?? []).includes(x),
      );
      if (missingValues.length > 0) missingProp.blocked_values = missingValues;
      if (Object.keys(missingProp).length > 0) {
        if (prop.action) missingProp.action = prop.action;
        if (!missing[dir]) missing[dir] = {};
        if (!missing[dir]!.properties) missing[dir]!.properties = {};
        missing[dir]!.properties![field] = missingProp;
      }
    }
  }
  return Object.keys(missing).length > 0 ? missing : null;
}

/** The subset of `inferred` that `existing` does not already express. */
export function specDiffMissing(existing: AgentMintSpec, inferred: AgentMintSpec): AgentMintSpec {
  const missing: AgentMintSpec = { version: existing.version || "1.0" };
  for (const [tool, cfg] of Object.entries(inferred.tools ?? {})) {
    const m = toolRuleMissing(existing.tools?.[tool], cfg);
    if (m) {
      if (!missing.tools) missing.tools = {};
      missing.tools[tool] = m;
    }
  }
  const b = inferred.breakers;
  if (b) {
    const eb = existing.breakers;
    const mb: SpecBreakerConfig = {};
    if (b.loop && !eb?.loop) mb.loop = b.loop;
    if (b.velocity && !eb?.velocity) mb.velocity = b.velocity;
    if (b.cost && !eb?.cost) mb.cost = b.cost;
    if (b.budget && !eb?.budget) mb.budget = b.budget;
    if (Object.keys(mb).length > 0) missing.breakers = mb;
  }
  return missing;
}

export interface RepairSuggestion {
  /** The rules the current policy is missing, as a spec fragment. */
  missing: AgentMintSpec;
  /** YAML snippet to add, with comments citing the source receipts. */
  snippet: string;
  /** The full merged policy (existing + missing). */
  merged: AgentMintSpec;
}

/**
 * When the corpus shows failures the current policy does NOT catch, emit the
 * exact YAML to add — each rule annotated with the receipt it came from —
 * plus the merged policy.
 */
export function suggestRepair(events: JSONLEvent[], existing: AgentMintSpec): RepairSuggestion {
  const inferred = inferSpec(events);
  const missing = specDiffMissing(existing, inferred);
  const merged = mergeSpecs(existing, missing);

  // Citation per tool: the first denial event for that tool.
  const citation = (tool: string): string | undefined => {
    const e = events.find((ev) => ev.tool === tool && isViolation(ev));
    if (!e) return undefined;
    return `learned from run ${e.runId} @ ${e.timestamp} (${e.violations?.[0]?.type ?? e.reason})`;
  };

  const raw = serializeSpec(missing);
  const lines: string[] = [];
  for (const line of raw.split("\n")) {
    const toolMatch = line.match(/^ {2}(\S+):$/);
    if (toolMatch && missing.tools?.[toolMatch[1]!]) {
      const cite = citation(toolMatch[1]!);
      if (cite) lines.push(`  # ${cite}`);
    }
    if (line === "breakers:") {
      const e = events.find(
        (ev) => isViolation(ev) && /breaker|budget_cap/.test(ev.violations?.[0]?.type ?? ev.reason ?? ""),
      );
      if (e) lines.push(`# learned from run ${e.runId} @ ${e.timestamp} (${e.violations?.[0]?.type ?? e.reason})`);
    }
    lines.push(line);
  }
  return { missing, snippet: lines.join("\n"), merged };
}

/** True when a repair suggestion actually contains new rules. */
export function hasMissingRules(missing: AgentMintSpec): boolean {
  return Object.keys(missing.tools ?? {}).length > 0 || Object.keys(missing.breakers ?? {}).length > 0;
}

function serializeProps(
  lines: string[],
  dir: "input" | "output",
  props: Record<string, SpecPropertyConfig> | undefined,
): void {
  if (!props || Object.keys(props).length === 0) return;
  lines.push(`    ${dir}:`);
  lines.push("      properties:");
  for (const [field, prop] of Object.entries(props)) {
    lines.push(`        ${field}:`);
    if (prop.cross_ref) lines.push(`          cross_ref: ${scalar(prop.cross_ref)}`);
    if (prop.max_ref) lines.push(`          max_ref: ${scalar(prop.max_ref)}`);
    if (prop.blocked_patterns && prop.blocked_patterns.length > 0) {
      lines.push("          blocked_patterns:");
      for (const p of prop.blocked_patterns) lines.push(`            - ${scalar(p)}`);
    }
    if (prop.blocked_values && prop.blocked_values.length > 0) {
      lines.push("          blocked_values:");
      for (const v of prop.blocked_values) lines.push(`            - ${scalar(v)}`);
    }
    if (prop.action) lines.push(`          action: ${prop.action}`);
  }
}
