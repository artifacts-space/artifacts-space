"use client";

import { IconLoader2, IconSend } from "@tabler/icons-react";
import { useState } from "react";

import { FormError } from "@/components/teams/form-error";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { COMMENT_MAX_LENGTH } from "@/lib/comments/config";

import { useMentionAutocomplete } from "./mention-suggestions";
import type { WriteOutcome } from "./use-comment-thread";

interface CommentComposerProps {
  label: string;
  placeholder: string;
  submitLabel: string;
  initialBody?: string;
  onSubmit: (body: string) => Promise<WriteOutcome>;
  onCancel?: () => void;
  autoFocus?: boolean;
}

/** A markdown box for a comment, reply, or edit. Errors show under it. */
export function CommentComposer({ label, placeholder, submitLabel, initialBody = "", onSubmit, onCancel, autoFocus = false }: CommentComposerProps) {
  const [body, setBody] = useState(initialBody);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const mentions = useMentionAutocomplete({
    body,
    setBody: (next) => { setBody(next); setError(""); },
  });

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) {
      setError("Write something first.");
      return;
    }
    if (body.length > COMMENT_MAX_LENGTH) {
      setError(`Keep comments under ${COMMENT_MAX_LENGTH.toLocaleString("en-US")} characters.`);
      return;
    }
    setError("");
    setPending(true);
    const outcome = await onSubmit(body);
    setPending(false);
    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }
    setBody("");
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-2">
      <div className="relative">
        <Textarea
          {...mentions.textareaProps}
          value={body}
          onChange={(event) => { setBody(event.target.value); setError(""); mentions.syncCaret(event); }}
          placeholder={placeholder}
          aria-label={label}
          autoFocus={autoFocus}
          rows={3}
          className="min-h-20 bg-card text-[13px] leading-6"
        />
        {mentions.suggestions}
      </div>
      <FormError message={error} />
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-[11px] text-muted-foreground">Markdown. Type @handle to mention a teammate or agent.</span>
        {onCancel ? <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button> : null}
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <IconLoader2 className="animate-spin" /> : <IconSend />} {submitLabel}
        </Button>
      </div>
    </form>
  );
}
