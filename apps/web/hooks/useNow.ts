"use client";

import { useEffect, useState } from "react";

/**
 * `Date.now()` is impure, so calling it directly during render breaks React's
 * idempotency assumptions (two renders of the same state could disagree).
 * This hook holds "now" in state, refreshed on an interval via an effect —
 * the only place reading the clock is allowed to live.
 */
export function useNow(intervalMs = 5000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
