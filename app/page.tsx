import { SectionObserver } from "@/components/home/SectionObserver";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { siteCopy } from "@/content/site-copy";

const tallyFormUrl = process.env.TALLY_FORM_URL;
const stripeStandardUrl = process.env.STRIPE_STANDARD;
const calendarUrl = process.env.NEXT_PUBLIC_CALENDAR_URL;
const copy = siteCopy.home;
const heroTerminalLines = [
  { prefix: "$", label: "questionnaire", value: "uploaded" },
  { prefix: ">", label: "artifacts", value: "12 generated" },
  { prefix: ">", label: "gap_register", value: "7 rows disclosed" },
  { prefix: ">", label: "packet_hash", value: "sha256 verified" },
  { prefix: ">", label: "delivery_window", value: "48 hours" },
] as const;

export default function HomePage() {
  return (
    <>
      <SectionObserver selector="[data-reveal]" />
      <nav className="nav">
        <div className="nav-inner">
          <a href="/" className="wordmark" aria-label="AgentMint">
            <span className="wordmark__agent">Agent</span>
            <span className="wordmark__mint">Mint</span>
          </a>
          <a href="#intake" className="cta-primary nav-cta" aria-label={copy.nav.ctaAriaLabel}>
            <span className="nav-cta__full">{copy.nav.ctaFull}</span>
            <span className="nav-cta__short" aria-hidden="true">
              {copy.nav.ctaShort}
            </span>
          </a>
        </div>
      </nav>

      <main className="home-page">
        <section className="section visible home-hero">
          <div className="container home-hero__grid">
            <div className="home-hero__content">
              <MonoLabel className="home-hero__eyebrow">{copy.hero.eyebrow}</MonoLabel>
              <h1 className="hero-headline hero-line hero-line--one">
                <span className="hero-headline__mono">{copy.hero.headlineMono}</span>{" "}
                <span className="hero-headline__serif">{copy.hero.headlineSerif}</span>
              </h1>
              <p className="home-hero__subhead hero-line hero-line--two">{copy.hero.subhead}</p>
              <p className="home-hero__support hero-line hero-line--three">{copy.hero.support}</p>
              <div className="home-hero__actions">
                <a href="#intake" className="cta-primary">
                  {copy.hero.primaryCta}
                </a>
                <a href="/p/sample-health-001" className="cta-secondary">
                  {copy.hero.secondaryCta}
                </a>
              </div>
            </div>

            <div className="hero-right" aria-hidden="true">
              <p className="terminal-context">sample-health-001.packet · local preview</p>
              <div className="terminal">
                <div className="terminal-chrome">
                  <div className="terminal-dots">
                    <span className="terminal-dot red" />
                    <span className="terminal-dot yellow" />
                    <span className="terminal-dot green" />
                  </div>
                  <div className="terminal-title">agentmint proof packet</div>
                </div>
                <div className="terminal-body">
                  <div className="scan-beam" />
                  {heroTerminalLines.map((line) => (
                    <p key={line.label} className="terminal-line">
                      <span className="prefix">{line.prefix} </span>
                      <span className="label">{line.label}</span>
                      <span className="value"> {line.value}</span>
                    </p>
                  ))}
                  <p className="verified-line">PASS buyer-verification.sh</p>
                </div>
              </div>
              <p className="home-hero__exhibit-note">
                SAMPLE — SampleHealth is fictional. Packet format, field depth, and gap handling
                match the attested deliverable.
              </p>
            </div>
          </div>
        </section>

        <section className="section home-section" data-reveal>
          <div className="container home-section__inner">
            <div className="home-copy">
              <p className="home-credential">{copy.credential.body}</p>
              <p className="home-credential__byline">{copy.credential.byline}</p>
            </div>
          </div>
        </section>

        <section className="section home-section" data-reveal>
          <div className="container home-section__inner">
            <MonoLabel>{copy.steps.label}</MonoLabel>
            <div className="steps">
              {copy.steps.items.map((step) => (
                <article key={step.number} className="step-card">
                  <p className="step-num">{step.number}</p>
                  <p className="step-day">{step.day}</p>
                  <h2 className="step-title">{step.title}</h2>
                  <p className="step-content">{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="intake" className="section home-section" data-reveal>
          <div className="container home-section__inner">
            <MonoLabel>{copy.intake.label}</MonoLabel>
            <div className="home-copy">
              <p className="home-intake__intro">{copy.intake.intro}</p>
              {calendarUrl ? (
                <div className="home-intake__actions">
                  <a
                    className="cta-secondary"
                    href={calendarUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {copy.intake.calendarCta}
                  </a>
                </div>
              ) : null}
              {tallyFormUrl ? (
                <iframe
                  src={tallyFormUrl}
                  title="Questionnaire intake form"
                  className="home-intake__frame"
                />
              ) : (
                <a className="home-intake__mail" href="mailto:aniketh@agentmint.run">
                  {copy.intake.mailtoLabel}
                </a>
              )}
              <div className="offer-grid">
                <article className="offer-card">
                  <p className="offer-kicker">{copy.intake.offers.designPartner.kicker}</p>
                  <p className="offer-pill">{copy.intake.offers.designPartner.pill}</p>
                  <h2 className="offer-title">{copy.intake.offers.designPartner.title}</h2>
                  <p className="offer-copy">{copy.intake.offers.designPartner.body}</p>
                  <a className="cta-secondary" href="mailto:aniketh@agentmint.run?subject=Design%20Partner">
                    {copy.intake.offers.designPartner.cta}
                  </a>
                </article>
                <article className="offer-card">
                  <p className="offer-kicker">{copy.intake.offers.standard.kicker}</p>
                  <p className="offer-price">{copy.intake.offers.standard.price}</p>
                  <p className="offer-copy">{copy.intake.offers.standard.body}</p>
                  <p className="offer-caption">{copy.intake.offers.standard.continuous}</p>
                  <a
                    className="cta-primary"
                    href={
                      stripeStandardUrl ||
                      "mailto:aniketh@agentmint.run?subject=Standard%20Engagement"
                    }
                    target={stripeStandardUrl ? "_blank" : undefined}
                    rel={stripeStandardUrl ? "noreferrer" : undefined}
                  >
                    {copy.intake.offers.standard.cta}
                  </a>
                </article>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="home-footer">
        <div className="home-footer__inner">
          <a href="/" className="wordmark" aria-label="AgentMint">
            <span className="wordmark__agent">Agent</span>
            <span className="wordmark__mint">Mint</span>
          </a>
          <a href="https://github.com/aerf-spec/aerf" className="home-footer__link">
            {copy.footer.standardLinkLabel}
          </a>
          <p className="home-footer__tag">{copy.footer.tag}</p>
        </div>
      </footer>
    </>
  );
}
