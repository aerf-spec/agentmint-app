import type {
  AERFRecord,
  AgentMintConfig,
  EventResult,
  RunState,
} from "./types.js";

const ICONS: Record<EventResult, string> = {
  allowed: "✓",
  blocked: "✗",
  held: "⏸",
  approved: "✓",
  rejected: "✗",
  killed: "⊘",
  skipped: "↷",
};

const SUFFIXES: Record<EventResult, string> = {
  blocked: "  BLOCKED",
  held: "  HELD",
  rejected: "  REJECTED",
  killed: "  KILLED",
  skipped: "  skipped",
  approved: "  approved",
  allowed: "",
};

export function buildRecord(
  state: RunState,
  config: Readonly<AgentMintConfig>,
): AERFRecord {
  return {
    version: "0.1.0",
    runId: state.runId,
    boundValues: { ...state.boundValues },
    startedAt: new Date(state.startedAt).toISOString(),
    status: state.status,
    mode: config.mode ?? "enforce",
    events: state.events.map((event) => {
      const boundParams: Record<string, string> = {};
      for (const key of Object.keys(event.params)) {
        const value = state.boundValues[key];
        if (value !== undefined) boundParams[key] = value;
      }
      return {
        tool: event.tool,
        result: event.result,
        ...(event.reason !== undefined ? { reason: event.reason } : {}),
        ...(event.details !== undefined ? { details: event.details } : {}),
        ...(Object.keys(boundParams).length > 0 ? { boundParams } : {}),
      };
    }),
    summary: {
      calls: state.callCount,
      executed: state.executedCount,
      blocked: state.blockedCount,
      held: state.heldCount,
      skipped: state.skippedCount,
      cost: state.totalCost > 0 || config.costEstimator ? state.totalCost : null,
      budget: config.budget ?? null,
      elapsedSeconds: parseFloat(((Date.now() - state.startedAt) / 1000).toFixed(1)),
    },
    ...(config.require
      ? {
          requiredSteps: config.require.map((tool) => ({
            tool,
            completed: state.completedSteps.has(tool),
          })),
        }
      : {}),
  };
}

function pad(line: string, width: number): string {
  return line + " ".repeat(Math.max(0, width - line.length)) + "║";
}

export function formatReceipt(
  state: RunState,
  config: Readonly<AgentMintConfig>,
): string {
  const W = 65;
  const lines: string[] = [];

  lines.push("╔" + "═".repeat(64) + "╗");
  lines.push(pad("║  AgentMint Receipt", W));
  lines.push(pad("║  Run: " + state.runId, W));
  if ((config.mode ?? "enforce") === "shadow") {
    lines.push(pad("║  SHADOW MODE", W));
  }
  const boundKeys = Object.keys(state.boundValues);
  if (boundKeys.length > 0) {
    const bound = boundKeys
      .map((k) => `${k}: ${state.boundValues[k]}`)
      .join(" · ");
    lines.push(pad("║  " + bound, W));
  }
  lines.push("╠" + "═".repeat(64) + "╣");

  for (const event of state.events) {
    lines.push(
      pad("║  " + ICONS[event.result] + " " + event.tool + SUFFIXES[event.result], W),
    );
    if (event.reason && event.result !== "allowed") {
      const detail = event.details ? ": " + event.details : "";
      lines.push(pad("║    ↳ " + event.reason + detail, W));
    }
  }

  lines.push("║" + " ".repeat(64) + "║");

  let summary: string;
  if (config.costEstimator) {
    summary = "Cost: $" + state.totalCost.toFixed(2);
    if (config.budget) summary += " / $" + config.budget.toFixed(2);
  } else {
    summary = "Calls: " + state.callCount;
  }
  const elapsed = parseFloat(((Date.now() - state.startedAt) / 1000).toFixed(1));
  summary += " · Time: " + elapsed + "s · Blocked: " + state.blockedCount;
  lines.push(pad("║  " + summary, W));

  if (config.require) {
    const required = config.require
      .map((step) => (state.completedSteps.has(step) ? "✓" : "✗") + " " + step)
      .join(" ");
    lines.push(pad("║  Required: " + required, W));
  }

  lines.push("║" + " ".repeat(64) + "║");
  lines.push("╚" + "═".repeat(64) + "╝");

  return lines.join("\n");
}
