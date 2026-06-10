import type { ReactNode } from "react";

type SerifBodyProps = {
  children: ReactNode;
  className?: string;
};

export function SerifBody({ children, className }: SerifBodyProps) {
  return <p className={["section-body", className].filter(Boolean).join(" ")}>{children}</p>;
}
