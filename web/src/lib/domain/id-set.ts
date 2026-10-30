/** A copy of the ids with `id` added (`included`) or removed */
export function withId(ids: ReadonlySet<number>, id: number, included: boolean): Set<number> {
  const next = new Set(ids);
  if (included) next.add(id);
  else next.delete(id);
  return next;
}

/** A copy of the ids with `id` removed if it was in them, added otherwise */
export function toggledId(ids: ReadonlySet<number>, id: number): Set<number> {
  return withId(ids, id, !ids.has(id));
}
