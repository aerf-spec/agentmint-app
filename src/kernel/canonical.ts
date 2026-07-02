/**
 * @kernel
 * Part of the AgentMint verification kernel. Canonical JSON serialization
 * (RFC 8785 / JCS profile) plus SHA hashing — the byte-exact foundation that
 * receipt signing and verification are built on. Must never be made optional,
 * bypassable, or relocated to experimental/. Kernel modules must not import
 * from experimental/.
 *
 * Two canonicalization audiences share one encoder:
 *
 *   1. Producer path — plain JavaScript values. Numbers must be integers;
 *      a finite non-integer (or a non-finite number) throws a TypeError that
 *      names the JSON path of the offending value. This keeps every receipt
 *      the SDK *emits* free of float ambiguity.
 *
 *   2. Verifier path — records read back from bytes another producer signed
 *      (Go / Python), whose numbers may carry lexemes the SDK would never
 *      emit itself (e.g. `1250.0`). To verify such a record the original
 *      number lexeme must be replayed verbatim, not re-serialized. A caller
 *      represents a verbatim number as a plain object carrying the well-known
 *      global symbol `Symbol.for("aerf.canonical.rawNumber")` whose value is
 *      the exact source lexeme string. canonicalize() emits that lexeme
 *      unquoted and unmodified. A number-preserving JSON reader (see the
 *      conformance test and test/aerf-verify-poc.mjs) produces these wrappers.
 */

import { createHash } from "node:crypto";

/**
 * Well-known symbol tagging a verbatim JSON number lexeme. A value shaped
 * `{ [RAW_NUMBER]: "1250.0" }` is emitted by canonicalize() as the raw lexeme.
 * Declared via Symbol.for so independent readers (the .mjs oracle, the test
 * harness) can reference the identical symbol without importing this module.
 */
const RAW_NUMBER: unique symbol = Symbol.for("aerf.canonical.rawNumber") as never;

type RawNumberBox = { [RAW_NUMBER]: string };

function isRawNumber(value: object): value is RawNumberBox {
  return RAW_NUMBER in value;
}

/**
 * Serialize a value to its canonical JSON string (RFC 8785 / JCS):
 *   - object keys sorted by UTF-16 code unit, no insignificant whitespace,
 *     `,` / `:` separators;
 *   - strings escaped per ECMAScript JSON.stringify (JCS defers to it);
 *   - integers rendered shortest-form; `-0` normalized to `0`;
 *   - verbatim-number boxes (see RAW_NUMBER) emitted as their source lexeme.
 *
 * Throws TypeError (naming the JSON path) on a finite non-integer number, a
 * non-finite number, `undefined`, a function/symbol, or any non-plain object.
 */
export function canonicalize(value: unknown): string {
  return encode(value, "$");
}

/** UTF-8 bytes of {@link canonicalize}. The unit signing/hashing operates on. */
export function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(canonicalize(value), "utf8");
}

/** Lowercase hex SHA-256 of a buffer. */
export function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Lowercase hex SHA-512 of a buffer. */
export function sha512Hex(buf: Buffer): string {
  return createHash("sha512").update(buf).digest("hex");
}

function encode(value: unknown, path: string): string {
  if (value === null) return "null";

  const t = typeof value;

  if (t === "boolean") return value ? "true" : "false";

  if (t === "string") return JSON.stringify(value);

  if (t === "number") {
    const n = value as number;
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      throw new TypeError(
        `canonicalize(): non-integer number at JSON path ${path} (value: ${String(n)}). ` +
          `Producer receipts must use integers; verify float-bearing records via a raw-number lexeme.`,
      );
    }
    return Object.is(n, -0) ? "0" : String(n);
  }

  if (t === "object") {
    const obj = value as object;

    if (isRawNumber(obj)) {
      // Verbatim lexeme — replay exactly the bytes that were originally signed.
      return String(obj[RAW_NUMBER]);
    }

    if (Array.isArray(obj)) {
      const parts = obj.map((entry, i) => encode(entry, `${path}[${i}]`));
      return `[${parts.join(",")}]`;
    }

    const record = obj as Record<string, unknown>;
    const keys = Object.keys(record).sort(); // UTF-16 code-unit order (JCS)
    const parts = keys.map((key) => {
      const child = record[key];
      if (child === undefined) {
        throw new TypeError(
          `canonicalize(): undefined value at JSON path ${path}.${key}`,
        );
      }
      return `${JSON.stringify(key)}:${encode(child, `${path}.${key}`)}`;
    });
    return `{${parts.join(",")}}`;
  }

  // undefined, function, symbol, bigint — not representable in canonical JSON.
  throw new TypeError(
    `canonicalize(): unsupported ${t} at JSON path ${path}`,
  );
}
