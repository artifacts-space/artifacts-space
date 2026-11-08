"use client";

import { useEffect, useRef } from "react";

/** Where the beacon goes (src/app/api/views/route.ts). */
export const viewBeaconPath = "/api/views";

/** True while the browser renders the page ahead of a visit (Speculation Rules); that is not a view yet. */
function isPrerendering(): boolean {
  return Reflect.get(document, "prerendering") === true;
}

function sendBeacon(publicId: string) {
  try {
    // text/plain keeps the beacon a simple request; the server parses the JSON itself.
    const body = new Blob([JSON.stringify({ id: publicId, referrer: document.referrer })], { type: "text/plain" });
    navigator.sendBeacon(viewBeaconPath, body);
  } catch {
    // Counting never gets in the reader's way.
  }
}

/**
 * Counts one view of a public artifact page, after it loads in a real
 * browser: no cookie, no local storage, and nothing sent but the artifact id
 * and the referring page (the server keeps only its domain). Automated
 * browsers (navigator.webdriver) and pages still prerendering send nothing
 * until a person actually opens them. Renders nothing.
 */
export function ViewBeacon({ publicId }: { publicId: string }) {
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (sent.current === publicId || navigator.webdriver) return;
    const send = () => {
      sent.current = publicId;
      sendBeacon(publicId);
    };
    if (!isPrerendering()) {
      send();
      return;
    }
    document.addEventListener("prerenderingchange", send, { once: true });
    return () => { document.removeEventListener("prerenderingchange", send); };
  }, [publicId]);
  return null;
}
