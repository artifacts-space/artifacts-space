"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { forgetPushDeviceAction, listPushDevicesAction, removePushDeviceAction, savePushDeviceAction, sendTestPushAction } from "@/app/(workspace)/app/push-actions";
import type { NotificationPreferences } from "@/lib/notifications/preference-rules";
import type { PushDeviceView } from "@/lib/notifications/push/devices";

import { currentSubscription, endpointKey, pushSupport, PushSetupError, subscribeThisBrowser, unsubscribeThisBrowser, type PushSupport } from "./push-client";

const offline = "Something went wrong. Check your connection and try again.";

/** This browser's state: unknown until checked after mount, so the server and browser render the same. */
export type ThisBrowser = { support: "checking" } | { support: PushSupport; key: string | null };

/** Whether this browser can get notifications, and the key of its subscription if it has one. Never prompts. */
async function readThisBrowser(): Promise<ThisBrowser> {
  const support = pushSupport();
  const subscription = await currentSubscription().catch(() => null);
  return { support, key: subscription ? await endpointKey(subscription.endpoint) : null };
}

/**
 * Browser notifications for the settings page: whether this browser is on,
 * the person's browsers, and the actions. Checks this browser once after
 * mount, without asking for permission; only `turnOn` (a click) asks.
 */
export function useBrowserPush(input: { publicKey: string; initialDevices: PushDeviceView[]; onPreferences: (preferences: NotificationPreferences) => void }) {
  const { publicKey, onPreferences } = input;
  const [devices, setDevices] = useState(input.initialDevices);
  const [here, setHere] = useState<ThisBrowser>({ support: "checking" });
  const [busy, setBusy] = useState<"on" | "off" | "test" | null>(null);

  const check = useCallback(async () => {
    setHere(await readThisBrowser());
  }, []);

  useEffect(() => {
    let active = true;
    readThisBrowser()
      .then((state) => {
        if (active) setHere(state);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const turnOn = useCallback(async () => {
    setBusy("on");
    try {
      const subscription = await subscribeThisBrowser(publicKey);
      const result = await savePushDeviceAction(subscription);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setDevices((current) => [result.data.device, ...current.filter((device) => device.id !== result.data.device.id)]);
      onPreferences(result.data.preferences);
      toast.success("Browser notifications are on in this browser.");
    } catch (error) {
      toast.error(error instanceof PushSetupError ? error.message : "This browser could not turn on notifications. Please try again.");
    } finally {
      await check();
      setBusy(null);
    }
  }, [publicKey, onPreferences, check]);

  const turnOff = useCallback(async () => {
    setBusy("off");
    try {
      const endpoint = await unsubscribeThisBrowser();
      if (endpoint) {
        const key = await endpointKey(endpoint);
        await forgetPushDeviceAction(endpoint);
        setDevices((current) => current.filter((device) => device.key !== key));
      }
    } catch {
      toast.error(offline);
    } finally {
      await check();
      setBusy(null);
    }
  }, [check]);

  /** Removes a browser from the list; if it is this one, turns it off here too. Resolves true when done. */
  const remove = useCallback(
    async (device: PushDeviceView): Promise<boolean> => {
      try {
        if (here.support !== "checking" && here.key === device.key) await unsubscribeThisBrowser().catch(() => null);
        const result = await removePushDeviceAction(device.id);
        if (!result.success) {
          toast.error(result.error);
          return false;
        }
        setDevices((current) => current.filter((item) => item.id !== device.id));
        await check();
        return true;
      } catch {
        toast.error(offline);
        return false;
      }
    },
    [here, check],
  );

  const sendTest = useCallback(async () => {
    setBusy("test");
    try {
      const result = await sendTestPushAction();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      const { sent, failed, removed } = result.data;
      if (sent > 0) toast.success(`Sent to ${String(sent)} ${sent === 1 ? "browser" : "browsers"}.`);
      if (failed > 0) toast.error(`${String(failed)} ${failed === 1 ? "browser" : "browsers"} did not take it. Try again later.`);
      if (removed > 0) {
        toast.message(`${String(removed)} ${removed === 1 ? "browser was" : "browsers were"} no longer subscribed and left the list.`);
        const listed = await listPushDevicesAction();
        if (listed.success) setDevices(listed.data);
      }
    } catch {
      toast.error(offline);
    } finally {
      setBusy(null);
    }
  }, []);

  return { devices, here, busy, turnOn, turnOff, remove, sendTest };
}
