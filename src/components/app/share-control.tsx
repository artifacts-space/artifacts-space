"use client";

import { IconClock, IconLink, IconLoader2, IconLock, IconUsersGroup, IconWorld } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

import { setCommentsAction, shareArtifactAction } from "@/app/(workspace)/app/sharing-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ValueField } from "@/components/value-field";
import type { ActionResult, ArtifactDto, ArtifactVisibility, CommentSetting } from "@/lib/artifact-types";
import { cn } from "@/lib/utils";

import { commentLabel, commentsWaitForApproval } from "./comment-options";
import { CommentsPicker } from "./comments-picker";
import { outcomeText, selectedTeamLabel, teamLabel, teamsFor, visibilityLabel, visibilityOptions } from "./share-options";
import { useShareTeams, type ShareTeam } from "./share-teams-context";
import { useShareChoice } from "./use-share-choice";

const icons: Record<ArtifactVisibility, typeof IconLock> = { private: IconLock, team: IconUsersGroup, link: IconLink, public: IconWorld };

function LevelPicker({ value, onChange }: { value: ArtifactVisibility; onChange: (value: ArtifactVisibility) => void }) {
  return (
    <div role="radiogroup" aria-label="Who can read it" className="grid gap-2 sm:grid-cols-2">
      {visibilityOptions.map((option) => {
        const Icon = icons[option.value];
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => { onChange(option.value); }}
            className={cn("flex gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors", selected ? "border-foreground bg-muted" : "hover:bg-muted/60")}
          >
            <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span>
              <span className="block text-md font-medium">{option.title}</span>
              <span className="mt-0.5 block text-sm leading-5 text-muted-foreground">{option.detail}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TeamPicker({ visibility, teams, value, onChange }: { visibility: ArtifactVisibility; teams: readonly ShareTeam[]; value: string | null; onChange: (id: string) => void }) {
  const options = teamsFor(visibility, teams);
  if (visibility === "private" || options.length === 0) return null;
  return (
    <label className="flex flex-col gap-2 text-sm text-muted-foreground">
      {visibility === "team" ? "Share with" : "Approved by"}
      <Select value={value ?? ""} onValueChange={(id) => { if (id) onChange(id); }}>
        <SelectTrigger className="h-9 w-full text-sm text-foreground">
          <SelectValue>{(id: string) => selectedTeamLabel(id, options)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((team) => <SelectItem key={team.id} value={team.id}>{teamLabel(team)}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
  );
}

/** Readers outside the team keep the approved version while an edit waits. */
function PendingEditNotice({ artifact }: { artifact: ArtifactDto }) {
  if (!artifact.pendingEdit) return null;
  return (
    <p className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm leading-5 text-muted-foreground">
      <IconClock className="size-3.5 shrink-0" />
      Changes waiting for approval. Readers outside the team see the last approved version.
    </p>
  );
}

function PendingNotice({ artifact, teams }: { artifact: ArtifactDto; teams: readonly ShareTeam[] }) {
  const pending = artifact.pendingSharing;
  const comments = artifact.pendingComments;
  if (!pending && !comments) return null;
  const team = teams.find((item) => item.id === pending?.teamId);
  return (
    <p className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm leading-5 text-muted-foreground">
      <IconClock className="size-3.5 shrink-0" />
      <span>
        Waiting for approval:{" "}
        {pending ? `${visibilityLabel(pending.level).toLowerCase()}${team ? ` in ${team.name}` : ""}` : null}
        {pending && comments ? "; " : null}
        {comments ? `comments from ${commentLabel(comments.comments).toLowerCase()}` : null}.
      </span>
    </p>
  );
}

/** The sentence about comments approval, or null when the chosen setting applies at once. */
function commentsApprovalNote(input: { artifact: ArtifactDto; visibility: ArtifactVisibility; team: ShareTeam | undefined; comments: CommentSetting }) {
  const wait = commentsWaitForApproval({ current: input.artifact.comments, next: input.comments, currentTeamId: input.artifact.teamId, visibility: input.visibility, team: input.team });
  return wait ? `Comments from anyone signed in need an owner's or admin's approval in ${input.team?.name ?? "the team"}.` : null;
}

/** What saving will do: now or after approval, for the level and for comments. */
function ShareOutcome(props: { artifact: ArtifactDto; visibility: ArtifactVisibility; team: ShareTeam | undefined; comments: CommentSetting }) {
  const { artifact, visibility, team, comments } = props;
  const note = commentsApprovalNote(props);
  const onlyComments = visibility === artifact.visibility && (visibility === "private" || team?.id === artifact.teamId) && comments !== artifact.comments;
  // Only the comments change: sharing stays as it is, so only the comments rule applies.
  const commentsText = note ? `${note} Until then, comments stay as they are.` : "It applies as soon as you save.";
  const text = onlyComments ? commentsText : [outcomeText(visibility, team), note].filter(Boolean).join(" ");
  return <p className="text-sm leading-5 text-muted-foreground">{text}</p>;
}

/** Saves the dialog: only the comments setting when the level and team stay, else a sharing change that carries it. */
function saveChoice(artifact: ArtifactDto, choice: { visibility: ArtifactVisibility; teamId: string | null; comments: CommentSetting }): Promise<ActionResult<{ status: "applied" | "pending"; artifact: ArtifactDto }>> {
  const teamId = choice.visibility === "private" ? null : choice.teamId;
  const sameSharing = choice.visibility === artifact.visibility && (choice.visibility === "private" || teamId === artifact.teamId);
  if (sameSharing && choice.comments !== artifact.comments) return setCommentsAction(artifact.id, choice.comments);
  return shareArtifactAction(artifact.id, { visibility: choice.visibility, teamId, comments: choice.comments });
}

interface ShareControlProps {
  artifact: ArtifactDto;
  shareUrl: string;
  onUpdated: (artifact: ArtifactDto) => void;
}

/**
 * The editor's share button and dialog. Every change goes through the
 * server's sharing rule, which applies it now or files it for approval.
 */
export function ShareControl({ artifact, shareUrl, onUpdated }: ShareControlProps) {
  const teams = useShareTeams();
  const [open, setOpen] = useState(false);
  const choice = useShareChoice(artifact, teams);
  const { visibility, teamId, team, comments } = choice;
  const [saving, setSaving] = useState(false);
  const waiting = artifact.pendingSharing !== null || artifact.pendingEdit !== null || artifact.pendingComments !== null;
  const Icon = waiting ? IconClock : icons[artifact.visibility];
  const live = artifact.visibility === "link" || artifact.visibility === "public";

  async function save() {
    setSaving(true);
    try {
      const result = await saveChoice(artifact, { visibility, teamId, comments });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onUpdated(result.data.artifact);
      toast.success(result.data.status === "pending" ? "Request sent. An owner or admin will review it." : "Sharing saved.");
      setOpen(false);
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => { setOpen(true); }} className="gap-1.5" aria-label="Share settings">
        <Icon /> {waiting ? "Pending" : visibilityLabel(artifact.visibility)}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Share “{artifact.title}”</DialogTitle>
            <DialogDescription className="leading-6">Artifacts are private until you share them. Teams decide whether sharing needs approval.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <PendingNotice artifact={artifact} teams={teams} />
            <PendingEditNotice artifact={artifact} />
            <LevelPicker value={visibility} onChange={choice.changeLevel} />
            <TeamPicker visibility={visibility} teams={teams} value={teamId} onChange={choice.changeTeam} />
            <CommentsPicker visibility={visibility} team={team} value={comments} onChange={choice.chooseComments} />
            <ShareOutcome artifact={artifact} visibility={visibility} team={team} comments={comments} />
            {live ? (
              <ValueField value={shareUrl} copyLabel="Copy link" />
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setOpen(false); }}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving || (visibility !== "private" && !teamId)}>
              {saving ? <IconLoader2 className="animate-spin" /> : null} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
