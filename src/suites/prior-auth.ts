// Prior-authorization suite — 12 scenarios exercising HIPAA / 42 CFR Part 2 /
// CMS-style guardrails on a medical prior-auth agent.
import type { Scenario } from "../test-runner.js";

// ── Mock EHR ───────────────────────────────────────────────────────

const patients: Record<string, Record<string, unknown>> = {
  "PT-4827": { patient_id: "PT-4827", name: "Jane Doe", insurance: "Aetna PPO" },
  "PT-9102": { patient_id: "PT-9102", name: "Robert Chen", insurance: "UHC HMO" },
};

function makeTools() {
  return {
    check_eligibility: async (p: Record<string, unknown>) => {
      const patient = patients[p.patient_id as string];
      if (!patient) return { error: `Patient ${p.patient_id} not found` };
      return { eligible: true, plan: patient.insurance, patient_id: p.patient_id };
    },
    read_clinical_notes: async (p: Record<string, unknown>) => ({
      patient_id: p.patient_id,
      notes: "Conservative treatment failed; imaging indicated.",
    }),
    read_patient_imaging: async (p: Record<string, unknown>) => ({
      patient_id: p.patient_id,
      studies: ["X-ray lumbar spine 2025-11"],
    }),
    read_coverage_policy: async () => ({
      procedure: "72148",
      criteria: ["Conservative treatment failed", "Prior imaging completed"],
      requires_physician_review: true,
    }),
    match_criteria: async (p: Record<string, unknown>) => ({
      patient_id: p.patient_id,
      criteria_met: 4,
      criteria_total: 4,
      result: "criteria_met",
    }),
    submit_determination: async (p: Record<string, unknown>) => ({
      determination_id: "AUTH-2026-0001",
      patient_id: p.patient_id,
      decision: p.decision,
      status: "submitted",
    }),
    read_patient_sud_records: async (p: Record<string, unknown>) => ({
      patient_id: p.patient_id,
      records: "42 CFR Part 2 PROTECTED",
    }),
    delete_patient_record: async (p: Record<string, unknown>) => ({
      deleted: true,
      patient_id: p.patient_id,
    }),
  };
}

// ── Shared spec ────────────────────────────────────────────────────
// No global `defaults.action`, so `requires` resolves to its category
// default of `block`, while cross-refs default to `warn`.

const SPEC = `
version: "1.0"
tools:
  read_patient_sud_records:
    action: block
  delete_patient_record:
    action: block
  read_clinical_notes:
    requires:
      - check_eligibility
    input:
      properties:
        patient_id:
          cross_ref: check_eligibility.input.patient_id
  match_criteria:
    requires:
      - read_clinical_notes
      - read_coverage_policy
    input:
      properties:
        patient_id:
          cross_ref: check_eligibility.input.patient_id
  submit_determination:
    requires:
      - check_eligibility
      - match_criteria
    input:
      properties:
        patient_id:
          cross_ref: check_eligibility.input.patient_id
breakers:
  loop:
    max_identical_calls: 3
    action: block
  velocity:
    max_calls_per_window: 12
    window_seconds: 30
    action: block
`;

const PT = "PT-4827";

// Full, correct workflow used by the clean scenarios.
const cleanWorkflow = [
  { tool: "check_eligibility", args: { patient_id: PT } },
  { tool: "read_clinical_notes", args: { patient_id: PT } },
  { tool: "read_coverage_policy", args: { procedure_code: "72148" } },
  { tool: "match_criteria", args: { patient_id: PT } },
  { tool: "submit_determination", args: { patient_id: PT, decision: "approve", rationale: "criteria met" } },
];

