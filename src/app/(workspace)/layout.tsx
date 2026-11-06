import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { ConfirmationsProvider } from "@/components/confirmations-provider";
import { UsernameOnboarding } from "@/components/teams/username-onboarding";
import { countUnreadMentions } from "@/lib/comments/inbox";
import { listSkippedConfirmations } from "@/lib/confirmations/store";
import { getSession } from "@/lib/session";
import { loadWorkspaceViewer } from "@/lib/teams/workspace";

export const instant = false;

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const viewer = await loadWorkspaceViewer(session.user);
  if (!viewer.usernameConfirmed) return <UsernameOnboarding suggestion={viewer.username} />;

  const teams = viewer.teams.map(({ slug, name, personal }) => ({ slug, name, personal }));
  const [unreadMentions, skippedConfirmations] = await Promise.all([
    countUnreadMentions(session.user.id).catch(() => 0),
    // Without the list, every confirmation shows. That is the safe side.
    listSkippedConfirmations(session.user.id).catch(() => []),
  ]);
  return (
    <ConfirmationsProvider initial={skippedConfirmations}>
      <div className="min-h-screen">
        <AppHeader name={session.user.name} email={session.user.email} username={viewer.username} teams={teams} unreadMentions={unreadMentions} />
        {children}
      </div>
    </ConfirmationsProvider>
  );
}
