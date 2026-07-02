/**
 * @kernel
 * Part of the AgentMint verification kernel. Ed25519 key handling and the
 * detached-signature scheme that turns a canonical record into a tamper-
 * evident receipt. Must never be made optional, bypassable, or relocated to
 * experimental/. Kernel modules must not import from experimental/.
 *
 * Signature scheme ("stripped"):
 *   A notarized record carries five fields that are added *at or after*
 *   issuance and therefore cannot be part of what was signed — most obviously
 *   the signature itself. Signing and verification both remove these five
 *   POST-ISSUANCE fields, canonicalize what remains (see ./canonical), and
 *   sign/verify over those bytes. Ed25519 produces a detached signature; we
 *   carry it as lowercase hex.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as edSign,
  verify as edVerify,
  type KeyObject,
} from "node:crypto";

import { canonicalBytes } from "./canonical.js";

/**
 * The five post-issuance fields removed before canonicalization. They are
 * populated by the notary once the content is fixed, so they are excluded
 * from the signed bytes. Tampering with any *signed* field makes the
 * canonical bytes disagree with the signature and verification fails on
 * `issuer_signature`.
 */
export const STRIPPED_FIELDS: readonly string[] = [
  "issuer_signature",
  "issuer_key_id",
  "issuer_public_key",
  "issued_at",
  "record_hash",
];

export interface KeyPair {
  publicKey: KeyObject;
  privateKey: KeyObject;
}

/** Generate a fresh Ed25519 key pair. */
export function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { publicKey, privateKey };
}

/** Export a private key as PKCS#8 PEM. */
export function privateKeyToPem(priv: KeyObject): string {
  return priv.export({ type: "pkcs8", format: "pem" }) as string;
}

/** Load a private key from PKCS#8 PEM. */
export function privateKeyFromPem(pem: string): KeyObject {
  return createPrivateKey(pem);
}

/** Export a public key as SPKI PEM. */
export function publicKeyToPem(pub: KeyObject): string {
  return pub.export({ type: "spki", format: "pem" }) as string;
}

/** Load a public key from SPKI PEM. */
export function publicKeyFromPem(pem: string): KeyObject {
  return createPublicKey(pem);
}

/**
 * The raw 32-byte Ed25519 public key, unwrapped from its SPKI/DER envelope.
 * Read from the JWK `x` coordinate (base64url of the raw point).
 */
export function rawPublicKey(pub: KeyObject): Buffer {
  const jwk = pub.export({ format: "jwk" }) as { x?: string };
  if (!jwk.x) {
    throw new TypeError("rawPublicKey(): key is not an Ed25519 public key");
  }
  return Buffer.from(jwk.x, "base64url");
}

/**
 * Stable identifier for a public key: lowercase hex SHA-256 of the raw
 * 32-byte key. Deterministic and collision-resistant; independent of PEM
 * whitespace or DER framing.
 */
export function keyId(pub: KeyObject): string {
  return createHash("sha256").update(rawPublicKey(pub)).digest("hex");
}

/** Shallow copy of `obj` with the five post-issuance fields removed. */
function strip(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...obj };
  for (const field of STRIPPED_FIELDS) delete out[field];
  return out;
}

/**
 * Sign a record: strip post-issuance fields, canonicalize, Ed25519-sign the
 * bytes, return the detached signature as lowercase hex.
 */
export function signStripped(
  obj: Record<string, unknown>,
  priv: KeyObject,
): string {
  const bytes = canonicalBytes(strip(obj));
  return edSign(null, bytes, priv).toString("hex");
}

/**
 * Verify a record against a signer's public key (SPKI PEM) and a hex
 * signature: strip post-issuance fields, canonicalize, Ed25519-verify.
 * Returns false (never throws) on a malformed signature or key.
 */
export function verifyStripped(
  obj: Record<string, unknown>,
  pubPem: string,
  sigHex: string,
): boolean {
  try {
    const bytes = canonicalBytes(strip(obj));
    const pub = createPublicKey(pubPem);
    return edVerify(null, bytes, pub, Buffer.from(sigHex, "hex"));
  } catch {
    return false;
  }
}
