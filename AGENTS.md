# AGENTS.md

## The wedge

`agentmint` produces **cryptographic receipts for agent actions**: one-line
instrumentation at the tool boundary that yields tamper-evident, verifiable
evidence of what an agent did, when, and with what result. The wedge is
`receipt` + `verify` + `gate` — wrap an action → get a signed JSONL receipt →
an auditor verifies it later. Everything else supports or extends that.

Zero-runtime-dependency TypeScript SDK + CLI.

Current constraints:
- Node `>=18`
- Dual ESM/CJS output via `tsup`
- No entries in `dependencies`
- Source lives under `src/`

## Repo shape

- **`src/`** — the wedge and its direct supporting modules (below).
- **`src/kernel/`** — the always-on verification kernel the wedge depends on:
  `spec.ts` (YAML spec parser), `cross-ref.ts` (validates tool I/O against
  spec rules), `budget.ts` (pre-flight cost guardrails), `redact.ts` (strips
  unbound sensitive params). Marked `@kernel`; must never import from
  `experimental/` and are not part of the public SDK surface.
- **`src/experimental/`** — future product lines kept out of the wedge:
  `harden.ts` (one-line auto-wrapper), `enforce.ts`, `breakers.ts`, `learn.ts`,
  `report.ts`, `matcher.ts`, `test-runner.ts`, `adapters/` (OpenAI, Anthropic,
  LangChain, Vercel, Raw, Generic), `suites/`.
- **`src/cli/`** — CLI commands (see below).

## Canonical files (read in this order)

1. `src/types.ts` — single source of truth for all SDK types
2. `src/session.ts` — session store for cross-tool I/O tracking
3. `src/log.ts` — run state + block/violation event emission
4. `src/merkle.ts` — hashing + Merkle tree for chaining receipts
5. `src/jsonl.ts` — JSONL receipt emitter + parser
6. `src/receipt.ts` — builds the signed `AERFRecord`
7. `src/verify.ts` — verifies a receipt / change set against a spec
8. `src/gate.ts` — pre-flight human approval with a hash chain
9. `src/index.ts` — public surface; exports only the wedge

## Commands

```bash
npm install
npx tsc --noEmit
npm test
npm run build
npm run demo
tsx --test tests/integration.test.ts  # full rogue agent test suite
```

## CLI

```bash
agentmint demo [1|2|3|a]    # run demo scenarios
agentmint init [--example refund|coding|data]  # generate spec
agentmint watch              # real-time validation
agentmint ci                 # CI gating (exit 0/1)
agentmint diff f1 f2         # compare runs
```

## Verification

Before wrapping up changes:
- Run `npx tsc --noEmit`
- Run `npm test`
- Run `tsx --test tests/integration.test.ts`
- Run `npm run build` when package output or exports changed
