/**
 * AERF conformance suite — reproduces every expectation in
 * test/vectors/manifest.json using ONLY the kernel modules
 * (src/kernel/canonical + src/kernel/sign) plus a small number-preserving JSON
 * reader defined here.
 *
 * Why the local reader: the vectors were signed over canonical bytes that
 * contain verbatim number lexemes (vector 01 carries `1250.0`). The producer
 * canonicalizer rejects non-integer numbers on purpose, so a record read back
 * with JSON.parse (which would turn `1250.0` into the JS number 1250, and then
 * re-serialize it as `1250`) could never reproduce the signed bytes. The reader
 * below preserves each number's source lexeme by wrapping it in the well-known
 * `{ [Symbol.for("aerf.canonical.rawNumber")]: "<lexeme>" }` box that
 * canonicalize() replays byte-for-byte. This mirrors test/aerf-verify-poc.mjs.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect } from "vitest";

import {
  canonicalBytes,
  sha256Hex,
} from "../src/kernel/canonical";
import {
  STRIPPED_FIELDS,
  keyId,
  publicKeyFromPem,
  rawPublicKey,
  verifyStripped,
} from "../src/kernel/sign";

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = Symbol.for("aerf.canonical.rawNumber");

type Json = unknown;

/** Recursive-descent JSON reader that preserves number lexemes verbatim. */
function parsePreservingNumbers(text: string): Json {
  let i = 0;
  const isDigit = (c: string) => c >= "0" && c <= "9";
  const ws = () => {
    while (i < text.length && " \t\n\r".includes(text[i]!)) i++;
  };
  const str = (): string => {
    const start = i;
    i++; // opening quote
    for (;;) {
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
    return JSON.parse(text.slice(start, i)) as string;
  };
  const num = (): Json => {
    const start = i;
    if (text[i] === "-") i++;
    while (isDigit(text[i]!)) i++;
    if (text[i] === ".") {
      i++;
      while (isDigit(text[i]!)) i++;
    }
    if (text[i] === "e" || text[i] === "E") {
      i++;
      if (text[i] === "+" || text[i] === "-") i++;
      while (isDigit(text[i]!)) i++;
    }
    return { [RAW]: text.slice(start, i) };
  };
  const value = (): Json => {
    ws();
    const c = text[i]!;
    if (c === "{") return obj();
    if (c === "[") return arr();
    if (c === '"') return str();
    if (c === "-" || isDigit(c)) return num();
    if (text.startsWith("true", i)) return (i += 4), true;
    if (text.startsWith("false", i)) return (i += 5), false;
    if (text.startsWith("null", i)) return (i += 4), null;
    throw new Error(`unexpected ${c} at ${i}`);
  };
  const obj = (): Record<string, Json> => {
    i++;
    const o: Record<string, Json> = {};
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
  const arr = (): Json[] => {
    i++;
    const a: Json[] = [];
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

function strip(record: Record<string, unknown>): Record<string, unknown> {
  const out = { ...record };
  for (const f of STRIPPED_FIELDS) delete out[f];
  return out;
}

interface Vector {
  id: string;
  description: string;
  expect: "verify" | "fail";
  fails_on?: string;
  record: Record<string, unknown>;
}

const manifest = parsePreservingNumbers(
  readFileSync(join(HERE, "vectors", "manifest.json"), "utf8"),
) as {
  signer: { public_key_pem: string; public_key_raw_hex: string; key_id: string };
  vectors: Vector[];
};

const pubPem = manifest.signer.public_key_pem;
const pub = publicKeyFromPem(pubPem);

describe("AERF signer identity", () => {
  it("raw public key is 32 bytes and matches the manifest", () => {
    const rp = rawPublicKey(pub);
    expect(rp.length).toBe(32);
    expect(rp.toString("hex")).toBe(manifest.signer.public_key_raw_hex);
  });

  it("key id is sha256 of the raw public key and matches the manifest", () => {
    expect(keyId(pub)).toBe(manifest.signer.key_id);
  });
});

describe("AERF conformance vectors", () => {
  it("manifest carries all 12 vectors", () => {
    expect(manifest.vectors).toHaveLength(12);
  });

  for (const vec of manifest.vectors) {
    it(`vector ${vec.id} — ${vec.description}`, () => {
      const rec = vec.record;

      // record_hash is the SHA-256 of the canonical stripped record.
      const recomputed = sha256Hex(canonicalBytes(strip(rec)));
      expect(recomputed).toBe(rec.record_hash);

      const verified = verifyStripped(
        rec,
        pubPem,
        rec.issuer_signature as string,
      );

      if (vec.expect === "verify") {
        expect(verified).toBe(true);
      } else {
        // Tamper vectors: a signed field was altered, so verification fails.
        expect(verified).toBe(false);
        expect(vec.fails_on).toBe("issuer_signature");
      }
    });
  }
});
