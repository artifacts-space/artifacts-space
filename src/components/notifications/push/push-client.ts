"use client";

/**
 * Browser side of browser notifications. Nothing here asks for permission or
 * registers the service worker on its own: only subscribeThisBrowser does,
 * and only after the person clicks to turn notifications on.
 */

/** What this browser can do: nothing, blocked by the person, or ready to ask. */
export type PushSupport = "unsupported" | "blocked" | "ready";

const SCOPE = "/";

/** Whether this browser supports browser notifications and whether the person blocked them. Never prompts. */
export function pushSupport(): PushSupport {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  return Notification.permission === "denied" ? "blocked" : "ready";
}

/** This browser's current subscription, without registering anything or prompting. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() === "unsupported") return null;
  const registration = await navigator.serviceWorker.getRegistration(SCOPE);
  return (await registration?.pushManager.getSubscription()) ?? null;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

function sameKey(subscription: PushSubscription, key: Uint8Array) {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === key.length && bytes.every((byte, index) => byte === key[index]);
}

/** A refusal the settings page shows as is. */
export class PushSetupError extends Error {}

/**
 * Asks for permission, registers the service worker, and subscribes. Call only
 * from a click. A subscription made with an older server key is replaced.
 * Returns the subscription as JSON for the server.
 */
export async function subscribeThisBrowser(publicKey: string): Promise<PushSubscriptionJSON> {
  if (pushSupport() === "unsupported") throw new PushSetupError("This browser cannot show notifications from websites.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new PushSetupError("Notifications are blocked for this site. Allow them in your browser's site settings, then try again.");
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: SCOPE, updateViaCache: "none" });
  await navigator.serviceWorker.ready;
  const key = keyBytes(publicKey);
  const existing = await registration.pushManager.getSubscription();
  if (existing && sameKey(existing, key)) return existing.toJSON();
  await existing?.unsubscribe();
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  return subscription.toJSON();
}

/** The short SHA-256 of a push address, matching the server's endpointKey, to find this browser in the list. */
export async function endpointKey(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

/** Unsubscribes this browser. Returns its push address so the server can forget it, or null when it had none. */
export async function unsubscribeThisBrowser(): Promise<string | null> {
  const subscription = await currentSubscription();
  if (!subscription) return null;
  const { endpoint } = subscription;
  await subscription.unsubscribe();
  return endpoint;
}
