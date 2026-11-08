"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult } from "@/lib/artifact-types";
import { anyBrowserOn, withBrowserForAll, type NotificationPreferences } from "@/lib/notifications/preference-rules";
import { loadPreferencesFor, savePreferences } from "@/lib/notifications/preferences";
import { listDevices, removeDevice, removeDeviceByEndpoint, saveDevice, type PushDeviceView } from "@/lib/notifications/push/devices";
import { testPushMessage } from "@/lib/notifications/push/push-rules";
import { pushConfigured, sendPushMessages, type PushReport } from "@/lib/notifications/push/send";
import { getSession } from "@/lib/session";

/**
 * Browser notifications in Settings: turn this browser on or off, list and
 * remove browsers, and send a test. Each action checks the session; a person
 * only ever sees and changes their own browsers.
 */

const signInMessage = "Sign in to change notifications.";
const offMessage = "Browser notifications are not set up on this site.";
const idSchema = z.string().trim().min(1).max(200);
const endpointSchema = z.string().trim().min(1).max(1000);

async function viewerId() {
  const session = await getSession();
  return session?.user.id ?? null;
}

/** This browser after it turned on, and the settings (browser turns on for every event the first time). */
export interface SavedDevice {
  device: PushDeviceView;
  preferences: NotificationPreferences;
}

/** Saves this browser's subscription after the person turned it on. */
export async function savePushDeviceAction(subscription: unknown): Promise<ActionResult<SavedDevice>> {
  try {
    const userId = await viewerId();
    if (!userId) return { success: false, error: signInMessage };
    if (!pushConfigured()) return { success: false, error: offMessage };
    await enforceRateLimit("pushDevice", userId);
    const device = await saveDevice(userId, subscription, (await headers()).get("user-agent"));
    let preferences = await loadPreferencesFor(userId);
    if (!anyBrowserOn(preferences)) {
      preferences = withBrowserForAll(preferences);
      await savePreferences(userId, preferences);
    }
    return { success: true, data: { device, preferences } };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "This browser could not be turned on. Please try again.") };
  }
}

/** Forgets this browser, by its push address, when the person turns it off here or signs out. */
export async function forgetPushDeviceAction(endpoint: string): Promise<ActionResult<null>> {
  try {
    const userId = await viewerId();
    if (!userId) return { success: false, error: signInMessage };
    await removeDeviceByEndpoint(userId, endpointSchema.parse(endpoint));
    return { success: true, data: null };
  } catch {
    return { success: false, error: "This browser could not be turned off. Please try again." };
  }
}

/** Removes one of the person's browsers from the list. */
export async function removePushDeviceAction(id: string): Promise<ActionResult<null>> {
  try {
    const userId = await viewerId();
    if (!userId) return { success: false, error: signInMessage };
    await removeDevice(userId, idSchema.parse(id));
    return { success: true, data: null };
  } catch {
    return { success: false, error: "The browser could not be removed. Please try again." };
  }
}

/** The person's browsers, newest first. */
export async function listPushDevicesAction(): Promise<ActionResult<PushDeviceView[]>> {
  try {
    const userId = await viewerId();
    if (!userId) return { success: false, error: signInMessage };
    return { success: true, data: await listDevices(userId) };
  } catch {
    return { success: false, error: "Your browsers could not be loaded." };
  }
}

/** Sends a test notification to every browser the person turned on. */
export async function sendTestPushAction(): Promise<ActionResult<PushReport>> {
  try {
    const userId = await viewerId();
    if (!userId) return { success: false, error: signInMessage };
    if (!pushConfigured()) return { success: false, error: offMessage };
    await enforceRateLimit("pushTest", userId);
    const report = await sendPushMessages(new Map([[userId, testPushMessage()]]));
    if (report.sent + report.failed + report.removed === 0) return { success: false, error: "Turn on browser notifications in a browser first." };
    return { success: true, data: report };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The test notification could not be sent. Please try again.") };
  }
}
