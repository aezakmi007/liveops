import type { LogEvent } from "@liveops/shared";
import { errorRatePerMinute, eventsPerSecond, p95LatencyPerMinute, percentile } from "./metrics";

function makeEvent(overrides: Partial<LogEvent> = {}): LogEvent {
  return {
    id: "id",
    ts: 0,
    level: "INFO",
    service: "gateway",
    message: "ok",
    traceId: "trace",
    latencyMs: 0,
    ...overrides,
  };
}

describe("percentile", () => {
  it("returns 0 for an empty array", () => {
    expect(percentile([], 95)).toBe(0);
  });

  it("returns the single value for a one-element array", () => {
    expect(percentile([42], 95)).toBe(42);
  });

  it("returns the max for p100", () => {
    expect(percentile([1, 2, 3, 4, 5], 100)).toBe(5);
  });

  it("returns the min for p0", () => {
    expect(percentile([1, 2, 3, 4, 5], 0)).toBe(1);
  });

  it("computes p95 over a larger sorted set", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(percentile(values, 95)).toBe(95);
  });

  it("doesn't mutate the input array", () => {
    const values = [5, 3, 1, 4, 2];
    percentile(values, 50);
    expect(values).toEqual([5, 3, 1, 4, 2]);
  });
});

describe("errorRatePerMinute", () => {
  it("returns an empty array for no events", () => {
    expect(errorRatePerMinute([])).toEqual([]);
  });

  it("computes the percentage of ERROR/FATAL events per minute", () => {
    const minute = 60_000;
    const events = [
      makeEvent({ ts: minute, level: "INFO" }),
      makeEvent({ ts: minute, level: "ERROR" }),
      makeEvent({ ts: minute, level: "FATAL" }),
      makeEvent({ ts: minute, level: "WARN" }),
    ];
    expect(errorRatePerMinute(events)).toEqual([{ minute, value: 50 }]);
  });

  it("buckets distinct minutes separately, sorted ascending", () => {
    const events = [
      makeEvent({ ts: 2 * 60_000, level: "ERROR" }),
      makeEvent({ ts: 1 * 60_000, level: "INFO" }),
    ];
    expect(errorRatePerMinute(events)).toEqual([
      { minute: 60_000, value: 0 },
      { minute: 120_000, value: 100 },
    ]);
  });
});

describe("p95LatencyPerMinute", () => {
  it("returns an empty array for no events", () => {
    expect(p95LatencyPerMinute([])).toEqual([]);
  });

  it("computes p95 latency within a single minute bucket", () => {
    const minute = 60_000;
    const events = Array.from({ length: 100 }, (_, i) => makeEvent({ ts: minute, latencyMs: i + 1 }));
    expect(p95LatencyPerMinute(events)).toEqual([{ minute, value: 95 }]);
  });

  it("handles a single event in a bucket", () => {
    const events = [makeEvent({ ts: 60_000, latencyMs: 123 })];
    expect(p95LatencyPerMinute(events)).toEqual([{ minute: 60_000, value: 123 }]);
  });
});

describe("eventsPerSecond", () => {
  it("returns one zero-filled point per second in the window when there are no events", () => {
    const now = 100_000; // epoch ms
    const points = eventsPerSecond([], 10, now);
    expect(points).toHaveLength(10);
    expect(points.every((p) => p.count === 0)).toBe(true);
    expect(points[points.length - 1]!.second).toBe(Math.floor(now / 1000));
  });

  it("counts events into their second, ignoring events outside the window", () => {
    const now = 100_700; // not on a second boundary, so `now - 500` stays in the same second
    const nowSecond = Math.floor(now / 1000);
    const events = [
      makeEvent({ ts: now }), // this second
      makeEvent({ ts: now }), // same second again
      makeEvent({ ts: now - 500 }), // still this second (500ms earlier)
      makeEvent({ ts: now - 1000 * 60 }), // way outside a 10s window
    ];
    const points = eventsPerSecond(events, 10, now);
    const last = points.find((p) => p.second === nowSecond);
    expect(last?.count).toBe(3);
    expect(points.reduce((sum, p) => sum + p.count, 0)).toBe(3);
  });
});
