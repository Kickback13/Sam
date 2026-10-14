/** Double-booking detection for estimate visits (a warning, not a hard block — AZH-007). */
export type VisitSlot = {
  id: string;
  estimatorId: string | null;
  startsAt: string | Date;
  endsAt: string | Date;
  status?: string;
};

const ms = (v: string | Date) => (v instanceof Date ? v.getTime() : new Date(v).getTime());

/** Half-open intervals: a visit ending at 10:00 does not overlap one starting at 10:00. */
export function overlaps(
  a: Pick<VisitSlot, "startsAt" | "endsAt">,
  b: Pick<VisitSlot, "startsAt" | "endsAt">,
) {
  return ms(a.startsAt) < ms(b.endsAt) && ms(b.startsAt) < ms(a.endsAt);
}

/** Existing visits that clash with `candidate` for the same estimator (canceled ones ignored). */
export function findConflicts(candidate: VisitSlot, existing: VisitSlot[]): VisitSlot[] {
  if (!candidate.estimatorId) return [];
  return existing.filter(
    (v) =>
      v.id !== candidate.id &&
      v.status !== "canceled" &&
      v.estimatorId === candidate.estimatorId &&
      overlaps(candidate, v),
  );
}

/** Ids of every visit that is double-booked with another one (for the week view). */
export function doubleBookedIds(visits: VisitSlot[]): Set<string> {
  const out = new Set<string>();
  const active = visits.filter((v) => v.status !== "canceled" && v.estimatorId);
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      if (a.estimatorId === b.estimatorId && overlaps(a, b)) {
        out.add(a.id);
        out.add(b.id);
      }
    }
  }
  return out;
}
