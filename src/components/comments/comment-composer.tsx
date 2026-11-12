"use client";

import { IconLoader2, IconSend } from "@tabler/icons-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ExternalLink } from "@/components/artifact-view/external-link";
import { FormError } from "@/components/teams/form-error";
import { Button } from "@/components/ui/button";
import { COMMENT_MAX_LENGTH } from "@/lib/comments/config";

import { CommentEditorBoundary, isSubmitShortcut, PlainCommentBox, useWantsEditor } from "./comment-box";
import type { CommentEditorApi } from "./comment-editor";
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

/** Puts the cursor at the end of the plain box's text, for a box that opens focused. */
function focusAtEnd(textarea: HTMLTextAreaElement) {
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

/**
 * A comment, reply, or edit box. Formatting shows as you type (bold looks
 * bold, a list is a list) and @mentions turn into chips; what posts is the
 * same Markdown as before. ⌘↵ or Ctrl+↵ posts. A failed post keeps the
 * draft and shows why under the box.
 *
 * The rich box loads on demand. Until it is in, and for good if it cannot
 * load, a plain text box with the same name, size, and text stands in its
 * place; what is typed there posts as written, and the rich box takes it
 * over, with the caret, when it arrives.
 */
export function CommentComposer({ label, placeholder, submitLabel, initialBody = "", onSubmit, onCancel, autoFocus = false, compact = false }: CommentComposerProps) {
  const [body, setBody] = useState(initialBody);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [cleared, setCleared] = useState(0);
  const [rich, setRich] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const plain = useRef<HTMLTextAreaElement>(null);
  const { candidates, self, resolved } = useMentionables();
  const mentions = useMemo<MentionSource>(() => ({ candidates, self, resolved }), [candidates, self, resolved]);
  const { attach, wanted, want } = useWantsEditor(autoFocus);

  useEffect(() => {
    if (autoFocus && plain.current) focusAtEnd(plain.current);
  }, [autoFocus]);

  const onChange = useCallback((next: string) => {
    setBody(next);
    setError("");
  }, []);
  const onSubmitShortcut = useCallback(() => { form.current?.requestSubmit(); }, []);
  const onReady = useCallback((editor: CommentEditorApi) => {
    const textarea = plain.current;
    if (!textarea) return;
    const focused = document.activeElement === textarea;
    editor.load(textarea.value, focused ? textarea.selectionStart : null);
    // Hidden at once, ahead of the next render, which removes it.
    textarea.parentElement?.setAttribute("hidden", "");
    setRich(true);
  }, []);

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

  return (
    <form ref={form} onSubmit={(event) => void submit(event)} noValidate data-comment-skip="" className="space-y-2">
      <div ref={attach}>
        {rich ? null : (
          <PlainCommentBox
            ref={plain}
            compact={compact}
            aria-label={label}
            placeholder={placeholder}
            value={body}
            onChange={(event) => { onChange(event.target.value); }}
            onFocus={want}
            onKeyDown={(event) => {
              if (!isSubmitShortcut(event)) return;
              event.preventDefault();
              onSubmitShortcut();
            }}
          />
        )}
        {wanted ? (
          <CommentEditorBoundary>
            <Suspense fallback={null}>
              <CommentEditor
                onChange={onChange}
                label={label}
                placeholder={placeholder}
                hidden={!rich}
                onReady={onReady}
                clearSignal={cleared}
                onSubmitShortcut={onSubmitShortcut}
                mentions={mentions}
                compact={compact}
              />
            </Suspense>
          </CommentEditorBoundary>
        ) : null}
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
