import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { NotificationsPanel } from "@/components/notifications/notifications-panel";
import { loadPreferencesFor } from "@/lib/notifications/preferences";
import { listDevices } from "@/lib/notifications/push/devices";
import { pushPublicKey } from "@/lib/notifications/push/send";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };
// Reads the signed-in session, so it renders per request.
export const instant = false;

/** Account settings: how the person hears about comments and sharing. Browser notifications show only when VAPID is set up. */
export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const publicKey = pushPublicKey();
  const [preferences, devices] = await Promise.all([loadPreferencesFor(session.user.id), publicKey ? listDevices(session.user.id) : Promise.resolve([])]);
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 py-8 sm:p-6 sm:py-10">
      <div>
        <h1 className="text-xl font-medium tracking-[-0.01em]">Settings</h1>
        <p className="mt-1 text-md text-muted-foreground">Choose how artifacts.space keeps you in the loop.</p>
      </div>
      <NotificationsPanel initial={preferences} push={publicKey ? { publicKey, devices } : null} />
    </main>
  );
}
