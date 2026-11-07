"use client";

import { IconLoader2, IconMessage } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

import { setCommentsAction } from "@/app/(workspace)/app/sharing-actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { commentSettings, type ArtifactDto, type ArtifactVisibility, type CommentSetting } from "@/lib/artifact-types";

import { commentDetail, commentLabel, commentOptions } from "./comment-options";
import type { ShareTeam } from "./share-teams-context";

function isCommentSetting(value: string): value is CommentSetting {
  return (commentSettings as readonly string[]).includes(value);
}

interface CommentsPickerProps {
  visibility: ArtifactVisibility;
  team: ShareTeam | undefined;
  value: CommentSetting;
  onChange: (value: CommentSetting) => void;
  disabled?: boolean;
}

/** "Who can comment": a select next to who can read it, with one line on what the choice does. */
export function CommentsPicker({ visibility, team, value, onChange, disabled = false }: CommentsPickerProps) {
  const options = commentOptions(visibility, team);
  return (
    <label className="flex flex-col gap-2 text-sm text-muted-foreground">
      Who can comment
      <Select value={value} disabled={disabled} onValueChange={(next) => { if (next && isCommentSetting(next)) onChange(next); }}>
        <SelectTrigger className="h-9 w-full text-sm text-foreground" aria-label="Who can comment">
          <SelectValue>{(id: string) => options.find((option) => option.value === id)?.title ?? id}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.title}</SelectItem>)}
        </SelectContent>
      </Select>
      <span className="leading-5">{commentDetail(value)}</span>
    </label>
  );
}

/**
 * The comments setting for a team owner or admin looking at a teammate's
 * artifact: a compact select that applies at once. Owners and admins never
 * wait for approval.
 */
export function CommentsControl({ artifact, team, onUpdated }: { artifact: ArtifactDto; team: ShareTeam | undefined; onUpdated: (artifact: ArtifactDto) => void }) {
  const [saving, setSaving] = useState(false);
  const options = commentOptions(artifact.visibility, team);

  async function change(next: string | null) {
    if (!next || !isCommentSetting(next) || next === artifact.comments) return;
    setSaving(true);
    try {
      const result = await setCommentsAction(artifact.id, next);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onUpdated(result.data.artifact);
      toast.success(result.data.status === "pending" ? "Request sent. An owner or admin will review it." : `Comments: ${commentLabel(next, team?.personal).toLowerCase()}.`);
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Select value={artifact.comments} disabled={saving} onValueChange={(next) => void change(next)}>
      <SelectTrigger size="sm" className="h-8 gap-1.5 text-sm" aria-label="Who can comment">
        {saving ? <IconLoader2 className="size-3.5 animate-spin" /> : <IconMessage className="size-3.5 text-muted-foreground" />}
        <SelectValue>{(id: string) => options.find((option) => option.value === id)?.title ?? id}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.title}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
