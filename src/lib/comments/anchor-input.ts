import { z } from "zod";

import { getViewableArtifact } from "@/lib/access";
import { UserFacingError } from "@/lib/user-facing-error";

import { anchorForServedQuote } from "./anchor-privacy-rules";
import { QUOTE_MAX_LENGTH, storedAnchor, type CommentAnchor } from "./anchor-rules";
import type { Thread } from "./thread";

/*
 * The words a new comment is made on, checked at the boundary. People send a
 * selection (quote and the text around it) from the text they see; agents
 * send only the quote, which must be in the content they are served.
 */

/** Generous caps: storedAnchor cuts each part to what is kept. */
const anchorInputSchema = z.object({
  quote: z.string().max(QUOTE_MAX_LENGTH * 20),
  prefix: z.string().max(QUOTE_MAX_LENGTH * 4).optional(),
  suffix: z.string().max(QUOTE_MAX_LENGTH * 4).optional(),
});

const quoteSchema = z
  .string()
  .trim()
  .min(1, "Pass the words the comment is about, or leave out quote to comment on the whole artifact.")
  .max(QUOTE_MAX_LENGTH, `Quote at most ${QUOTE_MAX_LENGTH.toLocaleString("en-US")} characters.`);

/** The refusal an agent gets when its quote is not in the artifact. */
export const QUOTE_NOT_FOUND_MESSAGE =
  "Those words are not in the artifact as you can read it. Copy the words exactly as they read in the artifact, without Markdown marks such as ** or #, and keep them short; or leave out quote to comment on the whole artifact.";

/** Refuses words on a reply: only a top-level comment is made on words. Runs before any database work. */
export function assertTopLevelAnchor(input: { parentId?: string | undefined; anchor?: CommentAnchor | undefined; quote?: string | undefined }) {
  if (!input.parentId) return;
  if (input.anchor || input.quote !== undefined) {
    throw new UserFacingError(
      "A reply cannot be made on words in the artifact. Reply without a quote, or start a new comment on those words.",
      "A reply cannot be made on words in the artifact. Reply without a selection, or start a new comment on those words.",
    );
  }
}

/** An agent's quote, found in the content it is served, or a refusal that says how to quote. */
async function anchorForAgentQuote(thread: Thread, quote: string): Promise<CommentAnchor> {
  const words = quoteSchema.parse(quote);
  const viewable = await getViewableArtifact(thread.artifact.publicId, thread.actor.userId);
  if (!viewable) throw new UserFacingError("Artifact not found.");
  const anchor = anchorForServedQuote(viewable.view.content, words);
  if (!anchor) throw new UserFacingError(QUOTE_NOT_FOUND_MESSAGE);
  return anchor;
}

/**
 * The anchor to save with a new comment, or null for a comment on the whole
 * artifact. A person's selection is not checked against the saved content:
 * autosave may not have stored the words they selected yet.
 */
export async function anchorToStore(thread: Thread, input: { anchor?: CommentAnchor | undefined; quote?: string | undefined }): Promise<CommentAnchor | null> {
  if (input.quote !== undefined) return anchorForAgentQuote(thread, input.quote);
  if (!input.anchor) return null;
  return storedAnchor(anchorInputSchema.parse(input.anchor));
}
