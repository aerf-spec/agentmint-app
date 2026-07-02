/**
 * AERF conformance oracle — standalone, zero-dependency (node:crypto + node:fs).
 *
 * This file is deliberately INDEPENDENT of the TypeScript kernel modules: it
 * re-implements the number-preserving JSON reader, the RFC 8785 / JCS canonical
 * form, and Ed25519 verification from scratch. Agreement between this oracle and
 * the vitest conformance suite (which drives the real src/kernel modules) is the
 * signal that both code paths compute the same bytes.
 *
 * Run:  node test/aerf-verify-poc.mjs   ->  prints "AERF conformance: 12/12"
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash, createPublicKey, verify as edVerify } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = Symbol.for("aerf.canonical.rawNumber");
const POST_ISSUANCE = [
  "issuer_signature",
  "issuer_key_id",
  "issuer_public_key",
  "issued_at",
  "record_hash",
];

/* ---- number-preserving JSON reader (mirrors the conformance test) ---------- */
function parsePreservingNumbers(text) {
  let i = 0;
  const isDigit = (c) => c >= "0" && c <= "9";
  const ws = () => {
    while (i < text.length && " \t\n\r".includes(text[i])) i++;
  };
  const str = () => {
    const start = i;
    i++; // opening quote
    while (true) {
      const ch = text[i];
      if (ch === undefined) throw new Error("unterminated string");
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === '"') {
        i++;
        break;
      }
      i++;
    }
    return JSON.parse(text.slice(start, i));
  };
  const num = () => {
    const start = i;
    if (text[i] === "-") i++;
    while (isDigit(text[i])) i++;
    if (text[i] === ".") {
      i++;
      while (isDigit(text[i])) i++;
    }
    if (text[i] === "e" || text[i] === "E") {
      i++;
      if (text[i] === "+" || text[i] === "-") i++;
      while (isDigit(text[i])) i++;
    }
    return { [RAW]: text.slice(start, i) }; // verbatim lexeme
  };
  const value = () => {
    ws();
    const c = text[i];
    if (c === "{") return obj();
    if (c === "[") return arr();
    if (c === '"') return str();
    if (c === "-" || isDigit(c)) return num();
    if (text.startsWith("true", i)) return (i += 4), true;
    if (text.startsWith("false", i)) return (i += 5), false;
    if (text.startsWith("null", i)) return (i += 4), null;
    throw new Error(`unexpected ${c} at ${i}`);
  };
  const obj = () => {
    i++;
    const o = {};
    ws();
    if (text[i] === "}") return i++, o;
    for (;;) {
      ws();
      const k = str();
      ws();
      if (text[i] !== ":") throw new Error("expected :");
      i++;
      o[k] = value();
      ws();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "}") return i++, o;
      throw new Error("expected , or }");
    }
  };
  const arr = () => {
    i++;
    const a = [];
    ws();
    if (text[i] === "]") return i++, a;
    for (;;) {
      a.push(value());
      ws();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "]") return i++, a;
      throw new Error("expected , or ]");
    }
  };
  const v = value();
  ws();
  return v;
}

/* ---- RFC 8785 / JCS canonical form (verbatim numbers) ---------------------- */
function canonicalize(v) {
  if (v === null) return "null";
  const t = typeof v;
  if (t === "boolean") return v ? "true" : "false";
  if (t === "string") return JSON.stringify(v);
  if (t === "number") return Object.is(v, -0) ? "0" : String(v);
  if (t === "object") {
    if (RAW in v) return String(v[RAW]);
    if (Array.isArray(v)) return "[" + v.map(canonicalize).join(",") + "]";
    const keys = Object.keys(v).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(v[k])).join(",") + "}";
  }
  throw new Error(`unsupported ${t}`);
}
const canonicalBytes = (v) => Buffer.from(canonicalize(v), "utf8");
const sha256Hex = (buf) => createHash("sha256").update(buf).digest("hex");

function strip(record) {
  const out = { ...record };
  for (const f of POST_ISSUANCE) delete out[f];
  return out;
}

function rawPublicKey(pem) {
  const jwk = createPublicKey(pem).export({ format: "jwk" });
  return Buffer.from(jwk.x, "base64url");
}
const keyId = (pem) => sha256Hex(rawPublicKey(pem));

function verifyStripped(record, pubPem, sigHex) {
  try {
    const bytes = canonicalBytes(strip(record));
    return edVerify(null, bytes, createPublicKey(pubPem), Buffer.from(sigHex, "hex"));
  } catch {
    return false;
  }
}

/* ---- run ------------------------------------------------------------------- */
const manifest = parsePreservingNumbers(
  readFileSync(join(HERE, "vectors", "manifest.json"), "utf8"),
);
// signer.* fields are strings; unwrap any raw-number boxes to plain strings.
const pubPem = manifest.signer.public_key_pem;
const declaredKeyId = manifest.signer.key_id;
const declaredRawHex = manifest.signer.public_key_raw_hex;

let pass = 0;
const total = manifest.vectors.length;
const failures = [];

// Signer-level checks (counted once, must hold for the suite to be sound).
const rp = rawPublicKey(pubPem);
if (rp.length !== 32) failures.push("signer: raw public key is not 32 bytes");
if (rp.toString("hex") !== declaredRawHex) failures.push("signer: raw hex mismatch");
if (keyId(pubPem) !== declaredKeyId) failures.push("signer: key_id mismatch");

for (const vec of manifest.vectors) {
  const rec = vec.record;
  const expectVerify = vec.expect === "verify";

  const recomputedHash = sha256Hex(canonicalBytes(strip(rec)));
  const hashOk = recomputedHash === rec.record_hash;

  const verified = verifyStripped(rec, pubPem, rec.issuer_signature);
  const verifyOk = verified === expectVerify;

  if (hashOk && verifyOk) {
    pass++;
  } else {
    failures.push(
      `vector ${vec.id}: hashOk=${hashOk} verifyOk=${verifyOk} ` +
        `(expected ${vec.expect}${vec.fails_on ? ` on ${vec.fails_on}` : ""})`,
    );
  }
}

for (const f of failures) console.error("  FAIL:", f);
console.log(`AERF conformance: ${pass}/${total}`);
process.exit(pass === total && failures.length === 0 ? 0 : 1);
