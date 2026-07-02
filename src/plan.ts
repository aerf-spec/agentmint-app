// Signed plans — the policy envelope AERF receipts bind to.
//
// A plan is a signed statement of what an agent MAY do: scope patterns that
// allow, checkpoint patterns that block, and an optional delegate allowlist.
// Receipts bind to a plan via plan_id + plan_signature, and the plan's rules
// hash to policy_hash (SHA-256 of canonical {scope, checkpoints,
// delegates_to}). Ported from the Python reference producer
// (agentmint.notary.PlanReceipt / create_plan / evaluate_policy /
// _compute_policy_hash / intersect_scopes) with byte-identical signing and
// hashing semantics.
import { randomUUID, createPublicKey, type KeyObject } from "node:crypto";
import { canonicalBytes, sha256Hex } from "./kernel/canonical.js";
import { keyId, signStripped, verifyStripped, privateKeyFromPem } from "./kernel/sign.js";
import { isoNowUtc, AerfReceiptError, MAX_ACTION_LEN, MAX_IDENTITY_LEN } from "./receipt-aerf.js";

// ── Constants (mirror notary.py) ────────────────────────────────────

export const DEFAULT_PLAN_TTL_SECONDS = 300;
export const MAX_PLAN_TTL_SECONDS = 3600;
export const MIN_PLAN_TTL_SECONDS = 1;

/** Python's datetime.max in UTC — the expiry of a never-expiring plan. */
const NEVER_EXPIRES = "9999-12-31T23:59:59.999999+00:00";

// ── Scope pattern matching (port of patterns.py) ────────────────────

/**
 * Match an action against a scope pattern. `*` matches everything;
 * `read:reports:*` matches `read:reports` and anything under it; anything
 * else is an exact match. Bare `*` suffixes (e.g. `tts:standard*`) are NOT
 * wildcards.
 */
export function matchesPattern(action: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith(":*")) {
    const prefix = pattern.slice(0, -2);
    return action === prefix || action.startsWith(prefix + ":");
  }
  return action === pattern;
}

/** True if the action matches any pattern in the list. */
export function inScope(action: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => matchesPattern(action, p));
}

// ── Plan shape ──────────────────────────────────────────────────────

/** A signed plan receipt as it appears on the wire. */
export interface PlanReceipt {
  id: string;
  type: "plan";
  user: string;
  action: string;
  scope: string[];
  checkpoints: string[];
  delegates_to: string[];
  issued_at: string;
  expires_at: string;
  key_id: string;
  signature: string;
}

export interface PlanInit {
  user: string;
  action: string;
  scope: readonly string[];
  checkpoints?: readonly string[];
  delegatesTo?: readonly string[];
  /** Seconds until expiry, clamped to [1, 3600]. Pass null for never-expires. Default 300. */
  ttlSeconds?: number | null;
  // deterministic overrides (tests, replay)
  id?: string;
  issuedAt?: string;
}

function requireStringList(value: readonly string[] | undefined, name: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new AerfReceiptError(`${name} must be a list`);
  return value.map((item, i) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new AerfReceiptError(`${name}[${i}] must be a non-empty string`);
    }
    return item.trim();
  });
}

function requireIdentity(value: string, name: string, maxLen: number): string {
  if (typeof value !== "string") throw new AerfReceiptError(`${name} must be a string`);
  const stripped = value.trim();
  if (!stripped) throw new AerfReceiptError(`${name} must not be empty`);
  if (stripped.length > maxLen) {
    throw new AerfReceiptError(`${name} must be at most ${maxLen} characters, got ${stripped.length}`);
  }
  for (const ch of stripped) {
    if (ch.codePointAt(0)! < 32) throw new AerfReceiptError(`${name} contains control characters`);
  }
  return stripped;
}

function clampTtl(ttl: number): number {
  return Math.max(MIN_PLAN_TTL_SECONDS, Math.min(MAX_PLAN_TTL_SECONDS, ttl));
}

/** The exact signable dict of the Python producer's PlanReceipt.signable_dict(). */
export function planSignable(plan: Omit<PlanReceipt, "signature">): Record<string, unknown> {
  return {
    id: plan.id,
    type: "plan",
    user: plan.user,
    action: plan.action,
    scope: [...plan.scope],
    checkpoints: [...plan.checkpoints],
    delegates_to: [...plan.delegates_to],
    issued_at: plan.issued_at,
    expires_at: plan.expires_at,
    key_id: plan.key_id,
  };
}

/** Build an unsigned plan (validation + TTL clamping, mirroring create_plan). */
export function buildPlan(init: PlanInit, issuerKeyId: string): Omit<PlanReceipt, "signature"> {
  const user = requireIdentity(init.user, "user", MAX_IDENTITY_LEN);
  const action = requireIdentity(init.action, "action", MAX_ACTION_LEN);
  const scope = requireStringList(init.scope, "scope");
  const checkpoints = requireStringList(init.checkpoints, "checkpoints");
  const delegatesTo = requireStringList(init.delegatesTo, "delegates_to");

  const issuedAt = init.issuedAt ?? isoNowUtc();
  let expiresAt: string;
  if (init.ttlSeconds === null) {
    expiresAt = NEVER_EXPIRES;
  } else {
    const ttl = clampTtl(init.ttlSeconds ?? DEFAULT_PLAN_TTL_SECONDS);
    expiresAt = isoNowUtc(new Date(parseIso(issuedAt).getTime() + ttl * 1000));
  }

  return {
    id: init.id ?? randomUUID(),
    type: "plan",
    user,
    action,
    scope,
    checkpoints,
    delegates_to: delegatesTo,
    issued_at: issuedAt,
    expires_at: expiresAt,
    key_id: issuerKeyId,
  };
}

