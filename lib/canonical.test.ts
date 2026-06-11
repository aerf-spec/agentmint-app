import { describe, expect, it } from "vitest";

import {
  canonicalize,
  canonicalizeToBuffer,
  computeHash,
  computeHashFromBuffer,
  prettyCanonicalize,
  prettyCanonicalizeToBuffer,
} from "@/lib/canonical";

describe("canonical", () => {
  it("sorts object keys recursively while preserving array order", () => {
    const value = {
      zebra: 1,
      alpha: {
        beta: true,
        alpha: [3, { z: 1, a: 2 }],
      },
    };

    expect(canonicalize(value)).toBe(
      '{"alpha":{"alpha":[3,{"a":2,"z":1}],"beta":true},"zebra":1}',
    );
  });

  it("returns utf-8 bytes for canonical data", () => {
    expect(canonicalizeToBuffer({ b: 1, a: 2 }).toString("utf8")).toBe('{"a":2,"b":1}');
  });

  it("renders stable pretty JSON from canonical ordering", () => {
    expect(prettyCanonicalize({ b: 1, a: { d: 4, c: 3 } })).toBe(
      '{\n  "a": {\n    "c": 3,\n    "d": 4\n  },\n  "b": 1\n}\n',
    );
    expect(prettyCanonicalizeToBuffer({ b: 1, a: 2 }).toString("utf8")).toBe(
      '{\n  "a": 2,\n  "b": 1\n}\n',
    );
  });

  it("computes a stable sha-256 hash from canonical bytes", () => {
    expect(computeHash({ b: 1, a: 2 })).toBe(
      "d3626ac30a87e6f7a6428233b3c68299976865fa5508e4267c5415c76af7a772",
    );
  });

  it("computes a stable sha-256 hash from arbitrary buffers", () => {
    expect(computeHashFromBuffer('{"a":1}\n')).toBe(
      "e346432021b04179518d9614f3560ccd71354a4ee101ddcb893d6959a9d6301c",
    );
  });

  it("throws on unsupported value types", () => {
    expect(() => canonicalize({ nope: undefined })).toThrow(
      "Unsupported value in canonicalize(): undefined",
    );
  });
});
