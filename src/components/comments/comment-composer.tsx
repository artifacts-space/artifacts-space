"use client";

import { IconLoader2, IconSend } from "@tabler/icons-react";
import { lazy, Suspense, useCallback, useMemo, useRef, useState } from "react";

import { ExternalLink } from "@/components/artifact-view/external-link";
import { FormError } from "@/components/teams/form-error";
import { Button } from "@/components/ui/button";
import { COMMENT_MAX_LENGTH } from "@/lib/comments/config";

import { CommentBoxStandIn, useWantsEditor } from "./comment-box";
import type { MentionSource } from "./comment-mentions";
import { useMentionables } from "./mentionables-context";
import type { WriteOutcome } from "./use-comment-thread";

/** The rich box loads on demand, in its own chunk with the editor it shares with the artifact editor. */
const CommentEditor = lazy(() => import("./comment-editor"));

/** GitHub's guide matches what comments render: GitHub-flavored Markdown, which the box's shortcuts follow. */
const SYNTAX_HELP_URL = "https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax";

interface CommentComposerProps {
  label: string;
  placeholder: string;
  submitLabel: string;
  initialBody?: string;
  onSubmit: (body: string) => Promise<WriteOutcome>;
  onCancel?: () => void;
  autoFocus?: boolean;
  /** A shorter box, for the card at an inline comment's words. */
  compact?: boolean;
}

/** Why a draft cannot be posted yet, or null when it can. */
function draftProblem(body: string): string | null {
  if (!body.trim()) return "Write something first.";
  if (body.length > COMMENT_MAX_LENGTH) return `Keep comments under ${COMMENT_MAX_LENGTH.toLocaleString("en-US")} characters.`;
  return null;
}

/**
 * A comment, reply, or edit box. Formatting shows as you type (bold looks
 * bold, a list is a list) and @mentions turn into chips; what posts is the
 * same Markdown as before. ⌘↵ or Ctrl+↵ posts. A failed post keeps the
 * draft and shows why under the box.
 */
export function CommentComposer({ label, placeholder, submitLabel, initialBody = "", onSubmit, onCancel, autoFocus = false, compact = false }: CommentComposerProps) {
  const [body, setBody] = useState(initialBody);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [cleared, setCleared] = useState(0);
  const [pressed, setPressed] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const { candidates, self, resolved } = useMentionables();
  const mentions = useMemo<MentionSource>(() => ({ candidates, self, resolved }), [candidates, self, resolved]);
  const { attach, wanted, want } = useWantsEditor(autoFocus);

  const onChange = useCallback((next: string) => {
    setBody(next);
    setError("");
  }, []);
  const onSubmitShortcut = useCallback(() => { form.current?.requestSubmit(); }, []);

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const problem = draftProblem(body);
    if (problem) {
      setError(problem);
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
    setCleared((count) => count + 1);
  }

  const standIn = <CommentBoxStandIn text={initialBody} placeholder={placeholder} compact={compact} onPress={() => { setPressed(true); want(); }} />;

  return (
    <form ref={form} onSubmit={(event) => void submit(event)} noValidate data-comment-skip="" className="space-y-2">
      <div ref={attach}>
        {wanted ? (
          <Suspense fallback={standIn}>
            <CommentEditor
              initialValue={initialBody}
              onChange={onChange}
              label={label}
              placeholder={placeholder}
              autoFocus={autoFocus || pressed}
              clearSignal={cleared}
              onSubmitShortcut={onSubmitShortcut}
              mentions={mentions}
              compact={compact}
            />
          </Suspense>
        ) : standIn}
      </div>
      <FormError message={error} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <p className="mr-auto text-xs text-muted-foreground">
          Type @ to bring someone in. <ExternalLink href={SYNTAX_HELP_URL}>Formatting help</ExternalLink>
        </p>
        {onCancel ? <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button> : null}
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <IconLoader2 className="animate-spin" /> : <IconSend />} {submitLabel}
        </Button>
      </div>
    </form>
  );
}
