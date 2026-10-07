import type { Filters, LogEvent } from "@liveops/shared";

export function matchesFilters(event: LogEvent, filters: Filters): boolean {
  if (filters.levels.length > 0 && !filters.levels.includes(event.level)) return false;
  if (filters.services.length > 0 && !filters.services.includes(event.service)) return false;
  if (filters.from !== undefined && event.ts < filters.from) return false;
  if (filters.to !== undefined && event.ts > filters.to) return false;
  if (filters.query.trim().length > 0) {
    const needle = filters.query.trim().toLowerCase();
    if (!event.message.toLowerCase().includes(needle)) return false;
  }
  return true;
}
