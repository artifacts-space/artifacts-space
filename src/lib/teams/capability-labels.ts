import type { TeamCapability } from "./capability-rules";

/** What each capability is called in the Permissions tab and the audit log, with a short description. Client-safe. */
export const capabilityLabels: Record<TeamCapability, { label: string; description: string }> = {
  "share.team": { label: "Share with the team", description: "Share with everyone in the team without asking first, when the team's rule needs approval." },
  "share.link": { label: "Share by link", description: "Let anyone with the link read an artifact, without asking first." },
  "share.public": { label: "Share in public", description: "Publish an artifact for everyone, or open its comments to anyone signed in, without asking first." },
  "approve.sharing": { label: "Approve sharing", description: "Approve or deny requests to share or to open comments." },
  "approve.edits": { label: "Approve edits", description: "Approve changes to link and public artifacts." },
  "members.invite": { label: "Invite people", description: "Send, resend, and cancel invitations." },
  "members.remove": { label: "Remove people", description: "Take someone with a lower role out of the team." },
  "members.roles": { label: "Change roles", description: "Give people roles below your own, and edit those roles." },
  "agents.manage": { label: "Add and remove agents", description: "Add agents, mute them, and manage their tokens." },
  "themes.manage": { label: "Manage themes", description: "Edit team presets and the team default." },
  "analytics.view": { label: "See views", description: "See how often artifacts shared through the team are read." },
  "artifacts.withdraw": { label: "Withdraw others' sharing", description: "Make a teammate's shared artifact private again. Only its author deletes it." },
  "reports.handle": { label: "Handle reports", description: "Review what readers report, and dismiss it or withdraw sharing." },
  "settings.sharing": { label: "Change the sharing rule", description: "Decide whether team sharing needs approval, and rename the team." },
};

/** Sharing capabilities: without one, a member still shares, after approval. */
export const askFirstCapabilities: ReadonlySet<TeamCapability> = new Set<TeamCapability>(["share.team", "share.link", "share.public"]);
