import type { SharingRequestKind } from "@/lib/artifact-types";
import { loadActors } from "@/lib/agents/queries";
import { toAuthorView } from "@/lib/comments/views";

import { commentExcerpt, notificationHref } from "../display-rules";
import type { NotificationDraft } from "../recipient-rules";
import { pushMessage, type PushMessage } from "./push-rules";
import { pushConfigured, sendPushMessages } from "./send";

/** What a browser notification needs beyond the recipient: the event's artifact, actor, and comment. */
export interface BrowserContext {
  publicId: string;
  actorId: string | null;
  /** The comment's text for comment kinds. Only a short excerpt is sent. */
  commentBody: string | null;
  requestKind: SharingRequestKind | null;
  teamSlug: string | null;
}

/**
 * Sends browser notifications for drafts that already passed the access
 * check and the person's settings. `titleFor` gives the title each person may
 * read (the approved one for readers outside the team). Nothing is sent when
 * browser notifications are not set up.
 */
export async function sendBrowserNotifications(drafts: readonly NotificationDraft[], context: BrowserContext, titleFor: (recipientId: string) => string): Promise<void> {
  if (drafts.length === 0 || !pushConfigured()) return;
  const actors = await loadActors(context.actorId ? [context.actorId] : []);
  const actor = context.actorId ? actors.get(context.actorId) : undefined;
  const actorLabel = actor ? toAuthorView(actor).label : null;
  const excerpt = context.commentBody === null ? null : commentExcerpt(context.commentBody);
  const messages = new Map<string, PushMessage>();
  for (const draft of drafts) {
    const href = notificationHref({ type: draft.type, publicId: context.publicId, teamSlug: context.teamSlug });
    messages.set(draft.recipientId, pushMessage({ type: draft.type, requestKind: context.requestKind, actorLabel, artifactTitle: titleFor(draft.recipientId), publicId: context.publicId, excerpt, href }));
  }
  await sendPushMessages(messages);
}
