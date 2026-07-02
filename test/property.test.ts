// Property tests: for randomized receipts, mutating ANY signed field breaks
// verification and mutating any post-issuance field does not; the
// canonicalizer byte-matches python3 json.dumps on random nested structures;
// parallel calls through one harden() instance never corrupt the chain.
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import {
  buildAerfReceipt,
  verifyAerfReceipt,
  counterSignAerfReceipt,
  type AerfReceiptInit,
} from "../src/receipt-aerf.js";
import { canonicalize } from "../src/kernel/canonical.js";
import {
  generateKeyPair,
  publicKeyToPem,
  privateKeyToPem,
  POST_ISSUANCE_FIELDS,
} from "../src/kernel/sign.js";
import { harden } from "../src/experimental/harden.js";

// Deterministic PRNG (mulberry32) — reproducible failures.
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ASCII = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-:./";
function randString(r: () => number, maxLen = 12): string {
  const len = 1 + Math.floor(r() * maxLen);
  let out = "";
  for (let i = 0; i < len; i++) out += ASCII[Math.floor(r() * ASCII.length)];
  return out;
}

function randValue(r: () => number, depth: number): unknown {
  const roll = r();
  if (depth <= 0 || roll < 0.45) {
    const scalar = r();
    if (scalar < 0.4) return randString(r);
    if (scalar < 0.7) return Math.floor(r() * 2_000_000) - 1_000_000;
    if (scalar < 0.8) return true;
    if (scalar < 0.9) return false;
    return null;
  }
  if (roll < 0.7) {
    return Array.from({ length: Math.floor(r() * 4) }, () => randValue(r, depth - 1));
  }
  const obj: Record<string, unknown> = {};
  const keys = 1 + Math.floor(r() * 4);
  for (let i = 0; i < keys; i++) obj[randString(r, 8)] = randValue(r, depth - 1);
  return obj;
}

function randReceiptInit(r: () => number): AerfReceiptInit {
  return {
    planId: `plan-${randString(r, 8)}`,
    agent: `agent-${randString(r, 8)}`,
    action: `do:${Math.floor(r() * 1000)}`,
    inPolicy: r() < 0.5,
    policyReason: randString(r, 20),
    evidence: randValue(r, 2) instanceof Object && !Array.isArray(randValue(r, 0))
      ? ({ data: randValue(r, 2), n: Math.floor(r() * 100) } as Record<string, unknown>)
      : { data: randString(r), n: Math.floor(r() * 100) },
    ...(r() < 0.5 ? { previousReceiptHash: "f".repeat(64) } : {}),
    ...(r() < 0.5 ? { policyHash: "a".repeat(64) } : {}),
    ...(r() < 0.5 ? { outputHash: "b".repeat(64) } : {}),
    ...(r() < 0.5 ? { sessionId: randString(r) } : {}),
    ...(r() < 0.3 ? { sessionEscalation: randString(r) } : {}),
    ...(r() < 0.3 ? { reasoningHash: "c".repeat(64) } : {}),
    ...(r() < 0.3 ? { mode: "shadow", originalVerdict: r() < 0.5 } : {}),
    ...(r() < 0.5 ? { planSignature: "d".repeat(128) } : {}),
    ...(r() < 0.3 ? { seq: 1 + Math.floor(r() * 100) } : {}),
  };
}

/** Mutate one signed value minimally: flip a char, a bit, or a boolean. */
function mutate(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.length === 0) return "x";
    const ch = value[0] === "z" ? "a" : "z";
    return ch + value.slice(1);
  }
  if (typeof value === "number") return value + 1;
  if (typeof value === "boolean") return !value;
  if (value === null) return 0;
  if (Array.isArray(value)) return [...value, "injected"];
  if (typeof value === "object") return { ...(value as object), __injected: 1 };
  return "mutated";
}

