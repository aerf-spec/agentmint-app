import { describe, expect, it } from "vitest";
import type {
  AERFRecord,
  AgentMintConfig,
  BlockResponse,
  Event,
  MerkleProof,
  RunState,
} from "./types.js";

describe("types", () => {
  it("constructs a valid AgentMintConfig", () => {
    const config: AgentMintConfig = { bind: { patient_id: "PT-1" } };

    expect(config.bind?.patient_id).toBe("PT-1");
  });

  it("constructs a valid RunState", () => {
    const state: RunState = {
      runId: "amr_test1234",
      startedAt: Date.now(),
      status: "running",
      totalCost: 0,
      callCount: 0,
      executedCount: 0,
      blockedCount: 0,
      heldCount: 0,
      killedCount: 0,
      skippedCount: 0,
      retryCounts: {},
      completedSteps: new Set(),
      boundValues: {},
      events: [],
      retrievedData: [],
    };

    expect(state.status).toBe("running");
  });

  it("constructs a valid Event", () => {
    const event: Event = {
      timestamp: new Date().toISOString(),
      elapsed: "0.0s",
      tool: "test_tool",
      params: {},
      result: "allowed",
    };

    expect(event.result).toBe("allowed");
  });

  it("constructs a valid BlockResponse", () => {
    const block: BlockResponse = {
      error: true,
      tool: "x",
      message: "denied",
    };

    expect(block.error).toBe(true);
  });

  it("constructs a valid AERFRecord", () => {
    const record: AERFRecord = {
      version: "0.1.0",
      runId: "amr_test1234",
      boundValues: {},
      startedAt: new Date().toISOString(),
      status: "completed",
      mode: "enforce",
      events: [],
      summary: {
        calls: 0,
        executed: 0,
        blocked: 0,
        held: 0,
        skipped: 0,
        cost: null,
        budget: null,
        elapsedSeconds: 0,
      },
    };

    expect(record.version).toBe("0.1.0");
  });

  it("constructs a valid MerkleProof", () => {
    const proof: MerkleProof = {
      leaf: "abc",
      index: 0,
      siblings: [],
      root: "def",
    };

    expect(proof.index).toBe(0);
  });
});
