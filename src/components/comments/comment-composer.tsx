"use client";

import { IconLoader2, IconSend } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

import { ExternalLink } from "@/components/artifact-view/external-link";
import { MarkdownView } from "@/components/artifact-view/markdown-view";
import { HighlightedTextarea } from "@/components/editor/highlighted-textarea";
import { FormError } from "@/components/teams/form-error";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COMMENT_MAX_LENGTH } from "@/lib/comments/config";
import type { MentionKind } from "@/lib/comments/mentions";

import { useMentionAutocomplete } from "./mention-suggestions";
import { useMentionables } from "./mentionables-context";
import type { WriteOutcome } from "./use-comment-thread";

/** GitHub's guide matches what comments render: GitHub-flavored Markdown. */
const SYNTAX_HELP_URL = "https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax";

type ComposerTab = "write" | "preview";

interface CommentComposerProps {
  label: string;
  placeholder: string;
  submitLabel: string;
  initialBody?: string;
  onSubmit: (body: string) => Promise<WriteOutcome>;
  onCancel?: () => void;
  autoFocus?: boolean;
}

/** Shows the draft exactly as it will post, with the same Markdown renderer as the thread. */
function DraftPreview({ body, resolved }: { body: string; resolved: ReadonlyMap<string, MentionKind> }) {
  return (
    <div className="min-h-20 rounded-lg border border-input px-2.5 py-2">
      {body.trim() ? <MarkdownView content={body} mentions={resolved} className="max-w-none text-md leading-6" /> : <p className="text-md text-muted-foreground">Nothing to preview yet.</p>}
    </div>
  );
}

/**
 * A comment, reply, or edit box. Write shows Markdown and resolved @mentions
 * as you type; Preview shows the posted result. Errors show under it.
 */
export function CommentComposer({ label, placeholder, submitLabel, initialBody = "", onSubmit, onCancel, autoFocus = false }: CommentComposerProps) {
  const [body, setBody] = useState(initialBody);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [tab, setTab] = useState<ComposerTab>("write");
  const { resolved } = useMentionables();
  const mentions = useMentionAutocomplete({
    body,
    setBody: (next) => { setBody(next); setError(""); },
  });
  const { ref: textareaRef, ...textareaProps } = mentions.textareaProps;
  const startedWith = useRef(autoFocus ? initialBody : "");

  // A comment that starts with text (a quoted block) opens with the cursor after it, in view.
  useEffect(() => {
    const field = textareaRef.current;
    if (!field || !startedWith.current) return;
    field.setSelectionRange(field.value.length, field.value.length);
    field.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [textareaRef]);

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
    setTab("write");
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-2">
      <Tabs value={tab} onValueChange={(value: ComposerTab) => { setTab(value); }} className="gap-1.5">
        <TabsList aria-label={`${label}: write or preview`}>
          <TabsTrigger value="write" className="px-2.5">Write</TabsTrigger>
          <TabsTrigger value="preview" className="px-2.5">Preview</TabsTrigger>
        </TabsList>
        {/* Kept mounted so the textarea keeps its undo history while you preview. */}
        <TabsContent value="write" keepMounted className="relative">
          <HighlightedTextarea
            {...textareaProps}
            textareaRef={textareaRef}
            value={body}
            resolved={resolved}
            onChange={(event) => { setBody(event.target.value); setError(""); mentions.syncCaret(event); }}
            placeholder={placeholder}
            aria-label={label}
            autoFocus={autoFocus}
            rows={3}
          />
          {mentions.suggestions}
          {mentions.hint}
        </TabsContent>
        <TabsContent value="preview">
          <DraftPreview body={body} resolved={resolved} />
        </TabsContent>
      </Tabs>
      <FormError message={error} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <p className="mr-auto text-xs text-muted-foreground">
          Markdown and @mentions work here. <ExternalLink href={SYNTAX_HELP_URL}>Formatting help</ExternalLink>
        </p>
        {onCancel ? <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button> : null}
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <IconLoader2 className="animate-spin" /> : <IconSend />} {submitLabel}
        </Button>
      </div>
    </form>
  );
}
