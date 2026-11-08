/**
 * A same-tab signal that the person's notifications may have changed: they
 * opened a thread (which marks it read), or a push arrived. The bell listens
 * and refetches once. Events, never a timer.
 */

const eventName = "artifacts:notifications-changed";

/** Tells the bell to refetch. */
export function announceNotificationsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(eventName));
}

/** Calls `listener` whenever notifications may have changed. Returns the cleanup. */
export function onNotificationsChanged(listener: () => void): () => void {
  window.addEventListener(eventName, listener);
  return () => {
    window.removeEventListener(eventName, listener);
  };
}
