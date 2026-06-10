import type { Artifact, GapEntry, PacketData } from "@/lib/types";

const ARTIFACT_IDS = ["01", "02", "03", "04", "05", "07", "06", "11", "08", "09", "10", "12"];

export function createGap(id = "gap-1"): GapEntry {
  return {
    id,
    title: `Gap ${id}`,
    description: "Missing control evidence.",
    remediation: "Add the missing control evidence.",
    owner_name: "Jordan Lee",
    owner_title: "Security Lead",
    target_date: "2026-07-01",
    compensating_control: "Manual review is in place.",
  };
}

export function createArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "01",
    title: "Artifact",
    status: "attested",
    detachable: false,
    sections: [
      {
        label: "Core",
        fields: [
          {
            machine_key: "control",
            display_label: "Control",
            value: "Implemented",
            citation_ref: "CIT-1",
            is_attested: true,
          },
        ],
      },
    ],
    gaps: [],
    ciso_simulation: [
      {
        question: "How is this attested?",
        answer: "With supporting evidence.",
      },
    ],
    ...overrides,
  };
}

export function createOrderedArtifacts(): Artifact[] {
  return ARTIFACT_IDS.map((id) =>
    createArtifact({
      id,
      title: `Artifact ${id}`,
    }),
  );
}

export function createPacketData(overrides: Partial<PacketData> = {}): PacketData {
  return {
    metadata: {
      packet_id: "sample-health-001",
      vendor: "AgentMint",
      jurisdiction: "US",
      system: "Clara Health",
      version: "0.1.0",
      workflow: "Security packet review",
      regulatory_classification: "Healthcare SaaS",
      buyer: "Acme Health",
      generated_at: "2026-06-09T00:00:00Z",
      methodology_version: "1.0",
      attested_by_name: "Alex Doe",
      attested_by_title: "Founder",
    },
    executive_summary: {
      system_description: "An empty placeholder packet for pipeline validation.",
      status_line: "Attested sample",
      top_gaps: [],
      deal_context: "Security review in progress.",
      contact: "alex@example.com",
    },
    artifacts: createOrderedArtifacts(),
    gap_register: [],
    attestation: {
      statement: "This packet is a placeholder.",
      explicit_non_claims: ["No production data included."],
      signed_date: "2026-06-09",
    },
    owasp_llm_assessment: [
      {
        threat_id: "LLM01",
        threat: "Prompt injection",
        control: "Prompt isolation",
        status: "sample",
      },
    ],
    chai_crosswalk: [
      {
        chai_field: "artifact_id",
        packet_location: "artifacts[0].id",
      },
    ],
    ...overrides,
  };
}
