"use client";

import { useEffect } from "react";

export interface UseTabVisibilityOptions {
  onHide?: () => void;
  onShow?: () => void;
}

/**
 * Wraps the Page Visibility API. Kept generic (just two callbacks) so it
 * has no knowledge of WebSockets or fetch — callers wire in whatever
 * pause/resume/backfill behavior they need, which keeps this hook trivial
 * to unit test.
 */
export function useTabVisibility({ onHide, onShow }: UseTabVisibilityOptions): void {
  useEffect(() => {
    function handleVisibilityChange(): void {
      if (document.hidden) {
        onHide?.();
      } else {
        onShow?.();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [onHide, onShow]);
}
