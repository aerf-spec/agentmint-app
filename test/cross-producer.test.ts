/**
 * Cross-producer canonicalization compatibility: TypeScript <-> Python.
 *
 * For the payload shapes AgentMint actually emits (ASCII keys/strings and
 * integers), the RFC 8785 / JCS canonical form is byte-identical to Python's
 * `json.dumps(obj, sort_keys=True, separators=(",", ":"))`. This test shells
 * out to the stdlib `python3` (no pynacl / no third-party packages) and asserts
 * byte equality with canonicalize(), pinning the compatibility we rely on for
 * receipts that get produced or verified across the two runtimes.
 */
import { spawnSync } from "node:child_process";
import { describe, it, expect } from "vitest";

import { canonicalize } from "../src/kernel/canonical";

const PY_CANON =
  'import json,sys; print(json.dumps(json.load(sys.stdin), sort_keys=True, separators=(",",":")))';

function pythonCanonical(value: unknown): string {
  const res = spawnSync("python3", ["-c", PY_CANON], {
    input: JSON.stringify(value),
    encoding: "utf8",
  });
  if (res.status !== 0) {
    throw new Error(`python3 failed: ${res.stderr ?? res.error?.message}`);
  }
  return res.stdout.replace(/\n$/, "");
}

const hasPython =
  spawnSync("python3", ["--version"], { encoding: "utf8" }).status === 0;

// ASCII-only, integers and strings (plus the nesting/ordering that exercises
// key sorting) — the shapes for which JCS === Python sorted-compact JSON.
const fixtures: Array<{ name: string; value: unknown }> = [
  {
    name: "flat object, keys out of order",
    value: { z: 1, a: "alpha", m: 2, b: "bravo" },
  },
  {
    name: "nested objects and integer/string arrays",
    value: {
      order_id: "A-1002",
      total_cents: 125000,
      items: ["sku-1", "sku-2", "sku-3"],
      customer: { name: "bob", id: 7, tier: "gold" },
    },
  },
  {
    name: "deep nesting with quotes and backslashes in strings",
    value: {
      b: 10,
      a: { d: 4, c: 3, note: 'he said "hi"\\bye' },
      e: ["p", "q", 1, 2],
      id: "rcpt_0007",
    },
  },
];

describe.skipIf(!hasPython)("canonicalize() matches python3 stdlib json", () => {
  for (const { name, value } of fixtures) {
    it(name, () => {
      expect(canonicalize(value)).toBe(pythonCanonical(value));
    });
  }
});

// Make the reason visible in CI logs if python3 is missing rather than passing
// silently with zero assertions.
describe.runIf(!hasPython)("cross-producer (skipped)", () => {
  it.skip("python3 not available on this runner", () => {});
});
