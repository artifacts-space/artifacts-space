import type { MentionKind } from "@/lib/comments/mentions";

/** A resolved @mention's chip while it is typed: in the highlighted textarea and the rich comment box. */
export const mentionClasses: Record<MentionKind, string> = {
  person: "rounded-xs bg-mention text-mention-foreground ring-2 ring-mention",
  agent: "rounded-xs bg-mention-agent text-mention-agent-foreground ring-2 ring-mention-agent",
};
