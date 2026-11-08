"use client";

import { IconArrowsHorizontal, IconCode, IconDots, IconLock, IconTrash } from "@tabler/icons-react";

import { CopyButton } from "@/components/copy-button";
import { OpenPageButton } from "@/components/page-width/open-page-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { kindColors, kindIcons } from "@/lib/artifact-kinds";
import type { ArtifactKind } from "@/lib/artifact-types";
import { FULL_WIDTH_LABEL } from "@/lib/page-width/rules";
import { cn } from "@/lib/utils";

import type { FullWidthControl } from "./use-full-width";

/** The raw content behind the page, for advanced edits: shown in place of the page while open. */
export interface SourceToggle {
  open: boolean;
  onToggle: () => void;
}

interface MoreMenuProps {
  source: SourceToggle;
  fullWidth: FullWidthControl;
  onRequestDelete: (() => void) | null;
  onWithdraw: (() => void) | null;
}

/** View source and Full width for every editor; Delete for the author; Withdraw sharing for a team owner or admin editing a teammate's artifact. */
function MoreMenu({ source, fullWidth, onRequestDelete, onWithdraw }: MoreMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="More actions" />}>
        <IconDots />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={source.onToggle} className="py-2">
          <IconCode /> {source.open ? "Hide source" : "View source"}
        </DropdownMenuItem>
        <DropdownMenuCheckboxItem checked={fullWidth.checked} disabled={fullWidth.pending} onCheckedChange={fullWidth.onChange} className="py-2">
          <IconArrowsHorizontal /> {FULL_WIDTH_LABEL}
        </DropdownMenuCheckboxItem>
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

interface EditorToolbarProps {
  id: string;
  /** For Open, beside copy: the artifact's own page in a new tab. */
  publicId: string;
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
  /** View source in the More menu. */
  source: SourceToggle;
  /** Null for teammates: only the author (or the person who added the agent that wrote it) deletes. */
  onRequestDelete: (() => void) | null;
  /** Set for a team owner or admin editing a teammate's artifact. */
  onWithdraw: (() => void) | null;
  /** The "Full width" setting, in the More menu. */
  fullWidth: FullWidthControl;
}

/**
 * The editor's top bar: format icon, short id, copy, history, views, comments,
 * share, and more actions (View source, delete). Changes save on their own,
 * so there is no Save button. On phones the page scrolls, so it sticks under
 * the app header (h-14) to keep History in reach; from md up the /app shell
 * keeps it in place.
 */
export function EditorToolbar({ id, publicId, kind, content, shareControl, history, comments, views, source, onRequestDelete, onWithdraw, fullWidth }: EditorToolbarProps) {
  const KindIcon = kindIcons[kind];
  return (
    <div className="flex min-h-12 flex-wrap items-center gap-2 border-b px-4 py-2 max-md:sticky max-md:top-14 max-md:z-10 max-md:bg-card sm:px-5">
      <KindIcon className={cn("size-4 shrink-0", kindColors[kind])} />
      <span className="font-mono text-xs text-muted-foreground">{id.slice(0, 8)}</span>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
        <CopyButton value={content} variant="ghost" size="icon" />
        <OpenPageButton publicId={publicId} />
        {history}
        {views}
        {comments}
        {shareControl}
        <MoreMenu source={source} fullWidth={fullWidth} onRequestDelete={onRequestDelete} onWithdraw={onWithdraw} />
      </div>
    </div>
  );
}
