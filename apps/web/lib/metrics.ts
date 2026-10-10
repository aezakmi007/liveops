import type { LogEvent } from "@liveops/shared";

export interface MinutePoint {
  /** Start of the minute bucket, epoch ms. */
  minute: number;
  value: number;
}

export interface SecondPoint {
  second: number;
  count: number;
}

const MINUTE_MS = 60_000;

function minuteBucket(ts: number): number {
  return Math.floor(ts / MINUTE_MS) * MINUTE_MS;
}

/** Nearest-rank percentile (p in [0, 100]) over a list of numbers.
 * Returns 0 for an empty input rather than NaN/undefined, since callers
 * render this directly into a chart. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0]!;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  const clamped = Math.min(Math.max(rank, 0), sorted.length - 1);
  return sorted[clamped]!;
}

/** Percentage of events at ERROR or FATAL severity, bucketed per minute.
 * Minutes with no events are omitted rather than reported as 0% — an empty
 * minute isn't "zero errors", it's "no data". */
export function errorRatePerMinute(events: readonly LogEvent[]): MinutePoint[] {
  const buckets = new Map<number, { total: number; errors: number }>();

  for (const event of events) {
    const minute = minuteBucket(event.ts);
    const bucket = buckets.get(minute) ?? { total: 0, errors: 0 };
    bucket.total += 1;
    if (event.level === "ERROR" || event.level === "FATAL") bucket.errors += 1;
    buckets.set(minute, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([minute, { total, errors }]) => ({ minute, value: total === 0 ? 0 : (errors / total) * 100 }));
}

/** p95 latency, bucketed per minute. */
export function p95LatencyPerMinute(events: readonly LogEvent[]): MinutePoint[] {
  const buckets = new Map<number, number[]>();

  for (const event of events) {
    const minute = minuteBucket(event.ts);
    const bucket = buckets.get(minute) ?? [];
    bucket.push(event.latencyMs);
    buckets.set(minute, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([minute, latencies]) => ({ minute, value: percentile(latencies, 95) }));
}

/** Events per second over the trailing `windowSeconds`, one point per
 * second. Seconds with no events are included as 0 so the chart shows a
 * continuous line rather than gaps. */
export function eventsPerSecond(events: readonly LogEvent[], windowSeconds = 60, now = Date.now()): SecondPoint[] {
  const nowSecond = Math.floor(now / 1000);
  const counts = new Map<number, number>();

  for (const event of events) {
    const second = Math.floor(event.ts / 1000);
    if (second < nowSecond - windowSeconds || second > nowSecond) continue;
    counts.set(second, (counts.get(second) ?? 0) + 1);
  }

  const points: SecondPoint[] = [];
  for (let second = nowSecond - windowSeconds + 1; second <= nowSecond; second++) {
    points.push({ second, count: counts.get(second) ?? 0 });
  }
  return points;
}
