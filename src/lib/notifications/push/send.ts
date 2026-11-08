import type { PushSubscriptionRecord } from "@/db/notification-schema";

import { encryptPushMessage } from "./encrypt";
import { pruneDevices, subscriptionsFor, touchDevices } from "./devices";
import { isAllowedPushEndpoint, pushOutcome, type PushMessage, type PushOutcome } from "./push-rules";
import { vapidAuthorization, vapidConfig, type VapidConfig } from "./vapid";

/**
 * Sends browser notifications through the browsers' push services. Messages
 * are encrypted for each browser (RFC 8291); push services see only the
 * address, the size, and the time. Errors are logged by status or name only,
 * never with addresses, keys, or content.
 */

/** Push services keep a message this long for an offline browser. */
const TTL_SECONDS = 24 * 60 * 60;
/** A push service that does not answer within this time counts as a failure. */
const SEND_TIMEOUT_MS = 10_000;

const encoder = new TextEncoder();

/** Sends one message to one browser and says what happened. Never throws. */
async function sendOne(config: VapidConfig, subscription: PushSubscriptionRecord, message: PushMessage, fetcher: typeof fetch): Promise<PushOutcome> {
  if (!isAllowedPushEndpoint(subscription.endpoint)) return "gone";
  try {
    const body = encryptPushMessage(encoder.encode(JSON.stringify(message)), {
      p256dh: new Uint8Array(Buffer.from(subscription.p256dh, "base64url")),
      auth: new Uint8Array(Buffer.from(subscription.auth, "base64url")),
    });
    const response = await fetcher(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: vapidAuthorization(config, subscription.endpoint),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(TTL_SECONDS),
        Urgency: "normal",
      },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    const outcome = pushOutcome(response.status);
    if (outcome === "failed") console.error(`[push] A push service refused a notification (${String(response.status)}).`);
    return outcome;
  } catch (error) {
    console.error("[push] A notification could not be sent", error instanceof Error ? error.name : "unknown error");
    return "failed";
  }
}

/** How a batch went. */
export interface PushReport {
  sent: number;
  failed: number;
  removed: number;
}

/**
 * Sends each person's message to every browser they turned on, removes the
 * browsers whose subscriptions are gone, and records the ones that took it.
 * Does nothing when VAPID is not set up.
 */
export async function sendPushMessages(messages: ReadonlyMap<string, PushMessage>, fetcher: typeof fetch = fetch): Promise<PushReport> {
  const report: PushReport = { sent: 0, failed: 0, removed: 0 };
  const config = vapidConfig();
  if (!config || messages.size === 0) return report;
  const subscriptions = await subscriptionsFor([...messages.keys()]);
  const outcomes = await Promise.all(
    subscriptions.map(async (subscription) => {
      const message = messages.get(subscription.userId);
      return { id: subscription.id, outcome: message ? await sendOne(config, subscription, message, fetcher) : ("failed" as const) };
    }),
  );
  const gone = outcomes.filter((item) => item.outcome === "gone").map((item) => item.id);
  const sent = outcomes.filter((item) => item.outcome === "sent").map((item) => item.id);
  await Promise.all([pruneDevices(gone), touchDevices(sent)]);
  return { sent: sent.length, failed: outcomes.length - sent.length - gone.length, removed: gone.length };
}

/** True when browser notifications are set up on this server. */
export function pushConfigured(): boolean {
  return vapidConfig() !== null;
}

/** The public key browsers subscribe with, or null when browser notifications are off. */
export function pushPublicKey(): string | null {
  return vapidConfig()?.publicKey ?? null;
}
