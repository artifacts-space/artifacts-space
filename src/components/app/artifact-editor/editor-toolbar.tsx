"use client";

import { IconDots, IconLoader2, IconLock, IconTrash } from "@tabler/icons-react";

import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { kindColors, kindIcons } from "@/lib/artifact-kinds";
import type { ArtifactKind } from "@/lib/artifact-types";
import { cn } from "@/lib/utils";

import type { PendingAction } from "./use-artifact-actions";

function saveLabel(saving: boolean, dirty: boolean) {
  if (saving) return "Saving…";
  return dirty ? "Save" : "Saved";
}

/** Delete for the author; Withdraw sharing for a team owner or admin editing a teammate's artifact. */
function MoreMenu({ onRequestDelete, onWithdraw }: { onRequestDelete: (() => void) | null; onWithdraw: (() => void) | null }) {
  if (!onRequestDelete && !onWithdraw) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="More actions" />}>
        <IconDots />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {onWithdraw ? (
          <DropdownMenuItem onClick={onWithdraw} className="py-2">
            <IconLock /> Withdraw sharing
          </DropdownMenuItem>
        ) : null}
        {onRequestDelete ? (
          <DropdownMenuItem variant="destructive" onClick={onRequestDelete} className="py-2">
            <IconTrash /> Delete artifact
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SaveButton({ saving, dirty, onSave }: { saving: boolean; dirty: boolean; onSave: () => void }) {
  return (
    <Button onClick={onSave} disabled={!dirty || saving} className="ml-1 px-3">
      {saving ? <IconLoader2 className="animate-spin" /> : null}
      {saveLabel(saving, dirty)}
    </Button>
  );
}

interface EditorToolbarProps {
  id: string;
  kind: ArtifactKind;
  content: string;
  /** The share button and dialog (ShareControl). Null for teammates: only the author (or the person who added the agent that wrote it) shares. */
  shareControl: React.ReactNode;
  /** The History button and dialog (VersionHistory). */
  history: React.ReactNode;
  /** The Comments button and dialog (CommentsDialog), beside History. */
  comments: React.ReactNode;
  /** The Views button and dialog (ViewsDialog). */
  views: React.ReactNode;
  dirty: boolean;
  pending: PendingAction;
  onSave: () => void;
  /** Null for teammates: only the author (or the person who added the agent that wrote it) deletes. */
  onRequestDelete: (() => void) | null;
  /** Set for a team owner or admin editing a teammate's artifact. */
  onWithdraw: (() => void) | null;
}

/**
 * The editor's top bar: format icon, short id, copy, history, views, comments, share, more
 * actions, and save. On phones the page scrolls, so it sticks under the app
 * header (h-14) to keep Save and History in reach; from md up the /app shell
 * keeps it in place.
 */
export function EditorToolbar({ id, kind, content, shareControl, history, comments, views, dirty, pending, onSave, onRequestDelete, onWithdraw }: EditorToolbarProps) {
  const KindIcon = kindIcons[kind];
  return (
    <div className="flex min-h-12 flex-wrap items-center gap-2 border-b px-4 py-2 max-md:sticky max-md:top-14 max-md:z-10 max-md:bg-card sm:px-5">
      <KindIcon className={cn("size-4 shrink-0", kindColors[kind])} />
      <span className="font-mono text-xs text-muted-foreground">{id.slice(0, 8)}</span>
      <div className="ml-auto flex items-center gap-1">
        <CopyButton value={content} variant="ghost" size="icon" />
        {history}
        {views}
        {comments}
        {shareControl}
        <MoreMenu onRequestDelete={onRequestDelete} onWithdraw={onWithdraw} />
        <SaveButton saving={pending === "save"} dirty={dirty} onSave={onSave} />
      </div>
    </div>
  );
}
