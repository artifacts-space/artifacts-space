import { canManageAgents } from "@/lib/agents/rules";
import type { SharingLevel } from "@/lib/artifact-types";
import { canDecideRequest, canWithdrawSharing, decideSharing, type SharingActor } from "@/lib/sharing/rules";
import { canManageTeamThemes } from "@/lib/themes/team-preset-rules";
import { decideEdit } from "@/lib/versions/rules";

import { canEditTeamSettings, canManageTeam, type TeamRole } from "./roles";

/**
 * Today's team permissions as a role-by-capability table, read-only. Every
 * cell asks the same rule functions the server actions and MCP tools use,
 * so the table cannot drift from what the app enforces. Client-safe.
 */

/** The roles in the table. Agents are team members whose actor is an agent. */
export const matrixRoles = ["owner", "admin", "member", "agent"] as const;
export type MatrixRole = (typeof matrixRoles)[number];

export const matrixCapabilities = [
  "shareTeam",
  "shareLink",
  "sharePublic",
  "approveSharing",
  "approveEdits",
  "invite",
  "removeMembers",
  "changeRoles",
  "manageAgents",
  "manageThemes",
  "viewAnalytics",
  "withdrawOthers",
  "sharingRule",
] as const;
export type MatrixCapability = (typeof matrixCapabilities)[number];

/** yes: does it. asks: asks an owner or admin first. limited: yes, but not to owners. no: cannot. */
export type MatrixGrant = "yes" | "asks" | "limited" | "no";

export const matrixRoleLabels: Record<MatrixRole, string> = { owner: "Owner", admin: "Admin", member: "Member", agent: "Agent" };

export const matrixCapabilityLabels: Record<MatrixCapability, { label: string; description: string }> = {
  shareTeam: { label: "Share with the team", description: "Make an artifact readable by everyone in the team." },
  shareLink: { label: "Share by link", description: "Let anyone with the link read an artifact." },
  sharePublic: { label: "Share in public", description: "Publish an artifact for everyone." },
  approveSharing: { label: "Approve sharing", description: "Approve or deny requests to share." },
  approveEdits: { label: "Approve edits", description: "Approve changes to link and public artifacts." },
  invite: { label: "Invite people", description: "Send, resend, and cancel invitations." },
  removeMembers: { label: "Remove people", description: "Take someone out of the team." },
  changeRoles: { label: "Change roles", description: "Give someone another role." },
  manageAgents: { label: "Add and remove agents", description: "Add agents, mute them, and manage their tokens." },
  manageThemes: { label: "Manage themes", description: "Edit team presets and the team default." },
  viewAnalytics: { label: "See views", description: "See who reads artifacts shared through the team." },
  withdrawOthers: { label: "Withdraw others' sharing", description: "Make a teammate's shared artifact private again. Nobody deletes a teammate's artifact." },
  sharingRule: { label: "Change the sharing rule", description: "Decide whether team sharing needs approval." },
};

/** The team settings the table depends on. */
export interface MatrixTeam {
  teamSharingNeedsApproval: boolean;
}

function teamRoleOf(role: MatrixRole): TeamRole {
  return role === "agent" ? "member" : role;
}

function actorOf(role: MatrixRole): SharingActor {
  return role === "agent" ? "agent" : "person";
}

function shareGrant(role: MatrixRole, level: SharingLevel, team: MatrixTeam): MatrixGrant {
  const outcome = decideSharing({ level, team: { personal: false, ...team }, role: teamRoleOf(role), actor: actorOf(role) });
  return outcome === "apply" ? "yes" : "asks";
}

function editGrant(role: MatrixRole): MatrixGrant {
  // An approver's own link edit applies at once; anyone else's waits. Approving someone else's edit is the same rule.
  const outcome = decideEdit({ visibility: "link", team: { personal: false, teamSharingNeedsApproval: true }, role: teamRoleOf(role), actor: actorOf(role) });
  return outcome === "apply" ? "yes" : "no";
}

function yesNo(allowed: boolean): MatrixGrant {
  return allowed ? "yes" : "no";
}

/** People who manage the team, except that admins never act on owners. */
function managesPeople(role: MatrixRole): MatrixGrant {
  if (role === "agent" || !canManageTeam(role)) return "no";
  return role === "owner" ? "yes" : "limited";
}

const grantRules: Record<MatrixCapability, (role: MatrixRole, team: MatrixTeam) => MatrixGrant> = {
  shareTeam: (role, team) => shareGrant(role, "team", team),
  shareLink: (role, team) => shareGrant(role, "link", team),
  sharePublic: (role, team) => shareGrant(role, "public", team),
  approveSharing: (role) => yesNo(canDecideRequest({ viewerRole: teamRoleOf(role), actor: actorOf(role) })),
  approveEdits: (role) => editGrant(role),
  invite: (role) => yesNo(role !== "agent" && canManageTeam(role)),
  removeMembers: (role) => managesPeople(role),
  changeRoles: (role) => managesPeople(role),
  manageAgents: (role) => yesNo(role !== "agent" && canManageAgents({ role, personal: false })),
  manageThemes: (role) => yesNo(role !== "agent" && canManageTeamThemes({ role, personal: false })),
  // Anyone who may edit an artifact shared through the team sees its views, in the web app or with artifacts_views.
  viewAnalytics: () => "yes",
  withdrawOthers: (role) => yesNo(role !== "agent" && canWithdrawSharing({ viewerId: "viewer", authorId: "teammate", viewerRole: role })),
  sharingRule: (role) => yesNo(role !== "agent" && canEditTeamSettings(role)),
};

/** What a role may do with one capability today, in a shared team with these settings. */
export function currentGrant(role: MatrixRole, capability: MatrixCapability, team: MatrixTeam): MatrixGrant {
  return grantRules[capability](role, team);
}

/** Short text for a grant, for the table and screen readers. */
export const matrixGrantLabels: Record<MatrixGrant, string> = {
  yes: "Yes",
  asks: "Asks first",
  limited: "Not owners",
  no: "No",
};
