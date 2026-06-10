import { HashDisplay } from "@/components/ui/HashDisplay";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { SerifBody } from "@/components/ui/SerifBody";
import { SignedStamp } from "@/components/ui/SignedStamp";
import { StatusPill } from "@/components/ui/StatusPill";
import { PACKET_HASH } from "@/lib/packet-hash";
import { resolveSampleHash } from "@/lib/test-page";

const SAMPLE_HASH = resolveSampleHash(PACKET_HASH);

const STATUS_VARIANTS = ["attested", "attested_with_gaps", "gap", "sample"] as const;

export default function TestPage() {
  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <span className="packet-stamp">Healthcare Packet System</span>
          <StatusPill status="sample" />
        </div>
      </nav>
      <main className="container test-page">
        <section className="section visible test-page__hero">
          <MonoLabel>Component Test Surface</MonoLabel>
          <h1 className="section-title">UI primitives on the production dark canvas.</h1>
          <SerifBody>
            This page is intentionally small and content-light. It exists so the visual tokens,
            typography, print behavior, and packet proof components can be checked in isolation.
          </SerifBody>
        </section>

        <section className="section visible test-page__grid">
          <article className="packet-card">
            <MonoLabel>StatusPill</MonoLabel>
            <div className="test-page__pill-row">
              {STATUS_VARIANTS.map((status) => (
                <StatusPill key={status} status={status} />
              ))}
            </div>
          </article>

          <article className="packet-card">
            <MonoLabel>SignedStamp</MonoLabel>
            <div className="test-page__stamp-wrap">
              <SignedStamp date="2026-06-09" />
            </div>
          </article>

          <article className="packet-card">
            <MonoLabel>HashDisplay</MonoLabel>
            <HashDisplay hash={SAMPLE_HASH} short />
          </article>
        </section>

        <section className="section visible test-page__artifact">
          <article className="packet-card artifact-card">
            <MonoLabel>Typography Preview</MonoLabel>
            <h2 className="test-page__artifact-title">Serif narrative with mono metadata.</h2>
            <SerifBody>
              The visual system keeps body copy editorial and calm, then uses the mono treatment
              to signal provenance, machine readability, and control surfaces.
            </SerifBody>
            <div className="packet-field">
              <span className="section-label test-page__field-label">Sample Field</span>
              <div className="packet-value">artifact_id=sample-health-001 / status=attested</div>
            </div>
          </article>
        </section>
      </main>
    </>
  );
}
