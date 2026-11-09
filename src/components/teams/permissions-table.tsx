import { IconCheck, IconMinus, IconUserQuestion } from "@tabler/icons-react";

import {
  currentGrant,
  matrixCapabilities,
  matrixCapabilityLabels,
  matrixGrantLabels,
  matrixRoleLabels,
  matrixRoles,
  type MatrixGrant,
  type MatrixTeam,
} from "@/lib/teams/permission-matrix-rules";

function GrantCell({ grant }: { grant: MatrixGrant }) {
  const label = matrixGrantLabels[grant];
  if (grant === "yes") return <span className="inline-flex items-center gap-1"><IconCheck aria-hidden className="size-4" /><span className="sr-only">{label}</span></span>;
  if (grant === "no") return <span className="inline-flex items-center text-muted-foreground"><IconMinus aria-hidden className="size-4" /><span className="sr-only">{label}</span></span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      {grant === "asks" ? <IconUserQuestion aria-hidden className="size-3.5" /> : null}
      {label}
    </span>
  );
}

/**
 * Who may do what in the team, as a role-by-capability table. Read-only:
 * every cell comes from the rules the app enforces today
 * (src/lib/teams/permission-matrix-rules.ts).
 */
export function PermissionsTable({ team }: { team: MatrixTeam }) {
  return (
    // The table scrolls inside the card on narrow phones, never the page.
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" aria-label="Permissions by role">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 pl-5 font-normal">Capability</th>
            {matrixRoles.map((role) => <th key={role} scope="col" className="px-2 py-2 text-center font-normal last:pr-5">{matrixRoleLabels[role]}</th>)}
          </tr>
        </thead>
        <tbody>
          {matrixCapabilities.map((capability) => (
            <tr key={capability} className="border-t" data-capability={capability}>
              <th scope="row" className="py-2.5 pr-3 pl-5 text-left font-normal">
                <span className="block font-medium">{matrixCapabilityLabels[capability].label}</span>
                <span className="block text-xs text-muted-foreground">{matrixCapabilityLabels[capability].description}</span>
              </th>
              {matrixRoles.map((role) => (
                <td key={role} className="px-2 py-2.5 text-center last:pr-5" data-role={role}>
                  <GrantCell grant={currentGrant(role, capability, team)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
