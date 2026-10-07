import { describe, expect, it } from "vitest";
import type { LogEvent } from "@liveops/shared";
import { matchesFilters } from "./matchFilters.js";

const baseEvent: LogEvent = {
  id: "00000000-0000-0000-0000-000000000000",
  ts: 1_000,
  level: "ERROR",
  service: "payments-api",
  message: "upstream timeout",
  traceId: "trace-1",
  latencyMs: 120,
};

describe("matchesFilters", () => {
  it("passes events through an empty filter", () => {
    expect(matchesFilters(baseEvent, { levels: [], services: [], query: "" })).toBe(true);
  });

  it("filters by level", () => {
    expect(matchesFilters(baseEvent, { levels: ["INFO"], services: [], query: "" })).toBe(false);
    expect(matchesFilters(baseEvent, { levels: ["ERROR"], services: [], query: "" })).toBe(true);
  });

  it("filters by service", () => {
    expect(matchesFilters(baseEvent, { levels: [], services: ["auth"], query: "" })).toBe(false);
  });

  it("filters by text search, case-insensitively", () => {
    expect(matchesFilters(baseEvent, { levels: [], services: [], query: "TIMEOUT" })).toBe(true);
    expect(matchesFilters(baseEvent, { levels: [], services: [], query: "nope" })).toBe(false);
  });

  it("filters by time range", () => {
    expect(matchesFilters(baseEvent, { levels: [], services: [], query: "", from: 2_000 })).toBe(
      false,
    );
    expect(matchesFilters(baseEvent, { levels: [], services: [], query: "", to: 500 })).toBe(
      false,
    );
  });
});
