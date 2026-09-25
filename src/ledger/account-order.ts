/** The ids with `id` moved `steps` places (negative is up), stopping at either end. */
export function moveInOrder(ids: readonly string[], id: string, steps: number): string[] {
  const from = ids.indexOf(id);
  if (from < 0) return [...ids];
  const to = Math.min(ids.length - 1, Math.max(0, from + steps));
  const next = ids.filter(other => other !== id);
  next.splice(to, 0, id);
  return next;
}
