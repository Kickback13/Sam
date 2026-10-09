/** Fractional ordering for kanban cards: a new position strictly between two neighbors. */
export function positionBetween(prev: number | undefined, next: number | undefined): number {
  if (prev === undefined && next === undefined) return 1000;
  if (prev === undefined) return (next as number) - 1000;
  if (next === undefined) return prev + 1000;
  return (prev + next) / 2;
}

/** Position for an item inserted at `index` of `list` (list excludes the moving item). */
export function positionAt(list: { position: number }[], index: number): number {
  const i = Math.max(0, Math.min(index, list.length));
  return positionBetween(list[i - 1]?.position, list[i]?.position);
}
