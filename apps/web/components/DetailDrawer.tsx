"use client";

import { useEffect, useRef, useState } from "react";
import type { LogEvent } from "@liveops/shared";
import { useLogStore } from "@/store/logStore";

export interface DetailDrawerProps {
  event: LogEvent | null;
  onClose: () => void;
}

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function DetailDrawer({ event, onClose }: DetailDrawerProps) {
  const allEvents = useLogStore((s) => s.events);
  const drawerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);

  // Focus trap + Esc-to-close + focus restoration. Runs once per open (keyed
  // on `event` becoming non-null) rather than on every render.
  useEffect(() => {
    if (!event) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    drawerRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const container = drawerRef.current;
      if (!container) return;
      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [event, onClose]);

  if (!event) return null;

  const related = allEvents.filter((e) => e.traceId === event.traceId && e.id !== event.id);

  function copyTraceId(): void {
    navigator.clipboard
      .writeText(event!.traceId)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // Clipboard access can be denied (permissions, non-HTTPS context);
        // the button simply won't flip to "Copied!" in that case.
      });
  }

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/30" onClick={onClose}>
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-drawer-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col gap-3 overflow-y-auto border-l border-slate-300/50 bg-white/95 p-4 shadow-xl backdrop-blur-xl focus:outline-none dark:border-slate-700/50 dark:bg-slate-900/95"
      >
        <div className="flex items-center justify-between">
          <h2 id="detail-drawer-title" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Log detail
          </h2>
          <button
            onClick={onClose}
            aria-label="Close detail panel"
            className="rounded px-2 py-1 text-slate-500 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-700/40"
          >
            ✕
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="truncate text-xs text-slate-500 dark:text-slate-400">traceId: {event.traceId}</span>
          <button
            onClick={copyTraceId}
            className="shrink-0 rounded border border-slate-300/60 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-200/50 dark:border-slate-600/50 dark:text-slate-300 dark:hover:bg-slate-700/40"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        <pre className="overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100 dark:bg-slate-950">
          {JSON.stringify(event, null, 2)}
        </pre>

        <div>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Related events ({related.length})
          </h3>
          {related.length === 0 ? (
            <p className="text-xs text-slate-400">No other events share this traceId.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {related.map((e) => (
                <li
                  key={e.id}
                  className="rounded border border-slate-300/40 px-2 py-1 text-xs text-slate-700 dark:border-slate-700/40 dark:text-slate-300"
                >
                  <span className="font-mono text-slate-500 dark:text-slate-400">
                    {new Date(e.ts).toLocaleTimeString()}
                  </span>{" "}
                  <span className="font-medium">{e.level}</span> {e.service} — {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
