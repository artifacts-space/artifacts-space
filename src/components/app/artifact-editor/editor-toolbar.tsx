"use client";

import { IconDots, IconLoader2, IconTrash } from "@tabler/icons-react";

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

function MoreMenu({ onRequestDelete }: { onRequestDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="More actions" />}>
        <IconDots />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem variant="destructive" onClick={onRequestDelete} className="py-2">
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
  /** The share button and dialog (ShareControl). */
  shareControl: React.ReactNode;
  dirty: boolean;
  pending: PendingAction;
  onSave: () => void;
  onRequestDelete: () => void;
}

/** The editor's top bar: format icon, short id, copy, share, more actions, and save. */
export function EditorToolbar({ id, kind, content, shareControl, dirty, pending, onSave, onRequestDelete }: EditorToolbarProps) {
  const KindIcon = kindIcons[kind];
  return (
    <div className="flex min-h-12 flex-wrap items-center gap-2 border-b px-4 py-2 sm:px-5">
      <KindIcon className={cn("size-4 shrink-0", kindColors[kind])} />
      <span className="font-mono text-xs text-muted-foreground">{id.slice(0, 8)}</span>
      <div className="ml-auto flex items-center gap-1">
        <CopyButton value={content} variant="ghost" size="icon" />
        {shareControl}
        <MoreMenu onRequestDelete={onRequestDelete} />
        <SaveButton saving={pending === "save"} dirty={dirty} onSave={onSave} />
      </div>
    </div>
  );
}
