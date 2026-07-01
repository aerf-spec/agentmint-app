import { describe, expect, it } from "vitest";
import { redact } from "./redact.js";

describe("redact", () => {
  it("bound_kept", () => {
    expect(redact({ patient_id: "PT-4827" }, ["patient_id"])).toEqual({
      patient_id: "PT-4827",
    });
  });

  it("long_string", () => {
    expect(redact({ notes: "x".repeat(51) }, [])).toEqual({ notes: "[REDACTED]" });
  });

  it("object_redacted", () => {
    expect(redact({ data: { nested: true } }, [])).toEqual({ data: "[REDACTED]" });
  });

  it("array_redacted", () => {
    expect(redact({ items: [1, 2, 3] }, [])).toEqual({ items: "[REDACTED]" });
  });

  it("short_string", () => {
    expect(redact({ status: "active" }, [])).toEqual({ status: "active" });
  });

  it("number_kept", () => {
    expect(redact({ count: 5 }, [])).toEqual({ count: 5 });
  });

  it("boolean_kept", () => {
    expect(redact({ flag: true }, [])).toEqual({ flag: true });
  });

  it("no_mutation", () => {
    const original = { notes: "x".repeat(51), status: "active" };
    const snapshot = { ...original };
    redact(original, []);
    expect(original).toEqual(snapshot);
  });
});
