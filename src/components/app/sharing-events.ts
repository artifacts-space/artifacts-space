/**
 * A signal that an artifact's sharing was saved in this tab: who can read
 * it, the team it is shared through, or who can comment. What a page loaded
 * for the audience before (the people a comment can mention) listens and
 * loads again, so it never waits for a reload of the page. Events, never a
 * timer. A change made elsewhere (another tab, an approval, an agent) sends
 * no signal here.
 */

const eventName = "artifacts:sharing-changed";

/** Says that the sharing of the artifact with this public id was saved. */
export function announceSharingChanged(publicId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(eventName, { detail: publicId }));
}

/** Calls `listener` whenever this artifact's sharing was saved in this tab. Returns the cleanup. */
export function onSharingChanged(publicId: string, listener: () => void): () => void {
  const onEvent = (event: Event) => {
    if (event instanceof CustomEvent && event.detail === publicId) listener();
  };
  window.addEventListener(eventName, onEvent);
  return () => { window.removeEventListener(eventName, onEvent); };
}
