import { dedupeNewEvents } from "./dedupe";

interface Item {
  id: string;
  value: number;
}

describe("dedupeNewEvents", () => {
  it("passes through events whose ids are unseen", () => {
    const incoming: Item[] = [{ id: "a", value: 1 }, { id: "b", value: 2 }];
    expect(dedupeNewEvents(incoming, new Set())).toEqual(incoming);
  });

  it("drops events already present in seenIds", () => {
    const incoming: Item[] = [{ id: "a", value: 1 }, { id: "b", value: 2 }];
    const result = dedupeNewEvents(incoming, new Set(["a"]));
    expect(result).toEqual([{ id: "b", value: 2 }]);
  });

  it("drops duplicate ids within the same incoming batch", () => {
    const incoming: Item[] = [
      { id: "a", value: 1 },
      { id: "a", value: 2 },
    ];
    const result = dedupeNewEvents(incoming, new Set());
    expect(result).toEqual([{ id: "a", value: 1 }]);
  });

  it("is useful for the history/live overlap case: same id from both sources", () => {
    // History backfill and the live stream can both deliver the same event
    // for a moment around reconnect; dedupe must treat them as one.
    const historyEvent: Item = { id: "shared", value: 100 };
    const seen = new Set([historyEvent.id]);
    const liveBatch: Item[] = [{ id: "shared", value: 999 }, { id: "new", value: 1 }];
    expect(dedupeNewEvents(liveBatch, seen)).toEqual([{ id: "new", value: 1 }]);
  });

  it("returns an empty array when nothing is new", () => {
    expect(dedupeNewEvents([{ id: "a", value: 1 }], new Set(["a"]))).toEqual([]);
  });
});
