"use client";

import { IconLoader2, IconPhoto, IconPhotoUp, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { removeTeamIconAction, uploadTeamIconAction } from "@/app/(workspace)/teams/icon-actions";
import { ConfirmDialog, useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TEAM_ICON_ACCEPT, TEAM_ICON_SOURCE_LIMIT_LABEL } from "@/lib/teams/team-icon-rules";

import { FormError } from "./form-error";
import { prepareTeamIcon } from "./prepare-team-icon";
import { TeamIcon } from "./team-icon";

const failed = "Something went wrong. Check your connection and try again.";

interface TeamIconControlProps {
  teamId: string;
  teamName: string;
  iconUrl: string | null;
  /** The signed-in viewer, for the preview's avatar. */
  viewerId: string;
}

/** Prepares and uploads one picked image. Resolves to an error message for people, or null when it saved. */
async function uploadPicked(teamId: string, file: File): Promise<string | null> {
  try {
    const prepared = await prepareTeamIcon(file);
    const form = new FormData();
    form.set("icon", prepared);
    const result = await uploadTeamIconAction(teamId, form);
    return result.success ? null : result.error;
  } catch (error) {
    return error instanceof Error && error.message ? error.message : failed;
  }
}

/**
 * "Team icon": upload, replace, or remove the picture that marks the team
 * in the Teams menu, the team list, and this page. Shown only to people who
 * can change team settings; the server checks the same rule on every call.
 * Removing asks first, with "Don't ask again".
 */
export function TeamIconControl({ teamId, teamName, iconUrl, viewerId }: TeamIconControlProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState("");
  const confirmRemove = useConfirm("removeTeamIcon");

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy("upload");
    setError("");
    const problem = await uploadPicked(teamId, file);
    setBusy(null);
    if (problem) {
      setError(problem);
      return;
    }
    setOpen(false);
    toast.success(iconUrl ? "Team icon replaced." : "Team icon added.");
    router.refresh();
  }

  async function remove(): Promise<boolean> {
    setBusy("remove");
    try {
      const result = await removeTeamIconAction(teamId);
      if (!result.success) {
        toast.error(result.error);
        return false;
      }
      toast.success("Team icon removed.");
      router.refresh();
      return true;
    } catch {
      toast.error(failed);
      return false;
    } finally {
      setBusy(null);
    }
  }

  function requestRemove() {
    setOpen(false);
    confirmRemove.request(remove);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { setOpen(next); setError(""); }}>
        <DialogTrigger render={<Button variant="outline" size="sm" className="text-xs" />}><IconPhoto /> Team icon</DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Team icon</DialogTitle>
            <DialogDescription className="leading-6">Help your team spot {teamName} at a glance. Only people in the team see it.</DialogDescription>
          </DialogHeader>
          <form noValidate onSubmit={(event) => { event.preventDefault(); }} className="grid gap-4">
            <div className="flex items-center gap-4">
              <TeamIcon team={{ id: teamId, personal: false, iconUrl }} viewerId={viewerId} size={64} />
              <p id={hintId} className="text-sm leading-5 text-muted-foreground">PNG, JPEG, or WebP, up to {TEAM_ICON_SOURCE_LIMIT_LABEL}. We cut it to a square.</p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={TEAM_ICON_ACCEPT}
              aria-label="Team icon image"
              aria-describedby={hintId}
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => { void pick(event.target.files?.[0]); event.target.value = ""; }}
            />
            <FormError message={error} />
            <div className="flex flex-wrap justify-end gap-2">
              {iconUrl ? (
                <Button type="button" variant="ghost" disabled={busy !== null} onClick={requestRemove}>
                  <IconTrash /> Remove
                </Button>
              ) : null}
              <Button type="button" disabled={busy !== null} aria-describedby={hintId} onClick={() => { inputRef.current?.click(); }}>
                {busy === "upload" ? <IconLoader2 className="animate-spin" /> : <IconPhotoUp />} {iconUrl ? "Replace image" : "Upload an image"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        state={confirmRemove.dialog}
        title="Remove the team icon?"
        description={`${teamName} shows its pixel avatar again, and the image is deleted. You can upload a new one at any time.`}
        confirmLabel="Remove icon"
        pending={busy === "remove"}
      />
    </>
  );
}
