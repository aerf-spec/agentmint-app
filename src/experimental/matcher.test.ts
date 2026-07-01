import { describe, expect, it } from "vitest";
import { matches, matchesAny } from "./matcher.js";

describe("matches", () => {
  it("exact_match", () => {
    expect(matches("foo", "foo")).toBe(true);
  });

  it("exact_mismatch", () => {
    expect(matches("foo", "bar")).toBe(false);
  });

  it("wildcard_all", () => {
    expect(matches("anything", "*")).toBe(true);
  });

  it("prefix_hit", () => {
    expect(matches("delete_patient", "delete_*")).toBe(true);
  });

  it("prefix_miss", () => {
    expect(matches("read_patient", "delete_*")).toBe(false);
  });

  it("underscore_prefix", () => {
    expect(matches("read_patient_sud", "read_patient_*")).toBe(true);
  });

  it("no_partial", () => {
    expect(matches("delete_patient_record", "delete_patient")).toBe(false);
  });

  it("empty_pattern_no_match", () => {
    expect(matches("foo", "")).toBe(false);
  });
});

describe("matchesAny", () => {
  it("matchesAny_mixed", () => {
    expect(matchesAny("read_patient_imaging", ["delete_*", "read_patient_*"])).toBe(true);
  });
});
