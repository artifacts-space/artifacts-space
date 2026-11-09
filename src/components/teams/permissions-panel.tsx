import { can } from "@/lib/teams/capability-rules";
import { grantableCapabilities, orderRoles, type MatrixRole } from "@/lib/teams/permission-matrix-rules";
import type { TeamMembership } from "@/lib/teams/queries";
import type { PermissionAuditView } from "@/lib/teams/role-store";

import { NewRoleDialog } from "./new-role-dialog";
import { PermissionAudit } from "./permission-audit";
import { PermissionsMatrix } from "./permissions-matrix";
import { Section } from "./section";
import { SharingRuleSetting } from "./team-settings";

/**
 * The Permissions tab: the editable role matrix (read-only for people who
 * cannot change roles), the sharing rule, and the log of role changes.
 */
export function PermissionsPanel({ team, roles, audit }: { team: TeamMembership; roles: readonly MatrixRole[]; audit: readonly PermissionAuditView[] }) {
  const viewer = team.kind === "person" ? team : null;
  const grantable = grantableCapabilities(viewer);
  const editable = viewer !== null && can(viewer, "members.roles");
  return (
    <>
      <Section
        title="Permissions"
        description={editable ? "What each role can do. Change roles below your own, with what your role can do. Owners always can do everything, and agents never approve." : "What each role can do in this team. Owners always can do everything, and agents never approve."}
        action={grantable.length > 0 ? <NewRoleDialog teamId={team.id} grantable={grantable} /> : undefined}
      >
        <PermissionsMatrix teamId={team.id} viewer={viewer} roles={orderRoles(roles)} />
      </Section>
      <Section title="Sharing rule" description="Does sharing with the team need approval?">
        <SharingRuleSetting teamId={team.id} needsApproval={team.teamSharingNeedsApproval} canEdit={viewer !== null && can(viewer, "settings.sharing")} />
      </Section>
      <Section title="Role changes" description="Every change to a role, and every change to someone's role, with who made it.">
        <PermissionAudit entries={audit} />
      </Section>
    </>
  );
}
