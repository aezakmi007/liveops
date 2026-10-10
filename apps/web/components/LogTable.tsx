"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { LogEvent, LogLevel } from "@liveops/shared";
import { useLogStore } from "@/store/logStore";

const ROW_HEIGHT = 32;
const GRID_COLS = "88px 72px 140px 1fr 90px";

// Semantic status colors only — INFO/WARN/ERROR stay muted (this is a dense
// stream, not a palette showcase); FATAL is the one level that should
// actually interrupt the eye, so it's the only solid fill.
const LEVEL_STYLES: Record<LogLevel, string> = {
  INFO: "bg-sky-500/10 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300",
  WARN: "bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
  ERROR: "bg-red-500/10 text-red-700 dark:bg-red-400/10 dark:text-red-300",
  FATAL: "bg-red-600 text-white dark:bg-red-500",
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

interface RowProps {
  event: LogEvent;
  onSelect?: (event: LogEvent) => void;
}

// Memoized so a virtualizer re-render (e.g. from scrolling) doesn't re-render
// rows whose underlying event object hasn't changed.
const Row = memo(function Row({ event, onSelect }: RowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${event.level} log from ${event.service} at ${formatTime(event.ts)}: ${event.message}`}
      className="grid cursor-pointer items-center gap-3 border-b border-slate-300/30 px-3 text-sm text-slate-900 hover:bg-slate-200/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-slate-500 dark:border-slate-700/30 dark:text-slate-100 dark:hover:bg-slate-700/20"
      style={{ gridTemplateColumns: GRID_COLS, height: ROW_HEIGHT }}
      onClick={() => onSelect?.(event)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(event);
        }
      }}
    >
      <span className="font-mono text-xs text-slate-600 dark:text-slate-400">{formatTime(event.ts)}</span>
      <span className={`w-fit rounded px-1.5 py-0.5 text-xs font-medium ${LEVEL_STYLES[event.level]}`}>
        {event.level}
      </span>
      <span className="truncate text-slate-700 dark:text-slate-300">{event.service}</span>
      <span className="truncate">{event.message}</span>
      <span className="text-right font-mono text-xs text-slate-600 dark:text-slate-400">{event.latencyMs}ms</span>
    </div>
  );
});

export interface LogTableProps {
  /** Already filtered (see lib/applyFilters.ts) — this component just
   * renders and virtualizes whatever it's given. */
  events: LogEvent[];
  onSelectEvent?: (event: LogEvent) => void;
}

export function LogTable({ events, onSelectEvent }: LogTableProps) {
  const paused = useLogStore((s) => s.paused);

  const parentRef = useRef<HTMLDivElement>(null);
  // Whether the user is parked at the bottom (auto-follow) or has scrolled
  // up to read older rows (auto-scroll pauses, but new events keep arriving
  // into the buffer in the background — baselineCountRef + newSinceScroll
  // below surface that so it doesn't look like the stream froze).
  const [isAtBottom, setIsAtBottom] = useState(true);
  const baselineCountRef = useRef(events.length);

  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  useEffect(() => {
    if (paused || !isAtBottom || events.length === 0) return;
    virtualizer.scrollToIndex(events.length - 1, { align: "end" });
  }, [events.length, paused, isAtBottom, virtualizer]);

  function handleScroll(): void {
    const el = parentRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom <= ROW_HEIGHT * 2;
    setIsAtBottom((prev) => {
      if (prev && !atBottom) baselineCountRef.current = events.length;
      return atBottom;
    });
  }

  const newSinceScroll = isAtBottom ? 0 : events.length - baselineCountRef.current;

  function jumpToLatest(): void {
    setIsAtBottom(true);
    virtualizer.scrollToIndex(events.length - 1, { align: "end" });
  }

  return (
    // Frosted glass panel in the same slate family as the page background —
    // translucent fill + blur + a hairline border, not a colored overlay.
    // Rows stay solid, high-contrast text; glass is for the container only.
    <div className="relative flex h-full flex-col overflow-hidden rounded-xl border border-slate-300/50 bg-white/40 shadow-xl backdrop-blur-xl dark:border-slate-700/50 dark:bg-slate-800/40">
      <div
        className="grid gap-3 border-b border-slate-300/50 bg-slate-100/50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-600 backdrop-blur-md dark:border-slate-700/40 dark:bg-slate-900/40 dark:text-slate-400"
        style={{ gridTemplateColumns: GRID_COLS }}
      >
        <span>Time</span>
        <span>Level</span>
        <span>Service</span>
        <span>Message</span>
        <span className="text-right">Latency</span>
      </div>

      {newSinceScroll > 0 && (
        <button
          onClick={jumpToLatest}
          className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-slate-600/30 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-md dark:border-slate-400/20 dark:bg-slate-200/80 dark:text-slate-900"
        >
          ↓ {newSinceScroll} new — jump to latest
        </button>
      )}

      <div ref={parentRef} onScroll={handleScroll} className="flex-1 overflow-auto">
        {events.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">Waiting for events…</div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((item) => {
              const event = events[item.index];
              if (!event) return null;
              return (
                <div
                  key={event.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  <Row event={event} onSelect={onSelectEvent} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
