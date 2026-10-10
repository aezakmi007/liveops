"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { logEventSchema, type ClientMsg, type Filters, type LogEvent } from "@liveops/shared";
import { useLogStore } from "@/store/logStore";
import { getLastTs, setLastTs } from "@/lib/storage";

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "closed";

interface HistoryResponse {
  events: LogEvent[];
  serverTs: number;
}

const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 30_000;

async function fetchHistory(historyUrl: string): Promise<HistoryResponse> {
  const lastTs = getLastTs();
  const qs = lastTs !== null ? `since=${lastTs}` : "limit=5000";
  const res = await fetch(`${historyUrl}/history?${qs}`);
  if (!res.ok) throw new Error(`history fetch failed: ${res.status}`);
  return (await res.json()) as HistoryResponse;
}

export interface UseLogStreamResult {
  status: ConnectionStatus;
  invalidCount: number;
  /** Re-fetches `/history?since=lastTs` and appends the result. Exposed so
   * useTabVisibility can call it after the tab becomes visible again. */
  backfill: () => Promise<void>;
  send: (msg: ClientMsg) => void;
}

export function useLogStream(wsUrl: string, historyUrl: string, filters: Filters): UseLogStreamResult {
  const append = useLogStore((s) => s.append);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [invalidCount, setInvalidCount] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Always read the *current* filters from inside WS callbacks, which are
  // registered once per connection and would otherwise close over whatever
  // `filters` was at connect time. Synced via an effect, not during render:
  // mutating a ref in the render body breaks React Compiler's assumptions.
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  // Multiple WS messages can land within the same animation frame; buffer
  // them in a ref and flush once per frame instead of calling the store's
  // append (and triggering a re-render) on every message.
  const frameBuffer = useRef<LogEvent[]>([]);
  const frameHandle = useRef<number | null>(null);

  const flushFrame = useCallback(() => {
    frameHandle.current = null;
    if (frameBuffer.current.length === 0) return;
    const batch = frameBuffer.current;
    frameBuffer.current = [];
    append(batch);
  }, [append]);

  const scheduleFlush = useCallback(() => {
    if (frameHandle.current !== null) return;
    frameHandle.current = requestAnimationFrame(flushFrame);
  }, [flushFrame]);

  const send = useCallback((msg: ClientMsg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  // Initial load: /history?since=lastTs on a returning visit, or
  // ?limit=5000 the first time there's no lastTs yet.
  const historyQuery = useQuery({
    queryKey: ["history", historyUrl],
    queryFn: () => fetchHistory(historyUrl),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const appliedHistoryRef = useRef<HistoryResponse | undefined>(undefined);
  useEffect(() => {
    if (historyQuery.data && historyQuery.data !== appliedHistoryRef.current) {
      appliedHistoryRef.current = historyQuery.data;
      append(historyQuery.data.events);
    }
  }, [historyQuery.data, append]);

  const backfill = useCallback(async () => {
    const data = await fetchHistory(historyUrl);
    appliedHistoryRef.current = data;
    append(data.events);
  }, [historyUrl, append]);

  // Connect once per `wsUrl`; reconnect with exponential backoff + jitter
  // on close, up to MAX_BACKOFF_MS, until the effect is cleaned up.
  //
  // `active`/`socket` are local to *this* effect invocation rather than refs
  // shared across the hook's whole lifetime. React Strict Mode runs this
  // effect twice on mount (mount, cleanup, mount again) to surface exactly
  // this bug: with a single shared "unmounted" ref, the first (torn-down)
  // socket's async `close` event can arrive *after* the second, real
  // connection has already flipped that ref back to "mounted" — so the
  // dead socket's onclose wrongly believes it's still current and kicks off
  // a reconnect, silently orphaning the live connection. Scoping `active`
  // per effect run, and double-checking `wsRef.current === ws` before
  // reacting to a close event, makes a stale socket's events inert no
  // matter when they arrive.
  useEffect(() => {
    let active = true;

    function connect(): void {
      if (!active) return;
      setStatus("connecting");
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (wsRef.current !== ws) return;
        reconnectAttempt.current = 0;
        setStatus("open");
        send({ type: "subscribe", filters: filtersRef.current });
      };

      ws.onmessage = (event) => {
        if (wsRef.current !== ws) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data as string);
        } catch {
          setInvalidCount((c) => c + 1);
          return;
        }

        if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) {
          setInvalidCount((c) => c + 1);
          return;
        }

        const msg = parsed as { type: unknown; events?: unknown[] };

        if (msg.type === "status") return; // nothing to track yet (Day 2 scope)

        if (msg.type === "batch") {
          const rawEvents = Array.isArray(msg.events) ? msg.events : [];
          let invalid = 0;
          let latestTs: number | undefined;

          for (const item of rawEvents) {
            const result = logEventSchema.safeParse(item);
            if (result.success) {
              frameBuffer.current.push(result.data);
              latestTs = result.data.ts;
            } else {
              invalid++;
            }
          }

          if (invalid > 0) setInvalidCount((c) => c + invalid);
          if (latestTs !== undefined) setLastTs(latestTs);
          if (frameBuffer.current.length > 0) scheduleFlush();
          return;
        }

        setInvalidCount((c) => c + 1);
      };

      ws.onclose = () => {
        // Ignore a close event from a socket that's no longer the current
        // one — either this effect was cleaned up, or a newer connection
        // has already replaced this one in wsRef.
        if (!active || wsRef.current !== ws) return;
        setStatus("reconnecting");
        const attempt = reconnectAttempt.current++;
        const backoff = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
        const jitter = Math.random() * backoff * 0.3;
        reconnectTimer.current = setTimeout(connect, backoff + jitter);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    // Cleanup covers every leak vector: cancel a pending reconnect timer,
    // cancel a pending rAF flush, and close the socket with its handlers
    // still attached (onclose checks `active`/`wsRef` so it won't schedule
    // a reconnect after we've torn down).
    return () => {
      active = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (frameHandle.current !== null) cancelAnimationFrame(frameHandle.current);
      wsRef.current?.close();
      wsRef.current = null;
      setStatus("closed");
    };
  }, [wsUrl, send, scheduleFlush]);

  // Re-subscribe whenever filters change, without tearing down the socket.
  useEffect(() => {
    send({ type: "subscribe", filters });
  }, [filters, send]);

  return { status, invalidCount, backfill, send };
}
