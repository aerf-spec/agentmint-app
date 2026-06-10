import type { ReactNode } from "react";

type MonoLabelProps = {
  children: ReactNode;
  className?: string;
};

export function MonoLabel({ children, className }: MonoLabelProps) {
  return <p className={["section-label", className].filter(Boolean).join(" ")}>{children}</p>;
}
