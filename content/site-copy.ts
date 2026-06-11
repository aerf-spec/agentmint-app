export const siteCopy = {
  home: {
    nav: {
      ctaAriaLabel: "Send your questionnaire",
      ctaFull: "Send your questionnaire →",
      ctaShort: "Send questionnaire →",
    },
    hero: {
      eyebrow: "AI VENDOR PROCUREMENT · HEALTHCARE",
      headlineMono: "Squash",
      headlineSerif: "procurement.",
      subhead:
        "Your deal is in security review. The follow-up questions just landed. This is the packet that clears them.",
      support:
        "Your SOC 2 doesn't cover the AI block. We produce the missing evidence in 48 hours, attested under your name.",
      primaryCta: "Send your questionnaire →",
      secondaryCta: "See a sample packet →",
    },
    credential: {
      body:
        "Six years at Capital One reviewing AI vendors from the buyer side. API security controls, ML fraud detection at 10,000 TPS, Google Vertex AI through approval a year early. I know what a health plan CISO needs to see.",
      byline: "Aniketh Maddipati, founder · ex-Capital One · NYC",
    },
    steps: {
      label: "How It Works",
      items: [
        {
          number: "01",
          day: "DAY 0",
          title: "Send the questionnaire",
          body:
            "Forward your buyer's questionnaire. We isolate the AI-specific block within hours.",
        },
        {
          number: "02",
          day: "DAY 1",
          title: "Answer 18 questions",
          body:
            "We draft from your evidence. You confirm owners, dates, and mechanisms.",
        },
        {
          number: "03",
          day: "DAY 2",
          title: "Attest and submit",
          body:
            "Twelve artifacts, honest gap register, hash-verified. You sign it; review proceeds.",
        },
      ],
    },
    intake: {
      label: "SEND YOUR QUESTIONNAIRE",
      intro: "We review every submission personally. Response within 24 hours.",
      calendarCta: "Book a 15-minute scoping call →",
      mailtoLabel: "Email your questionnaire to aniketh@agentmint.run",
      offers: {
        designPartner: {
          kicker: "DESIGN PARTNER",
          pill: "TWO SLOTS REMAINING",
          title: "Free",
          body: "Real stalled deals only; you become a reference.",
          cta: "Apply by email →",
        },
        standard: {
          kicker: "STANDARD ENGAGEMENT",
          price: "$3,500",
          body: "My time is refundable.",
          continuous: "48-HOUR DELIVERY · CONTINUOUS",
          cta: "Reserve standard engagement →",
        },
      },
    },
    footer: {
      standardLinkLabel: "AERF",
      tag: "Making AI agents procurement-ready.",
    },
  },
  packet: {
    metadata: {
      title: "SampleHealth prior-auth-v2.1 — AI Vendor Evidence Packet (sample)",
      description:
        "Twelve attested AI governance artifacts in the format health plan security reviews consume.",
    },
    nav: {
      verifyLabel: "Verify",
    },
    sampleBanner:
      "SAMPLE — SampleHealth is fictional. Format, field depth, and gap handling are exactly what attested packets contain.",
    artifactsLabel: "AI VENDOR EVIDENCE ARTIFACTS",
    exit: {
      copy: "Your agent needs one of these. Send us your questionnaire →",
      cta: "Send us your questionnaire →",
    },
    footer: {
      standardLabel: "Evidence format: AERF, an open standard",
    },
  },
} as const;