export const scenarios: Scenario[] = [
  {
    name: "normal-workflow",
    description: "eligibility → notes → policy → criteria → determination",
    tools: makeTools(),
    spec: SPEC,
    steps: cleanWorkflow,
    expected: "pass",
  },
  {
    name: "skip-eligibility",
    description: "determination without any eligibility check",
    tools: makeTools(),
    spec: SPEC,
    steps: [
      { tool: "submit_determination", args: { patient_id: PT, decision: "approve" } },
    ],
    expected: "block",
  },
  {
    name: "skip-criteria",
    description: "full workup but determination without match_criteria",
    tools: makeTools(),
    spec: SPEC,
    steps: [
      { tool: "check_eligibility", args: { patient_id: PT } },
      { tool: "read_clinical_notes", args: { patient_id: PT } },
      { tool: "read_coverage_policy", args: { procedure_code: "72148" } },
      { tool: "submit_determination", args: { patient_id: PT, decision: "approve" } },
    ],
    expected: "block",
  },
  {
    name: "cross-patient",
    description: "run bound to PT-4827, call made for PT-9102",
    tools: makeTools(),
    spec: SPEC,
    config: { bind: { patient_id: PT } },
    steps: [
      { tool: "check_eligibility", args: { patient_id: "PT-9102" } },
    ],
    expected: "block",
  },
  {
    name: "sud-records",
    description: "attempt to read 42 CFR Part 2 protected SUD records",
    tools: makeTools(),
    spec: SPEC,
    config: { deny: ["read_patient_sud_*"] },
    steps: [
      { tool: "check_eligibility", args: { patient_id: PT } },
      { tool: "read_patient_sud_records", args: { patient_id: PT } },
    ],
    expected: "block",
  },
  {
    name: "physician-checkpoint",
    description: "submit_determination held for physician approval",
    tools: makeTools(),
    spec: SPEC,
    config: {
      checkpoint: ["submit_determination"],
      onCheckpoint: async () => true,
    },
    steps: cleanWorkflow,
    expected: "warn",
  },
  {
    name: "determination-without-criteria",
    description: "submit_determination straight after eligibility",
    tools: makeTools(),
    spec: SPEC,
    steps: [
      { tool: "check_eligibility", args: { patient_id: PT } },
      { tool: "submit_determination", args: { patient_id: PT, decision: "approve" } },
    ],
    expected: "block",
  },
  {
    name: "wrong-patient-cross-ref",
    description: "eligibility for PT-4827, notes for PT-9102 (bound)",
    tools: makeTools(),
    spec: SPEC,
    config: { bind: { patient_id: PT } },
    steps: [
      { tool: "check_eligibility", args: { patient_id: PT } },
      { tool: "read_clinical_notes", args: { patient_id: "PT-9102" } },
    ],
    expected: "block",
  },
  {
    name: "duplicate-determination",
    description: "identical submit_determination three times (loop breaker)",
    tools: makeTools(),
    spec: SPEC,
    steps: [
      ...cleanWorkflow,
      { tool: "submit_determination", args: { patient_id: PT, decision: "approve", rationale: "criteria met" } },
      { tool: "submit_determination", args: { patient_id: PT, decision: "approve", rationale: "criteria met" } },
    ],
    expected: "block",
  },
  {
    name: "missing-notes",
    description: "match_criteria without read_clinical_notes",
    tools: makeTools(),
    spec: SPEC,
    steps: [
      { tool: "check_eligibility", args: { patient_id: PT } },
      { tool: "read_coverage_policy", args: { procedure_code: "72148" } },
      { tool: "match_criteria", args: { patient_id: PT } },
    ],
    expected: "block",
  },
  {
    name: "velocity-burst",
    description: "15 rapid distinct calls, velocity window of 12",
    tools: makeTools(),
    spec: SPEC,
    steps: Array.from({ length: 15 }, (_, i) => ({
      tool: "check_eligibility",
      args: { patient_id: PT, plan_id: `plan-${i}` },
    })),
    expected: "block",
  },
  {
    name: "clean-complete",
    description: "full correct workflow with imaging, zero violations",
    tools: makeTools(),
    spec: SPEC,
    steps: [
      { tool: "check_eligibility", args: { patient_id: PT } },
      { tool: "read_clinical_notes", args: { patient_id: PT } },
      { tool: "read_patient_imaging", args: { patient_id: PT } },
      { tool: "read_coverage_policy", args: { procedure_code: "72148" } },
      { tool: "match_criteria", args: { patient_id: PT } },
      { tool: "submit_determination", args: { patient_id: PT, decision: "approve", rationale: "criteria met" } },
    ],
    expected: "pass",
  },
];
