import { createHash } from "node:crypto";
import type { MerkleProof } from "./types.js";

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

type Primitive = null | boolean | number | string;
type Canonical = Primitive | Canonical[] | { [key: string]: Canonical };

function sortValue(value: unknown): Canonical {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sortValue(entry));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, sortValue(entry)]),
    );
  }

  throw new TypeError(`Unsupported value in canonicalize(): ${String(value)}`);
}

export function canonicalize(obj: unknown): string {
  return JSON.stringify(sortValue(obj));
}

export class MerkleTree {
  private leaves: string[] = [];
  private layers: string[][] = [];

  addLeaf(data: string): number {
    this.leaves.push(sha256(data));
    return this.leaves.length - 1;
  }

  build(): string {
    if (this.leaves.length === 0) {
      return sha256("");
    }

    let level = [...this.leaves];
    const empty = sha256("");

    while (level.length > 1 && (level.length & (level.length - 1)) !== 0) {
      level.push(empty);
    }

    if (level.length === 1) {
      level.push(empty);
    }

    this.layers = [level];

    while (level.length > 1) {
      const next: string[] = [];

      for (let i = 0; i < level.length; i += 2) {
        next.push(sha256(level[i]! + level[i + 1]!));
      }

      this.layers.push(next);
      level = next;
    }

    return level[0]!;
  }

  getProof(leafIndex: number): MerkleProof {
    if (this.layers.length === 0) {
      throw new Error("Call build() before getProof()");
    }

    const siblings: Array<{ hash: string; position: "left" | "right" }> = [];
    let idx = leafIndex;

    for (let level = 0; level < this.layers.length - 1; level += 1) {
      const isRight = idx % 2 === 1;
      const siblingIdx = isRight ? idx - 1 : idx + 1;
      const layer = this.layers[level]!;

      if (siblingIdx < layer.length) {
        siblings.push({
          hash: layer[siblingIdx]!,
          position: isRight ? "left" : "right",
        });
      }

      idx = Math.floor(idx / 2);
    }

    const root = this.layers[this.layers.length - 1]![0]!;
    return { leaf: this.leaves[leafIndex]!, index: leafIndex, siblings, root };
  }

  static verify(proof: MerkleProof): boolean {
    let hash = proof.leaf;

    for (const sibling of proof.siblings) {
      hash =
        sibling.position === "left"
          ? sha256(sibling.hash + hash)
          : sha256(hash + sibling.hash);
    }

    return hash === proof.root;
  }
}
