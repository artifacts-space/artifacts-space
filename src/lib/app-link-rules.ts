import type { ArtifactLink } from "./app-link";
import type { ArtifactListItemDto } from "./artifact-types";

/**
 * Pure rules for what a link (`/app?artifact=<id>`, from a notification,
 * say) does to the workspace list. Client-safe.
 */

/** A link opens its artifact, or the artifact is gone or not the viewer's to read. */
export type ArtifactLinkOutcome =
  | { kind: "open"; artifacts: ArtifactListItemDto[]; selectedId: string }
  | { kind: "unavailable" };

/**
 * Opens the linked artifact: the one in the list when it is there (the list
 * keeps the person's latest changes), else the server's copy, pinned to the
 * top. `target` is what the server found for the link through the access
 * check, or null when the artifact is missing or the viewer may not read it.
 */
export function openArtifactLink(artifacts: ArtifactListItemDto[], link: ArtifactLink, target: ArtifactListItemDto | null): ArtifactLinkOutcome {
  const listed = artifacts.find((artifact) => artifact.publicId === link.publicId);
  if (listed) return { kind: "open", artifacts, selectedId: listed.id };
  if (target?.publicId !== link.publicId) return { kind: "unavailable" };
  return { kind: "open", artifacts: [target, ...artifacts.filter((artifact) => artifact.id !== target.id)], selectedId: target.id };
}

/** Where the workspace starts: the linked artifact when a link opens one, else the first in the list. */
export function linkedStart(artifacts: ArtifactListItemDto[], link: ArtifactLink | null, target: ArtifactListItemDto | null) {
  const outcome = link ? openArtifactLink(artifacts, link, target) : null;
  if (outcome?.kind === "open") return { artifacts: outcome.artifacts, selectedId: outcome.selectedId, unavailable: false, opened: link };
  return { artifacts, selectedId: artifacts[0]?.id ?? "", unavailable: outcome !== null, opened: null };
}

/** What the workspace says about a link that did not open: its artifact is gone, or it could not be checked just now. */
export type LinkNotice = "gone" | "failed";

/** The notice for a link: none when it opened, "failed" when the server could not check it (it may still be there), else "gone". */
export function linkNotice(unavailable: boolean, failed: boolean): LinkNotice | null {
  if (!unavailable) return null;
  return failed ? "failed" : "gone";
}
