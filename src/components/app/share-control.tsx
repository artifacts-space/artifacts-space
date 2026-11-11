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
import type { ActionResult, ArtifactDto, ArtifactVisibility, CommentSetting, ShareableArtifactDto } from "@/lib/artifact-types";
import { cn } from "@/lib/utils";

import { commentLabel, commentsWaitForApproval } from "./comment-options";
import { CommentsPicker } from "./comments-picker";
import { SearchEnginesPicker } from "./search-engines-picker";
import { searchChangeAfterSave, searchSwitchState, type SearchSwitchState } from "./search-options";
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
function PendingEditNotice({ artifact }: { artifact: ShareableArtifactDto }) {
  if (!artifact.pendingEdit) return null;
  return (
    <p className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm leading-5 text-muted-foreground">
      <IconClock className="size-3.5 shrink-0" />
      Changes waiting for approval. Readers outside the team see the last approved version.
    </p>
  );
}

function PendingNotice({ artifact, teams }: { artifact: ShareableArtifactDto; teams: readonly ShareTeam[] }) {
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
function commentsApprovalNote(input: { artifact: ShareableArtifactDto; visibility: ArtifactVisibility; team: ShareTeam | undefined; comments: CommentSetting }) {
  const wait = commentsWaitForApproval({ current: input.artifact.comments, next: input.comments, currentTeamId: input.artifact.teamId, visibility: input.visibility, team: input.team });
  return wait ? `Comments from anyone signed in need an owner's or admin's approval in ${input.team?.name ?? "the team"}.` : null;
}

/** What saving will do: now or after approval, for the level and for comments. */
function ShareOutcome(props: { artifact: ShareableArtifactDto; visibility: ArtifactVisibility; team: ShareTeam | undefined; comments: CommentSetting }) {
  const { artifact, visibility, team, comments } = props;
  const note = commentsApprovalNote(props);
  const onlyComments = visibility === artifact.visibility && (visibility === "private" || team?.id === artifact.teamId) && comments !== artifact.comments;
  // Only the comments change: sharing stays as it is, so only the comments rule applies.
  const commentsText = note ? `${note} Until then, comments stay as they are.` : "It applies as soon as you save.";
  const text = onlyComments ? commentsText : [outcomeText(visibility, team), note].filter(Boolean).join(" ");
  return <p className="text-sm leading-5 text-muted-foreground">{text}</p>;
}

/** The Share button's name and tooltip: it says "Pending" while a change waits for approval, so its name does too. */
function shareTriggerText(waiting: boolean, visibility: ArtifactVisibility) {
  const now = visibilityLabel(visibility);
  if (waiting) return { "aria-label": "Pending. Share settings", title: `Waiting for approval. Until then: ${now}` };
  return { "aria-label": "Share settings", title: `Who can read it: ${now}` };
}

/** The saved artifact, or null when nothing needed saving. */
type SaveResult = ActionResult<{ status: "applied" | "pending"; artifact: ArtifactDto | null }>;

/**
 * The server actions the dialog saves through. Every surface passes the
 * workspace's own (the default), so the auth, approval, and team checks stay
 * in one place; only the /dev fixtures hand in-memory stand-ins.
 */
export interface ShareActions {
  share: typeof shareArtifactAction;
  comments: typeof setCommentsAction;
  search: typeof setShowInSearchAction;
}

const serverShareActions: ShareActions = { share: shareArtifactAction, comments: setCommentsAction, search: setShowInSearchAction };

interface SaveChoice {
  visibility: ArtifactVisibility;
  teamId: string | null;
  comments: CommentSetting;
  showInSearch: boolean;
  searchState: SearchSwitchState;
}

/** Whether only "Show in search engines" changed, so sharing and comments need no call. */
function onlySearchChanged(artifact: ShareableArtifactDto, choice: SaveChoice, teamId: string | null): boolean {
  const sameSharing = choice.visibility === artifact.visibility && (choice.visibility === "private" || teamId === artifact.teamId);
  return sameSharing && choice.comments === artifact.comments && choice.showInSearch !== artifact.showInSearch;
}

/** Saves who can read it and who can comment: only the comments setting when the level and team stay, else a sharing change that carries it. */
function saveSharing(artifact: ShareableArtifactDto, choice: SaveChoice, actions: ShareActions): Promise<SaveResult> {
  const teamId = choice.visibility === "private" ? null : choice.teamId;
  if (onlySearchChanged(artifact, choice, teamId)) return Promise.resolve({ success: true, data: { status: "applied", artifact: null } });
  const sameSharing = choice.visibility === artifact.visibility && (choice.visibility === "private" || teamId === artifact.teamId);
  if (sameSharing && choice.comments !== artifact.comments) return actions.comments(artifact.id, choice.comments);
  return actions.share(artifact.id, { visibility: choice.visibility, teamId, comments: choice.comments });
}

/**
 * Saves the dialog: sharing and comments first, then "Show in search engines"
 * once the artifact is public. When only the second step fails, `onShared`
 * still gets the saved sharing so the dialog shows what applied.
 */
async function saveChoice(artifact: ShareableArtifactDto, choice: SaveChoice, actions: ShareActions, onShared: (artifact: ArtifactDto) => void): Promise<SaveResult> {
  const shared = await saveSharing(artifact, choice, actions);
  if (!shared.success) return shared;
  const saved = shared.data.artifact ?? artifact;
  if (!searchChangeAfterSave({ state: choice.searchState, savedVisibility: saved.visibility, saved: saved.showInSearch, chosen: choice.showInSearch })) return shared;
  const search = await actions.search(artifact.id, choice.showInSearch);
  if (search.success) return { success: true, data: { status: shared.data.status, artifact: search.data } };
  if (shared.data.artifact) onShared(shared.data.artifact);
  return search;
}

/** What a custom Share button needs: the level now, whether a change waits for approval, and how to open the dialog. */
export interface ShareTriggerProps {
  visibility: ArtifactVisibility;
  waiting: boolean;
  onOpen: () => void;
}

interface ShareControlProps {
  artifact: ShareableArtifactDto;
  shareUrl: string;
  onUpdated: (artifact: ArtifactDto) => void;
  /** The button that opens the dialog; the workspace's Share button when left out. The artifact page passes its visibility status. */
  renderTrigger?: (props: ShareTriggerProps) => React.ReactNode;
  /** Where saves go: the workspace's server actions unless a /dev fixture hands its own. */
  actions?: ShareActions;
}

/** The workspace's Share button: the level's icon (a clock while a change waits) and "Share" or "Pending". */
function WorkspaceShareButton({ visibility, waiting, onOpen }: ShareTriggerProps) {
  const Icon = waiting ? IconClock : icons[visibility];
  return (
    // The icon says who can read it now (a lock while private, a clock while a change waits); the title spells it out.
    <Button variant="outline" size="sm" onClick={onOpen} className="gap-1.5" {...shareTriggerText(waiting, visibility)}>
      <Icon /> {waiting ? "Pending" : "Share"}
    </Button>
  );
}

/**
 * The editor's share button and dialog. Every change goes through the
 * server's sharing rule, which applies it now or files it for approval.
 */
export function ShareControl({ artifact, shareUrl, onUpdated, renderTrigger = WorkspaceShareButton, actions = serverShareActions }: ShareControlProps) {
  const teams = useShareTeams();
  const [open, setOpen] = useState(false);
  const choice = useShareChoice(artifact, teams);
  const { visibility, teamId, team, comments, showInSearch } = choice;
  const searchState = searchSwitchState({ current: artifact.visibility, visibility, team });
  const [saving, setSaving] = useState(false);
  const waiting = artifact.pendingSharing !== null || artifact.pendingEdit !== null || artifact.pendingComments !== null;
  const live = artifact.visibility === "link" || artifact.visibility === "public";

  async function save() {
    setSaving(true);
    try {
      const result = await saveChoice(artifact, { visibility, teamId, comments, showInSearch, searchState }, actions, onUpdated);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.data.artifact) onUpdated(result.data.artifact);
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
      {renderTrigger({ visibility: artifact.visibility, waiting, onOpen: () => { setOpen(true); } })}
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
