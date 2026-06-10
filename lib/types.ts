export interface ArtifactField {
  machine_key: string;
  display_label: string;
  value: string | number | boolean;
  citation_ref: string | null;
  is_attested: boolean;
}

export interface GapEntry {
  id: string;
  title: string;
  description: string;
  remediation: string;
  owner_name: string;
  owner_title: string;
  target_date: string;
  compensating_control: string;
}

export interface ArtifactSection {
  label: string;
  fields: ArtifactField[];
}

export interface CisoSimEntry {
  question: string;
  answer: string;
}

export interface OWASPEntry {
  threat_id: string;
  threat: string;
  control: string;
  status: string;
}

export interface ChaiCrosswalkEntry {
  chai_field: string;
  packet_location: string;
}

export interface Artifact {
  id: string;
  title: string;
  status: "attested" | "attested_with_gaps";
  detachable: boolean;
  sections: ArtifactSection[];
  gaps: GapEntry[];
  ciso_simulation: CisoSimEntry[];
}

export interface PacketMetadata {
  packet_id: string;
  vendor: string;
  jurisdiction: string;
  system: string;
  version: string;
  workflow: string;
  regulatory_classification: string;
  buyer: string;
  generated_at: string;
  methodology_version: string;
  attested_by_name: string;
  attested_by_title: string;
}

export interface ExecutiveSummary {
  system_description: string;
  status_line: string;
  top_gaps: string[];
  deal_context: string;
  contact: string;
}

export interface Attestation {
  statement: string;
  explicit_non_claims: string[];
  signed_date: string;
}

export interface PacketData {
  metadata: PacketMetadata;
  executive_summary: ExecutiveSummary;
  artifacts: Artifact[];
  gap_register: GapEntry[];
  attestation: Attestation;
  owasp_llm_assessment: OWASPEntry[];
  chai_crosswalk: ChaiCrosswalkEntry[];
}
