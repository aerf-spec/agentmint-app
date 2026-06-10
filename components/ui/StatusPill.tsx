import type { CSSProperties } from "react";

type StatusPillProps = {
  status: "attested" | "attested_with_gaps" | "gap" | "sample";
};

const STYLES: Record<StatusPillProps["status"], { label: string; style: CSSProperties }> = {
  attested: {
    label: "ATTESTED",
    style: {
      background: "rgba(16, 185, 129, 0.1)",
      border: "1px solid rgba(16, 185, 129, 0.35)",
      color: "var(--green)",
    },
  },
  attested_with_gaps: {
    label: "ATTESTED WITH GAPS",
    style: {
      background: "rgba(251, 191, 36, 0.1)",
      border: "1px solid rgba(251, 191, 36, 0.35)",
      color: "var(--yellow)",
    },
  },
  gap: {
    label: "GAP",
    style: {
      background: "rgba(251, 191, 36, 0.1)",
      border: "1px solid rgba(251, 191, 36, 0.35)",
      color: "var(--yellow)",
    },
  },
  sample: {
    label: "SAMPLE",
    style: {
      background: "transparent",
      border: "1px solid var(--yellow)",
      color: "var(--yellow)",
    },
  },
};

export function StatusPill({ status }: StatusPillProps) {
  const entry = STYLES[status];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "18px",
        padding: "4px 10px",
        borderRadius: "4px",
        fontFamily: "var(--font-mono), monospace",
        fontSize: "10px",
        fontWeight: 700,
        letterSpacing: "0.08em",
        lineHeight: 1,
        textTransform: "uppercase",
        ...entry.style,
      }}
    >
      {entry.label}
    </span>
  );
}
