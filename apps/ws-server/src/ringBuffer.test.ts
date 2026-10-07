import { describe, expect, it } from "vitest";
import type { LogEvent } from "@liveops/shared";
import { RingBuffer } from "./ringBuffer.js";

function event(ts: number): LogEvent {
  return {
    id: `id-${ts}`,
    ts,
    level: "INFO",
    service: "gateway",
    message: "ok",
    traceId: `trace-${ts}`,
    latencyMs: 10,
  };
}

describe("RingBuffer", () => {
  it("drops the oldest events once capacity is exceeded", () => {
    const buf = new RingBuffer(3);
    buf.push([event(1), event(2), event(3), event(4)]);
    expect(buf.recent(10).map((e) => e.ts)).toEqual([2, 3, 4]);
  });

  it("returns events strictly newer than `since`", () => {
    const buf = new RingBuffer(10);
    buf.push([event(1), event(2), event(3)]);
    expect(buf.since(1).map((e) => e.ts)).toEqual([2, 3]);
    expect(buf.since(3)).toEqual([]);
  });

  it("recent() caps at the requested limit", () => {
    const buf = new RingBuffer(10);
    buf.push([event(1), event(2), event(3)]);
    expect(buf.recent(2).map((e) => e.ts)).toEqual([2, 3]);
  });
});
