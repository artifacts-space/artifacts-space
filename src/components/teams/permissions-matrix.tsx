"use client";

import { IconCheck, IconLock, IconMinus, IconTrash, IconUserQuestion } from "@tabler/icons-react";

import { deleteRoleAction, updateRoleCapabilityAction } from "@/app/(workspace)/teams/role-actions";
import { ConfirmDialog, useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { askFirstCapabilities, capabilityLabels } from "@/lib/teams/capability-labels";
import { can, teamCapabilities, type TeamActor, type TeamCapability } from "@/lib/teams/capability-rules";
import { matrixCell, type MatrixCell, type MatrixRole } from "@/lib/teams/permission-matrix-rules";
import { deleteRoleProblem } from "@/lib/teams/role-admin-rules";

import { useTeamAction } from "./use-team-action";

/** Why a cell cannot change, as its accessible name says it. */
function cellReason(cell: MatrixCell): string {
  if (cell.locked) return ` Locked: ${cell.locked}`;
  return cell.blocked ? ` ${cell.blocked}` : "";
}

/**
 * A cell the viewer cannot change: the state, and why. Locked cells, and
 * blocked cells for people who change roles, show the reason in a tooltip;
 * for everyone else it is only in the accessible name, since the panel
 * already says the matrix is read-only for them.
 */
function StaticCell({ cell, capability, roleName, explain }: { cell: MatrixCell; capability: TeamCapability; roleName: string; explain: boolean }) {
  const label = `${capabilityLabels[capability].label} for ${roleName}`;
  const state = cell.held ? "Yes" : askFirstCapabilities.has(capability) ? "Asks first" : "No";
  const icon = cell.held ? <IconCheck aria-hidden className="size-4" /> : askFirstCapabilities.has(capability) ? <IconUserQuestion aria-hidden className="size-4" /> : <IconMinus aria-hidden className="size-4" />;
  const content = (
    <span className="inline-flex items-center gap-0.5 text-muted-foreground" data-locked={cell.locked ? "true" : undefined}>
      {icon}
      {cell.locked ? <IconLock aria-hidden className="size-3" /> : null}
      <span className="sr-only">{`${label}: ${state}.${cellReason(cell)}`}</span>
    </span>
  );
  const reason = cell.locked ?? (explain ? cell.blocked : null);
  if (!reason) return content;
  return (
    <Tooltip>
      <TooltipTrigger render={<button type="button" className="rounded-md p-1 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none" aria-label={`${label}: ${state}.${cellReason(cell)}`} />}>{content}</TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

function EditableCell({ teamId, role, capability, held, busy, onToggle }: { teamId: string; role: MatrixRole; capability: TeamCapability; held: boolean; busy: boolean; onToggle: (key: string, run: () => ReturnType<typeof updateRoleCapabilityAction>) => void }) {
  return (
    <Checkbox
      checked={held}
      disabled={busy}
      aria-label={`${capabilityLabels[capability].label} for ${role.name}`}
      onCheckedChange={(on) => { onToggle(`${role.key}:${capability}`, () => updateRoleCapabilityAction(teamId, role.key, capability, on)); }}
    />
  );
}

function RoleHeader({ teamId, viewer, role }: { teamId: string; viewer: TeamActor | null; role: MatrixRole }) {
  const { pending, run } = useTeamAction();
  const confirmDelete = useConfirm("deleteTeamRole");
  const deletable = deleteRoleProblem(viewer, role.key) === null;
  return (
    <th scope="col" className="px-2 py-2 text-center font-normal last:pr-5">
      <span className="inline-flex items-center gap-0.5">
        {role.name}
        {deletable ? (
          <Button variant="ghost" size="icon-xs" aria-label={`Delete the ${role.name} role`} disabled={pending !== null} onClick={() => { confirmDelete.request(() => run("delete", () => deleteRoleAction(teamId, role.key), `${role.name} deleted.`)); }}>
            <IconTrash />
          </Button>
        ) : null}
      </span>
      {deletable ? (
        <ConfirmDialog state={confirmDelete.dialog} title={`Delete the ${role.name} role?`} description="People with this role go back to Member, and lose anything only this role gave them." confirmLabel="Delete role" pending={pending !== null} />
      ) : null}
    </th>
  );
}

/**
 * Who may do what, as a role-by-capability matrix. People who may change
 * roles toggle the cells they may change; locked cells show a lock and say
 * why; everything else is read-only. Every change saves at once and is
 * audited.
 */
export function PermissionsMatrix({ teamId, viewer, roles }: { teamId: string; viewer: TeamActor | null; roles: readonly MatrixRole[] }) {
  const { pending, run } = useTeamAction();
  const editor = viewer?.kind === "person" && can(viewer, "members.roles");
  const toggle = (key: string, action: () => ReturnType<typeof updateRoleCapabilityAction>) => void run(key, action, "Permissions saved.");
  return (
    // The table scrolls inside the card on narrow phones, never the page.
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" aria-label="Permissions by role">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 pl-5 font-normal">Capability</th>
            {roles.map((role) => <RoleHeader key={role.key} teamId={teamId} viewer={viewer} role={role} />)}
          </tr>
        </thead>
        <tbody>
          {teamCapabilities.map((capability) => (
            <tr key={capability} className="border-t" data-capability={capability}>
              <th scope="row" className="py-2.5 pr-3 pl-5 text-left font-normal">
                <span className="block font-medium">{capabilityLabels[capability].label}</span>
                <span className="block text-xs text-muted-foreground">{capabilityLabels[capability].description}</span>
              </th>
              {roles.map((role) => {
                const cell = matrixCell(viewer, role, capability);
                const editable = cell.locked === null && cell.blocked === null;
                return (
                  <td key={role.key} className="px-2 py-2.5 text-center last:pr-5" data-role={role.key}>
                    <span className="inline-flex justify-center">
                      {editable ? <EditableCell teamId={teamId} role={role} capability={capability} held={cell.held} busy={pending !== null} onToggle={toggle} /> : <StaticCell cell={cell} capability={capability} roleName={role.name} explain={editor} />}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
