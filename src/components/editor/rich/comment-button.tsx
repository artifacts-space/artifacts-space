"use client";

import { IconMessage } from "@tabler/icons-react";

import { useInlineComments } from "@/components/inline-comments/inline-comments-context";

import { ToolButton } from "./format-controls";

/**
 * Comment, in the menus over selected text: starts an inline comment on the
 * selected words, in a card at the text. It shows only where the artifact
 * around the editor has inline comments and this person may comment.
 */
export function CommentButton() {
  const inline = useInlineComments();
  if (!inline) return null;
  return (
    <>
      <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-border" />
      <ToolButton icon={IconMessage} label="Comment" onPress={() => { inline.startComment(); }} />
    </>
  );
}
