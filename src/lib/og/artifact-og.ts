import type { Metadata } from "next";

import { getArtifactAccess, type ArtifactAccess } from "@/lib/access";
import type { ArtifactKind } from "@/lib/artifact-types";
import { filesForViewer } from "@/lib/files/download";
import { cachedVersionView } from "@/lib/versions/cache";
import { isReviewedLevel } from "@/lib/versions/rules";
import { OG_DESCRIPTION, OG_WORDMARK } from "@/lib/site-copy";

import { buildSynopsis, ogKindLabels } from "./synopsis";
import type { Synopsis } from "./synopsis-types";
import { truncate } from "./text-utils";
import { OG_SIZE } from "./theme";

/*
 * Privacy rules for artifact social preview images.
 *
 * A preview shows an artifact's title and a synopsis of its content only when
 * a signed-out reader could open the artifact (link or public) and only from
 * its approved version, never from edits that wait for approval. Everything
 * else (private, team, deleted, unknown ids, link artifacts without an
 * approved version, versions that are no longer approved) gets the same
 * generic site image with the same headers, so the image route cannot tell
 * anyone whether an artifact exists. The read decision is the share page's
 * own: getArtifactAccess as a signed-out viewer.
 */


/** The approved version a signed-out reader sees, or null when the preview must stay generic. */
export function shareableVersion(access: ArtifactAccess | null): { versionId: string; savedAt: string } | null {
  if (!access || !isReviewedLevel(access.record.visibility)) return null;
  if (access.version.source !== "approved" || !access.version.versionId) return null;
  return { versionId: access.version.versionId, savedAt: access.served.updatedAt.toISOString() };
}

/** The read decision for a signed-out viewer, the same one the share page makes. */
async function publicAccess(publicId: string): Promise<ArtifactAccess | null> {
  return getArtifactAccess(publicId, null);
}

/** The path of an artifact's preview image at one version. The route is src/app/artifact/[publicId]/og/[version]. */
export function artifactImagePath(publicId: string, versionId: string): string {
  return `/artifact/${encodeURIComponent(publicId)}/og/${encodeURIComponent(versionId)}`;
}

/**
 * Open Graph and X card tags for an artifact page, as a signed-out reader
 * would get them: its approved title and the preview of its approved version,
 * whose URL holds the version id so it changes with every approval and can be
 * cached for a year. Empty (the page keeps the site's tags and image) when
 * the artifact may not be previewed or the lookup fails.
 */
export async function artifactOgMetadata(publicId: string): Promise<Pick<Metadata, "openGraph" | "twitter">> {
  try {
    const access = await publicAccess(publicId);
    const shareable = shareableVersion(access);
    if (!access || !shareable) return {};
    const title = access.served.title;
    const image = { url: artifactImagePath(publicId, shareable.versionId), alt: `${title} on ${OG_WORDMARK}`, width: OG_SIZE.width, height: OG_SIZE.height, type: "image/png" };
    return {
      openGraph: { title, description: OG_DESCRIPTION, type: "article", siteName: OG_WORDMARK, images: [image] },
      twitter: { card: "summary_large_image", title, description: OG_DESCRIPTION, images: [image] },
    };
  } catch (error) {
    console.error("[og] Artifact preview tags failed; keeping the site tags", error);
    return {};
  }
}

/** What an artifact preview draws. */
export interface ArtifactOg {
  title: string;
  kind: ArtifactKind;
  kindLabel: string;
  synopsis: Synopsis;
}

/**
 * The preview for `publicId` at version `versionId`, or null when the preview
 * must be the generic site image: the artifact is not readable signed out,
 * or `versionId` is not its approved version.
 */
export async function loadArtifactOg(publicId: string, versionId: string): Promise<ArtifactOg | null> {
  const access = await publicAccess(publicId);
  const shareable = shareableVersion(access);
  if (!access || !shareable) return null;
  if (shareable.versionId !== versionId) return null;
  const view = await cachedVersionView(shareable.versionId, shareable.savedAt);
  if (!view) return null;
  const files = view.kind === "file" ? await filesForViewer(access) : [];
  return {
    title: view.title,
    kind: view.kind,
    kindLabel: view.kind === "code" && view.language ? `${ogKindLabels.code} · ${truncate(view.language, 16)}` : ogKindLabels[view.kind],
    synopsis: buildSynopsis({ kind: view.kind, content: view.content, language: view.language, files }),
  };
}
