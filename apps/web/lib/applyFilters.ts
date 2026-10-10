import type { Filters, LogEvent } from "@liveops/shared";

/**
 * The server already narrows what it *sends* a client to its subscribed
 * filters, but the client's buffer can still hold events gathered under a
 * previous (different) filter set — e.g. right after the user changes a
 * filter, or after a history backfill. This is the single source of truth
 * for what a filter set matches, used both to decide what the table shows
 * and, identically, by the server's own matching (see
 * apps/ws-server/src/matchFilters.ts) — kept as separate implementations
 * since the two run in different runtimes, but intentionally the same
 * logic.
 */
export function applyFilters(events: readonly LogEvent[], filters: Filters): LogEvent[] {
  const query = filters.query.trim().toLowerCase();

  return events.filter((event) => {
    if (filters.levels.length > 0 && !filters.levels.includes(event.level)) return false;
    if (filters.services.length > 0 && !filters.services.includes(event.service)) return false;
    if (filters.from !== undefined && event.ts < filters.from) return false;
    if (filters.to !== undefined && event.ts > filters.to) return false;
    if (query.length > 0 && !event.message.toLowerCase().includes(query)) return false;
    return true;
  });
}
