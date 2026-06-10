import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "@/app/page";

describe("HomePage", () => {
  it("renders the packet scaffold message", () => {
    render(<HomePage />);

    expect(screen.getByText("AgentMint")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /packet system scaffold/i })).toBeInTheDocument();
    expect(screen.getByText(/Use/i)).toHaveTextContent("/test");
  });
});
