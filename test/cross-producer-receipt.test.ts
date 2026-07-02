// Cross-producer AERF receipt check: build the SAME logical receipt in TS
// (src/receipt-aerf.ts) and in the Python reference producer
// (.vendor/agentmint-python agentmint.notary.NotarisedReceipt), from the same
// Ed25519 seed, and assert:
//   1. identical canonical signable bytes,
//   2. identical signatures (Ed25519 is deterministic), and
//   3. each producer's receipt verifies under the other's verifier.
// Skips gracefully when python3 + pynacl + .vendor are unavailable.
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { buildAerfSignable, type AerfReceiptInit } from "../src/receipt-aerf.js";
import { canonicalize } from "../src/kernel/canonical.js";
import { keyId, signStripped, verifyStripped, publicKeyToPem } from "../src/kernel/sign.js";

const VENDOR = ".vendor/agentmint-python";

function pythonProducerAvailable(): boolean {
  if (!existsSync(VENDOR)) return false;
  const r = spawnSync("python3", ["-c", "import nacl"], { encoding: "utf-8" });
  return r.status === 0;
}

const SEED_HEX = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";

/** Ed25519 private key from a raw 32-byte seed (PKCS8 DER, RFC 8410). */
function keyFromSeed(seedHex: string) {
  const der = Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    Buffer.from(seedHex, "hex"),
  ]);
  return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
}

const PY_SCRIPT = `
import sys, json, hashlib
sys.path.insert(0, ${JSON.stringify(VENDOR)})
from agentmint.notary import NotarisedReceipt, _canonical_json, _sign, _derive_key_id
from nacl.signing import SigningKey

spec = json.load(sys.stdin)
key = SigningKey(bytes.fromhex(spec["seed_hex"]))
f = spec["fields"]
evidence = f["evidence"]
evidence_hash = hashlib.sha512(_canonical_json(evidence)).hexdigest()
r = NotarisedReceipt(
    id=f["id"],
    plan_id=f["plan_id"],
    agent=f["agent"],
    action=f["action"],
    in_policy=f["in_policy"],
    policy_reason=f["policy_reason"],
    evidence_hash=evidence_hash,
    evidence=evidence,
    observed_at=f["observed_at"],
    signature="",
    previous_receipt_hash=f.get("previous_receipt_hash"),
    plan_signature=f.get("plan_signature", ""),
    key_id=_derive_key_id(key.verify_key),
    policy_hash=f.get("policy_hash", ""),
    output_hash=f.get("output_hash", ""),
    session_id=f.get("session_id", ""),
    session_trajectory=tuple(f.get("session_trajectory", [])),
    session_escalation=f.get("session_escalation"),
    reasoning_hash=f.get("reasoning_hash"),
    mode=f.get("mode", "enforce"),
    original_verdict=f.get("original_verdict"),
)
d = r.signable_dict()
sig = _sign(key, d)
print(json.dumps({
    "canonical": _canonical_json(d).decode(),
    "signature": sig,
    "key_id": _derive_key_id(key.verify_key),
    "receipt": {**d, "signature": sig},
}))
`;

interface PyResult {
  canonical: string;
  signature: string;
  key_id: string;
  receipt: Record<string, unknown>;
}

function runPythonProducer(fields: Record<string, unknown>): PyResult {
  const r = spawnSync("python3", ["-c", PY_SCRIPT], {
    input: JSON.stringify({ seed_hex: SEED_HEX, fields }),
    encoding: "utf-8",
  });
  if (r.status !== 0) throw new Error(`python producer failed: ${r.stderr}`);
  return JSON.parse(r.stdout) as PyResult;
}

