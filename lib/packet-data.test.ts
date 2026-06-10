import { describe, expect, it } from "vitest";

import claraHealthPacket from "@/lib/packet-data";
import { PACKET_HASH } from "@/lib/packet-hash";

describe("packet data exports", () => {
  it("exports the placeholder packet shape and a generated hash", () => {
    expect(claraHealthPacket.artifacts).toEqual([]);
    expect(claraHealthPacket.gap_register).toEqual([]);
    expect(claraHealthPacket.executive_summary.top_gaps).toEqual([]);
    expect(PACKET_HASH).toMatch(/^[a-f0-9]{64}$/);
  });
});
