"use client";

import { useEffect, useRef } from "react";

/**
 * Asks again, once, the next time the window gets focus after a load of the
 * people to mention failed: a dropped request does not leave the box without
 * its list until a reload. `failure` is the failed answer, or null while the
 * newest answer is not a failure; each new failed answer waits for another
 * focus, so a refusal costs one request per return to the window and nothing
 * in between. Never on a timer.
 */
export function useRetryOnFocus(failure: object | null, retry: () => void) {
  const retryRef = useRef(retry);
  useEffect(() => { retryRef.current = retry; }, [retry]);
  useEffect(() => {
    if (!failure) return;
    const onFocus = () => { retryRef.current(); };
    window.addEventListener("focus", onFocus, { once: true });
    return () => { window.removeEventListener("focus", onFocus); };
  }, [failure]);
}
