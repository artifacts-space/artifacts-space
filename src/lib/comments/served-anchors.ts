import { getArtifactAccess, getViewableArtifact } from "@/lib/access";
import type { CommentRecord } from "@/db/schema";

import { anchorGate, hideAnchors, servedAnchorFinder, textChanged, type AnchorGate } from "./anchor-privacy-rules";
import type { CommentView } from "./views";

/*
 * Loads what the anchor rules need: the content a viewer is served, only when
 * it decides something. Viewers served the latest version never load it, and
 * neither does a thread without inline comments. Any failure hides the
 * anchors instead of showing words the viewer may not read.
 */

type AnchorRow = Pick<CommentRecord, "quote" | "parentId" | "deletedAt">;
type AnchoredView = Pick<CommentView, "anchored" | "anchor">;

function hasLiveAnchor(records: readonly AnchorRow[]) {
  return records.some((record) => record.quote !== null && record.parentId === null && record.deletedAt === null);
}

/**
 * One viewer's served versions and the finders over the content they are
 * served, each loaded at most once per artifact. A request that reads the
 * comments of one artifact several times (the inbox, an agent's comment
 * list) makes one and hands it to every call, so the content is loaded and
 * read once, not once per comment.
 */
export interface ServedAnchors {
  /** Which version the viewer is served, or null when they may not read the artifact. */
  source: (publicId: string) => Promise<"latest" | "approved" | null>;
  /** A finder over the content the viewer is served, or null when they may not read the artifact. */
  finder: (publicId: string) => Promise<AnchorGate | null>;
}

function once<T>(loaded: Map<string, Promise<T>>, publicId: string, load: () => Promise<T>): Promise<T> {
  let value = loaded.get(publicId);
  if (!value) {
    value = load();
    loaded.set(publicId, value);
  }
  return value;
}

/** A loader for one viewer and one request. See ServedAnchors. */
export function servedAnchors(viewerId: string): ServedAnchors {
  const sources = new Map<string, Promise<"latest" | "approved" | null>>();
  const finders = new Map<string, Promise<AnchorGate | null>>();
  return {
    source: (publicId) => once(sources, publicId, async () => (await getArtifactAccess(publicId, viewerId))?.version.source ?? null),
    finder: (publicId) =>
      once(finders, publicId, async () => {
        const content = (await getViewableArtifact(publicId, viewerId))?.view.content ?? null;
        return content === null ? null : servedAnchorFinder(content);
      }),
  };
}

function logFailure(error: unknown) {
  console.error("[comments] Loading the served content for anchors failed", error instanceof Error ? error.name : "unknown error");
}

/**
 * The anchor gate for a viewer of one artifact's comments (`records`).
 * `source` is the version the viewer is served, when the caller already ran
 * the access check; otherwise it is checked here, only when needed. Pass
 * `served` when the request reads this artifact's comments more than once.
 */
export async function anchorGateFor(input: { publicId: string; viewerId: string; records: readonly AnchorRow[]; source?: "latest" | "approved" | undefined; served?: ServedAnchors | undefined }): Promise<AnchorGate> {
  if (!hasLiveAnchor(input.records)) return hideAnchors;
  const served = input.served ?? servedAnchors(input.viewerId);
  try {
    const source = input.source ?? (await served.source(input.publicId));
    if (source === "latest") return anchorGate({ source });
    // Served the approved version: only anchors whose words are in its content, read from it.
    const find = source ? await served.finder(input.publicId) : null;
    return find ?? hideAnchors;
  } catch (error) {
    logFailure(error);
    return hideAnchors;
  }
}

/**
 * For agents: a check that says which inline comments sit on words that are
 * no longer in the content the agent is served. Loads the content only when
 * a comment shows its anchor; a withheld anchor counts as changed text.
 */
export async function textChangedCheck(publicId: string, viewerId: string, views: readonly AnchoredView[], served: ServedAnchors = servedAnchors(viewerId)): Promise<(view: AnchoredView) => boolean> {
  if (!views.some((view) => view.anchor !== null)) return (view) => textChanged(view, null);
  try {
    const find = await served.finder(publicId);
    return (view) => textChanged(view, find);
  } catch (error) {
    logFailure(error);
    return (view) => textChanged(view, null);
  }
}
