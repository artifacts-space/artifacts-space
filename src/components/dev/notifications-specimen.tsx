"use client";

import { ConfirmationsProvider } from "@/components/confirmations-provider";
import { NotificationsPanel } from "@/components/notifications/notifications-panel";
import { defaultPreferences } from "@/lib/notifications/preference-rules";
import type { PushDeviceView } from "@/lib/notifications/push/devices";

/** A valid-looking P-256 public key; the gallery never subscribes. */
const galleryKey = "BFrEtiLlM5EKmkMz2ymx8vABnssUwiTZ3fUAXsuwD5FlaTsLGm_J0yZptaGmsC-NyFlsGYTdle6aFhY3DU86YQI";

const devices: PushDeviceView[] = [
  { id: "d1", label: "Chrome on macOS", createdAt: "2026-11-01T12:00:00.000Z", lastUsedAt: "2026-11-07T09:30:00.000Z", key: "0000000000000001" },
  { id: "d2", label: "Safari on iOS", createdAt: "2026-10-20T08:00:00.000Z", lastUsedAt: null, key: "0000000000000002" },
];

/** The Notifications settings with browser notifications set up, for the gallery. No database and no permission prompt. */
export function NotificationsSpecimen() {
  return (
    <ConfirmationsProvider initial={[]}>
      <div className="space-y-6">
        <NotificationsPanel initial={defaultPreferences()} push={{ publicKey: galleryKey, devices }} />
      </div>
    </ConfirmationsProvider>
  );
}
