"use client";

import { createContext, use } from "react";

import type { ActorKind, TeamCapability } from "@/lib/teams/capability-rules";
import type { TeamRole } from "@/lib/teams/roles";

/** A team the viewer can share with, as the share control needs it. */
export interface ShareTeam {
  id: string;
  slug: string;
  name: string;
  personal: boolean;
  role: TeamRole;
  /** The viewer's role and what it may do there (capability-rules.ts), so share controls say what will happen. The server decides again. */
  roleKey: string;
  kind: ActorKind;
  capabilities: readonly TeamCapability[];
  teamSharingNeedsApproval: boolean;
}

const ShareTeamsContext = createContext<readonly ShareTeam[]>([]);

/** Provides the viewer's teams to share controls below it. */
export function ShareTeamsProvider({ teams, children }: { teams: readonly ShareTeam[]; children: React.ReactNode }) {
  return <ShareTeamsContext value={teams}>{children}</ShareTeamsContext>;
}

/** The viewer's teams, personal team first. */
export function useShareTeams() {
  return use(ShareTeamsContext);
}
