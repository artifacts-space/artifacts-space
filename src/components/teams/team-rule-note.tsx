import { IconLock, IconPencil, IconUsers } from "@tabler/icons-react";

import { teamRuleLines, type TeamRuleSubject } from "@/lib/teams/team-rule-copy";

/**
 * "How this team works": the editing and sharing rule for the viewer, in
 * three short lines, so everyone in the team can see where approval applies.
 * Shared teams only; a personal team approves itself.
 */
export function TeamRuleNote({ team }: { team: TeamRuleSubject }) {
  const lines = teamRuleLines(team);
  const rows = [
    { key: "inside", icon: IconPencil, label: "Inside the team", text: lines.inside },
    { key: "team", icon: IconUsers, label: "Sharing with the team", text: lines.team },
    { key: "outside", icon: IconLock, label: "Outside the team", text: lines.outside },
  ];
  return (
    <section aria-labelledby="team-rule-title" className="card-surface px-5 py-4" data-slot="team-rule">
      <h2 id="team-rule-title" className="text-md font-medium">How this team works</h2>
      <dl className="mt-3 grid gap-3 sm:grid-cols-3 sm:gap-5">
        {rows.map(({ key, icon: Icon, label, text }) => (
          <div key={key} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-sm font-medium"><Icon aria-hidden className="size-4 text-muted-foreground" />{label}</dt>
            <dd className="mt-1 text-sm leading-5 text-muted-foreground">{text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
