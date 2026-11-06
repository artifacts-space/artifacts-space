import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { UsernameOnboarding } from "@/components/teams/username-onboarding";
import { countUnreadMentions } from "@/lib/comments/inbox";
import { getSession } from "@/lib/session";
import { loadWorkspaceViewer } from "@/lib/teams/workspace";

export const instant = false;

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const viewer = await loadWorkspaceViewer(session.user);
  if (!viewer.usernameConfirmed) return <UsernameOnboarding suggestion={viewer.username} />;

  const teams = viewer.teams.map(({ slug, name, personal }) => ({ slug, name, personal }));
  const unreadMentions = await countUnreadMentions(session.user.id).catch(() => 0);
  return (
    <div className="min-h-screen">
      <AppHeader name={session.user.name} email={session.user.email} username={viewer.username} teams={teams} unreadMentions={unreadMentions} />
      {children}
    </div>
  );
}
