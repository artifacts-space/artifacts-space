"use client";

import { createContext, use } from "react";

import { setCommentsAction, setShowInSearchAction, shareArtifactAction } from "@/app/(workspace)/app/sharing-actions";

/**
 * The server actions sharing saves through. Every surface uses the
 * workspace's own (the default), so the auth, approval, and team checks stay
 * in one place; only the /dev fixtures hand in-memory stand-ins.
 */
export interface ShareActions {
  share: typeof shareArtifactAction;
  comments: typeof setCommentsAction;
  search: typeof setShowInSearchAction;
}

/** The workspace's server actions. */
export const serverShareActions: ShareActions = { share: shareArtifactAction, comments: setCommentsAction, search: setShowInSearchAction };

const ShareActionsContext = createContext<ShareActions>(serverShareActions);

/** Hands a /dev fixture's stand-in to every share control below it, and to the workspace's move toast. */
export function ShareActionsProvider({ actions, children }: { actions: ShareActions; children: React.ReactNode }) {
  return <ShareActionsContext value={actions}>{children}</ShareActionsContext>;
}

/** Where sharing saves go here: the server actions unless a fixture provided its own. */
export function useShareActions(): ShareActions {
  return use(ShareActionsContext);
}
