import { describe, expect, it } from "vitest";
import { canonicalize, MerkleTree } from "./merkle.js";

describe("canonicalize", () => {
  it("produces deterministic output regardless of key order", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });

  it("sorts nested objects recursively", () => {
    const result = canonicalize({ z: { b: 1, a: 2 }, a: 3 });

    expect(result).toBe('{"a":3,"z":{"a":2,"b":1}}');
  });

  it("throws on undefined", () => {
    expect(() => canonicalize({ x: undefined })).toThrow("Unsupported value");
  });
});

describe("MerkleTree", () => {
  it("single leaf verifies", () => {
    const tree = new MerkleTree();

    tree.addLeaf("event-0");
    tree.build();

    expect(MerkleTree.verify(tree.getProof(0))).toBe(true);
  });

  it("eight leaves each verify independently", () => {
    const tree = new MerkleTree();

    for (let i = 0; i < 8; i += 1) {
      tree.addLeaf(`event-${i}`);
    }

    tree.build();

    for (let i = 0; i < 8; i += 1) {
      expect(MerkleTree.verify(tree.getProof(i))).toBe(true);
    }
  });

  it("detects tampering", () => {
    const tree = new MerkleTree();

    tree.addLeaf("event-0");
    tree.build();

    const proof = tree.getProof(0);
    const tampered = { ...proof, leaf: "deadbeef" };

    expect(MerkleTree.verify(tampered)).toBe(false);
  });

  it("selective disclosure proves subset without revealing others", () => {
    const tree = new MerkleTree();

    for (let i = 0; i < 8; i += 1) {
      tree.addLeaf(`event-${i}`);
    }

    tree.build();

    const proof2 = tree.getProof(2);
    const proof5 = tree.getProof(5);

    expect(MerkleTree.verify(proof2)).toBe(true);
    expect(MerkleTree.verify(proof5)).toBe(true);
    expect(proof2.root).toBe(proof5.root);

    const allHashes2 = proof2.siblings.map((sibling) => sibling.hash);
    const allHashes5 = proof5.siblings.map((sibling) => sibling.hash);

    expect(allHashes2).not.toContain(proof5.leaf);
    expect(allHashes5).not.toContain(proof2.leaf);
  });

  it("same data produces same root", () => {
    const t1 = new MerkleTree();
    const t2 = new MerkleTree();

    for (let i = 0; i < 4; i += 1) {
      t1.addLeaf(`event-${i}`);
      t2.addLeaf(`event-${i}`);
    }

    expect(t1.build()).toBe(t2.build());
  });
});
