import type { NotificationView } from "@/lib/notifications/feed";

const minute = 60_000;

/** Bell entries for the dev workspace fixture: folded comments, a mention, a request, and a read decision. No database. */
export function fixtureNotifications(now: number = Date.now()): NotificationView[] {
  const at = (minutesAgo: number) => new Date(now - minutesAgo * minute).toISOString();
  const artifact = { publicId: "fixtureworkspace000md", title: "Long markdown fixture", icon: null };
  const ada = { userId: "fixture-ada", kind: "person" as const, label: "@ada" };
  const agent = { userId: "fixture-agent", kind: "agent" as const, label: "@claude-code for Fixture" };
  const href = `/app?artifact=${artifact.publicId}&comments=1`;
  return [
    { id: "n1", type: "mention", createdAt: at(2), readAt: null, actor: ada, artifact, excerpt: "Can you check the rollout plan before Friday?", requestKind: null, href },
    { id: "n2", type: "comment", createdAt: at(10), readAt: null, actor: agent, artifact, excerpt: "I updated the risks section with the new numbers.", requestKind: null, href },
    { id: "n3", type: "comment", createdAt: at(30), readAt: null, actor: ada, artifact, excerpt: "Looks good to me.", requestKind: null, href },
    { id: "n4", type: "share_request", createdAt: at(90), readAt: null, actor: agent, artifact, excerpt: null, requestKind: "sharing", href: "/teams/fixture" },
    { id: "n5", type: "share_approved", createdAt: at(60 * 26), readAt: at(60 * 20), actor: ada, artifact, excerpt: null, requestKind: "edit", href: `/app?artifact=${artifact.publicId}` },
  ];
}
