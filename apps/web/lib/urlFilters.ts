import { EMPTY_FILTERS, logLevelSchema, type Filters, type LogLevel } from "@liveops/shared";

function parseLevels(raw: string | null): LogLevel[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is LogLevel => logLevelSchema.safeParse(s).success);
}

function parseServices(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseTimestamp(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Pure: reconstructs a Filters object from a URL's query string. */
export function searchParamsToFilters(params: URLSearchParams): Filters {
  return {
    levels: parseLevels(params.get("levels")),
    services: parseServices(params.get("services")),
    query: params.get("q") ?? EMPTY_FILTERS.query,
    from: parseTimestamp(params.get("from")),
    to: parseTimestamp(params.get("to")),
  };
}

/** Pure: the inverse of searchParamsToFilters. Omits empty/default fields
 * entirely rather than writing them as empty params, so a cleared filter
 * produces a clean URL instead of `?levels=&services=&q=`. */
export function filtersToSearchParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.levels.length > 0) params.set("levels", filters.levels.join(","));
  if (filters.services.length > 0) params.set("services", filters.services.join(","));
  if (filters.query.trim().length > 0) params.set("q", filters.query);
  if (filters.from !== undefined) params.set("from", String(filters.from));
  if (filters.to !== undefined) params.set("to", String(filters.to));
  return params;
}
