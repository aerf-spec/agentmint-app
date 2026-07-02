// AERF conformance oracle — verify all vectors in pure Node (node:crypto only).
// Location: commit at test/aerf-verify-poc.mjs with vectors at test/vectors/.
// Usage: node test/aerf-verify-poc.mjs [vectorsDir]
// NEVER MODIFY THIS FILE — it is the acceptance oracle for the TS port.
//
// Semantics (matching verifiers/go/internal/aerf): JCS canonicalization with
// number lexemes replayed verbatim from source bytes, strip post-issuance
// fields, Ed25519 over the canonical payload.

import { createPublicKey, verify as edVerify } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Number-preserving JSON parse ────────────────────────────────────
// JS cannot round-trip 1250.0 through JSON.parse → JSON.stringify (it
// becomes 1250). Like Go's json.Number, we re-tokenize the source and
// keep every number's original lexeme.
function parsePreserving(src) {
  let i = 0;
  const ws = () => { while (i < src.length && /[\s]/.test(src[i])) i++; };
  function value() {
    ws();
    const c = src[i];
    if (c === "{") return obj();
    if (c === "[") return arr();
    if (c === '"') return str();
    if (c === "t") { i += 4; return true; }
    if (c === "f") { i += 5; return false; }
    if (c === "n") { i += 4; return null; }
    return num();
  }
  function obj() {
    i++; const out = new Map(); ws();
    if (src[i] === "}") { i++; return out; }
    for (;;) {
      ws(); const k = str(); ws(); i++; // ':'
      out.set(k, value()); ws();
      if (src[i] === ",") { i++; continue; }
      i++; return out; // '}'
    }
  }
  function arr() {
    i++; const out = []; ws();
    if (src[i] === "]") { i++; return out; }
    for (;;) {
      out.push(value()); ws();
      if (src[i] === ",") { i++; continue; }
      i++; return out; // ']'
    }
  }
  function str() {
    let out = ""; i++; // opening quote
    while (src[i] !== '"') {
      if (src[i] === "\\") {
        const e = src[i + 1];
        if (e === "u") { out += String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16)); i += 6; }
        else { out += ({ '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" })[e]; i += 2; }
      } else { out += src[i++]; }
    }
    i++; return out;
  }
  function num() {
    const start = i;
    while (i < src.length && /[-+0-9.eE]/.test(src[i])) i++;
    return { __num: src.slice(start, i) }; // verbatim lexeme, like json.Number
  }
  return value();
}

// ── JCS emit (RFC 8785 §3.2.2.2 escaping, raw UTF-8 otherwise) ─────
function esc(s) {
  let out = '"';
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\b") out += "\\b";
    else if (ch === "\f") out += "\\f";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (code < 0x20) out += "\\u" + code.toString(16).padStart(4, "0");
    else out += ch;
  }
  return out + '"';
}
function canonical(v) {
  if (v === null) return "null";
  if (v === true) return "true";
  if (v === false) return "false";
  if (typeof v === "string") return esc(v);
  if (v && v.__num !== undefined) return v.__num; // verbatim number
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v instanceof Map) {
    const keys = [...v.keys()].sort();
    return "{" + keys.map((k) => esc(k) + ":" + canonical(v.get(k))).join(",") + "}";
  }
  throw new Error("unsupported type");
}

const POST_ISSUANCE = ["signature", "timestamp", "parent_signature", "parent_key_id", "log_inclusion_proof"];

function verifyReceipt(receiptPath, pubPath) {
  const raw = readFileSync(receiptPath, "utf-8");
  const r = parsePreserving(raw);
  const sigHex = r.get("signature");
  const stripped = new Map(r);
  for (const f of POST_ISSUANCE) stripped.delete(f);
  const payload = Buffer.from(canonical(stripped), "utf-8");
  const pub = createPublicKey(readFileSync(pubPath, "utf-8"));
  return edVerify(null, payload, pub, Buffer.from(sigHex, "hex"));
}

// ── Run every vector ────────────────────────────────────────────────
// Vectors dir: CLI arg, else ./vectors next to this file (i.e. test/vectors/).
const here = dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] ?? join(here, "vectors");
if (!existsSync(join(base, "manifest.json"))) {
  console.error(`No manifest.json in ${base}. Pass the vectors dir as an argument\n` +
    `or place vectors at ${join(here, "vectors")} (copy from the aerf repo's vectors/).`);
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(join(base, "manifest.json"), "utf-8"));
let pass = 0, fail = 0;
for (const v of manifest) {
  const dir = join(base, v.dir);
  const pub = join(dir, "public_key.pem");
  let results = [];
  if (existsSync(join(dir, "receipt.json"))) {
    results.push(verifyReceipt(join(dir, "receipt.json"), pub));
  } else if (existsSync(join(dir, "receipts"))) {
    for (const f of readdirSync(join(dir, "receipts")).sort()) {
      results.push(verifyReceipt(join(dir, "receipts", f), pub));
    }
  } else { continue; }
  const allValid = results.every(Boolean);
  const expectValid = !(v.outcome === "FAIL" && v.reason_code === "issuer_signature");
  const ok = allValid === expectValid;
  ok ? pass++ : fail++;
  console.log(`${ok ? "OK " : "BAD"}  ${v.dir}  (sig valid: ${allValid}, expected valid: ${expectValid})`);
}
console.log(`\n${pass} matched expectations, ${fail} mismatched`);
process.exit(fail === 0 ? 0 : 1);
