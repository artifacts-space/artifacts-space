"use client";

import { IconClock, IconLink, IconLoader2, IconLock, IconUsersGroup, IconWorld } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

import { setCommentsAction, setShowInSearchAction, shareArtifactAction } from "@/app/(workspace)/app/sharing-actions";
import { ArtifactIcon } from "@/components/artifact-icon/artifact-icon";
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
import { shareRuleLine } from "@/lib/teams/team-rule-copy";
import { cn } from "@/lib/utils";

import { commentLabel, commentsWaitForApproval } from "./comment-options";
import { CommentsPicker } from "./comments-picker";
import { SearchEnginesPicker } from "./search-engines-picker";
import { searchChangeAfterSave, searchSwitchState, type SearchSwitchState } from "./search-options";
import { outcomeText, ruleTeamFor, selectedTeamLabel, teamLabel, teamsFor, visibilityLabel, visibilityOptions } from "./share-options";
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

/** The team's editing and sharing rule, for a team artifact that stays in a shared team (team-rule-copy.ts); null otherwise. */
function teamRuleText(props: { artifact: ArtifactDto; visibility: ArtifactVisibility; team: ShareTeam | undefined; teams: readonly ShareTeam[] }) {
  const ruleTeam = ruleTeamFor(props.artifact.teamId, props.visibility, props.team, props.teams);
  return ruleTeam ? shareRuleLine(ruleTeam.name, ruleTeam) : null;
}

/** What saving will do: now or after approval, for the level and for comments, then the team's rule for a team artifact. */
function ShareOutcome(props: { artifact: ArtifactDto; visibility: ArtifactVisibility; team: ShareTeam | undefined; teams: readonly ShareTeam[]; comments: CommentSetting }) {
  const { artifact, visibility, team, comments } = props;
  const note = commentsApprovalNote(props);
  const onlyComments = visibility === artifact.visibility && (visibility === "private" || team?.id === artifact.teamId) && comments !== artifact.comments;
  // Only the comments change: sharing stays as it is, so only the comments rule applies.
  const commentsText = note ? `${note} Until then, comments stay as they are.` : "It applies as soon as you save.";
  const outcome = onlyComments ? commentsText : [outcomeText(visibility, team), note].filter(Boolean).join(" ");
  const text = [outcome, teamRuleText(props)].filter(Boolean).join(" ");
  return <p data-slot="share-outcome" className="text-sm leading-5 text-muted-foreground">{text}</p>;
}

/** The Share button's name and tooltip: it says "Pending" while a change waits for approval, so its name does too. */
function shareTriggerText(waiting: boolean, visibility: ArtifactDto["visibility"]) {
  const now = visibilityLabel(visibility);
  if (waiting) return { "aria-label": "Pending. Share settings", title: `Waiting for approval. Until then: ${now}` };
  return { "aria-label": "Share settings", title: `Who can read it: ${now}` };
}

type SaveResult = ActionResult<{ status: "applied" | "pending"; artifact: ArtifactDto }>;

interface SaveChoice {
  visibility: ArtifactVisibility;
  teamId: string | null;
  comments: CommentSetting;
  showInSearch: boolean;
  searchState: SearchSwitchState;
}

/** Whether only "Show in search engines" changed, so sharing and comments need no call. */
function onlySearchChanged(artifact: ArtifactDto, choice: SaveChoice, teamId: string | null): boolean {
  const sameSharing = choice.visibility === artifact.visibility && (choice.visibility === "private" || teamId === artifact.teamId);
  return sameSharing && choice.comments === artifact.comments && choice.showInSearch !== artifact.showInSearch;
}

/** Saves who can read it and who can comment: only the comments setting when the level and team stay, else a sharing change that carries it. */
function saveSharing(artifact: ArtifactDto, choice: SaveChoice): Promise<SaveResult> {
  const teamId = choice.visibility === "private" ? null : choice.teamId;
  if (onlySearchChanged(artifact, choice, teamId)) return Promise.resolve({ success: true, data: { status: "applied", artifact } });
  const sameSharing = choice.visibility === artifact.visibility && (choice.visibility === "private" || teamId === artifact.teamId);
  if (sameSharing && choice.comments !== artifact.comments) return setCommentsAction(artifact.id, choice.comments);
  return shareArtifactAction(artifact.id, { visibility: choice.visibility, teamId, comments: choice.comments });
}

/**
 * Saves the dialog: sharing and comments first, then "Show in search engines"
 * once the artifact is public. When only the second step fails, `onShared`
 * still gets the saved sharing so the dialog shows what applied.
 */
async function saveChoice(artifact: ArtifactDto, choice: SaveChoice, onShared: (artifact: ArtifactDto) => void): Promise<SaveResult> {
  const shared = await saveSharing(artifact, choice);
  if (!shared.success) return shared;
  const saved = shared.data.artifact;
  if (!searchChangeAfterSave({ state: choice.searchState, savedVisibility: saved.visibility, saved: saved.showInSearch, chosen: choice.showInSearch })) return shared;
  const search = await setShowInSearchAction(artifact.id, choice.showInSearch);
  if (search.success) return { success: true, data: { status: shared.data.status, artifact: search.data } };
  onShared(saved);
  return search;
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
  const { visibility, teamId, team, comments, showInSearch } = choice;
  const searchState = searchSwitchState({ current: artifact.visibility, visibility, team });
  const [saving, setSaving] = useState(false);
  const waiting = artifact.pendingSharing !== null || artifact.pendingEdit !== null || artifact.pendingComments !== null;
  const Icon = waiting ? IconClock : icons[artifact.visibility];
  const live = artifact.visibility === "link" || artifact.visibility === "public";

  async function save() {
    setSaving(true);
    try {
      const result = await saveChoice(artifact, { visibility, teamId, comments, showInSearch, searchState }, onUpdated);
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
      {/* The icon says who can read it now (a lock while private, a clock while a change waits); the title spells it out. */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => { setOpen(true); }}
        className="gap-1.5"
        {...shareTriggerText(waiting, artifact.visibility)}
      >
        <Icon /> {waiting ? "Pending" : "Share"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArtifactIcon icon={artifact.icon} />
              <span className="min-w-0">Share “{artifact.title}”</span>
            </DialogTitle>
            <DialogDescription className="leading-6">Artifacts are private until you share them. Teams decide whether sharing needs approval.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <PendingNotice artifact={artifact} teams={teams} />
            <PendingEditNotice artifact={artifact} />
            <LevelPicker value={visibility} onChange={choice.changeLevel} />
            <TeamPicker visibility={visibility} teams={teams} value={teamId} onChange={choice.changeTeam} />
            <SearchEnginesPicker state={searchState} checked={showInSearch} onChange={choice.chooseShowInSearch} />
            <CommentsPicker visibility={visibility} team={team} value={comments} onChange={choice.chooseComments} />
            <ShareOutcome artifact={artifact} visibility={visibility} team={team} teams={teams} comments={comments} />
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
