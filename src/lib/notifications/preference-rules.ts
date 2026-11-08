import { z } from "zod";

import { eventForType, notificationEvents, type NotificationChannel, type NotificationEvent, type NotificationType } from "./types";

/**
 * Pure rules for a person's notification settings: the defaults, which
 * channels each event offers, and reading stored settings safely. Stored
 * values are validated here, so a bad or old row falls back to defaults.
 */

/** The channels one event uses. */
export interface ChannelChoice {
  inApp: boolean;
  browser: boolean;
  email: boolean;
}

export type NotificationPreferences = Record<NotificationEvent, ChannelChoice>;

/**
 * Only mentions send email today (the first unread mention on an artifact,
 * src/lib/comments/mention-email.ts). Other events never email, so their
 * email choice is off and hidden.
 */
export function emailAvailable(event: NotificationEvent): boolean {
  return event === "mention";
}

/** Defaults: in-app on, browser off until the person turns it on, email as it worked before settings. */
export function defaultChoice(event: NotificationEvent): ChannelChoice {
  return { inApp: true, browser: false, email: emailAvailable(event) };
}

/** The defaults for every event. */
export function defaultPreferences(): NotificationPreferences {
  return {
    mention: defaultChoice("mention"),
    reply: defaultChoice("reply"),
    comment: defaultChoice("comment"),
    share_request: defaultChoice("share_request"),
    share_decision: defaultChoice("share_decision"),
  };
}

const choiceSchema = z.object({ inApp: z.boolean(), browser: z.boolean(), email: z.boolean() }).partial();
const storedSchema = z.record(z.string(), z.unknown());

/** One event's stored choice over its defaults. Email stays off where the event sends none. */
function readChoice(event: NotificationEvent, stored: unknown): ChannelChoice {
  const fallback = defaultChoice(event);
  const parsed = choiceSchema.safeParse(stored);
  if (!parsed.success) return fallback;
  const choice = {
    inApp: parsed.data.inApp ?? fallback.inApp,
    browser: parsed.data.browser ?? fallback.browser,
    email: parsed.data.email ?? fallback.email,
  };
  return emailAvailable(event) ? choice : { ...choice, email: false };
}

/** A person's settings from the stored JSON (or nothing), with defaults for anything missing or invalid. */
export function readPreferences(stored: unknown): NotificationPreferences {
  const parsed = storedSchema.safeParse(stored);
  const record = parsed.success ? parsed.data : {};
  const preferences = defaultPreferences();
  for (const event of notificationEvents) preferences[event] = readChoice(event, record[event]);
  return preferences;
}

/** Settings after one change. Turning on email where an event sends none is ignored. */
export function changePreference(current: NotificationPreferences, event: NotificationEvent, channel: NotificationChannel, on: boolean): NotificationPreferences {
  if (channel === "email" && !emailAvailable(event)) return current;
  return { ...current, [event]: { ...current[event], [channel]: on } };
}

/** Browser on for every event, for when a person turns on browser notifications and has none on yet. */
export function withBrowserForAll(current: NotificationPreferences): NotificationPreferences {
  const next = { ...current };
  for (const event of notificationEvents) next[event] = { ...current[event], browser: true };
  return next;
}

/** True when any event sends browser notifications. */
export function anyBrowserOn(preferences: NotificationPreferences): boolean {
  return notificationEvents.some((event) => preferences[event].browser);
}

/** Whether a stored notification type reaches this channel for the person. */
export function wants(preferences: NotificationPreferences, type: NotificationType, channel: NotificationChannel): boolean {
  return preferences[eventForType(type)][channel];
}
