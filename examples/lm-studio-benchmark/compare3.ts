// compare3.ts — aggregates every diag-<arm>.json present and renders the table
// plus pre-registered verdicts (PROTOCOL.md) and the H1/H8 side-hypotheses.
//
//   npx tsx compare3.ts
//   PRICE_IN=3 PRICE_OUT=15 npx tsx compare3.ts   # $/M tokens (proxy)
//
// Dollars here are PROXY (local models have no invoice). Real dollars and the
// prompt-caching interaction come from the API phase.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DiagRun } from "./agent-diag.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "analysis", "output");
const PRICE_IN = Number(process.env.PRICE_IN ?? 3);
const PRICE_OUT = Number(process.env.PRICE_OUT ?? 15);

interface ArmFile {
  armKey: string;
  baseArm: string;
  steering: boolean;
  runsPerTask: number;
  model: string;
  runs: DiagRun[];
}

function loadAll(): Record<string, ArmFile> {
  const out: Record<string, ArmFile> = {};
  for (const f of readdirSync(OUT_DIR)) {
    const m = /^diag-(.+)\.json$/.exec(f);
    if (!m || f.endsWith("-raw.jsonl")) continue;
    out[m[1]!] = JSON.parse(readFileSync(join(OUT_DIR, f), "utf8")) as ArmFile;
  }
  return out;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
function pad(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : s + " ".repeat(w - s.length);
}

interface Agg {
  n: number;
  promptMed: number;
  promptMin: number;
  promptMax: number;
  outMed: number;
  reasonMed: number;
  usdMed: number;
  successRate: number;
  turnCapRate: number;
  callsMed: number;
  blockedMed: number;
  afterBlockMed: number;
  dedupMed: number;
}
function agg(runs: DiagRun[]): Agg {
  const p = runs.map((r) => r.promptTokens);
  return {
    n: runs.length,
    promptMed: median(p),
    promptMin: Math.min(...p, 0),
    promptMax: Math.max(...p, 0),
    outMed: median(runs.map((r) => r.completionTokens)),
    reasonMed: median(runs.map((r) => Math.round(r.reasoningCharsEst / 4))),
    usdMed: median(
      runs.map(
        (r) => (r.promptTokens * PRICE_IN + r.completionTokens * PRICE_OUT) / 1e6,
      ),
    ),
    successRate: runs.length ? runs.filter((r) => r.success).length / runs.length : 0,
    turnCapRate: runs.length ? runs.filter((r) => r.hitTurnCap).length / runs.length : 0,
    callsMed: median(runs.map((r) => r.totalToolCalls)),
    blockedMed: median(runs.map((r) => r.blockedCalls)),
    afterBlockMed: median(runs.filter((r) => r.blockedCalls > 0).map((r) => r.turnsAfterFirstBlock)),
    dedupMed: median(runs.map((r) => r.dedupHits)),
  };
}

function main(): void {
  const files = loadAll();
  const keys = Object.keys(files);
  if (!keys.length) {
    console.log("  No diag-*.json in analysis/output/. Run run-all.ts first.");
    return;
  }
  const model = files[keys[0]!]!.model;
  const tasks = [...new Set(files[keys[0]!]!.runs.map((r) => r.task))];

  console.log(`\n  AgentMint diagnostic — ${model}`);
  console.log(`  Proxy pricing: $${PRICE_IN}/M in, $${PRICE_OUT}/M out (NOT an invoice)\n`);

  // Per-task table across all present arms.
  const H =
    pad("task", 15) + pad("arm", 15) + pad("promptTok (min-max)", 24) +
    pad("out", 6) + pad("reason", 8) + pad("$prx", 8) + pad("succ", 7) +
    pad("cap", 6) + pad("calls", 7) + pad("blk", 5) + pad("aftBlk", 8) + "dedup";
  console.log("  " + H);
  console.log("  " + "-".repeat(H.length));
  const A: Record<string, Record<string, Agg>> = {};
  for (const task of tasks) {
    A[task] = {};
    for (const k of keys) {
      A[task]![k] = agg(files[k]!.runs.filter((r) => r.task === task));
    }
    for (const k of keys) {
      const a = A[task]![k]!;
      console.log(
        "  " + pad(task, 15) + pad(k, 15) +
        pad(`${a.promptMed} (${a.promptMin}-${a.promptMax})`, 24) +
        pad(String(a.outMed), 6) + pad(String(a.reasonMed), 8) +
        pad(`$${a.usdMed.toFixed(3)}`, 8) + pad(pct(a.successRate), 7) +
        pad(pct(a.turnCapRate), 6) + pad(String(a.callsMed), 7) +
        pad(String(a.blockedMed), 5) + pad(String(a.afterBlockMed), 8) +
        String(a.dedupMed),
      );
    }
    console.log("");
  }

  const has = (k: string) => keys.includes(k);
  const verdicts: Array<{ id: string; pass: boolean; detail: string }> = [];

  // Core shaping verdicts (need baseline/hardened/shaped).
  if (has("baseline") && has("hardened") && has("shaped")) {
    const bloat = A["context-bloat"];
    const ctrl = A["linear-control"];
    if (bloat) {
      const ratio = bloat.shaped!.promptMed / Math.max(1, bloat.baseline!.promptMed);
      verdicts.push({
        id: "T1 shaped <= 80% of baseline prompt tokens on context-bloat",
        pass: ratio <= 0.8,
        detail: `shaped/baseline = ${pct(ratio)}`,
      });
      const marg = (bloat.hardened!.promptMed - bloat.shaped!.promptMed) /
        Math.max(1, bloat.baseline!.promptMed);
      verdicts.push({
        id: "T4 shaping adds >=10pp beyond enforcement (context-bloat)",
        pass: marg >= 0.1,
        detail: `hardened->shaped = ${pct(marg)} of baseline`,
      });
    }
    let t2 = true;
    const d: string[] = [];
    for (const task of tasks) {
      const drop = A[task]!.hardened!.successRate - A[task]!.shaped!.successRate;
      if (drop > 0.1) t2 = false;
      d.push(`${task} ${pct(A[task]!.hardened!.successRate)}->${pct(A[task]!.shaped!.successRate)}`);
    }
    verdicts.push({ id: "T2 shaped success within 10pp of hardened (all tasks)", pass: t2, detail: d.join("  ") });
    if (ctrl) {
      const sav = 1 - ctrl.shaped!.promptMed / Math.max(1, ctrl.baseline!.promptMed);
      const sd = ctrl.hardened!.successRate - ctrl.shaped!.successRate;
      verdicts.push({
        id: "T3 linear-control sanity: savings <5% and success intact",
        pass: sav < 0.05 && sd <= 0.1,
        detail: `control savings ${pct(sav)}, success drop ${pct(sd)}`,
      });
    }
  }

  // H1 steering: compare hardened vs hardened-steer on turnsAfterFirstBlock.
  if (has("hardened") && has("hardened-steer")) {
    const base: number[] = [];
    const steer: number[] = [];
    for (const task of tasks) {
      base.push(A[task]!.hardened!.afterBlockMed);
      steer.push(A[task]!["hardened-steer"]!.afterBlockMed);
    }
    const b = median(base), s = median(steer);
    verdicts.push({
      id: "H1 steering block messages reduce post-block turns",
      pass: s < b,
      detail: `median turnsAfterFirstBlock ${b} -> ${s}`,
    });
  }

  // H8 reasoning: report share of output tokens spent thinking (baseline).
  if (has("baseline")) {
    const rs: number[] = [], os: number[] = [];
    for (const task of tasks) {
      rs.push(A[task]!.baseline!.reasonMed);
      os.push(A[task]!.baseline!.outMed);
    }
    const r = median(rs), o = median(os);
    const share = o ? r / o : 0;
    verdicts.push({
      id: "H8 reasoning-token share of completion (info, not pass/fail)",
      pass: true,
      detail: `~${pct(share)} of output tokens are <think> — suppressing on routine turns could cut output cost by roughly this much`,
    });
  }

  console.log("  Verdicts:");
  for (const v of verdicts) {
    console.log(`  ${v.pass ? "PASS" : "FAIL"}  ${v.id}`);
    console.log(`        ${v.detail}`);
  }

  const core = verdicts.filter((v) => /^T[1-4]/.test(v.id));
  if (core.length) {
    const allPass = core.every((v) => v.pass);
    console.log(
      `\n  ${allPass ? "SHAPING THESIS SURVIVES — proceed to Model 2, then the $100 API phase (caching on vs off)." : "SHAPING THESIS DOES NOT SURVIVE as-is — see PROTOCOL.md kill criteria before spending on APIs."}`,
    );
  }
  console.log("");

  // Zero-token guard.
  const anyBaseline = files["baseline"];
  if (anyBaseline && anyBaseline.runs.every((r) => r.promptTokens === 0)) {
    console.log("  WARNING: promptTokens all 0 — LM Studio did not return the usage field. Nothing above is a token measurement.\n");
  }
}

main();
