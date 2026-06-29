/** What the developer passes to harden() */
export interface AgentMintConfig {
  /** Lock parameter values - block calls where a bound param has a different value */
  readonly bind?: Record<string, string>;
  /** If non-empty, only these tools can execute. Supports wildcards: "read_patient_*" */
  readonly allow?: readonly string[];
  /** These tools never execute. Overrides allow. Supports wildcards. */
  readonly deny?: readonly string[];
  /** These tools must complete before any checkpoint tool fires */
  readonly require?: readonly string[];
  /** These tools pause for human approval. Supports wildcards. */
  readonly checkpoint?: readonly string[];
  /** Max USD for the run. Requires costEstimator callback. */
  readonly budget?: number;
  /** Max seconds for the run */
  readonly timeout?: number;
  /** Max calls per tool name (not per run) */
  readonly retryLimit?: number;
  /** Suppress stdout receipt */
  readonly silent?: boolean;
  /** Enable Merkle tree evidence chain */
  readonly evidenceChain?: boolean;
  /** Shadow mode logs enforcement decisions but doesn't block */
  readonly mode?: "enforce" | "shadow";
  /** Called when a checkpoint tool is invoked. Return true to approve. */
  readonly onCheckpoint?: (
    tool: string,
    params: Readonly<Record<string, unknown>>,
  ) => Promise<boolean>;
  /** Called after any tool is blocked */
  readonly onBlock?: (tool: string, reason: string, details?: string) => void;
  /** Called when the run is killed (budget/timeout) */
  readonly onKill?: (reason: string, state: Readonly<RunState>) => void;
  /** Called after each successful tool execution. Returns estimated USD cost. */
  readonly costEstimator?: (
    tool: string,
    params: Readonly<Record<string, unknown>>,
    result: unknown,
  ) => number;
}

/** Mutable state tracked per harden() call */
export interface RunState {
  /** Unique run ID: "amr_" + 8 alphanumeric chars */
  runId: string;
  /** Unix timestamp ms when harden() was called */
  startedAt: number;
  /** Current run status */
  status: "running" | "completed" | "killed";
  /** Why the run was killed, if applicable */
  killReason?: string;
  /** Cumulative USD cost */
  totalCost: number;
  /** Total tool calls attempted (including blocked) */
  callCount: number;
  /** Tool calls that actually executed */
  executedCount: number;
  /** Tool calls that were blocked */
  blockedCount: number;
  /** Tool calls that were held for checkpoint */
  heldCount: number;
  /** Tool calls that triggered a kill */
  killedCount: number;
  /** Tool calls skipped due to retry limit */
  skippedCount: number;
  /** Per-tool call counts */
  retryCounts: Record<string, number>;
  /** Tools that have executed successfully */
  completedSteps: Set<string>;
  /** Frozen copy of config.bind */
  boundValues: Readonly<Record<string, string>>;
  /** Full event log */
  events: Event[];
  /** Summaries of data returned by tools (for grounding check) */
  retrievedData: string[];
}

/** Result type for an enforcement decision */
export type EventResult =
  | "allowed"
  | "blocked"
  | "held"
  | "approved"
  | "rejected"
  | "killed"
  | "skipped";

/** One entry per tool call attempt */
export interface Event {
  /** ISO 8601 timestamp */
  readonly timestamp: string;
  /** Seconds since run start, e.g. "4.8s" */
  readonly elapsed: string;
  /** Tool name */
  readonly tool: string;
  /** Redacted parameters */
  readonly params: Readonly<Record<string, unknown>>;
  /** Enforcement decision */
  readonly result: EventResult;
  /** Why this decision was made */
  readonly reason?: string;
  /** Additional context */
  readonly details?: string;
  /** USD cost of this call */
  readonly cost?: number;
  /** Execution time in milliseconds */
  readonly durationMs?: number;
}

/** What the agent receives when a tool call is blocked */
export interface BlockResponse {
  readonly error: true;
  readonly tool: string;
  readonly message: string;
}

/** Function signature used by framework adapters */
export type EnforcerFn = (
  tool: string,
  params: Record<string, unknown>,
  execute: () => Promise<unknown>,
) => Promise<unknown>;

/** Options for AgentMintReport.generate() */
export interface ReportOptions {
  /** Time window filter, e.g. "30d" */
  readonly last?: string;
  /** Output format */
  readonly format?: "text" | "json";
}

/** AgentMint Evidence Record Format - structured receipt */
export interface AERFRecord {
  /** Schema version */
  version: "0.1.0";
  /** Run identifier */
  runId: string;
  /** Bound parameter values */
  boundValues: Record<string, string>;
  /** ISO 8601 start time */
  startedAt: string;
  /** Final run status */
  status: RunState["status"];
  /** Enforcement mode */
  mode: "enforce" | "shadow";
  /** Condensed event log */
  events: ReadonlyArray<{
    tool: string;
    result: EventResult;
    reason?: string;
    details?: string;
    boundParams?: Record<string, string>;
  }>;
  /** Run summary */
  summary: {
    calls: number;
    executed: number;
    blocked: number;
    held: number;
    skipped: number;
    cost: number | null;
    budget: number | null;
    elapsedSeconds: number;
  };
  /** Required step completion status */
  requiredSteps?: Array<{ tool: string; completed: boolean }>;
}

/** Merkle proof for a single event in the evidence chain */
export interface MerkleProof {
  /** Hash of the leaf (event) */
  leaf: string;
  /** Position in the tree */
  index: number;
  /** Sibling hashes needed to reconstruct the root */
  siblings: ReadonlyArray<{ hash: string; position: "left" | "right" }>;
  /** Root hash to verify against */
  root: string;
}
