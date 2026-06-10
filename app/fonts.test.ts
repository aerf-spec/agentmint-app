import { describe, expect, it, vi } from "vitest";

const monoSpy = vi.fn(() => ({ variable: "--font-mono" }));
const serifSpy = vi.fn(() => ({ variable: "--font-serif" }));

vi.mock("next/font/google", () => ({
  JetBrains_Mono: monoSpy,
  Source_Serif_4: serifSpy,
}));

describe("fonts", () => {
  it("configures the google fonts with the expected options", async () => {
    const fonts = await import("@/app/fonts");

    expect(monoSpy).toHaveBeenCalledWith({
      subsets: ["latin"],
      weight: ["400", "500", "600", "700"],
      variable: "--font-mono",
      display: "swap",
    });
    expect(serifSpy).toHaveBeenCalledWith({
      subsets: ["latin"],
      weight: ["400", "600", "700"],
      style: ["normal", "italic"],
      variable: "--font-serif",
      display: "swap",
    });
    expect(fonts.mono.variable).toBe("--font-mono");
    expect(fonts.serif.variable).toBe("--font-serif");
  });
});
