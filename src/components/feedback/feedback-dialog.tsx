"use client";

import { IconLoader2 } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

import { sendFeedbackAction } from "@/app/(workspace)/feedback-actions";
import { FormError } from "@/components/teams/form-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/artifact-types";
import { FEEDBACK_NOTE_MAX_LENGTH, feedbackMessages, feedbackNoteError, pagePath, teamSlugFromLocation, type FeedbackInput } from "@/lib/feedback/feedback-rules";

/** Sends one report: the server action, or a stand-in on the dev fixture. */
export type FeedbackSend = (input: FeedbackInput) => Promise<ActionResult<null>>;

/** Where the person is, read when they press Send: the page path, the team workspace, and the window size. */
function pageContext(): Omit<FeedbackInput, "note"> {
  const { pathname, search } = window.location;
  return {
    path: pagePath(pathname),
    teamSlug: teamSlugFromLocation(pathname, search),
    viewport: { width: window.innerWidth, height: window.innerHeight },
  };
}

/** The count shows once the note is within this many characters of the limit. */
const COUNT_FROM = FEEDBACK_NOTE_MAX_LENGTH - 200;

/** Shows a count once the note nears the limit, so nobody is surprised by the error. Screen readers hear it politely. */
function LengthHint({ length }: { length: number }) {
  if (length < COUNT_FROM) return null;
  const over = length > FEEDBACK_NOTE_MAX_LENGTH;
  return (
    <p id="feedback-note-count" aria-live="polite" className={over ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
      {length.toLocaleString("en-US")} of {FEEDBACK_NOTE_MAX_LENGTH.toLocaleString("en-US")} characters
    </p>
  );
}

interface FeedbackFormProps {
  note: string;
  onNoteChange: (note: string) => void;
  send: FeedbackSend;
  onSent: () => void;
}

/**
 * The form inside the dialog. The note is owned by the dialog, so it
 * survives a failed send and a close; errors show in the form, never as
 * browser bubbles.
 */
export function FeedbackForm({ note, onNoteChange, send, onSent }: FeedbackFormProps) {
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const length = note.trim().length;
  // The error and the count, whichever show, describe the text box.
  const describedBy = [error ? "feedback-note-error" : null, length >= COUNT_FROM ? "feedback-note-count" : null].filter((id) => id !== null).join(" ");

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = feedbackNoteError(note);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setSending(true);
    try {
      const result = await send({ note, ...pageContext() });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onSent();
    } catch {
      setError(feedbackMessages.retry);
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="feedback-note">What went wrong?</Label>
        <Textarea
          id="feedback-note"
          name="note"
          value={note}
          onChange={(event) => { onNoteChange(event.target.value); setError(""); }}
          placeholder="For example: I press Save and nothing happens."
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className="min-h-28 max-sm:min-h-32"
        />
        <LengthHint length={length} />
      </div>
      <div id="feedback-note-error">
        <FormError message={error} />
      </div>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" className="max-sm:h-11" />}>Cancel</DialogClose>
        <Button type="submit" disabled={sending} className="max-sm:h-11">
          {sending ? <IconLoader2 className="animate-spin" aria-hidden /> : null} {sending ? "Sending…" : "Send"}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Defaults to the server action; the dev fixture passes a stand-in so tests never reach Slack. */
  send?: FeedbackSend;
}

/**
 * "Something's not working": a short note to the team, sent to Slack with
 * the page path, the team workspace, the browser, and the window size. Never
 * artifact content. After a send it thanks the person and closes.
 */
export function FeedbackDialog({ open, onOpenChange, send = sendFeedbackAction }: FeedbackDialogProps) {
  const [note, setNote] = useState("");

  function sent() {
    setNote("");
    onOpenChange(false);
    toast.success(feedbackMessages.sent);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Something&apos;s not working</DialogTitle>
          <DialogDescription className="leading-6">
            Tell us what happened. We see your note, your name and email, and the page you are on, never your artifacts.
          </DialogDescription>
        </DialogHeader>
        <FeedbackForm note={note} onNoteChange={setNote} send={send} onSent={sent} />
      </DialogContent>
    </Dialog>
  );
}
