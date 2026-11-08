"use client";

import { forgetPushDeviceAction } from "@/app/(workspace)/app/push-actions";

import { unsubscribeThisBrowser } from "./push-client";

/**
 * Turns browser notifications off in this browser and tells the server, for
 * sign-out. Never throws and never prompts; a browser without notifications
 * does nothing.
 */
export async function forgetThisBrowser(): Promise<void> {
  try {
    const endpoint = await unsubscribeThisBrowser();
    if (endpoint) await forgetPushDeviceAction(endpoint);
  } catch {
    // Signing out matters more; the push service drops the subscription anyway.
  }
}
