"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** False during SSR and before hydration; true once React is interactive. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
