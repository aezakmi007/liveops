"use client";

import { Suspense, useMemo, useState } from "react";
import type { LogEvent } from "@liveops/shared";
import { DetailDrawer } from "@/components/DetailDrawer";
import { FilterBar } from "@/components/FilterBar";
import { LogTable } from "@/components/LogTable";
import { MetricsPanel } from "@/components/MetricsPanel";
import { useLogStream } from "@/hooks/useLogStream";
import { useTabVisibility } from "@/hooks/useTabVisibility";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import { applyFilters } from "@/lib/applyFilters";
import { useLogStore } from "@/store/logStore";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000";
const HISTORY_URL = process.env.NEXT_PUBLIC_HISTORY_URL ?? "http://localhost:4000";

const STATUS_STYLES: Record<string, string> = {
  open: "text-emerald-600 dark:text-emerald-400",
  connecting: "text-slate-400",
  reconnecting: "text-amber-600 dark:text-amber-400",
  closed: "text-slate-400",
};

function Dashboard() {
  const { filters, setFilters } = useUrlFilters();
  const { status, invalidCount, backfill, send } = useLogStream(WS_URL, HISTORY_URL, filters);

  const allEvents = useLogStore((s) => s.events);
  const paused = useLogStore((s) => s.paused);
  const pendingCount = useLogStore((s) => s.pendingCount);
  const pause = useLogStore((s) => s.pause);
  const resume = useLogStore((s) => s.resume);

  const [selectedEvent, setSelectedEvent] = useState<LogEvent | null>(null);

  // The server already narrows what it *sends* to the subscribed filters,
  // but the buffer can still hold events gathered under a previous filter
  // set (e.g. right after the user changes a filter). This is what actually
  // decides what the table shows.
  const filteredEvents = useMemo(() => applyFilters(allEvents, filters), [allEvents, filters]);

  // Tab-hidden pause/resume is a *server-side* pause (stop sending anything
  // at all while nobody's watching), distinct from the manual Pause button
  // below, which only buffers client-side so nothing is missed.
  useTabVisibility({
    onHide: () => send({ type: "pause" }),
    onShow: () => {
      send({ type: "resume" });
      backfill().catch((err: unknown) => {
        console.error("[backfill] failed:", err);
      });
    },
  });

  return (
    // Monitoring/infra dashboards (Grafana, Datadog, financial dashboards)
    // converge on the same palette for a reason: dark slate, near-zero
    // saturation, color spent only on status (emerald = healthy, amber =
    // warning, red = critical). The subtle corner glow is just enough
    // variation for the glass panel below to catch — not a decorative
    // gradient.
    <main className="flex h-dvh flex-col gap-3 bg-slate-100 p-4 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">LiveOps</h1>
        <div className="flex items-center gap-4 text-sm">
          <span className={STATUS_STYLES[status]}>{status}</span>
          {invalidCount > 0 && (
            <span className="text-red-500" title="Events dropped for failing schema validation">
              {invalidCount} invalid
            </span>
          )}
          <button
            onClick={() => (paused ? resume() : pause())}
            className="rounded-lg border border-slate-300/70 bg-white/40 px-3 py-1 font-medium text-slate-800 shadow-sm backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-800/40 dark:text-slate-200"
          >
            {paused ? `Resume${pendingCount > 0 ? ` (${pendingCount} new)` : ""}` : "Pause"}
          </button>
        </div>
      </header>

      <FilterBar filters={filters} onChange={setFilters} />
      <MetricsPanel events={filteredEvents} />

      <div className="min-h-0 flex-1">
        <LogTable events={filteredEvents} onSelectEvent={setSelectedEvent} />
      </div>

      <DetailDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </main>
  );
}

export default function Home() {
  // useUrlFilters (inside Dashboard) reads useSearchParams, which Next.js
  // requires to sit under a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  );
}
