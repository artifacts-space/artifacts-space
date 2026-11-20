import { getViewableArtifact, type ViewableArtifact } from "@/lib/access";
import { loadActors } from "@/lib/agents/queries";

import { mentionBlock } from "./document-mention-rules";
import { documentMentionHandles } from "./mentionables";
import type { MentionKind } from "./mentions";

/**
 * What a stored document mention shows its recipient now: the block of the
 * text they are served that names them. Read on every listing, never stored,
 * so it follows the access check and the version the recipient is served.
 */

/** The artifact as the recipient is served it, and the block that mentions them. */
export interface ServedMention {
  title: string;
  icon: string | null;
  /** The mentioning block's Markdown. Untrusted: it is whatever the writer typed. */
  block: string;
}

/**
 * The served mention for each artifact, by public id. An artifact is left
 * out when the recipient may not read it, has no handle, or is served text
 * that does not mention them (the mention was removed, or waits in a version
 * they are not served).
 */
export async function servedMentions(userId: string, publicIds: readonly string[]): Promise<Map<string, ServedMention>> {
  const unique = [...new Set(publicIds)];
  const found = new Map<string, ServedMention>();
  if (unique.length === 0) return found;
  const handle = (await loadActors([userId])).get(userId)?.handle ?? null;
  if (!handle) return found;
  const viewable = await Promise.all(unique.map((publicId) => getViewableArtifact(publicId, userId)));
  unique.forEach((publicId, index) => {
    const artifact = viewable[index];
    if (artifact?.view.kind !== "markdown") return;
    const block = mentionBlock(artifact.view.content, handle);
    if (block !== null) found.set(publicId, { title: artifact.served.title, icon: artifact.served.icon, block });
  });
  return found;
}

const noChips: ReadonlyMap<string, MentionKind> = new Map();

/**
 * The @handles a page's read view shows as chips: the mentions this
 * artifact's text delivered. Only for a fresh render of the latest Markdown
 * that has an "@" in it. An approved version's render is shared by every
 * reader outside the team and cached by version, so it keeps plain text.
 */
export async function readViewMentions(viewable: Pick<ViewableArtifact, "record" | "view" | "version">): Promise<ReadonlyMap<string, MentionKind>> {
  const { view, version, record } = viewable;
  if (version.versionId || view.kind !== "markdown" || !view.content.includes("@")) return noChips;
  return documentMentionHandles(record.id);
}
