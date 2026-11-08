"use client";

import { useState } from "react";

import { Section } from "@/components/teams/section";
import type { NotificationPreferences } from "@/lib/notifications/preference-rules";
import type { PushDeviceView } from "@/lib/notifications/push/devices";

import { NotificationSettings } from "./notification-settings";
import { BrowserNotifications } from "./push/browser-notifications";

interface NotificationsPanelProps {
  initial: NotificationPreferences;
  /** Browser notifications, when the site has them set up (VAPID). Null hides the option. */
  push: { publicKey: string; devices: PushDeviceView[] } | null;
}

/** The Notifications settings: where each event reaches the person, and their browsers. */
export function NotificationsPanel({ initial, push }: NotificationsPanelProps) {
  const [preferences, setPreferences] = useState(initial);
  return (
    <>
      <Section title="Notifications" description="Hear about comments and sharing where you want them. The bell in the header lists everything you keep in the app.">
        <NotificationSettings preferences={preferences} onPreferences={setPreferences} channels={push ? ["inApp", "browser", "email"] : ["inApp", "email"]} />
      </Section>
      {push ? (
        <Section title="Browser notifications" description="Get a notification on this device even when artifacts.space is closed. Your browser's push service delivers it encrypted.">
          <BrowserNotifications publicKey={push.publicKey} initialDevices={push.devices} onPreferences={setPreferences} />
        </Section>
      ) : null}
    </>
  );
}
