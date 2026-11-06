/** People and agents in one team. Agents are team members in the database, but never count as people. */
export interface TeamHeadcount {
  people: number;
  agents: number;
}

/** "1 member" or "3 members", counting people only. */
export function peopleCountLabel(people: number): string {
  return `${String(people)} ${people === 1 ? "member" : "members"}`;
}

/** "1 agent" or "2 agents", or an empty string when the team has none. */
export function agentCountLabel(agents: number): string {
  if (agents <= 0) return "";
  return `${String(agents)} ${agents === 1 ? "agent" : "agents"}`;
}

/** The headcount for a team, or zero of each when it has no rows. */
export function headcountFor(counts: ReadonlyMap<string, TeamHeadcount>, teamId: string): TeamHeadcount {
  return counts.get(teamId) ?? { people: 0, agents: 0 };
}
