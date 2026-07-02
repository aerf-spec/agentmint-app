// Multi-signer verification: reproduce ALL 12 conformance-vector expectations
// with the full verifier (issuer + parent + PDP + log inclusion), not just the
// signature layer — and prove the C-12 defense: a valid issuer signature alone
// cannot carry a HIGH-IMPACT receipt.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAerfReceipt,
  verifyAerfReceipt,
  counterSignAerfReceipt,
  signPdpTuple,
  contextHashSha256,
  type AerfVerifyOptions,
} from "../src/receipt-aerf.js";
import { rawNumber, sha256Hex, canonicalBytes, type RawNumberLexeme } from "../src/kernel/canonical.js";
import { generateKeyPair, publicKeyToPem, privateKeyToPem, keyId } from "../src/kernel/sign.js";
import { computePolicyHash } from "../src/plan.js";
import { createPublicKey } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const vectorsDir = join(here, "vectors");

// ── Number-preserving JSON reader (same as the conformance suite) ───
type Preserved =
  | null
  | boolean
  | string
  | RawNumberLexeme
  | Preserved[]
  | { [k: string]: Preserved };

function parsePreserving(src: string): Preserved {
  let i = 0;
  const skipWs = () => {
    while (i < src.length && (src[i] === " " || src[i] === "\n" || src[i] === "\r" || src[i] === "\t")) i++;
  };
  function value(): Preserved {
    skipWs();
    const c = src[i];
    if (c === "{") return obj();
    if (c === "[") return arr();
    if (c === '"') return str();
    if (c === "t") { i += 4; return true; }
    if (c === "f") { i += 5; return false; }
    if (c === "n") { i += 4; return null; }
    return num();
  }
  function obj(): { [k: string]: Preserved } {
    i++; const out: { [k: string]: Preserved } = {}; skipWs();
    if (src[i] === "}") { i++; return out; }
    for (;;) {
      skipWs(); const k = str(); skipWs(); i++;
      out[k] = value(); skipWs();
      if (src[i] === ",") { i++; continue; }
      i++; return out;
    }
  }
  function arr(): Preserved[] {
    i++; const out: Preserved[] = []; skipWs();
    if (src[i] === "]") { i++; return out; }
    for (;;) {
      out.push(value()); skipWs();
      if (src[i] === ",") { i++; continue; }
      i++; return out;
    }
  }
  function str(): string {
    let out = ""; i++;
    while (src[i] !== '"') {
      if (src[i] === "\\") {
        const e = src[i + 1];
        if (e === "u") {
          out += String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16));
          i += 6;
        } else {
          out += ({ '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" } as Record<string, string>)[e!];
          i += 2;
        }
      } else {
        out += src[i++];
      }
    }
    i++; return out;
  }
  function num(): RawNumberLexeme {
    const start = i;
    while (i < src.length && /[-+0-9.eE]/.test(src[i]!)) i++;
    return rawNumber(src.slice(start, i));
  }
  return value();
}

interface ManifestEntry {
  dir: string;
  outcome: "PASS" | "FAIL" | "KNOWN_LIMIT";
  reason_code: string;
}

const manifest: ManifestEntry[] = JSON.parse(readFileSync(join(vectorsDir, "manifest.json"), "utf-8"));

function loadReceipts(dir: string): Record<string, unknown>[] {
  const single = join(dir, "receipt.json");
  if (existsSync(single)) {
    return [parsePreserving(readFileSync(single, "utf-8")) as Record<string, unknown>];
  }
  return readdirSync(join(dir, "receipts"))
    .sort()
    .map((f) => parsePreserving(readFileSync(join(dir, "receipts", f), "utf-8")) as Record<string, unknown>);
}

function keysFor(dir: string): AerfVerifyOptions {
  const opts: AerfVerifyOptions = {
    issuerPublicKey: readFileSync(join(dir, "public_key.pem"), "utf-8"),
  };
  const optional: Array<[string, keyof AerfVerifyOptions]> = [
    ["parent_key.pem", "parentPublicKey"],
    ["pdp_key.pem", "pdpPublicKey"],
    ["log_key.pem", "logPublicKey"],
  ];
  for (const [file, prop] of optional) {
    const p = join(dir, file);
    if (existsSync(p)) (opts as Record<string, unknown>)[prop] = readFileSync(p, "utf-8");
  }
  return opts;
}

describe("full verifier reproduces every conformance vector", () => {
  for (const v of manifest) {
    it(`${v.dir} → ${v.outcome}${v.reason_code ? ` (${v.reason_code})` : ""}`, () => {
      const dir = join(vectorsDir, v.dir);
      const opts = keysFor(dir);
      const results = loadReceipts(dir).map((r) => verifyAerfReceipt(r, opts));
      const failed = results.filter((r) => !r.ok);

      if (v.outcome === "FAIL") {
        expect(failed.length).toBeGreaterThan(0);
        expect(failed[0]!.failCategory).toBe(v.reason_code);
      } else {
        // PASS and KNOWN_LIMIT both verify cleanly (the limit is upstream of
        // the receipt layer — see vectors 11/12 notes).
        expect(failed, failed[0]?.failReason).toEqual([]);
      }
    });
  }
});

