import type { NotificationView } from "@/lib/notifications/feed";

const minute = 60_000;

/** The artifact only a link reaches (not in the fixture's list), like someone else's artifact shared by link. */
export const LINK_ONLY_PUBLIC_ID = "fixtureworkspacelinked";
/** An artifact that no longer exists, for the "no longer available" notice. */
export const GONE_PUBLIC_ID = "fixtureworkspacegone";

/**
 * Bell entries for the dev workspace fixture: folded comments, a mention, a
 * request, and read decisions, one for an artifact outside the list and one
 * for an artifact that is gone. Rows link to the fixture page, the stand-in
 * for /app. No database.
 */
export function fixtureNotifications(now: number = Date.now()): NotificationView[] {
  const at = (minutesAgo: number) => new Date(now - minutesAgo * minute).toISOString();
  const artifact = { publicId: "fixtureworkspace000md", title: "Long markdown fixture", icon: null };
  const linkOnly = { publicId: LINK_ONLY_PUBLIC_ID, title: "Shared by link fixture", icon: null };
  const gone = { publicId: GONE_PUBLIC_ID, title: "Removed fixture", icon: null };
  const ada = { userId: "fixture-ada", kind: "person" as const, label: "@ada" };
  const agent = { userId: "fixture-agent", kind: "agent" as const, label: "@claude-code for Fixture" };
  const open = (publicId: string) => `/dev/workspace?artifact=${publicId}`;
  const href = `${open(artifact.publicId)}&comments=1`;
  return [
    { id: "n1", type: "mention", createdAt: at(2), readAt: null, actor: ada, artifact, excerpt: "Can you check the rollout plan before Friday?", requestKind: null, href },
    { id: "n2", type: "comment", createdAt: at(10), readAt: null, actor: agent, artifact, excerpt: "I updated the risks section with the new numbers.", requestKind: null, href },
    { id: "n3", type: "comment", createdAt: at(30), readAt: null, actor: ada, artifact, excerpt: "Looks good to me.", requestKind: null, href },
    { id: "n4", type: "share_request", createdAt: at(90), readAt: null, actor: agent, artifact, excerpt: null, requestKind: "sharing", href: "/teams/fixture?tab=artifacts&view=approval" },
    { id: "n5", type: "share_approved", createdAt: at(60 * 26), readAt: at(60 * 20), actor: ada, artifact, excerpt: null, requestKind: "edit", href: open(artifact.publicId) },
    { id: "n6", type: "share_approved", createdAt: at(60 * 50), readAt: at(60 * 48), actor: ada, artifact: linkOnly, excerpt: null, requestKind: "sharing", href: open(linkOnly.publicId) },
    { id: "n7", type: "share_declined", createdAt: at(60 * 74), readAt: at(60 * 72), actor: ada, artifact: gone, excerpt: null, requestKind: "sharing", href: open(gone.publicId) },
  ];
}
