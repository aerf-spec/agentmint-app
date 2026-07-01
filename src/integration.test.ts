import { describe, expect, it } from "vitest";
import { buildRecord } from "./index.js";
import { harden } from "./experimental/harden.js";
import { AgentMintReport } from "./experimental/report.js";
import type { AERFRecord, AgentMintConfig } from "./index.js";

describe("integration", () => {
  it("full prior auth scenario", async () => {
    const mockTools = {
      check_eligibility: async (_p: Record<string, unknown>) => ({ eligible: true }),
      read_patient: async (_p: Record<string, unknown>) => ({ name: "Jane Doe" }),
      read_sud: async (_p: Record<string, unknown>) => ({ data: "protected" }),
      submit: async (_p: Record<string, unknown>) => ({ ref: "AUTH-001" }),
      delete_record: async (_p: Record<string, unknown>) => ({ deleted: true }),
    };

    let checkpointCalled = false;
    const config: AgentMintConfig = {
      bind: { patient_id: "PT-100" },
      allow: ["check_eligibility", "read_patient", "submit"],
      deny: ["delete_*", "read_sud"],
      require: ["check_eligibility"],
      checkpoint: ["submit"],
      retryLimit: 2,
      silent: true,
      onCheckpoint: async () => {
        checkpointCalled = true;
        return true;
      },
      costEstimator: () => 0.5,
    };

    const tools = harden(mockTools, config);
    const t = tools as any;

    const r1 = await t.check_eligibility({ patient_id: "PT-100" });
    expect(r1).toEqual({ eligible: true });

    const r2 = await t.read_patient({ patient_id: "PT-999" });
    expect(r2.error).toBe(true);
    expect(r2.message).toContain("PT-100");

    const r3 = await t.read_patient({ patient_id: "PT-100" });
    expect(r3).toEqual({ name: "Jane Doe" });

    const r4 = await t.read_sud({ patient_id: "PT-100" });
    expect(r4.error).toBe(true);

    const r5 = await t.delete_record({ patient_id: "PT-100" });
    expect(r5.error).toBe(true);

    const r6 = await t.submit({ patient_id: "PT-100" });
    expect(r6).toEqual({ ref: "AUTH-001" });
    expect(checkpointCalled).toBe(true);

    const state = t.__state();
    expect(state.executedCount).toBe(3);
    expect(state.blockedCount).toBe(3);
    expect(state.heldCount).toBe(1);

    const receipt = t.__receipt();
    expect(receipt).toContain("AgentMint");
    expect(receipt).toContain("PT-100");
    expect(state.status).toBe("completed");

    const record: AERFRecord = buildRecord(state, config);
    expect(record.version).toBe("0.1.0");
    expect(record.events.length).toBeGreaterThanOrEqual(6);

    const report = new AgentMintReport();
    report.addRun(state);
    const text = report.generate();
    expect(text).toContain("1 total");
    expect(text).toContain("bind violations");
  });

  it("shadow mode logs but does not block", async () => {
    const tools = harden(
      { foo: async () => ({ data: "secret" }) },
      { deny: ["foo"], mode: "shadow", silent: true },
    );
    const result = await (tools as any).foo();
    expect(result).toEqual({ data: "secret" });
    const events = (tools as any).__log();
    expect(events.some((event: any) => event.result === "blocked")).toBe(true);
  });

  it("zero config just logs", async () => {
    const tools = harden({ bar: async () => 42 }, { silent: true });
    const result = await (tools as any).bar();
    expect(result).toBe(42);
    const log = (tools as any).__log();
    expect(log).toHaveLength(1);
    expect(log[0].result).toBe("allowed");
  });
});
