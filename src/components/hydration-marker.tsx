"use client";

import { useEffect } from "react";

/** Marks <html data-hydrated> once the app is interactive (used by e2e tests). */
export function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return null;
}
