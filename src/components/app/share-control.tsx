"use client";

import { IconClock, IconLink, IconLoader2, IconLock, IconUsersGroup, IconWorld } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

import { shareArtifactAction } from "@/app/(workspace)/app/sharing-actions";
import { CopyButton } from "@/components/copy-button";
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
import type { ArtifactDto, ArtifactVisibility } from "@/lib/artifact-types";
import { cn } from "@/lib/utils";

import { defaultTeamId, outcomeText, teamsFor, visibilityLabel, visibilityOptions } from "./share-options";
import { useShareTeams, type ShareTeam } from "./share-teams-context";

const icons: Record<ArtifactVisibility, typeof IconLock> = { private: IconLock, team: IconUsersGroup, link: IconLink, public: IconWorld };

function teamLabel(team: ShareTeam) {
  return team.personal ? `${team.name} (personal)` : team.name;
}

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
              <span className="block text-[13px] font-medium">{option.title}</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{option.detail}</span>
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
    <label className="flex flex-col gap-2 text-xs text-muted-foreground">
      {visibility === "team" ? "Share with" : "Approved by"}
      <Select value={value ?? ""} onValueChange={(id) => { if (id) onChange(id); }}>
        <SelectTrigger className="h-9 w-full text-[13px] text-foreground"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((team) => <SelectItem key={team.id} value={team.id} className="text-xs">{teamLabel(team)}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
  );
}

/** Readers outside the team keep the approved version while an edit waits. */
function PendingEditNotice({ artifact }: { artifact: ArtifactDto }) {
  if (!artifact.pendingEdit) return null;
  return (
    <p className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
      <IconClock className="size-3.5 shrink-0" />
      Changes waiting for approval. Readers outside the team see the last approved version.
    </p>
  );
}

function PendingNotice({ artifact, teams }: { artifact: ArtifactDto; teams: readonly ShareTeam[] }) {
  const pending = artifact.pendingSharing;
  if (!pending) return null;
  const team = teams.find((item) => item.id === pending.teamId);
  return (
    <p className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
      <IconClock className="size-3.5 shrink-0" />
      Waiting for approval: {visibilityLabel(pending.level).toLowerCase()}{team ? ` in ${team.name}` : ""}.
    </p>
  );
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
  const [visibility, setVisibility] = useState<ArtifactVisibility>(artifact.visibility);
  const [teamId, setTeamId] = useState(() => defaultTeamId(artifact.visibility, teams, artifact.teamId));
  const [saving, setSaving] = useState(false);
  const waiting = artifact.pendingSharing !== null || artifact.pendingEdit !== null;
  const Icon = waiting ? IconClock : icons[artifact.visibility];
  const live = artifact.visibility === "link" || artifact.visibility === "public";

  function changeLevel(next: ArtifactVisibility) {
    setVisibility(next);
    setTeamId(defaultTeamId(next, teams, teamId ?? artifact.teamId));
  }

  async function save() {
    setSaving(true);
    try {
      const result = await shareArtifactAction(artifact.id, { visibility, teamId: visibility === "private" ? null : teamId });
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
      <Button variant="ghost" size="sm" onClick={() => { setOpen(true); }} className="gap-1.5 text-xs" aria-label="Share settings">
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
            <LevelPicker value={visibility} onChange={changeLevel} />
            <TeamPicker visibility={visibility} teams={teams} value={teamId} onChange={setTeamId} />
            <p className="text-xs leading-5 text-muted-foreground">{outcomeText(visibility, teams.find((team) => team.id === teamId))}</p>
            {live ? (
              <div className="flex items-center gap-2 rounded-md border bg-background/60 p-1.5 pl-3">
                <code className="min-w-0 flex-1 truncate font-mono text-xs">{shareUrl}</code>
                <CopyButton value={shareUrl} label="Copy link" variant="secondary" size="sm" />
              </div>
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
