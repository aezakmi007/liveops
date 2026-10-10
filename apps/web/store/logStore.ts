import { create } from "zustand";
import type { LogEvent } from "@liveops/shared";
import { pushToRingBuffer } from "@/lib/ringBuffer";
import { dedupeNewEvents } from "@/lib/dedupe";
import { setLastTs } from "@/lib/storage";

export const RING_BUFFER_CAPACITY = 200_000;

interface LogStoreState {
  events: LogEvent[];
  paused: boolean;
  pendingCount: number;
  lastTs: number | null;
  append: (batch: LogEvent[]) => void;
  pause: () => void;
  resume: () => void;
  clear: () => void;
}

export const useLogStore = create<LogStoreState>((set, get) => {
  // Kept outside reactive state: these are implementation detail for
  // append(), not something any component needs to render on.
  let seenIds = new Set<string>();
  let pendingBuffer: LogEvent[] = [];

  function forgetDropped(dropped: LogEvent[]): void {
    for (const e of dropped) seenIds.delete(e.id);
  }

  return {
    events: [],
    paused: false,
    pendingCount: 0,
    lastTs: null,

    append: (batch) => {
      if (batch.length === 0) return;

      const fresh = dedupeNewEvents(batch, seenIds);
      if (fresh.length === 0) return;
      for (const e of fresh) seenIds.add(e.id);

      const latestTs = fresh.reduce((max, e) => Math.max(max, e.ts), get().lastTs ?? 0);
      setLastTs(latestTs);

      if (get().paused) {
        pendingBuffer.push(...fresh);
        set({ pendingCount: pendingBuffer.length, lastTs: latestTs });
        return;
      }

      const { buffer, dropped } = pushToRingBuffer(get().events, fresh, RING_BUFFER_CAPACITY);
      forgetDropped(dropped);
      set({ events: buffer, lastTs: latestTs });
    },

    pause: () => set({ paused: true }),

    resume: () => {
      if (pendingBuffer.length === 0) {
        set({ paused: false });
        return;
      }
      const { buffer, dropped } = pushToRingBuffer(get().events, pendingBuffer, RING_BUFFER_CAPACITY);
      forgetDropped(dropped);
      pendingBuffer = [];
      set({ events: buffer, paused: false, pendingCount: 0 });
    },

    clear: () => {
      seenIds = new Set();
      pendingBuffer = [];
      set({ events: [], paused: false, pendingCount: 0, lastTs: null });
    },
  };
});
