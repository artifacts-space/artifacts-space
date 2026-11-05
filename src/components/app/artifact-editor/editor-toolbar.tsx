"use client";

import {
  IconCheck,
  IconDots,
  IconLink,
  IconLoader2,
  IconLock,
  IconTrash,
} from "@tabler/icons-react";

import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { kindColors, kindIcons } from "@/lib/artifact-kinds";
import type { ArtifactKind } from "@/lib/artifact-types";
import { cn } from "@/lib/utils";

import type { PendingAction } from "./use-artifact-actions";

function shareLabel(shared: boolean) {
  return shared ? "Disable share link" : "Enable share link";
}

function saveLabel(saving: boolean, dirty: boolean) {
  if (saving) return "Saving…";
  return dirty ? "Save" : "Saved";
}

function ShareButton({ shared, sharing, onToggle }: { shared: boolean; sharing: boolean; onToggle: () => void }) {
  const Icon = shared ? IconLink : IconLock;
  return (
    <Button variant="ghost" size="icon" onClick={onToggle} disabled={sharing} aria-label={shareLabel(shared)}>
      {sharing ? <IconLoader2 className="animate-spin" /> : <Icon />}
    </Button>
  );
}

function MoreMenu({
  shared,
  shareUrl,
  onToggleShare,
  onRequestDelete,
}: {
  shared: boolean;
  shareUrl: string;
  onToggleShare: () => void;
  onRequestDelete: () => void;
}) {
  const ShareIcon = shared ? IconLock : IconLink;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="More actions" />}>
        <IconDots />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={onToggleShare} className="py-2 text-xs">
          <ShareIcon /> {shareLabel(shared)}
        </DropdownMenuItem>
        {shared ? (
          <DropdownMenuItem onClick={() => void navigator.clipboard.writeText(shareUrl)} className="py-2 text-xs">
            <IconCheck /> Copy share link
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onRequestDelete} className="py-2 text-xs">
          <IconTrash /> Delete artifact
        </DropdownMenuItem>
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
  shared: boolean;
  shareUrl: string;
  dirty: boolean;
  pending: PendingAction;
  onSave: () => void;
  onToggleShare: () => void;
  onRequestDelete: () => void;
}

/** The editor's top bar: format icon, short id, copy, share, more actions, and save. */
export function EditorToolbar({ id, kind, content, shared, shareUrl, dirty, pending, onSave, onToggleShare, onRequestDelete }: EditorToolbarProps) {
  const KindIcon = kindIcons[kind];
  return (
    <div className="flex min-h-12 flex-wrap items-center gap-2 border-b px-4 py-2 sm:px-5">
      <KindIcon className={cn("size-4 shrink-0", kindColors[kind])} />
      <span className="font-mono text-xs text-muted-foreground">{id.slice(0, 8)}</span>
      <div className="ml-auto flex items-center gap-1">
        <CopyButton value={content} variant="ghost" size="icon" />
        <ShareButton shared={shared} sharing={pending === "share"} onToggle={onToggleShare} />
        <MoreMenu shared={shared} shareUrl={shareUrl} onToggleShare={onToggleShare} onRequestDelete={onRequestDelete} />
        <SaveButton saving={pending === "save"} dirty={dirty} onSave={onSave} />
      </div>
    </div>
  );
}
