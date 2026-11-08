/**
 * A signal that the person's notifications may have changed: they opened a
 * thread (which marks it read), or a browser notification arrived. The bell
 * listens and refetches once. Events, never a timer.
 */

const eventName = "artifacts:notifications-changed";

/** Tells the bell to refetch. */
export function announceNotificationsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(eventName));
}

function fromServiceWorker(data: unknown): boolean {
  return typeof data === "object" && data !== null && "type" in data && data.type === eventName;
}

/**
 * Calls `listener` whenever notifications may have changed: a same-tab
 * signal, or a message from the service worker when a browser notification
 * arrives (public/sw.js posts the same event name). Returns the cleanup.
 */
export function onNotificationsChanged(listener: () => void): () => void {
  const worker = "serviceWorker" in navigator ? navigator.serviceWorker : null;
  const onMessage = (event: MessageEvent) => {
    if (fromServiceWorker(event.data)) listener();
  };
  window.addEventListener(eventName, listener);
  worker?.addEventListener("message", onMessage);
  worker?.startMessages();
  return () => {
    window.removeEventListener(eventName, listener);
    worker?.removeEventListener("message", onMessage);
  };
}
