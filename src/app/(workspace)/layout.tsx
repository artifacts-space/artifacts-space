import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { ConfirmationsProvider } from "@/components/confirmations-provider";
import { UsernameOnboarding } from "@/components/teams/username-onboarding";
import { listSkippedConfirmations } from "@/lib/confirmations/store";
import { countUnreadNotifications } from "@/lib/notifications/feed";
import { getSession } from "@/lib/session";
import { loadWorkspaceViewer } from "@/lib/teams/workspace";

export const instant = false;

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const viewer = await loadWorkspaceViewer(session.user);
  if (!viewer.usernameConfirmed) return <UsernameOnboarding suggestion={viewer.username} />;

  const teams = viewer.teams.map(({ slug, name, personal }) => ({ slug, name, personal }));
  const [unreadNotifications, skippedConfirmations] = await Promise.all([
    countUnreadNotifications(session.user.id).catch(() => 0),
    // Without the list, every confirmation shows. That is the safe side.
    listSkippedConfirmations(session.user.id).catch(() => []),
  ]);
  return (
    <ConfirmationsProvider initial={skippedConfirmations}>
      <div className="workspace-frame">
        <AppHeader userId={session.user.id} name={session.user.name} email={session.user.email} username={viewer.username} teams={teams} unreadNotifications={unreadNotifications} />
        {children}
      </div>
    </ConfirmationsProvider>
  );
}
