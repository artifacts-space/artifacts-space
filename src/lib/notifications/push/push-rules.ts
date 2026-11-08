import type { SharingRequestKind } from "@/lib/artifact-types";

import { actionPhrase } from "../display-rules";
import { MAX_ENDPOINT_LENGTH, type NotificationType } from "../types";

export { MAX_ENDPOINT_LENGTH };

/**
 * Pure rules for browser notifications: which push addresses the server may
 * call, how a device is named, what a message says, and which push service
 * answers mean the subscription is gone. Client-safe.
 */

/** Browsers a person can keep at once; adding one more drops the oldest. */
export const MAX_DEVICES = 10;

/** The push services of Chrome and Edge (Google), Firefox (Mozilla), Safari (Apple), and Windows (Microsoft). */
const pushHosts = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];

/**
 * True when the server may send to this address: HTTPS on the default port,
 * no credentials, on a known browser push service. The address comes from
 * the browser, so anything else (an internal host, a raw IP) is refused and
 * the server never calls it.
 */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  if (endpoint.length > MAX_ENDPOINT_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") return false;
  return pushHosts.some((host) => host.test(url.hostname));
}

const browsers: readonly [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/Firefox\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];
const systems: readonly [RegExp, string][] = [
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Windows/, "Windows"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

function firstMatch(text: string, table: readonly [RegExp, string][]) {
  return table.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

/** "Chrome on macOS", from the browser's user agent, for the device list. Never stores the raw user agent. */
export function deviceLabel(userAgent: string | null): string {
  const text = userAgent ?? "";
  const browser = firstMatch(text, browsers);
  const system = firstMatch(text, systems);
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? "Browser";
}

/** What a browser notification shows, and where a click goes. Sent encrypted. */
export interface PushMessage {
  v: 1;
  type: NotificationType | "test";
  title: string;
  body: string;
  /** A path on this site. The service worker opens only same-site paths. */
  url: string;
  /** Notifications with one tag replace each other instead of piling up. */
  tag: string;
}

const TITLE_MAX = 120;
const BODY_MAX = 160;

function clip(text: string, max: number) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/**
 * The message for one notification: "@ada commented on Plan" with a short
 * plain-text excerpt for comments. Nothing more of the comment, and the
 * caller only builds it for someone who may read the artifact now.
 */
export function pushMessage(input: { type: NotificationType; requestKind: SharingRequestKind | null; actorLabel: string | null; artifactTitle: string; publicId: string; excerpt: string | null; href: string }): PushMessage {
  const actor = input.actorLabel ?? "Someone";
  const title = clip(`${actor} ${actionPhrase(input.type, input.requestKind)} ${input.artifactTitle || "an artifact"}`, TITLE_MAX);
  return { v: 1, type: input.type, title, body: clip(input.excerpt ?? "", BODY_MAX), url: input.href, tag: `${input.type}:${input.publicId}` };
}

/** The message the Send a test notification button sends. */
export function testPushMessage(): PushMessage {
  return { v: 1, type: "test", title: "Browser notifications are on", body: "This is how artifacts.space reaches you in this browser.", url: "/app/settings", tag: "test" };
}

/** What to do after the push service answers. */
export type PushOutcome = "sent" | "gone" | "failed";

/** 404 and 410 mean the browser dropped the subscription: remove it. Anything else that is not 2xx is a failure to log. */
export function pushOutcome(status: number): PushOutcome {
  if (status >= 200 && status < 300) return "sent";
  if (status === 404 || status === 410) return "gone";
  return "failed";
}
