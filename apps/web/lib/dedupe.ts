/**
 * Filters `incoming` down to events not already in `seenIds` (and not
 * repeated within `incoming` itself). Takes the id set as a parameter
 * rather than deriving it from the full buffer, so callers can maintain it
 * incrementally instead of rebuilding it from a 200k-event array on every
 * call.
 */
export function dedupeNewEvents<T extends { id: string }>(
  incoming: readonly T[],
  seenIds: ReadonlySet<string>,
): T[] {
  const result: T[] = [];
  const localSeen = new Set<string>();

  for (const item of incoming) {
    if (seenIds.has(item.id) || localSeen.has(item.id)) continue;
    localSeen.add(item.id);
    result.push(item);
  }

  return result;
}
