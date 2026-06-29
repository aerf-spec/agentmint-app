# CLAUDE.md

## Project Overview

`agentmint` is a zero-runtime-dependency TypeScript SDK for AI agent guardrails.

Current constraints:
- Node `>=18`
- Dual ESM/CJS output via `tsup`
- No entries in `dependencies`
- Source lives under `src/`

## Important Files

- `src/types.ts`: single source of truth for SDK types
- `src/types.test.ts`: compile-level type coverage with Vitest
- `tsup.config.ts`: build config for ESM/CJS output
- `tsconfig.json`: strict NodeNext TypeScript config
- `package.json`: package exports, scripts, and devDependencies

## Development Rules

- Keep runtime dependencies at zero
- Prefer strict TypeScript and simple module boundaries
- Do not define shared SDK types outside `src/types.ts`
- Placeholder modules should remain `export {}`
- Preserve NodeNext-compatible imports such as `./types.js` in TypeScript files where needed

## Commands

```bash
npm install
npx tsc --noEmit
npm test
npm run build
npm run demo
```

## Expected Layout

```text
src/
  index.ts
  types.ts
  matcher.ts
  enforce.ts
  harden.ts
  receipt.ts
  redact.ts
  report.ts
  log.ts
  merkle.ts
  adapters/
  cli/
```

## Verification

Before wrapping up changes:
- Run `npx tsc --noEmit`
- Run `npm test`
- Run `npm run build` when package output or exports changed