/** The same logical receipt, expressed as TS builder init + Python field dict. */
function fixtures(): Array<{ name: string; init: AerfReceiptInit; py: Record<string, unknown> }> {
  const evidence = {
    tool: "submit-claim",
    claim_id: "CLM-9920",
    amount_micros: 1250000000,
    controls: ["E015", "D003"],
  };
  const observedAt = "2026-05-06T16:22:33.490443+00:00";
  const genesis: AerfReceiptInit = {
    id: "7473e179-001c-4d3b-94bc-d0f53dd6eec6",
    planId: "bc023208-ea24-410a-a280-ff36820e18a6",
    agent: "claims-agent",
    action: "submit:claim:CLM-9920",
    inPolicy: true,
    policyReason: "matched scope submit:claim:*",
    evidence,
    observedAt,
  };
  const trajectory = [
    { action: "read:claims", agent: "claims-agent", in_policy: true, observed_at: observedAt },
    { action: "submit:claim:CLM-9920", agent: "claims-agent", in_policy: false, observed_at: observedAt },
  ];
  const full: AerfReceiptInit = {
    ...genesis,
    id: "0b8532b9-13a6-45f4-9ce7-2d3f5f1c9b11",
    inPolicy: false,
    policyReason: "matched checkpoint submit:claim:*",
    previousReceiptHash: "a".repeat(64),
    planSignature: "b".repeat(128),
    policyHash: "c".repeat(64),
    outputHash: "d".repeat(64),
    sessionId: "8d07720e-337e-4b4c-b92b-b3eccbc8c2e9",
    sessionTrajectory: trajectory,
    sessionEscalation: "denied:submit:*:3/3",
    reasoningHash: "e".repeat(64),
    mode: "shadow",
    originalVerdict: false,
  };
  const toPy = (init: AerfReceiptInit): Record<string, unknown> => ({
    id: init.id,
    plan_id: init.planId,
    agent: init.agent,
    action: init.action,
    in_policy: init.inPolicy,
    policy_reason: init.policyReason,
    evidence: init.evidence,
    observed_at: init.observedAt,
    ...(init.previousReceiptHash !== undefined && { previous_receipt_hash: init.previousReceiptHash }),
    ...(init.planSignature !== undefined && { plan_signature: init.planSignature }),
    ...(init.policyHash !== undefined && { policy_hash: init.policyHash }),
    ...(init.outputHash !== undefined && { output_hash: init.outputHash }),
    ...(init.sessionId !== undefined && { session_id: init.sessionId }),
    ...(init.sessionTrajectory !== undefined && { session_trajectory: init.sessionTrajectory }),
    ...(init.sessionEscalation !== undefined && { session_escalation: init.sessionEscalation }),
    ...(init.reasoningHash !== undefined && { reasoning_hash: init.reasoningHash }),
    ...(init.mode !== undefined && { mode: init.mode }),
    ...(init.originalVerdict !== undefined && { original_verdict: init.originalVerdict }),
  });
  return [
    { name: "genesis, minimal fields", init: genesis, py: toPy(genesis) },
    { name: "chained, every conditional field", init: full, py: toPy(full) },
  ];
}

describe("cross-producer AERF receipts (TS vs Python reference producer)", () => {
  const available = pythonProducerAvailable();
  const privateKey = keyFromSeed(SEED_HEX);
  const publicKeyPem = publicKeyToPem(createPublicKey(privateKey));

  for (const fx of fixtures()) {
    it.skipIf(!available)(`${fx.name}: canonical bytes are byte-identical`, () => {
      const py = runPythonProducer(fx.py);
      const signable = buildAerfSignable(fx.init, keyId(createPublicKey(privateKey)));
      expect(canonicalize(signable)).toBe(py.canonical);
    });

    it.skipIf(!available)(`${fx.name}: signatures are identical and mutually verifiable`, () => {
      const py = runPythonProducer(fx.py);
      const signable = buildAerfSignable(fx.init, py.key_id);
      const tsSignature = signStripped(signable, privateKey);
      // Ed25519 is deterministic: same key + same bytes ⇒ same signature.
      expect(tsSignature).toBe(py.signature);
      // The Python-signed receipt verifies under the TS verifier.
      expect(verifyStripped(py.receipt, publicKeyPem, py.signature)).toBe(true);
      // And a mutated Python receipt does not.
      expect(
        verifyStripped({ ...py.receipt, in_policy: !py.receipt["in_policy"] }, publicKeyPem, py.signature),
      ).toBe(false);
    });
  }

  it.skipIf(!available)("derives the same key_id from the same seed", () => {
    const py = runPythonProducer(fixtures()[0]!.py);
    expect(keyId(createPublicKey(privateKey))).toBe(py.key_id);
  });
});