describe("C-12 defense: one compromised key cannot forge a HIGH-IMPACT claim", () => {
  function pemPair() {
    const { publicKey, privateKey } = generateKeyPair();
    return { pub: publicKeyToPem(publicKey), priv: privateKeyToPem(privateKey), keyId: keyId(publicKey) };
  }

  const issuer = pemPair();
  const parent = pemPair();
  const pdp = pemPair();
  const plan = { scope: ["disburse:*"], checkpoints: [], delegates_to: [] };
  const policyHash = computePolicyHash(plan as never);
  const context = { request: "disburse 9000 to vendor 42", amount: 9000 };
  const ctxHash = contextHashSha256(context);

  function issueHighImpact(overrides: { pdpSignature?: string; skipPdp?: boolean } = {}) {
    const pdpSig = overrides.skipPdp
      ? undefined
      : overrides.pdpSignature ?? signPdpTuple(ctxHash, true, policyHash, pdp.priv);
    const receipt = buildAerfReceipt(
      {
        planId: "plan-1",
        agent: "payments-agent",
        action: "disburse:vendor:42",
        inPolicy: true,
        policyReason: "matched scope disburse:*",
        evidence: { amount_micros: 9000000000, vendor: "42" },
        policyHash,
        impactTags: ["FINANCE-DISBURSEMENT"],
        contextHashSha256: ctxHash,
        ...(pdpSig ? { pdpSignature: pdpSig, pdpKeyId: pdp.keyId } : {}),
      },
      { issuerPrivateKey: issuer.priv },
    ) as unknown as Record<string, unknown>;
    return receipt;
  }

  const fullOpts: AerfVerifyOptions = {
    issuerPublicKey: issuer.pub,
    parentPublicKey: parent.pub,
    pdpPublicKey: pdp.pub,
  };

  it("accepts issuer + parent + PDP all present and valid", () => {
    const receipt = counterSignAerfReceipt(issueHighImpact(), parent.priv);
    const res = verifyAerfReceipt(receipt, fullOpts);
    expect(res.ok, res.failReason).toBe(true);
    expect(res.hasImpact).toBe(true);
    expect(res.parent).toBe("passed");
    expect(res.pdp).toBe("passed");
  });

  it("REJECTS a valid issuer signature with the parent counter-sign missing", () => {
    const res = verifyAerfReceipt(issueHighImpact(), fullOpts);
    expect(res.issuerOk).toBe(true); // the compromised key did its part…
    expect(res.ok).toBe(false); //     …and it is not enough.
    expect(res.failCategory).toBe("parent_signature");
  });

  it("REJECTS a valid issuer signature with the PDP signature missing", () => {
    const receipt = counterSignAerfReceipt(issueHighImpact({ skipPdp: true }), parent.priv);
    const res = verifyAerfReceipt(receipt, fullOpts);
    expect(res.issuerOk).toBe(true);
    expect(res.ok).toBe(false);
    expect(res.failCategory).toBe("pdp_signature");
  });

  it("REJECTS an invalid PDP signature (verdict signed for a different context)", () => {
    // PDP signed in_policy=true for a DIFFERENT context hash — split-context attack.
    const otherCtx = contextHashSha256({ request: "harmless read" });
    const forged = issueHighImpact({
      pdpSignature: signPdpTuple(otherCtx, true, policyHash, pdp.priv),
    });
    const receipt = counterSignAerfReceipt(forged, parent.priv);
    const res = verifyAerfReceipt(receipt, fullOpts);
    expect(res.ok).toBe(false);
    expect(res.failCategory).toBe("pdp_signature");
  });

  it("REJECTS a parent counter-signature over different content than the issuer signed", () => {
    const receipt = counterSignAerfReceipt(issueHighImpact(), parent.priv);
    // Mutate a signed field after counter-signing: issuer check fails first
    // (ratchet property — parent attests to exactly the issuer-signed bytes).
    const mutated = { ...receipt, in_policy: false };
    const res = verifyAerfReceipt(mutated, fullOpts);
    expect(res.ok).toBe(false);
  });
});

describe("contextHashSha256 (SPEC §5.1 numbers-as-strings)", () => {
  it("encodes numeric values as strings before hashing", () => {
    expect(contextHashSha256({ amount: 9000 })).toBe(
      sha256Hex(canonicalBytes({ amount: "9000" })),
    );
    // A context that differs only in number representation hashes identically
    // when the lexemes normalize to the same string.
    expect(contextHashSha256({ a: 1, b: [2, 3] })).toBe(
      sha256Hex(canonicalBytes({ a: "1", b: ["2", "3"] })),
    );
  });

  it("agrees between a JS number and its verbatim lexeme", () => {
    expect(contextHashSha256({ n: rawNumber("42") })).toBe(contextHashSha256({ n: 42 }));
  });
});

describe("vector 06 sanity: our counter-sign helper matches the vector's parent signature semantics", () => {
  it("re-verifies vector 06's parent signature over the stripped payload", () => {
    const dir = join(vectorsDir, "06-impact-with-parent-sig");
    const receipt = loadReceipts(dir)[0]!;
    const res = verifyAerfReceipt(receipt, keysFor(dir));
    expect(res.ok, res.failReason).toBe(true);
    expect(res.parent).toBe("passed");
    expect(res.pdp).toBe("passed");
    // The parent key id recorded on the wire matches the PEM in the vector.
    expect(receipt["parent_key_id"]).toBe(
      keyId(createPublicKey(readFileSync(join(dir, "parent_key.pem"), "utf-8"))),
    );
  });
});
