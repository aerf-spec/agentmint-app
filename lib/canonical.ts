import { createHash } from "node:crypto";

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

function sortValue(value: unknown): CanonicalValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sortValue(entry));
  }

  if (typeof value === "object") {
    const sortedEntries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => [key, sortValue(nestedValue)]);

    return Object.fromEntries(sortedEntries);
  }

  throw new TypeError(`Unsupported value in canonicalize(): ${String(value)}`);
}

export function canonicalize(obj: unknown): string {
  return JSON.stringify(sortValue(obj));
}

export function canonicalizeToBuffer(obj: unknown): Buffer {
  return Buffer.from(canonicalize(obj), "utf8");
}

export function computeHash(obj: unknown): string {
  return createHash("sha256").update(canonicalizeToBuffer(obj)).digest("hex");
}