describe("property: signed-field mutation always breaks verification", () => {
  const r = prng(0xa5e12f);
  const issuer = generateKeyPair();
  const issuerPem = { pub: publicKeyToPem(issuer.publicKey), priv: privateKeyToPem(issuer.privateKey) };
  const parent = generateKeyPair();

  const POST_ISSUANCE = new Set<string>(POST_ISSUANCE_FIELDS);

  it("holds for 25 randomized receipts across every present field", () => {
    for (let n = 0; n < 25; n++) {
      const receipt = buildAerfReceipt(randReceiptInit(r), {
        issuerPrivateKey: issuerPem.priv,
      }) as unknown as Record<string, unknown>;
      const baseline = verifyAerfReceipt(receipt, { issuerPublicKey: issuerPem.pub });
      expect(baseline.ok, `receipt ${n}: ${baseline.failReason}`).toBe(true);

      for (const field of Object.keys(receipt)) {
        if (POST_ISSUANCE.has(field)) continue;
        const mutated = { ...receipt, [field]: mutate(receipt[field]) };
        const res = verifyAerfReceipt(mutated, { issuerPublicKey: issuerPem.pub });
        expect(res.ok, `receipt ${n}: mutating signed field '${field}' must fail`).toBe(false);
      }
    }
  });

  it("post-issuance mutation never disturbs the issuer signature", () => {
    for (let n = 0; n < 10; n++) {
      const receipt = buildAerfReceipt(randReceiptInit(r), {
        issuerPrivateKey: issuerPem.priv,
      }) as unknown as Record<string, unknown>;
      const withPost = {
        ...counterSignAerfReceipt(receipt, privateKeyToPem(parent.privateKey)),
        timestamp: { tsa_url: "https://tsa.example", digest_hex: "ab".repeat(16) },
      };
      // Mutate every post-issuance field; the issuer check must keep passing.
      const mutated = {
        ...withPost,
        timestamp: { tsa_url: "https://other.example", digest_hex: "cd".repeat(16) },
        parent_signature: "0".repeat(128),
        parent_key_id: "deadbeefdeadbeef",
        log_inclusion_proof: { log_id: "x" },
      };
      const res = verifyAerfReceipt(mutated, { issuerPublicKey: issuerPem.pub });
      // Parent sig is garbage — but that is a PARENT failure, never an issuer one.
      expect(res.issuerOk).toBe(true);
      const issuerOnly = verifyAerfReceipt(
        { ...mutated, parent_signature: undefined, parent_key_id: undefined, log_inclusion_proof: undefined } as Record<string, unknown>,
        { issuerPublicKey: issuerPem.pub },
      );
      expect(issuerOnly.ok, issuerOnly.failReason).toBe(true);
    }
  });
});

describe("fuzz: canonicalizer vs python3 json.dumps", () => {
  const have = spawnSync("python3", ["--version"], { encoding: "utf-8" }).status === 0;

  it.skipIf(!have)("is byte-identical for 60 random nested structures", () => {
    const r = prng(0xc0ffee);
    const cases: unknown[] = Array.from({ length: 60 }, () => {
      const obj: Record<string, unknown> = {};
      const keys = 1 + Math.floor(r() * 6);
      for (let i = 0; i < keys; i++) obj[randString(r, 10)] = randValue(r, 3);
      return obj;
    });
    const py = spawnSync(
      "python3",
      [
        "-c",
        "import json,sys\ncases = json.load(sys.stdin)\nprint(json.dumps([json.dumps(c, sort_keys=True, separators=(',', ':')) for c in cases]))",
      ],
      { input: JSON.stringify(cases), encoding: "utf-8" },
    );
    expect(py.status, py.stderr).toBe(0);
    const expected = JSON.parse(py.stdout) as string[];
    cases.forEach((c, i) => {
      expect(canonicalize(c), `case ${i}`).toBe(expected[i]);
    });
  });
});

describe("concurrency: parallel calls through one harden() instance", () => {
  it("50 interleaved async calls produce an intact, verifiable receipt chain", async () => {
    const { privateKey } = generateKeyPair();
    const tools = harden(
      {
        // Random real await points force interleaving across calls.
        work: async (params: unknown) => {
          await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 5)));
          return { done: true, got: params };
        },
        blockedTool: async () => "never",
      },
      {
        deny: ["blockedTool"],
        silent: true,
        signing: { privateKeyPem: privateKeyToPem(privateKey) },
      },
    );

    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        i % 5 === 0
          ? (tools as Record<string, (p: unknown) => Promise<unknown>>)["blockedTool"]!({ i })
          : (tools as Record<string, (p: unknown) => Promise<unknown>>)["work"]!({ i }),
      ),
    );

    const receipts = tools.__receipts();
    expect(receipts.length).toBe(50);
    // Monotonic 1..50 with no duplicates or gaps.
    expect(receipts.map((r) => r.seq)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    const verification = tools.__verifyReceipts();
    expect(verification.ok, verification.reason).toBe(true);
  });
});
