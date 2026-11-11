"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { ArtifactDto, ArtifactEditorDto, ArtifactHarnessDto } from "@/lib/artifact-types";

/** Who saved the artifact last, and when, for the block menu's footer. */
export interface BlockMenuLastEdited {
  editor: ArtifactEditorDto | null;
  /** ISO time of the last save. */
  at: string;
  harness: ArtifactHarnessDto | null;
}

/**
 * What the block menu needs from the page around the editor: the artifact
 * to link to, its last save for the footer, and whether this person may
 * comment. Editors without it (a ui artifact's Markdown block) have no block
 * handles.
 */
export interface BlockMenuPage {
  /** Null while the artifact is not saved yet (a new, blank page): nothing to link to or comment on. */
  publicId: string | null;
  lastEdited: BlockMenuLastEdited;
  canComment: boolean;
}

const BlockMenuPageContext = createContext<BlockMenuPage | null>(null);

/** The page the block menu works for, or null where editors have no block handles. */
export function useBlockMenuPage(): BlockMenuPage | null {
  return useContext(BlockMenuPageContext);
}

/**
 * Block handles and the block menu for the editors inside, for one stored
 * artifact: links go to its page, the footer shows its last save, and
 * Comment opens its comments when `canComment`. Leave `stored` false for a
 * blank page nothing has been saved to yet.
 */
export function BlockMenuFor({ artifact, canComment, stored = true, children }: { artifact: ArtifactDto; canComment: boolean; stored?: boolean; children: ReactNode }) {
  const { publicId, updatedBy, updatedAt, harness } = artifact;
  const value = useMemo<BlockMenuPage>(
    () => ({ publicId: stored ? publicId : null, lastEdited: { editor: updatedBy, at: updatedAt, harness }, canComment }),
    [stored, publicId, updatedBy, updatedAt, harness, canComment],
  );
  return <BlockMenuPageContext value={value}>{children}</BlockMenuPageContext>;
}
