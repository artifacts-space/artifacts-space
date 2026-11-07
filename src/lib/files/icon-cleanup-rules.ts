import { iconFileId } from "@/lib/artifact-icons";

import { fileRefsInContent } from "./refs";

/**
 * Which old icon images an artifact no longer needs. Pure, so it is tested
 * without a database; icon-cleanup.ts loads the rows and deletes.
 */

/** What decides whether a file is still in use: one shown state of the artifact. */
export interface IconUseState {
  icon: string | null;
  kind: string;
  content: string;
}

function fileIdsUsedBy(state: IconUseState): string[] {
  const iconId = iconFileId(state.icon);
  return [...fileRefsInContent(state.kind, state.content), ...(iconId ? [iconId] : [])];
}

/**
 * The candidate files (images that were once the icon) nothing uses any
 * more. A file stays when the current artifact or a protected version (the
 * approved one readers outside the team see, or one waiting for approval)
 * shows it as the icon or points at it from an Image or File element. In a
 * file artifact every attachment is content, so nothing is removed there.
 */
export function unusedIconFiles(candidates: readonly string[], current: IconUseState, protectedStates: readonly IconUseState[]): string[] {
  if (current.kind === "file") return [];
  const used = new Set([current, ...protectedStates].flatMap(fileIdsUsedBy));
  return [...new Set(candidates)].filter((fileId) => !used.has(fileId));
}
