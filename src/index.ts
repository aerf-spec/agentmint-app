// AgentMint SDK — cryptographic receipts for agent actions.
//
// This is the public surface. It exposes only the wedge: wrap an agent action,
// get a signed receipt, verify it later. Optional guardrails (budget, learning,
// enforcement, adapters) live in ./experimental and are not exported here.

// receipt — build a signed, tamper-evident record of an agent action
export * from "./receipt.js";

// verify — check a receipt or a chain of receipts against its claims
export * from "./verify.js";

// gate — pre-flight approval check before an action runs
export * from "./gate.js";

// session — group receipts into an auditable, ordered session
export * from "./session.js";

// log — build run state and emit block/violation events
export * from "./log.js";

// merkle — hashing + Merkle tree used to chain and prove receipts
export * from "./merkle.js";

// jsonl — serialize/parse receipts as append-only JSONL evidence
export * from "./jsonl.js";

// types — shared type definitions for the SDK surface
export * from "./types.js";
