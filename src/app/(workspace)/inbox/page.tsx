import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { InboxList } from "@/components/comments/inbox-list";
import { listInbox } from "@/lib/comments/inbox";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Inbox" };
export const instant = false;

/** The viewer's mentions: unread first, then recent read ones. */
export default async function InboxPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const entries = await listInbox(session.user.id, { unreadOnly: false });
  const sorted = [...entries.filter((entry) => entry.readAt === null), ...entries.filter((entry) => entry.readAt !== null)];

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 py-8 sm:p-6 sm:py-10">
      <div>
        <h1 className="text-xl font-medium tracking-[-0.01em]">Inbox</h1>
        <p className="mt-1 text-md text-muted-foreground">Comments where a teammate or an agent mentioned you.</p>
      </div>
      <InboxList entries={sorted} />
    </main>
  );
}
