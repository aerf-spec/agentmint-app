import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/fonts", () => ({
  mono: { variable: "mono-font" },
  serif: { variable: "serif-font" },
}));

vi.mock("@/components/dev/ViewportToggle", () => ({
  ViewportToggle: () => <div data-testid="viewport-toggle">Viewport toggle</div>,
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("RootLayout", () => {
  it("renders the shell, decorative layers, and html font classes", async () => {
    const module = await import("@/app/layout");
    const RootLayout = module.default;

    const markup = renderToStaticMarkup(
      <RootLayout>
        <div>Child content</div>
      </RootLayout>,
    );

    expect(module.metadata.title).toBe("AgentMint — AI Vendor Evidence Packets");
    expect(module.metadata.description).toContain("Deal desks don't need weeks");
    expect(module.metadata.openGraph?.title).toBe("AgentMint — AI Vendor Evidence Packets");
    expect(JSON.stringify(module.metadata.twitter)).toContain('"card":"summary"');
    expect(markup).toContain('class="mono-font serif-font"');
    expect(markup).toContain('class="dot-grid"');
    expect(markup).toContain('class="hero-gradient"');
    expect(markup).toContain("Child content");
  });

  it("renders the dev viewport toggle in development", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const module = await import("@/app/layout");
    const RootLayout = module.default;

    const markup = renderToStaticMarkup(
      <RootLayout>
        <div>Child content</div>
      </RootLayout>,
    );

    expect(markup).toContain('data-testid="viewport-toggle"');
  });
});
