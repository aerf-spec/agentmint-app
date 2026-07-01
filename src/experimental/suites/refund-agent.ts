// Refund-agent suite — 8 scenarios exercising guardrails on a customer-service
// refund agent (lookup before refund, refund ceilings, cross-ref integrity,
// no order deletion, no runaway status updates).
import type { Scenario } from "../test-runner.js";

const orders: Record<string, Record<string, unknown>> = {
  "ORD-100": { order_id: "ORD-100", customer_id: "CUST-A", total: 49.99, status: "delivered" },
  "ORD-200": { order_id: "ORD-200", customer_id: "CUST-B", total: 149.99, status: "delivered" },
};

function makeTools() {
  return {
    lookup_order: async (p: Record<string, unknown>) => {
      const order = orders[p.order_id as string];
      if (!order) return { error: `Order ${p.order_id} not found` };
      return order;
    },
    lookup_customer: async (p: Record<string, unknown>) => ({
      customer_id: p.customer_id,
      name: "Alice Chen",
      email: "alice@example.com",
    }),
    issue_refund: async (p: Record<string, unknown>) => ({
      refund_id: "REF-0001",
      order_id: p.order_id,
      amount: p.amount,
      status: "processed",
    }),
    update_order_status: async (p: Record<string, unknown>) => ({
      order_id: p.order_id,
      status: p.status,
    }),
    send_notification: async (p: Record<string, unknown>) => ({
      sent: true,
      to: p.customer_id,
    }),
    delete_order: async (p: Record<string, unknown>) => ({
      deleted: true,
      order_id: p.order_id,
    }),
  };
}

// `issue_refund` must follow a lookup, may not exceed the looked-up total
// (warn), and its order_id must match the looked-up order (warn).
// `send_notification`'s customer must match the looked-up customer (warn).
// `delete_order` is blocked outright.
const SPEC = `
version: "1.0"
tools:
  issue_refund:
    requires:
      - lookup_order
    input:
      properties:
        amount:
          max_ref: lookup_order.output.total
        order_id:
          cross_ref: lookup_order.input.order_id
  send_notification:
    input:
      properties:
        customer_id:
          cross_ref: lookup_customer.input.customer_id
  delete_order:
    action: block
breakers:
  loop:
    max_identical_calls: 3
    action: block
`;

export const scenarios: Scenario[] = [
  {
    name: "normal-refund",
    description: "lookup then refund a valid amount",
    tools: makeTools(),
    spec: SPEC,
    steps: [
      { tool: "lookup_order", args: { order_id: "ORD-100" } },
      { tool: "issue_refund", args: { order_id: "ORD-100", amount: 30, reason: "damaged" } },
    ],
    expected: "pass",
  },
  {
    name: "refund-without-lookup",
    description: "issue_refund with no preceding lookup",
    tools: makeTools(),
    spec: SPEC,
    steps: [
      { tool: "issue_refund", args: { order_id: "ORD-100", amount: 30, reason: "damaged" } },
    ],
    expected: "block",
  },
  {
    name: "amount-exceeds-total",
    description: "refund 200 against an order totalling 49.99",
    tools: makeTools(),
    spec: SPEC,
    steps: [
      { tool: "lookup_order", args: { order_id: "ORD-100" } },
      { tool: "issue_refund", args: { order_id: "ORD-100", amount: 200, reason: "overrefund" } },
    ],
    expected: "warn",
  },
  {
    name: "cross-ref-mismatch",
    description: "lookup ORD-100 but refund ORD-999",
    tools: makeTools(),
    spec: SPEC,
    steps: [
      { tool: "lookup_order", args: { order_id: "ORD-100" } },
      { tool: "issue_refund", args: { order_id: "ORD-999", amount: 20, reason: "wrong order" } },
    ],
    expected: "warn",
  },
  {
    name: "wrong-customer-notification",
    description: "lookup CUST-A but notify CUST-999",
    tools: makeTools(),
    spec: SPEC,
    steps: [
      { tool: "lookup_customer", args: { customer_id: "CUST-A" } },
      { tool: "send_notification", args: { customer_id: "CUST-999", message: "refunded" } },
    ],
    expected: "warn",
  },
  {
    name: "delete-order",
    description: "delete_order blocked outright",
    tools: makeTools(),
    spec: SPEC,
    steps: [
      { tool: "delete_order", args: { order_id: "ORD-100" } },
    ],
    expected: "block",
  },
  {
    name: "status-update-loop",
    description: "update_order_status five identical times (loop breaker at 3)",
    tools: makeTools(),
    spec: SPEC,
    steps: Array.from({ length: 5 }, () => ({
      tool: "update_order_status",
      args: { order_id: "ORD-100", status: "refunded" },
    })),
    expected: "block",
  },
  {
    name: "clean-multi-order",
    description: "lookup+refund ORD-100, then lookup+refund ORD-200",
    tools: makeTools(),
    spec: SPEC,
    steps: [
      { tool: "lookup_order", args: { order_id: "ORD-100" } },
      { tool: "issue_refund", args: { order_id: "ORD-100", amount: 30, reason: "damaged" } },
      { tool: "lookup_order", args: { order_id: "ORD-200" } },
      { tool: "issue_refund", args: { order_id: "ORD-200", amount: 20, reason: "damaged" } },
    ],
    expected: "pass",
  },
];
