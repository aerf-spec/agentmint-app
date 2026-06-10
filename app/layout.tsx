import type { Metadata } from "next";
import type { ReactNode } from "react";

import { mono, serif } from "@/app/fonts";
import { ViewportToggle } from "@/components/dev/ViewportToggle";

import "@/styles/globals.css";
import "@/styles/print.css";

export const metadata: Metadata = {
  title: "AgentMint",
  description: "Workflow-to-deployment proof packet app for AI agent companies.",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={`${mono.variable} ${serif.variable}`}>
      <body>
        <div className="dot-grid" aria-hidden="true" />
        <div className="hero-gradient" aria-hidden="true" />
        <div className="site-shell">{children}</div>
        {process.env.NODE_ENV === "development" ? <ViewportToggle /> : null}
      </body>
    </html>
  );
}
