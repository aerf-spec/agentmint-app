import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ViewportToggle } from "@/components/dev/ViewportToggle";

describe("ViewportToggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.dataset.devViewport = "desktop";
    document.documentElement.style.removeProperty("--dev-preview-width");
  });

  afterEach(() => {
    cleanup();
  });

  it("defaults to desktop and applies saved viewport modes", () => {
    window.localStorage.setItem("agentmint-dev-viewport", "390");

    render(<ViewportToggle />);

    expect(document.documentElement.dataset.devViewport).toBe("390");
    expect(document.documentElement.style.getPropertyValue("--dev-preview-width")).toBe("390px");
    expect(screen.getByRole("button", { name: "390px" })).toHaveAttribute("data-active", "true");
  });

  it("switches between viewport sizes and persists the selection", () => {
    render(<ViewportToggle />);

    fireEvent.click(screen.getByRole("button", { name: "360px" }));
    expect(document.documentElement.dataset.devViewport).toBe("360");
    expect(document.documentElement.style.getPropertyValue("--dev-preview-width")).toBe("360px");
    expect(window.localStorage.getItem("agentmint-dev-viewport")).toBe("360");

    fireEvent.click(screen.getByRole("button", { name: "Desktop" }));
    expect(document.documentElement.dataset.devViewport).toBe("desktop");
    expect(document.documentElement.style.getPropertyValue("--dev-preview-width")).toBe("");
    expect(window.localStorage.getItem("agentmint-dev-viewport")).toBe("desktop");
  });
});
