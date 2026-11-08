"use client";

import { IconBellRinging, IconBellOff, IconLoader2, IconSend, IconTrash } from "@tabler/icons-react";

import { ConfirmDialog, useConfirm } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { NotificationPreferences } from "@/lib/notifications/preference-rules";
import type { PushDeviceView } from "@/lib/notifications/push/devices";
import { formatExactTime, formatRelativeTime } from "@/lib/relative-time";

import { useBrowserPush, type ThisBrowser } from "./use-browser-push";

/** What this browser can do, in words, with the button that changes it. */
function ThisBrowserRow({ here, on, busy, onTurnOn, onTurnOff }: { here: ThisBrowser; on: boolean; busy: string | null; onTurnOn: () => void; onTurnOff: () => void }) {
  if (here.support === "checking") return <p className="text-sm text-muted-foreground">Checking this browser…</p>;
  if (here.support === "unsupported") {
    return <p className="text-sm text-muted-foreground">This browser cannot show notifications from websites. On iPhone and iPad, add artifacts.space to your Home Screen first, then open it from there.</p>;
  }
  if (on) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">On in this browser.</p>
        <Button variant="outline" size="sm" disabled={busy !== null} onClick={onTurnOff}>
          {busy === "off" ? <IconLoader2 className="animate-spin" /> : <IconBellOff />} Turn off here
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        {here.support === "blocked" ? "Notifications are blocked for this site. Allow them in your browser's site settings, then turn them on here." : "Off in this browser. Your browser asks for permission when you turn it on."}
      </p>
      <Button size="sm" disabled={busy !== null} onClick={onTurnOn}>
        {busy === "on" ? <IconLoader2 className="animate-spin" /> : <IconBellRinging />} Turn on in this browser
      </Button>
    </div>
  );
}

function DeviceRow({ device, isHere, onRemove }: { device: PushDeviceView; isHere: boolean; onRemove: () => void }) {
  const now = new Date();
  const added = new Date(device.createdAt);
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-md">
          {device.label}
          {isHere ? <Badge variant="secondary">This browser</Badge> : null}
        </p>
        <p className="text-xs text-muted-foreground">
          <span title={formatExactTime(added)}>Added {formatRelativeTime(added, now)}</span>
          {device.lastUsedAt ? ` · Last notified ${formatRelativeTime(new Date(device.lastUsedAt), now)}` : null}
        </p>
      </div>
      <Button variant="ghost" size="sm" onClick={onRemove} aria-label={`Remove ${device.label}`}>
        <IconTrash /> Remove
      </Button>
    </li>
  );
}

interface BrowserNotificationsProps {
  publicKey: string;
  initialDevices: PushDeviceView[];
  onPreferences: (preferences: NotificationPreferences) => void;
}

/**
 * Turn browser notifications on or off in this browser, see and remove the
 * other browsers that get them, and send a test. Nothing asks for permission
 * until the person clicks Turn on.
 */
export function BrowserNotifications({ publicKey, initialDevices, onPreferences }: BrowserNotificationsProps) {
  const { devices, here, busy, turnOn, turnOff, remove, sendTest } = useBrowserPush({ publicKey, initialDevices, onPreferences });
  const confirmRemove = useConfirm("removePushDevice");
  const hereKey = here.support === "checking" ? null : here.key;
  const on = hereKey !== null && devices.some((device) => device.key === hereKey);

  return (
    <div className="space-y-4 px-5 py-4">
      <ThisBrowserRow here={here} on={on} busy={busy} onTurnOn={() => void turnOn()} onTurnOff={() => void turnOff()} />
      {devices.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium">Browsers that get notifications</h3>
          <ul className="mt-1 divide-y">
            {devices.map((device) => (
              <DeviceRow key={device.id} device={device} isHere={device.key === hereKey} onRemove={() => { confirmRemove.request(() => remove(device)); }} />
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-sm text-muted-foreground">Check that notifications reach your browsers.</p>
        <Button variant="outline" size="sm" disabled={busy !== null || devices.length === 0} onClick={() => void sendTest()}>
          {busy === "test" ? <IconLoader2 className="animate-spin" /> : <IconSend />} Send a test notification
        </Button>
      </div>
      <ConfirmDialog
        state={confirmRemove.dialog}
        title="Remove this browser?"
        description="It stops getting notifications. You can turn them on again from that browser."
        confirmLabel="Remove"
      />
    </div>
  );
}
