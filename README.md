# AgentMint

Tool-call enforcement for AI agents. One YAML spec defines what's allowed.
One line instruments your tools. Every decision logged.

## Quick start

npx @npmsai/agentmint demo a

## Install

npm install @npmsai/agentmint

## Instrument your agent (one line)

import { harden } from "@npmsai/agentmint";
const tools = harden(myTools);

## Add a spec

import { harden, loadSpec } from "@npmsai/agentmint";
const spec = loadSpec(`
version: "1.0"
tools:
  issue_refund:
    requires: [lookup_order]
    input:
      properties:
        amount:
          max_ref: lookup_order.output.total
  delete_account:
    action: block
breakers:
  loop:
    max_identical_calls: 3
`);
const tools = harden(myTools, { spec });

## Test your agent

npx @npmsai/agentmint test --suite prior-auth
npx @npmsai/agentmint test --suite coding-agent
npx @npmsai/agentmint test --suite refund-agent

## Learn from failures

npx @npmsai/agentmint learn --from receipts/incident.jsonl

## CLI

agentmint demo [1|2|3|a]    Run demo scenarios
agentmint test --suite <n>  Run pre-built test suite
agentmint learn --from <f>  Generate spec from failures
agentmint watch             Watch agent in real time
agentmint init              Generate starter spec
agentmint ci                Gate CI on violations
agentmint diff              Compare two receipt files

## Spec reference

- requires: [tool_a, tool_b] — tool_a and tool_b must run first
- action: block | warn — block prevents execution, warn logs and continues
- input.properties.<prop>.cross_ref — validate against prior tool output
- input.properties.<prop>.max_ref — enforce value ceiling from prior output
- input.properties.<prop>.blocked_patterns — glob patterns to reject
- input.properties.<prop>.blocked_values — exact values to reject
- breakers.loop.max_identical_calls — halt after N identical calls
- breakers.velocity.max_calls_per_window — halt after N calls in window
- bind: { key: value } — lock a parameter across all tools
- deny: ["pattern*"] — block tools matching glob pattern
- checkpoint: ["tool"] — require approval before execution

## Adapters

Works with OpenAI SDK, Anthropic SDK, Vercel AI SDK, LangChain,
or any plain object of async functions.

## Zero runtime dependencies. MIT license.
