import { capabilityLabels } from "@/lib/teams/capability-labels";
import { isTeamCapability } from "@/lib/teams/capability-rules";
import type { PermissionAuditView } from "@/lib/teams/role-store";

import { dateFormat } from "./member-table-cells";

function names(values: readonly string[]) {
  return values.map((value) => (isTeamCapability(value) ? capabilityLabels[value].label : value)).join(", ");
}

function changeSentence(who: string, entry: PermissionAuditView): string {
  const added = entry.after.filter((value) => !entry.before.includes(value));
  const removed = entry.before.filter((value) => !entry.after.includes(value));
  const parts = [added.length > 0 ? `added ${names(added)}` : "", removed.length > 0 ? `removed ${names(removed)}` : ""].filter(Boolean);
  return `${who} changed ${entry.subject}: ${parts.join("; ") || "no change"}.`;
}

/** One change in plain words: what changed, then what was added and removed. */
export function auditSentence(entry: PermissionAuditView): string {
  const who = entry.actorName ?? "A former member";
  if (entry.action === "member_role_changed") return `${who} changed ${entry.subject}'s role from ${entry.before.join("") || "none"} to ${entry.after.join("") || "none"}.`;
  if (entry.action === "role_created") return `${who} created the ${entry.subject} role${entry.after.length > 0 ? `: ${names(entry.after)}` : ""}.`;
  if (entry.action === "role_deleted") return `${who} deleted the ${entry.subject} role.`;
  if (entry.action === "role_updated") return changeSentence(who, entry);
  // A newer kind of change than this page knows: still listed, never dropped.
  return `${who} changed ${entry.subject} (${entry.action.replaceAll("_", " ")}).`;
}

/** The newest changes to roles and members' roles (up to 50), for everyone in the team to read. */
export function PermissionAudit({ entries }: { entries: readonly PermissionAuditView[] }) {
  if (entries.length === 0) return <p className="px-5 py-6 text-md text-muted-foreground">No role changes yet. Every change shows here, with who made it.</p>;
  return (
    <ul>
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b px-5 py-2.5 text-sm last:border-b-0" data-audit-action={entry.action}>
          <span className="min-w-0">{auditSentence(entry)}</span>
          <time className="text-xs text-muted-foreground" dateTime={entry.createdAt}>{dateFormat.format(new Date(entry.createdAt))}</time>
        </li>
      ))}
    </ul>
  );
}
