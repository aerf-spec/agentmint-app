/**
 * @kernel
 * AgentMint verification kernel — the always-on primitives the wedge is built on.
 *
 * The wedge (receipt/verify/gate) depends on these modules directly. They are
 * NOT part of the public SDK surface and NOT experimental: they are structural.
 * Rule: kernel modules never import from experimental/; features import kernel,
 * never the reverse.
 *
 * This barrel is the single import point for the kernel.
 */

// Spec parser — loads and normalizes agentmint.spec.yaml
export { loadSpec, loadSpecFromFile, parseYaml, resolveAction } from "./spec.js";

// Cross-reference engine — validates tool I/O against spec rules
export {
  matchPattern,
  validateInputCrossRefs,
  validateOutputCrossRefs,
  checkRequires,
} from "./cross-ref.js";

// Budget guardrails — pre-flight cost/usage enforcement
export {
  staticEstimate,
  estimateCallCost,
  resolveCostCap,
  resolveUsageCap,
  resolveBudget,
  guardrailsActive,
  checkBudgetGuardrails,
  validateGuardrails,
  roundUsd,
} from "./budget.js";
export type { BudgetDecision } from "./budget.js";

// Redaction — strips unbound sensitive params before they hit a receipt
export { redact } from "./redact.js";
