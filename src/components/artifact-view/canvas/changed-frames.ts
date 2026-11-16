"use client";

import { createContext, useContext } from "react";

const none: ReadonlySet<string> = new Set();

/**
 * The ids of the frames a newer save changed, while the editor's notice
 * about that save is up (use-catch-up.tsx). The board marks them, in the
 * page and in full screen. Empty everywhere else.
 */
export const ChangedFramesContext = createContext<ReadonlySet<string>>(none);

/** Whether the frame with this id is marked as changed. */
export function useFrameChanged(id: string): boolean {
  return useContext(ChangedFramesContext).has(id);
}