/** Build and sign a plan in one step. */
export function signPlan(init: PlanInit, issuerPrivateKey: string | KeyObject): PlanReceipt {
  const key = typeof issuerPrivateKey === "string" ? privateKeyFromPem(issuerPrivateKey) : issuerPrivateKey;
  const unsigned = buildPlan(init, keyId(createPublicKey(key)));
  const signature = signStripped(planSignable(unsigned), key);
  return { ...unsigned, signature };
}

/** Verify a plan's Ed25519 signature against the issuer public key. */
export function verifyPlan(plan: PlanReceipt, issuerPublicKey: string | KeyObject): boolean {
  if (typeof plan.signature !== "string" || !plan.signature) return false;
  return verifyStripped(planSignable(plan), issuerPublicKey, plan.signature);
}

/** True when the plan's expires_at is in the past (>= comparison, like Python). */
export function isPlanExpired(plan: Pick<PlanReceipt, "expires_at">, now = new Date()): boolean {
  return now.getTime() >= parseIso(plan.expires_at).getTime();
}

/**
 * Parse the ISO 8601 timestamps the producers emit. JS Date.parse handles
 * "+00:00" offsets and fractional seconds; Python's datetime.max year 9999 is
 * within Date range.
 */
function parseIso(iso: string): Date {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new AerfReceiptError(`invalid ISO timestamp: ${iso}`);
  return d;
}

// ── Policy hash (port of _compute_policy_hash) ──────────────────────

/** SHA-256 hex of canonical {scope, checkpoints, delegates_to}. */
export function computePolicyHash(
  plan: Pick<PlanReceipt, "scope" | "checkpoints" | "delegates_to">,
): string {
  return sha256Hex(
    canonicalBytes({
      scope: [...plan.scope],
      checkpoints: [...plan.checkpoints],
      delegates_to: [...plan.delegates_to],
    }),
  );
}

// ── Policy evaluation (port of evaluate_policy) ─────────────────────

export interface PolicyEvaluation {
  inPolicy: boolean;
  reason: string;
}

/**
 * Evaluate an action against a plan's policy. Pure function; precedence is
 * expiry > delegation > checkpoints (block) > scope (allow) > default-deny.
 */
export function evaluatePolicy(
  action: string,
  agent: string,
  plan: Pick<PlanReceipt, "scope" | "checkpoints" | "delegates_to" | "expires_at">,
  now = new Date(),
): PolicyEvaluation {
  if (isPlanExpired(plan, now)) {
    return { inPolicy: false, reason: "plan expired" };
  }
  if (plan.delegates_to.length > 0 && !plan.delegates_to.includes(agent)) {
    return { inPolicy: false, reason: `agent '${agent}' not in delegates_to` };
  }
  for (const pattern of plan.checkpoints) {
    if (matchesPattern(action, pattern)) {
      return { inPolicy: false, reason: `matched checkpoint ${pattern}` };
    }
  }
  for (const pattern of plan.scope) {
    if (matchesPattern(action, pattern)) {
      return { inPolicy: true, reason: `matched scope ${pattern}` };
    }
  }
  return { inPolicy: false, reason: "no scope pattern matched" };
}

// ── Scope intersection for delegation (port of intersect_scopes) ────

/**
 * The effective scope a child agent receives: for each requested pattern,
 * keep the more specific of (requested, parent) when one covers the other;
 * drop patterns with no overlap. Empty result = nothing delegable.
 */
export function intersectScopes(
  parentScope: readonly string[],
  requested: readonly string[],
): string[] {
  const result: string[] = [];
  for (const child of requested) {
    for (const parent of parentScope) {
      if (child === parent) {
        if (!result.includes(child)) result.push(child);
      } else if (matchesPattern(child, parent)) {
        // child is more specific, parent is the wildcard — keep child
        if (!result.includes(child)) result.push(child);
      } else if (matchesPattern(parent, child)) {
        // parent is more specific, child is the wildcard — keep parent
        if (!result.includes(parent)) result.push(parent);
      }
    }
  }
  return result;
}

/**
 * Derive a signed child plan whose scope is the intersection of the parent's
 * scope and the requested scope (port of Notary.delegate_to_agent). Throws
 * when the intersection is empty — nothing is delegable.
 */
export function delegatePlan(
  parent: PlanReceipt,
  init: {
    childAgent: string;
    requestedScope: readonly string[];
    action?: string;
    checkpoints?: readonly string[];
    ttlSeconds?: number;
  },
  issuerPrivateKey: string | KeyObject,
): PlanReceipt {
  const childAgent = requireIdentity(init.childAgent, "childAgent", MAX_IDENTITY_LEN);
  const requested = requireStringList(init.requestedScope, "requestedScope");
  const effective = intersectScopes(parent.scope, requested);
  if (effective.length === 0) {
    throw new AerfReceiptError(
      `scope intersection is empty — parent scope [${parent.scope.join(", ")}] ` +
        `does not overlap with requested [${requested.join(", ")}]`,
    );
  }
  return signPlan(
    {
      user: parent.user,
      action: init.action || parent.action,
      scope: effective,
      checkpoints: init.checkpoints ?? parent.checkpoints,
      delegatesTo: [childAgent],
      ttlSeconds: init.ttlSeconds ?? DEFAULT_PLAN_TTL_SECONDS,
    },
    issuerPrivateKey,
  );
}
