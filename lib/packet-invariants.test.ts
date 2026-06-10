import { describe, expect, it } from "vitest";

import { assertPacketInvariants } from "@/lib/packet-invariants";
import { createArtifact, createGap, createOrderedArtifacts, createPacketData } from "@/test/factories";

describe("packet invariants", () => {
  it("accepts a valid packet and skips artifact ordering when empty", () => {
    expect(() => assertPacketInvariants(createPacketData())).not.toThrow();
    expect(() => assertPacketInvariants(createPacketData({ artifacts: [] }))).not.toThrow();
  });

  it("rejects attested fields without citations", () => {
    const packet = createPacketData({
      artifacts: [
        createArtifact({
          id: "01",
          sections: [
            {
              label: "Core",
              fields: [
                {
                  machine_key: "proof",
                  display_label: "Proof",
                  value: true,
                  citation_ref: null,
                  is_attested: true,
                },
              ],
            },
          ],
        }),
        ...createOrderedArtifacts().slice(1),
      ],
    });

    expect(() => assertPacketInvariants(packet)).toThrow(
      "Invariant failed: artifact 01 field proof has citation_ref=null but is_attested=true.",
    );
  });

  it("rejects artifacts with gaps that are not marked attested_with_gaps", () => {
    const packet = createPacketData({
      artifacts: [
        createArtifact({
          id: "01",
          gaps: [createGap()],
          status: "attested",
        }),
        ...createOrderedArtifacts().slice(1),
      ],
    });

    expect(() => assertPacketInvariants(packet)).toThrow(
      "Invariant failed: artifact 01 has 1 gap(s) but status is attested.",
    );
  });

  it("rejects gap registers that do not match the artifact gap ids", () => {
    const gap = createGap("gap-1");
    const packet = createPacketData({
      artifacts: [
        createArtifact({
          id: "01",
          gaps: [gap],
          status: "attested_with_gaps",
        }),
        ...createOrderedArtifacts().slice(1),
      ],
      gap_register: [],
    });

    expect(() => assertPacketInvariants(packet)).toThrow(
      "Invariant failed: gap_register must equal the union of artifact gaps by id. register=[] artifactUnion=[gap-1].",
    );
  });

  it("rejects gap register entries that do not exactly match the artifact gap", () => {
    const artifactGap = createGap("gap-1");
    const packet = createPacketData({
      artifacts: [
        createArtifact({
          id: "01",
          gaps: [artifactGap],
          status: "attested_with_gaps",
        }),
        ...createOrderedArtifacts().slice(1),
      ],
      gap_register: [{ ...artifactGap, title: "Different title" }],
    });

    expect(() => assertPacketInvariants(packet)).toThrow(
      "Invariant failed: gap_register entry gap-1 does not exactly match the artifact gap union.",
    );
  });

  it("rejects incorrect artifact counts", () => {
    const packet = createPacketData({
      artifacts: createOrderedArtifacts().slice(0, 11),
    });

    expect(() => assertPacketInvariants(packet)).toThrow(
      "Invariant failed: expected 12 artifacts, received 11.",
    );
  });

  it("rejects incorrect artifact ordering", () => {
    const artifacts = createOrderedArtifacts();
    const packet = createPacketData({
      artifacts: [artifacts[1], artifacts[0], ...artifacts.slice(2)],
    });

    expect(() => assertPacketInvariants(packet)).toThrow(
      "Invariant failed: artifact ids must be in order [01, 02, 03, 04, 05, 07, 06, 11, 08, 09, 10, 12]; received [02, 01, 03, 04, 05, 07, 06, 11, 08, 09, 10, 12].",
    );
  });
});
