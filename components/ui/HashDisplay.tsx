"use client";

import { useEffect, useRef, useState } from "react";

type HashDisplayProps = {
  hash: string;
  short?: boolean;
};

function shortenHash(hash: string) {
  if (hash.length <= 18) {
    return hash;
  }

  return `${hash.slice(0, 12)}...${hash.slice(-6)}`;
}

export function HashDisplay({ hash, short = false }: HashDisplayProps) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="hash-display">
      <code className="hash-display__value">{short ? shortenHash(hash) : hash}</code>
      <button
        type="button"
        className="hash-display__button no-print"
        onClick={handleCopy}
      >
        {copied ? "Copied" : "Copy Hash"}
      </button>
    </div>
  );
}
