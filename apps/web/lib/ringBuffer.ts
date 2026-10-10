export interface RingBufferPushResult<T> {
  buffer: T[];
  dropped: T[];
}

/**
 * Appends `incoming` to `buffer`, trimming from the front once `capacity` is
 * exceeded. Returns the dropped elements too, so callers can reconcile any
 * side bookkeeping (e.g. an id set) keyed off what's still in the buffer.
 */
export function pushToRingBuffer<T>(
  buffer: readonly T[],
  incoming: readonly T[],
  capacity: number,
): RingBufferPushResult<T> {
  if (incoming.length === 0) return { buffer: buffer as T[], dropped: [] };

  const combined = buffer.length === 0 ? [...incoming] : buffer.concat(incoming);
  if (combined.length <= capacity) return { buffer: combined, dropped: [] };

  const overflow = combined.length - capacity;
  return { buffer: combined.slice(overflow), dropped: combined.slice(0, overflow) };
}
