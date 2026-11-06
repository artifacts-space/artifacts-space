"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const COPIED_MS = 1800;

/**
 * Copies text to the clipboard and reports `copied` for a short moment
 * afterwards, so a button can show "Copied". Shows a toast when the browser
 * blocks clipboard access.
 */
export function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => { window.clearTimeout(timer.current); }, []);

  const copy = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => { setCopied(false); }, COPIED_MS);
      return true;
    } catch {
      toast.error("Could not access the clipboard.");
      return false;
    }
  }, []);

  return { copied, copy };
}
