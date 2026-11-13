/**
 * Pure rules for links that open one artifact in the /app workspace:
 * `/app?artifact=<publicId>` selects it, `&comments=1` opens its comments
 * too, and `&comment=<commentId>` opens them at one comment (the Inbox and
 * mention emails link there). Notifications and other pages link here.
 * Client-safe.
 */

/** An artifact to open from the URL, whether to open its comments, and the comment to show. */
export interface ArtifactLink {
  publicId: string;
  comments: boolean;
  /** The comment to bring into view. Set only with `comments`. */
  commentId?: string;
}

/** Public ids are short base58; anything else is ignored before any lookup. */
const linkIdPattern = /^[A-Za-z0-9]{1,64}$/;
/** Comment ids are UUIDs; the pattern only keeps the value safe to look for, the thread decides whether it exists. */
const commentIdPattern = /^[A-Za-z0-9-]{1,64}$/;
/** The fragment older links (the retired /threads page, emails already sent) put the comment in. */
const commentHashPattern = /^#comment-([A-Za-z0-9-]{1,64})$/;

function single(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function commentIdOf(value: string | string[] | undefined): string | null {
  const id = single(value)?.trim() ?? "";
  return commentIdPattern.test(id) ? id : null;
}

/** The artifact link in the search params, or null when there is none or it is malformed. */
export function parseArtifactLink(params: Record<string, string | string[] | undefined>): ArtifactLink | null {
  const publicId = single(params.artifact)?.trim() ?? "";
  if (!linkIdPattern.test(publicId)) return null;
  const commentId = commentIdOf(params.comment);
  if (commentId) return { publicId, comments: true, commentId };
  return { publicId, comments: single(params.comments) === "1" };
}

/** The comment id in a `#comment-<id>` fragment, or null. Links to the retired thread page arrive at /app with it. */
export function commentIdFromHash(hash: string): string | null {
  return commentHashPattern.exec(hash)?.[1] ?? null;
}

/**
 * The artifact link in a URL's query string (the browser's), read by the
 * same rules as the page's search params. A `#comment-<id>` fragment names
 * the comment when the query does not.
 */
export function parseArtifactLinkSearch(search: URLSearchParams, hash = ""): ArtifactLink | null {
  const values = (name: string) => {
    const all = search.getAll(name);
    return all.length > 1 ? all : all[0];
  };
  const link = parseArtifactLink({ artifact: values("artifact"), comments: values("comments"), comment: values("comment") });
  const fromHash = link?.comments && !link.commentId ? commentIdFromHash(hash) : null;
  return link && fromHash ? { ...link, commentId: fromHash } : link;
}

/** The /app URL that opens an artifact, with its comments when asked, at one comment when it names one. */
export function artifactLinkHref(link: ArtifactLink): string {
  const base = `/app?artifact=${encodeURIComponent(link.publicId)}`;
  if (link.commentId) return `${base}&comment=${encodeURIComponent(link.commentId)}`;
  return link.comments ? `${base}&comments=1` : base;
}

/** The search string with the artifact link removed, so a reload or a later pick does not jump back. */
export function withoutArtifactLink(search: string): string {
  const params = new URLSearchParams(search);
  params.delete("artifact");
  params.delete("comments");
  params.delete("comment");
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}

/** The fragment without a link's `#comment-<id>`, which only the link needed; any other fragment stays. */
export function withoutCommentHash(hash: string): string {
  return commentHashPattern.test(hash) ? "" : hash;
}
