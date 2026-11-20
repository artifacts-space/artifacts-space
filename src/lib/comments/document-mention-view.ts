import { getViewableArtifact } from "@/lib/access";
import { loadActors } from "@/lib/agents/queries";

import { mentionBlock } from "./document-mention-rules";

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
