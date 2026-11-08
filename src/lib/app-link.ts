/**
 * Pure rules for links that open one artifact in the /app workspace:
 * `/app?artifact=<publicId>` selects it, and `&comments=1` opens its
 * comments too. Notifications and other pages link here. Client-safe.
 */

/** An artifact to open from the URL, and whether to open its comments. */
export interface ArtifactLink {
  publicId: string;
  comments: boolean;
}

/** Public ids are short base58; anything else is ignored before any lookup. */
const linkIdPattern = /^[A-Za-z0-9]{1,64}$/;

function single(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

/** The artifact link in the search params, or null when there is none or it is malformed. */
export function parseArtifactLink(params: Record<string, string | string[] | undefined>): ArtifactLink | null {
  const publicId = single(params.artifact)?.trim() ?? "";
  if (!linkIdPattern.test(publicId)) return null;
  return { publicId, comments: single(params.comments) === "1" };
}

/** The /app URL that opens an artifact, with its comments when asked. */
export function artifactLinkHref(link: ArtifactLink): string {
  const base = `/app?artifact=${encodeURIComponent(link.publicId)}`;
  return link.comments ? `${base}&comments=1` : base;
}

/** The search string with the artifact link removed, so a reload or a later pick does not jump back. */
export function withoutArtifactLink(search: string): string {
  const params = new URLSearchParams(search);
  params.delete("artifact");
  params.delete("comments");
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}
