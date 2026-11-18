"use client";

import { createContext, use } from "react";

import { leaveTeamAction } from "@/app/(workspace)/teams/actions";
import { leavePreviewAction, moveToPersonalBeforeLeavingAction } from "@/app/(workspace)/teams/leave-actions";

/**
 * The server actions Leave team goes through: what stays behind, moving
 * artifacts to Personal first, and leaving. The team page uses the server's
 * own (the default), so the session, membership, and ownership checks stay
 * there; only the /dev/team fixture hands in an in-memory stand-in.
 */
export interface LeaveActions {
  preview: typeof leavePreviewAction;
  moveToPersonal: typeof moveToPersonalBeforeLeavingAction;
  leave: typeof leaveTeamAction;
}

/** The team page's server actions. */
export const serverLeaveActions: LeaveActions = { preview: leavePreviewAction, moveToPersonal: moveToPersonalBeforeLeavingAction, leave: leaveTeamAction };

const LeaveActionsContext = createContext<LeaveActions>(serverLeaveActions);

/** Hands a /dev fixture's stand-in to the Leave team button below it. */
export function LeaveActionsProvider({ actions, children }: { actions: LeaveActions; children: React.ReactNode }) {
  return <LeaveActionsContext value={actions}>{children}</LeaveActionsContext>;
}

/** Where Leave team asks and saves: the server actions unless a fixture provided its own. */
export function useLeaveActions(): LeaveActions {
  return use(LeaveActionsContext);
}
