"use client";

import { useState } from "react";
import { LOG_LEVELS, SERVICES, type Filters, type LogLevel } from "@liveops/shared";
import { useNow } from "@/hooks/useNow";

export interface FilterBarProps {
  filters: Filters;
  onChange: (updates: Partial<Filters>) => void;
}

const TIME_RANGES: Array<{ label: string; ms: number | null }> = [
  { label: "All time", ms: null },
  { label: "5m", ms: 5 * 60_000 },
  { label: "15m", ms: 15 * 60_000 },
  { label: "1h", ms: 60 * 60_000 },
];

const LEVEL_TOGGLE_STYLES: Record<LogLevel, string> = {
  INFO: "data-[active=true]:bg-sky-500/20 data-[active=true]:text-sky-700 dark:data-[active=true]:text-sky-300",
  WARN: "data-[active=true]:bg-amber-500/20 data-[active=true]:text-amber-700 dark:data-[active=true]:text-amber-300",
  ERROR: "data-[active=true]:bg-red-500/20 data-[active=true]:text-red-700 dark:data-[active=true]:text-red-300",
  FATAL: "data-[active=true]:bg-red-600 data-[active=true]:text-white",
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function FilterBar({ filters, onChange }: FilterBarProps) {
  // Local so typing feels instant; the URL write (and therefore `filters.query`)
  // is debounced by useUrlFilters. Deliberately not re-synced from
  // `filters.query` after mount — doing so would fight the user mid-keystroke.
  // The one case this misses (browser back/forward rewriting the query) is an
  // accepted tradeoff at this scope.
  const [queryInput, setQueryInput] = useState(filters.query);
  const now = useNow();

  const activeRangeMs = filters.from !== undefined ? now - filters.from : null;
  const activeRangeLabel =
    filters.from === undefined
      ? "All time"
      : (TIME_RANGES.find((r) => r.ms !== null && Math.abs((activeRangeMs ?? 0) - r.ms) < 60_000)?.label ?? null);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-300/50 bg-white/40 px-3 py-2 text-sm shadow-sm backdrop-blur-xl dark:border-slate-700/50 dark:bg-slate-800/40">
      <div className="flex items-center gap-1" role="group" aria-label="Filter by severity">
        {LOG_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            data-active={filters.levels.includes(level)}
            aria-pressed={filters.levels.includes(level)}
            onClick={() => onChange({ levels: toggle(filters.levels, level) })}
            className={`rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-700/40 ${LEVEL_TOGGLE_STYLES[level]}`}
          >
            {level}
          </button>
        ))}
      </div>

      <div className="h-5 w-px bg-slate-300/60 dark:bg-slate-600/50" aria-hidden="true" />

      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by service">
        {SERVICES.map((service) => (
          <button
            key={service}
            type="button"
            aria-pressed={filters.services.includes(service)}
            onClick={() => onChange({ services: toggle(filters.services, service) })}
            className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200/50 data-[active=true]:bg-slate-700 data-[active=true]:text-white dark:text-slate-400 dark:hover:bg-slate-700/40 dark:data-[active=true]:bg-slate-200 dark:data-[active=true]:text-slate-900"
            data-active={filters.services.includes(service)}
          >
            {service}
          </button>
        ))}
      </div>

      <div className="h-5 w-px bg-slate-300/60 dark:bg-slate-600/50" aria-hidden="true" />

      <div className="flex items-center gap-1" role="group" aria-label="Filter by time range">
        {TIME_RANGES.map((range) => (
          <button
            key={range.label}
            type="button"
            aria-pressed={activeRangeLabel === range.label}
            onClick={() => onChange({ from: range.ms === null ? undefined : Date.now() - range.ms, to: undefined })}
            className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200/50 data-[active=true]:bg-slate-700 data-[active=true]:text-white dark:text-slate-400 dark:hover:bg-slate-700/40 dark:data-[active=true]:bg-slate-200 dark:data-[active=true]:text-slate-900"
            data-active={activeRangeLabel === range.label}
          >
            {range.label}
          </button>
        ))}
      </div>

      <input
        type="search"
        value={queryInput}
        onChange={(e) => {
          setQueryInput(e.target.value);
          onChange({ query: e.target.value });
        }}
        placeholder="Search messages…"
        aria-label="Search log messages"
        className="ml-auto min-w-[180px] flex-1 rounded border border-slate-300/60 bg-white/60 px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-600/50 dark:bg-slate-900/40 dark:text-slate-100"
      />
    </div>
  );
}
