import type { AgentMintConfig, RunState } from "./types.js";
import { matchesAny } from "./matcher.js";
import { blockResponse, logEvent } from "./log.js";

export async function enforce(
  tool: string,
  params: Record<string, unknown>,
  execute: () => Promise<unknown>,
  config: Readonly<AgentMintConfig>,
  state: RunState,
): Promise<unknown> {
  state.callCount++;

  // 0. Already dead
  if (state.status === "killed") {
    return blockResponse(tool, "Run has been terminated.");
  }

  // 1. Budget
  if (
    config.budget !== undefined &&
    config.costEstimator &&
    state.totalCost >= config.budget
  ) {
    state.status = "killed";
    state.killReason = "budget_exceeded";
    state.killedCount++;
    logEvent(state, tool, params, "killed", {
      reason: "budget_exceeded",
      details: `$${state.totalCost.toFixed(2)} >= $${config.budget.toFixed(2)}`,
    });
    config.onKill?.("budget_exceeded", state);
    return blockResponse(tool, `Run budget of $${config.budget.toFixed(2)} exceeded.`);
  }

  // 2. Timeout
  if (config.timeout !== undefined) {
    const elapsed = (Date.now() - state.startedAt) / 1000;
    if (elapsed >= config.timeout) {
      state.status = "killed";
      state.killReason = "timeout";
      state.killedCount++;
      logEvent(state, tool, params, "killed", {
        reason: "timeout",
        details: `${elapsed.toFixed(1)}s >= ${config.timeout}s`,
      });
      config.onKill?.("timeout", state);
      return blockResponse(tool, `Run timeout of ${config.timeout}s exceeded.`);
    }
  }

  // 3. Retry limit
  if (config.retryLimit !== undefined) {
    const count = state.retryCounts[tool] ?? 0;
    if (count >= config.retryLimit) {
      state.skippedCount++;
      logEvent(state, tool, params, "skipped", {
        reason: "retry_limit",
        details: `${tool} called ${count} times, limit is ${config.retryLimit}`,
      });
      return blockResponse(
        tool,
        `${tool} has been called ${count} times (limit: ${config.retryLimit}). Try a different approach.`,
      );
    }
  }

  // Steps 4-8: in shadow mode, log the block but fall through to execution.
  const shadow = config.mode === "shadow";

  // 4. Bind
  if (config.bind) {
    for (const [field, expected] of Object.entries(config.bind)) {
      if (params[field] !== undefined && params[field] !== expected) {
        const details = `${field}: expected "${expected}", got "${String(params[field])}"`;
        state.blockedCount++;
        logEvent(state, tool, params, "blocked", { reason: "bind_violation", details });
        config.onBlock?.(tool, "bind_violation", details);
        const blocked = blockResponse(
          tool,
          `Access denied. ${field} must be "${expected}" for this run.`,
        );
        if (!shadow) return blocked;
        break;
      }
    }
  }

  // 5. Deny
  if (config.deny && matchesAny(tool, config.deny)) {
    state.blockedCount++;
    logEvent(state, tool, params, "blocked", { reason: "denied" });
    config.onBlock?.(tool, "denied");
    const blocked = blockResponse(tool, `${tool} is not available.`);
    if (!shadow) return blocked;
  }

  // 6. Allow
  if (config.allow && config.allow.length > 0 && !matchesAny(tool, config.allow)) {
    state.blockedCount++;
    logEvent(state, tool, params, "blocked", { reason: "not_in_scope" });
    config.onBlock?.(tool, "not_in_scope");
    const blocked = blockResponse(tool, `${tool} is not available.`);
    if (!shadow) return blocked;
  }

  // 7. Require (only checked when hitting a checkpoint tool)
  if (config.require && config.checkpoint && matchesAny(tool, config.checkpoint)) {
    for (const req of config.require) {
      if (!state.completedSteps.has(req)) {
        state.blockedCount++;
        logEvent(state, tool, params, "blocked", {
          reason: "prerequisite_missing",
          details: `"${req}" must be completed first`,
        });
        config.onBlock?.(tool, "prerequisite_missing", req);
        const blocked = blockResponse(
          tool,
          `Cannot execute ${tool}. Required step "${req}" has not been completed.`,
        );
        if (!shadow) return blocked;
        break;
      }
    }
  }

  // 8. Checkpoint
  if (config.checkpoint && matchesAny(tool, config.checkpoint)) {
    state.heldCount++;
    logEvent(state, tool, params, "held", { reason: "checkpoint_required" });
    if (config.onCheckpoint) {
      const approved = await config.onCheckpoint(tool, params);
      if (approved) {
        logEvent(state, tool, params, "approved", { reason: "checkpoint_approved" });
      } else {
        state.blockedCount++;
        logEvent(state, tool, params, "rejected", { reason: "checkpoint_rejected" });
        config.onBlock?.(tool, "checkpoint_rejected");
        const blocked = blockResponse(tool, `${tool} was not approved.`);
        if (!shadow) return blocked;
      }
    } else {
      config.onBlock?.(tool, "checkpoint_required");
      const blocked = blockResponse(
        tool,
        `${tool} requires approval. Provide an onCheckpoint callback.`,
      );
      if (!shadow) return blocked;
    }
  }

  // 9. Execute
  const t0 = Date.now();
  let result: unknown;
  try {
    result = await execute();
  } catch (err) {
    logEvent(state, tool, params, "allowed", {
      reason: "execution_error",
      details: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  const durationMs = Date.now() - t0;

  // 10. Cost
  let cost: number | undefined;
  if (config.costEstimator) {
    cost = config.costEstimator(tool, params, result);
    state.totalCost += cost;
  }

  // 11. Update state
  state.executedCount++;
  state.completedSteps.add(tool);
  state.retryCounts[tool] = (state.retryCounts[tool] ?? 0) + 1;
  if (result != null) {
    const summary =
      typeof result === "string"
        ? result.slice(0, 200)
        : JSON.stringify(result).slice(0, 200);
    state.retrievedData.push(`${tool}: ${summary}`);
  }

  // 12. Log
  logEvent(state, tool, params, "allowed", { cost, durationMs });

  return result;
}
