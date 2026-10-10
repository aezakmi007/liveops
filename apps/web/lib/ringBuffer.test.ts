import { pushToRingBuffer } from "./ringBuffer";

describe("pushToRingBuffer", () => {
  it("appends without dropping while under capacity", () => {
    const result = pushToRingBuffer([1, 2], [3, 4], 10);
    expect(result).toEqual({ buffer: [1, 2, 3, 4], dropped: [] });
  });

  it("drops the oldest elements once capacity is exceeded", () => {
    const result = pushToRingBuffer([1, 2, 3], [4, 5], 4);
    expect(result.buffer).toEqual([2, 3, 4, 5]);
    expect(result.dropped).toEqual([1]);
  });

  it("handles an incoming batch larger than capacity", () => {
    const result = pushToRingBuffer([], [1, 2, 3, 4, 5], 2);
    expect(result.buffer).toEqual([4, 5]);
    expect(result.dropped).toEqual([1, 2, 3]);
  });

  it("is a no-op for an empty incoming batch", () => {
    const buffer = [1, 2, 3];
    const result = pushToRingBuffer(buffer, [], 10);
    expect(result).toEqual({ buffer, dropped: [] });
  });

  it("handles an empty starting buffer", () => {
    const result = pushToRingBuffer([], [1, 2], 10);
    expect(result).toEqual({ buffer: [1, 2], dropped: [] });
  });
});
