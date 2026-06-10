"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "agentmint-dev-viewport";

const VIEWPORTS = [
  { id: "desktop", label: "Desktop", width: null },
  { id: "390", label: "390px", width: "390px" },
  { id: "360", label: "360px", width: "360px" },
] as const;

type ViewportMode = (typeof VIEWPORTS)[number]["id"];

function applyViewport(mode: ViewportMode) {
  const root = document.documentElement;

  root.dataset.devViewport = mode;

  if (mode === "desktop") {
    root.style.removeProperty("--dev-preview-width");
    return;
  }

  const viewport = VIEWPORTS.find((entry) => entry.id === mode);

  if (viewport?.width) {
    root.style.setProperty("--dev-preview-width", viewport.width);
  }
}

export function ViewportToggle() {
  const [mode, setMode] = useState<ViewportMode>("desktop");

  useEffect(() => {
    const storedMode = window.localStorage.getItem(STORAGE_KEY);
    const initialMode =
      storedMode === "desktop" || storedMode === "390" || storedMode === "360"
        ? storedMode
        : "desktop";

    setMode(initialMode);
    applyViewport(initialMode);

    return () => {
      document.documentElement.dataset.devViewport = "desktop";
      document.documentElement.style.removeProperty("--dev-preview-width");
    };
  }, []);

  function handleModeChange(nextMode: ViewportMode) {
    setMode(nextMode);
    window.localStorage.setItem(STORAGE_KEY, nextMode);
    applyViewport(nextMode);
  }

  return (
    <div className="dev-viewport-toggle no-print" aria-label="Viewport toggle">
      <p className="dev-viewport-toggle__label">Viewport</p>
      <div className="dev-viewport-toggle__group" role="group" aria-label="Viewport size">
        {VIEWPORTS.map((viewport) => (
          <button
            key={viewport.id}
            type="button"
            className="dev-viewport-toggle__button"
            data-active={mode === viewport.id}
            onClick={() => handleModeChange(viewport.id)}
          >
            {viewport.label}
          </button>
        ))}
      </div>
    </div>
  );
}
