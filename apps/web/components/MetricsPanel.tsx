"use client";

import { useMemo, type ReactNode } from "react";
import { Area, AreaChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { LogEvent } from "@liveops/shared";
import { useNow } from "@/hooks/useNow";
import { errorRatePerMinute, eventsPerSecond, p95LatencyPerMinute } from "@/lib/metrics";

const METRICS_WINDOW_MS = 15 * 60_000;
const TICK_STYLE = { fontSize: 10, fill: "#94a3b8" };

function formatMinuteTick(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit" });
}

function formatSecondTick(second: number): string {
  return new Date(second * 1000).toLocaleTimeString(undefined, { hour12: false, minute: "2-digit", second: "2-digit" });
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-slate-300/50 bg-white/40 p-3 shadow-sm backdrop-blur-xl dark:border-slate-700/50 dark:bg-slate-800/40">
      <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h3>
      <div className="h-28">{children}</div>
    </div>
  );
}

export interface MetricsPanelProps {
  /** Already filtered (see lib/applyFilters.ts) — the metrics reflect
   * whatever the user is currently looking at, same as the table. */
  events: LogEvent[];
}

export function MetricsPanel({ events }: MetricsPanelProps) {
  const now = useNow();

  // The charts only need a trailing window; scanning the full 200k-capacity
  // buffer every render would be wasted work once the stream's been running
  // a while. Events are append-ordered by ts, so a single findIndex scan
  // finds the cutoff without sorting.
  const recentEvents = useMemo(() => {
    const cutoff = now - METRICS_WINDOW_MS;
    const idx = events.findIndex((e) => e.ts >= cutoff);
    return idx === -1 ? [] : events.slice(idx);
  }, [events, now]);

  const errorRate = useMemo(() => errorRatePerMinute(recentEvents), [recentEvents]);
  const p95Latency = useMemo(() => p95LatencyPerMinute(recentEvents), [recentEvents]);
  const throughput = useMemo(() => eventsPerSecond(recentEvents, 60, now), [recentEvents, now]);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <ChartCard title="Error rate / min">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={errorRate}>
            <XAxis dataKey="minute" tickFormatter={formatMinuteTick} tick={TICK_STYLE} />
            <YAxis tick={TICK_STYLE} width={30} unit="%" />
            <Tooltip
              labelFormatter={(v) => formatMinuteTick(Number(v))}
              formatter={(v) => [`${Number(v).toFixed(1)}%`, "Error rate"]}
            />
            <Line type="monotone" dataKey="value" stroke="#ef4444" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="p95 latency / min">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={p95Latency}>
            <XAxis dataKey="minute" tickFormatter={formatMinuteTick} tick={TICK_STYLE} />
            <YAxis tick={TICK_STYLE} width={34} unit="ms" />
            <Tooltip
              labelFormatter={(v) => formatMinuteTick(Number(v))}
              formatter={(v) => [`${Math.round(Number(v))}ms`, "p95 latency"]}
            />
            <Line type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Events / sec">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={throughput}>
            <XAxis dataKey="second" tickFormatter={formatSecondTick} tick={TICK_STYLE} />
            <YAxis tick={TICK_STYLE} width={28} />
            <Tooltip
              labelFormatter={(v) => formatSecondTick(Number(v))}
              formatter={(v) => [Number(v), "events/sec"]}
            />
            <Area type="monotone" dataKey="count" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.2} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
