import type { GapEntry, PacketData } from "./types";

const EXPECTED_ARTIFACT_IDS = ["01", "02", "03", "04", "05", "07", "06", "11", "08", "09", "10", "12"];

function formatGap(gap: GapEntry) {
  return JSON.stringify(gap);
}

function assertFieldAttestations(packet: PacketData) {
  for (const artifact of packet.artifacts) {
    for (const section of artifact.sections) {
      for (const field of section.fields) {
        if (field.citation_ref === null && field.is_attested) {
          throw new Error(
            `Invariant failed: artifact ${artifact.id} field ${field.machine_key} has citation_ref=null but is_attested=true.`,
          );
        }
      }
    }
  }
}

function assertGapStatuses(packet: PacketData) {
  for (const artifact of packet.artifacts) {
    if (artifact.gaps.length > 0 && artifact.status !== "attested_with_gaps") {
      throw new Error(
        `Invariant failed: artifact ${artifact.id} has ${artifact.gaps.length} gap(s) but status is ${artifact.status}.`,
      );
    }
  }
}

function collectArtifactGaps(packet: PacketData) {
  const artifactGapMap = new Map<string, GapEntry>();

  for (const artifact of packet.artifacts) {
    for (const gap of artifact.gaps) {
      artifactGapMap.set(gap.id, gap);
    }
  }

  return artifactGapMap;
}

function assertGapRegister(packet: PacketData) {
  const artifactGapMap = collectArtifactGaps(packet);

  const registerIds = packet.gap_register.map((gap) => gap.id);
  const artifactGapIds = [...artifactGapMap.keys()];

  if (
    registerIds.length !== artifactGapIds.length ||
    registerIds.some((id) => !artifactGapMap.has(id))
  ) {
    throw new Error(
      `Invariant failed: gap_register must equal the union of artifact gaps by id. register=[${registerIds.join(", ")}] artifactUnion=[${artifactGapIds.join(", ")}].`,
    );
  }

  for (const gap of packet.gap_register) {
    const artifactGap = artifactGapMap.get(gap.id);

    if (!artifactGap || formatGap(artifactGap) !== formatGap(gap)) {
      throw new Error(
        `Invariant failed: gap_register entry ${gap.id} does not exactly match the artifact gap union.`,
      );
    }
  }
}

function assertArtifactOrder(packet: PacketData) {
  if (packet.artifacts.length > 0) {
    if (packet.artifacts.length !== EXPECTED_ARTIFACT_IDS.length) {
      throw new Error(
        `Invariant failed: expected ${EXPECTED_ARTIFACT_IDS.length} artifacts, received ${packet.artifacts.length}.`,
      );
    }

    const actualIds = packet.artifacts.map((artifact) => artifact.id);
    const idsMatch = actualIds.every((id, index) => id === EXPECTED_ARTIFACT_IDS[index]);

    if (!idsMatch) {
      throw new Error(
        `Invariant failed: artifact ids must be in order [${EXPECTED_ARTIFACT_IDS.join(", ")}]; received [${actualIds.join(", ")}].`,
      );
    }
  }
}

export function assertPacketInvariants(packet: PacketData) {
  assertFieldAttestations(packet);
  assertGapStatuses(packet);
  assertGapRegister(packet);
  assertArtifactOrder(packet);
}
