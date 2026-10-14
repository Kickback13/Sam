"use client";

import { HardHat, MapPinned } from "lucide-react";
import { createContext, useContext } from "react";

import { officeLabel } from "../constants";
import type { CardExtra } from "../server/queries";

const Ctx = createContext<Record<string, CardExtra> | null>(null);

/** Supplies AZH project details to board cards (no-op outside construction boards). */
export function DealCardExtrasProvider({
  extras,
  children,
}: {
  extras: Record<string, CardExtra> | null;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={extras}>{children}</Ctx.Provider>;
}

/** Hook-in point for the shared deal card: office + services for AZH projects, else null. */
export function useDealCardExtra(dealId: string): React.ReactNode {
  const extras = useContext(Ctx);
  const extra = extras?.[dealId];
  if (!extra || (!extra.office && extra.services.length === 0)) return null;
  return (
    <div className="mt-1 space-y-0.5 text-xs text-muted-foreground" data-testid="card-azh">
      {extra.office && (
        <p className="flex items-center gap-1">
          <MapPinned className="size-3 shrink-0" aria-hidden />
          {officeLabel(extra.office)} office
        </p>
      )}
      {extra.services.length > 0 && (
        <p className="flex items-center gap-1 truncate">
          <HardHat className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{extra.services.join(", ")}</span>
        </p>
      )}
    </div>
  );
}
