import type { Filters, LogEvent } from "@liveops/shared";
import { EMPTY_FILTERS } from "@liveops/shared";
import { applyFilters } from "./applyFilters";

function makeEvent(overrides: Partial<LogEvent> = {}): LogEvent {
  return {
    id: "id-1",
    ts: 1_000,
    level: "INFO",
    service: "gateway",
    message: "request completed",
    traceId: "trace-1",
    latencyMs: 20,
    ...overrides,
  };
}

describe("applyFilters", () => {
  it("returns everything when filters are empty", () => {
    const events = [makeEvent(), makeEvent({ id: "id-2", level: "ERROR" })];
    expect(applyFilters(events, EMPTY_FILTERS)).toEqual(events);
  });

  it("returns an empty array for an empty input", () => {
    expect(applyFilters([], EMPTY_FILTERS)).toEqual([]);
  });

  it("filters by level", () => {
    const events = [makeEvent({ level: "INFO" }), makeEvent({ id: "id-2", level: "ERROR" })];
    const filters: Filters = { ...EMPTY_FILTERS, levels: ["ERROR", "FATAL"] };
    expect(applyFilters(events, filters)).toEqual([events[1]]);
  });

  it("filters by service", () => {
    const events = [makeEvent({ service: "auth" }), makeEvent({ id: "id-2", service: "gateway" })];
    const filters: Filters = { ...EMPTY_FILTERS, services: ["gateway"] };
    expect(applyFilters(events, filters)).toEqual([events[1]]);
  });

  it("filters by time range (from/to inclusive)", () => {
    const events = [
      makeEvent({ id: "a", ts: 100 }),
      makeEvent({ id: "b", ts: 500 }),
      makeEvent({ id: "c", ts: 900 }),
    ];
    expect(applyFilters(events, { ...EMPTY_FILTERS, from: 500 })).toEqual([events[1], events[2]]);
    expect(applyFilters(events, { ...EMPTY_FILTERS, to: 500 })).toEqual([events[0], events[1]]);
    expect(applyFilters(events, { ...EMPTY_FILTERS, from: 200, to: 800 })).toEqual([events[1]]);
  });

  it("filters by text search, case-insensitively and trimmed", () => {
    const events = [
      makeEvent({ id: "a", message: "upstream timeout" }),
      makeEvent({ id: "b", message: "cache hit" }),
    ];
    expect(applyFilters(events, { ...EMPTY_FILTERS, query: "  TIMEOUT  " })).toEqual([events[0]]);
  });

  it("combines multiple filter dimensions with AND semantics", () => {
    const events = [
      makeEvent({ id: "a", level: "ERROR", service: "auth", message: "timeout" }),
      makeEvent({ id: "b", level: "ERROR", service: "gateway", message: "timeout" }),
      makeEvent({ id: "c", level: "INFO", service: "auth", message: "timeout" }),
    ];
    const filters: Filters = { ...EMPTY_FILTERS, levels: ["ERROR"], services: ["auth"] };
    expect(applyFilters(events, filters)).toEqual([events[0]]);
  });

  it("an empty-string query matches everything (not an empty-substring match on nothing)", () => {
    const events = [makeEvent()];
    expect(applyFilters(events, { ...EMPTY_FILTERS, query: "" })).toEqual(events);
  });
});
