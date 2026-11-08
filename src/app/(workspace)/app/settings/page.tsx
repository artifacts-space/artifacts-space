import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { NotificationSettings } from "@/components/notifications/notification-settings";
import { Section } from "@/components/teams/section";
import { loadPreferencesFor } from "@/lib/notifications/preferences";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };
// Reads the signed-in session, so it renders per request.
export const instant = false;

/** Account settings: how the person hears about comments and sharing. */
export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const preferences = await loadPreferencesFor(session.user.id);
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 py-8 sm:p-6 sm:py-10">
      <div>
        <h1 className="text-xl font-medium tracking-[-0.01em]">Settings</h1>
        <p className="mt-1 text-md text-muted-foreground">Choose how artifacts.space keeps you in the loop.</p>
      </div>
      <Section title="Notifications" description="Hear about comments and sharing where you want them. The bell in the header lists everything you keep in the app.">
        <NotificationSettings initial={preferences} />
      </Section>
    </main>
  );
}
