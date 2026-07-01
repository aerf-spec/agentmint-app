import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseJSONL } from "../jsonl.js";
import { loadSpec } from "../kernel/spec.js";
import { inferSpec, mergeSpecs, serializeSpec } from "../experimental/learn.js";
import type { JSONLEvent } from "../types.js";
import { brand, dim, fg, green, muted, red } from "./color.js";

function parseArgs(argv: string[]): {
  from?: string;
  out?: string;
  merge?: string;
  help: boolean;
} {
  let from: string | undefined;
  let out: string | undefined;
  let merge: string | undefined;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from") from = argv[++i];
    else if (a === "--out") out = argv[++i];
    else if (a === "--merge") merge = argv[++i];
    else if (a === "--help" || a === "-h") help = true;
  }
  return { from, out, merge, help };
}

function showHelp(): void {
  console.log("");
  console.log(`  ${brand()}  ${dim("learn")}`);
  console.log(`  ${muted("Generate an agentmint spec from past violations")}`);
  console.log("");
  console.log(`  ${fg("Usage:")}  agentmint learn --from ${dim("<path>")} [--out ${dim("<path>")}] [--merge ${dim("<path>")}]`);
  console.log("");
  console.log(`  ${fg("Options:")}`);
  console.log(`    ${fg("--from")}   ${muted("JSONL file or directory of JSONL receipts (required)")}`);
  console.log(`    ${fg("--out")}    ${muted("Write the spec to a file (default: stdout)")}`);
  console.log(`    ${fg("--merge")}  ${muted("Merge inferred rules into an existing spec, preserving it")}`);
  console.log("");
  console.log(`  ${fg("Examples:")}`);
  console.log(`    ${dim("$")} agentmint learn --from receipts/incident.jsonl`);
  console.log(`    ${dim("$")} agentmint learn --from receipts/ --out agentmint.spec.yaml`);
  console.log(`    ${dim("$")} agentmint learn --from receipts/ --merge agentmint.spec.yaml`);
  console.log("");
}

function collectJSONL(path: string): JSONLEvent[] {
  const events: JSONLEvent[] = [];
  const st = statSync(path);
  if (st.isDirectory()) {
    for (const entry of readdirSync(path)) {
      if (entry.endsWith(".jsonl")) {
        events.push(...parseJSONL(readFileSync(join(path, entry), "utf-8")));
      }
    }
  } else {
    events.push(...parseJSONL(readFileSync(path, "utf-8")));
  }
  return events;
}

export async function runLearn(): Promise<void> {
  const { from, out, merge, help } = parseArgs(process.argv.slice(3));

  if (help || !from) {
    showHelp();
    if (!from && !help) process.exitCode = 1;
    return;
  }

  let events: JSONLEvent[];
  try {
    events = collectJSONL(from);
  } catch (err) {
    console.error("");
    console.error(`  ${red("✗")} Could not read ${red(from)}: ${err instanceof Error ? err.message : String(err)}`);
    console.error("");
    process.exitCode = 1;
    return;
  }

  let spec = inferSpec(events);

  if (merge) {
    try {
      const existing = loadSpec(readFileSync(merge, "utf-8"));
      spec = mergeSpecs(existing, spec);
    } catch (err) {
      console.error("");
      console.error(`  ${red("✗")} Could not merge with ${red(merge)}: ${err instanceof Error ? err.message : String(err)}`);
      console.error("");
      process.exitCode = 1;
      return;
    }
  }

  const yaml = serializeSpec(spec);

  if (out) {
    writeFileSync(out, yaml, "utf-8");
    const toolCount = spec.tools ? Object.keys(spec.tools).length : 0;
    console.error(`  ${green("✓")} Wrote spec (${toolCount} tool${toolCount === 1 ? "" : "s"}) to ${fg(out)}`);
  } else {
    process.stdout.write(yaml);
  }
}
