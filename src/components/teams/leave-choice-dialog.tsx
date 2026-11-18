"use client";

import { IconLoader2 } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

import { ScrollFrame } from "@/components/code/scroll-frame";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/artifact-types";
import { leaveSummary, moveAllLabel, movedMessage, moveProblems, shownArtifacts, type LeavePreview, type MoveNote, type MoveResult } from "@/lib/teams/departure-rules";

const offline = "Something went wrong. Check your connection and try again.";

/** Each title with a checkbox; the first few, or all of them once asked. */
function ArtifactChecklist({ preview, selected, onToggle, disabled }: { preview: LeavePreview; selected: ReadonlySet<string>; onToggle: (id: string, on: boolean) => void; disabled: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const { shown, more } = shownArtifacts(preview, showAll);
  const list = (
    <ul className="space-y-1" aria-label="Your artifacts in this team">
      {shown.map((item) => (
        <li key={item.id}>
          <label className="flex min-w-0 items-center gap-2 rounded-lg px-1 py-1 text-md">
            <Checkbox checked={selected.has(item.id)} disabled={disabled} onCheckedChange={(checked) => { onToggle(item.id, checked); }} />
            <span className="min-w-0 truncate">{item.title || "Untitled"}</span>
          </label>
        </li>
      ))}
    </ul>
  );
  const canShowAll = !showAll && preview.artifacts.length > shown.length;
  return (
    <div className="space-y-1" data-leave-list="">
      {showAll ? <ScrollFrame label="Your artifacts in this team" className="max-h-64 overflow-y-auto">{list}</ScrollFrame> : list}
      {more > 0 ? (
        <p className="flex flex-wrap items-center gap-x-2 px-1 text-sm text-muted-foreground">
          <span>and {more} more</span>
          {canShowAll ? <Button variant="link" size="sm" className="h-auto p-0 text-sm" onClick={() => { setShowAll(true); }}>Show all {preview.total}</Button> : null}
        </p>
      ) : null}
      {showAll && preview.total > preview.artifacts.length ? (
        <p className="px-1 text-sm text-muted-foreground">These are the newest {preview.artifacts.length}. Move them to see the rest.</p>
      ) : null}
    </div>
  );
}

/** Moves the chosen artifacts (or all listed) to Personal, and keeps what did not move on screen. */
function useMoves(move: (ids: string[]) => Promise<ActionResult<MoveResult>>, onPreview: (preview: LeavePreview) => void) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [notes, setNotes] = useState<MoveNote[]>([]);
  const [moving, setMoving] = useState(false);

  function toggle(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function run(ids: string[]) {
    if (ids.length === 0) return;
    setMoving(true);
    setNotes([]);
    try {
      const result = await move(ids);
      if (!result.success) {
        setNotes([{ key: "error", text: result.error }]);
        return;
      }
      onPreview(result.data.preview);
      setSelected(new Set());
      const moved = movedMessage(result.data.outcome);
      if (moved) toast.success(moved);
      setNotes(moveProblems(result.data.outcome));
    } catch {
      setNotes([{ key: "error", text: offline }]);
    } finally {
      setMoving(false);
    }
  }

  return { selected, toggle, notes, moving, run };
}

interface LeaveChoiceDialogProps {
  open: boolean;
  teamName: string;
  preview: LeavePreview;
  onPreview: (preview: LeavePreview) => void;
  move: (ids: string[]) => Promise<ActionResult<MoveResult>>;
  onCancel: () => void;
  onLeave: () => void;
  leaving: boolean;
}

/**
 * Leave team when some of the person's artifacts have the team as their
 * home: which ones, that they stay with the team, who becomes their owner,
 * and "Move to Personal" for some or all of them first. It carries that
 * choice, so it has no "Don't ask again" and always shows
 * (leaveConfirmKind). A move goes through the sharing service; what waits
 * or is refused stays named here, and the list is read again after each.
 */
export function LeaveChoiceDialog({ open, teamName, preview, onPreview, move, onCancel, onLeave, leaving }: LeaveChoiceDialogProps) {
  const moves = useMoves(move, onPreview);
  const chosen = preview.artifacts.filter((item) => moves.selected.has(item.id)).map((item) => item.id);
  const busy = moves.moving || leaving;
  const summary = leaveSummary(preview);
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onCancel(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Leave {teamName}?</DialogTitle>
          <DialogDescription className="leading-6">{summary ?? "None of your artifacts live in this team now, so nothing of yours stays behind."}</DialogDescription>
        </DialogHeader>
        {summary ? (
          <div className="space-y-3">
            <ArtifactChecklist preview={preview} selected={moves.selected} onToggle={moves.toggle} disabled={busy} />
            <p className="text-md leading-6 text-muted-foreground">To keep one as yours, move it to Personal first. It becomes private: only you can open it, and teammates can no longer read it or its comments.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={busy || chosen.length === 0} onClick={() => void moves.run(chosen)}>
                {moves.moving ? <IconLoader2 className="animate-spin" /> : null} Move selected to Personal
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void moves.run(preview.artifacts.map((item) => item.id))}>
                {moveAllLabel(preview)}
              </Button>
            </div>
          </div>
        ) : null}
        {moves.notes.length > 0 ? (
          <ul className="space-y-1 text-md leading-6 text-tone-warning" data-leave-notes="">
            {moves.notes.map((note) => <li key={note.key}>{note.text}</li>)}
          </ul>
        ) : null}
        <p className="text-sm leading-5 text-muted-foreground">Agents you added go to the team&apos;s owner, and their tokens stop working at once. Your private artifacts stay yours.</p>
        <DialogFooter className="sm:items-center">
          <Button variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" disabled={busy} onClick={onLeave}>
            {leaving ? <IconLoader2 className="animate-spin" /> : null} Leave team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
