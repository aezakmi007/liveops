"use client";

import { useCallback, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Filters } from "@liveops/shared";
import { filtersToSearchParams, searchParamsToFilters } from "@/lib/urlFilters";

const QUERY_DEBOUNCE_MS = 250;

export interface UseUrlFiltersResult {
  filters: Filters;
  /** Merges `updates` into the current filters and writes the result to the
   * URL. A `query`-only update is debounced (typing shouldn't spam
   * history); every other field commits immediately. */
  setFilters: (updates: Partial<Filters>) => void;
}

export function useUrlFilters(): UseUrlFiltersResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(() => searchParamsToFilters(searchParams), [searchParams]);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setFilters = useCallback(
    (updates: Partial<Filters>) => {
      const next: Filters = { ...filters, ...updates };
      const isQueryOnlyChange = Object.keys(updates).every((k) => k === "query");

      function commit(): void {
        const qs = filtersToSearchParams(next).toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }

      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (isQueryOnlyChange) {
        debounceTimer.current = setTimeout(commit, QUERY_DEBOUNCE_MS);
      } else {
        commit();
      }
    },
    [filters, pathname, router],
  );

  return { filters, setFilters };
}
