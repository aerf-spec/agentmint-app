# Contributing

## Setup

```bash
git clone https://github.com/aerf-spec/agentmint-sdk.git
cd agentmint-sdk
npm install
npm run build
npm test
```

## Try it locally

```bash
node dist/cli/entry.js demo a
node dist/cli/entry.js test --suite coding-agent
node dist/cli/entry.js --help
```

## Run against a local model

```bash
cd examples/lm-studio-benchmark
npm install
npx tsx run-baseline.ts
npx tsx run.ts
npx tsx analysis/compare.ts
```

Requires LM Studio, Ollama, or any OpenAI-compatible server on `localhost:1234`.

## Report results

Open an issue with your `compare.ts` output:
https://github.com/aerf-spec/agentmint-sdk/issues

Include: model name, how you ran it, what worked, what didn't.
