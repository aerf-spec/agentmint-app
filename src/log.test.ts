import { describe, expect, it } from "vitest";
import {
  blockResponse,
  createRunState,
  generateRunId,
  logEvent,
} from "./log.js";

const CHARSET = "abcdefghijklmnopqrstuvwxyz0123456789";

describe("generateRunId", () => {
  it("id_format", () => {
    const id = generateRunId();
    expect(id.startsWith("amr_")).toBe(true);
    expect(id.length).toBe(12);
    expect([...id.slice(4)].every((c) => CHARSET.includes(c))).toBe(true);
  });

  it("id_unique", () => {
    const ids = Array.from({ length: 100 }, () => generateRunId());
    expect(new Set(ids).size).toBe(100);
  });
});

describe("createRunState", () => {
  it("state_shape", () => {
    const state = createRunState({});
    expect(state.status).toBe("running");
    expect(state.totalCost).toBe(0);
    expect(state.callCount).toBe(0);
    expect(state.executedCount).toBe(0);
    expect(state.blockedCount).toBe(0);
    expect(state.heldCount).toBe(0);
    expect(state.skippedCount).toBe(0);
    expect(state.events).toEqual([]);
  });

  it("state_binds", () => {
    const state = createRunState({ bind: { patient_id: "PT-1" } });
    expect(state.boundValues.patient_id).toBe("PT-1");
  });
});

describe("logEvent", () => {
  it("event_pushes", () => {
    const state = createRunState({});
    const event = logEvent(state, "read_patient", {}, "allowed");
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toBe(event);
    expect(event.tool).toBe("read_patient");
  });

  it("event_redacts", () => {
    const state = createRunState({});
    const event = logEvent(
      state,
      "read_patient",
      { notes: "x".repeat(51) },
      "allowed",
    );
    expect(event.params.notes).toBe("[REDACTED]");
  });
});

describe("blockResponse", () => {
  it("block_response_shape", () => {
    expect(blockResponse("foo", "bar")).toEqual({
      error: true,
      tool: "foo",
      message: "bar",
    });
  });
});
