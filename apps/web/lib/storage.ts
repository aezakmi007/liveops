const LAST_TS_KEY = "liveops:lastTs";

/** Safe for SSR (no `window`) and private-browsing mode (storage access can throw). */
export function getLastTs(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_TS_KEY);
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function setLastTs(ts: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_TS_KEY, String(ts));
  } catch {
    // storage unavailable (private browsing, quota) — lastTs just won't persist
  }
}
