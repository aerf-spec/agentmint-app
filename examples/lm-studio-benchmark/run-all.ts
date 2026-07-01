// run-all.ts — runs every locally-testable arm in one pass against LM Studio,
// capturing real usage tokens. Arms:
//   baseline            raw heavy tools
//   hardened            + enforcement (your spec)
//   hardened+steer      + H1 enriched block messages
//   shaped              + dedup/truncation shaping
//   shaped+steer        + shaping + H1
// H8 (reasoning tokens) is captured on every arm automatically.
//
//   cd examples/lm-studio-benchmark
//   RUNS=5 npx tsx run-all.ts                 # smoke
//   RUNS=10 npx tsx run-all.ts                # final
//   LM_STUDIO_MODEL=<name> RUNS=10 npx tsx run-all.ts
//   ONLY=baseline,shaped npx tsx run-all.ts   # subset
//
// Writes analysis/output/diag-<arm>.json (raw per-run records).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { harden, loadSpec } from "../../src/index.ts";
import { SPEC_YAML, priceOf } from "./tools.ts";
import { createHeavyTools } from "./tools-heavy.ts";
import { shapeTools, SHAPE_CFG } from "./shape.ts";
import { ALL_TASKS } from "./tasks/index.ts";
import { EXTRA_TASKS } from "./tasks-extra.ts";
import {
  makeClient,
  runSingleDiag,
  type Arm,
  type DiagRun,
  type DiagToolSet,
} from "./agent-diag.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "analysis", "output");
const MODEL = process.env.LM_STUDIO_MODEL ?? "qwen3.5-9b-mlx";
const RUNS = Math.max(1, Number(process.env.RUNS ?? 5));
const TASKS = [...ALL_TASKS, ...EXTRA_TASKS];

// arm key -> { base arm for tools, steering on/off }
interface ArmSpec {
  key: string;
  base: Arm;
  steering: boolean;
}
const ALL_ARMS: ArmSpec[] = [
  { key: "baseline", base: "baseline", steering: false },
  { key: "hardened", base: "hardened", steering: false },
  { key: "hardened-steer", base: "hardened", steering: true },
  { key: "shaped", base: "shaped", steering: false },
  { key: "shaped-steer", base: "shaped", steering: true },
];

const only = (process.env.ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const ARMS = only.length ? ALL_ARMS.filter((a) => only.includes(a.key)) : ALL_ARMS;

type HardenedTools = Record<
  string,
  (p: Record<string, unknown>) => Promise<unknown>
> & {
  __state(): {
    blockedCount: number;
    totalCost: number;
    events: Array<{ result: string; reason?: string }>;
  };
  __receipt(): string;
};

function buildToolSet(base: Arm): DiagToolSet {
  const heavy = createHeavyTools();

  if (base === "baseline") return { fns: heavy };

  if (base === "hardened") {
    const spec = loadSpec(SPEC_YAML);
    const h = harden(heavy, {
      spec,
      silent: true,
      costEstimator: (tool: string) => priceOf(tool),
    }) as unknown as HardenedTools;
    return { fns: h, state: () => h.__state(), receipt: () => h.__receipt() };
  }

  // shaped: shaping inside, enforcement outside.
  const spec = loadSpec(SPEC_YAML);
  const shaped = shapeTools(heavy, SHAPE_CFG);
  const h = harden(shaped.fns, {
    spec,
    silent: true,
    costEstimator: (tool: string) => priceOf(tool),
  }) as unknown as HardenedTools;
  return {
    fns: h,
    state: () => h.__state(),
    receipt: () => h.__receipt(),
    shapeStats: shaped.stats,
  };
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const client = makeClient();

  console.log(`\n  AgentMint diagnostic — model: ${MODEL} — runs/task: ${RUNS}`);
  console.log(`  Arms: ${ARMS.map((a) => a.key).join(", ")}`);
  try {
    await client.models.list();
  } catch {
    console.error(
      `\n  x Could not reach LM Studio at ${
        process.env.LM_STUDIO_URL ?? "http://localhost:1234/v1"
      }.\n    Start the server and load ${MODEL} (or set LM_STUDIO_MODEL).\n`,
    );
    process.exitCode = 1;
    return;
  }

  const t0 = Date.now();
  for (const arm of ARMS) {
    const rawLog = join(OUT_DIR, `diag-${arm.key}-raw.jsonl`);
    writeFileSync(rawLog, "");
    const runs: DiagRun[] = [];
    console.log(`\n  === ARM: ${arm.key} ===`);
    for (const task of TASKS) {
      process.stdout.write(`  > ${task.name} `);
      for (let i = 1; i <= RUNS; i++) {
        const r = await runSingleDiag(client, buildToolSet(arm.base), task, {
          model: MODEL,
          arm: arm.base,
          rawLogPath: rawLog,
          runIndex: i,
          steering: arm.steering,
        });
        runs.push(r);
        process.stdout.write(r.success ? "." : "x");
      }
      process.stdout.write("\n");
    }
    writeFileSync(
      join(OUT_DIR, `diag-${arm.key}.json`),
      JSON.stringify(
        {
          model: MODEL,
          armKey: arm.key,
          baseArm: arm.base,
          steering: arm.steering,
          runsPerTask: RUNS,
          generatedAt: new Date().toISOString(),
          runs,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(`  Wrote diag-${arm.key}.json (${runs.length} runs)`);
  }

  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(
    `\n  Done in ${mins} min. Now run:  npx tsx compare3.ts\n` +
      `  '.' = task success, 'x' = task failure (watch the shaped arms).\n` +
      `  If promptTokens are all 0, LM Studio is not returning usage — fix that first.\n`,
  );
}

main().catch((err) => {
  console.error(`\n  x ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
