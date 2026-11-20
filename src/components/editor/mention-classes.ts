import type { MentionKind } from "@/lib/comments/mentions";

/**
 * A resolved @mention's look in text: while it is typed (the highlighted
 * textarea, the rich comment box, the document editor) and in the read view
 * of an artifact's own text (markdown-view.tsx). It takes no room of its
 * own, so text keeps its place when the mention resolves.
 */
export const mentionClasses: Record<MentionKind, string> = {
  person: "rounded-xs bg-mention text-mention-foreground ring-2 ring-mention",
  agent: "rounded-xs bg-mention-agent text-mention-agent-foreground ring-2 ring-mention-agent",
};
