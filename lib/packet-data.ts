import type { PacketData } from "@/lib/types";

const claraHealthPacket: PacketData = {
  metadata: {
    packet_id: "",
    vendor: "",
    jurisdiction: "",
    system: "",
    version: "",
    workflow: "",
    regulatory_classification: "",
    buyer: "",
    generated_at: "",
    methodology_version: "",
    attested_by_name: "",
    attested_by_title: "",
  },
  executive_summary: {
    system_description: "",
    status_line: "",
    top_gaps: [],
    deal_context: "",
    contact: "",
  },
  artifacts: [],
  gap_register: [],
  attestation: {
    statement: "",
    explicit_non_claims: [],
    signed_date: "",
  },
  owasp_llm_assessment: [],
  chai_crosswalk: [],
};

export default claraHealthPacket;
