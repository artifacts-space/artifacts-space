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

async function servedSource(publicId: string, viewerId: string, known: "latest" | "approved" | undefined) {
  if (known) return known;
  return (await getArtifactAccess(publicId, viewerId))?.version.source ?? null;
}

/** The content this viewer is served, or null when they may not read the artifact. */
async function servedContent(publicId: string, viewerId: string): Promise<string | null> {
  return (await getViewableArtifact(publicId, viewerId))?.view.content ?? null;
}

/**
 * The anchor gate for a viewer of one artifact's comments (`records`).
 * `source` is the version the viewer is served, when the caller already ran
 * the access check; otherwise it is checked here, only when needed.
 */
export async function anchorGateFor(input: { publicId: string; viewerId: string; records: readonly AnchorRow[]; source?: "latest" | "approved" }): Promise<AnchorGate> {
  if (!hasLiveAnchor(input.records)) return hideAnchors;
  try {
    const source = await servedSource(input.publicId, input.viewerId, input.source);
    if (source === "latest") return anchorGate({ source });
    const content = source ? await servedContent(input.publicId, input.viewerId) : null;
    return content === null ? hideAnchors : anchorGate({ source: "approved", content });
  } catch (error) {
    console.error("[comments] Loading the served content for anchors failed", error instanceof Error ? error.name : "unknown error");
    return hideAnchors;
  }
}

/**
 * For agents: a check that says which inline comments sit on words that are
 * no longer in the content the agent is served. Loads the content only when
 * a comment shows its anchor; a withheld anchor counts as changed text.
 */
export async function textChangedCheck(publicId: string, viewerId: string, views: readonly AnchoredView[]): Promise<(view: AnchoredView) => boolean> {
  if (!views.some((view) => view.anchor !== null)) return (view) => textChanged(view, null);
  try {
    const content = await servedContent(publicId, viewerId);
    const find = content === null ? null : servedAnchorFinder(content);
    return (view) => textChanged(view, find);
  } catch (error) {
    console.error("[comments] Loading the served content for anchors failed", error instanceof Error ? error.name : "unknown error");
    return (view) => textChanged(view, null);
  }
}
