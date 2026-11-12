import { isFileLinkPath } from "@/lib/files/media-rules";
import { isSafeHref, safeHref } from "@/lib/link-policy";

/**
 * The address an artifact's rendered Markdown links to, or null when it
 * shows the words without a link: http, https, and mailto URLs (the link
 * policy) and links to this site's uploads (`/api/files/<id>`). In-page
 * anchors, other relative paths, `javascript:`, `data:`, and the like are
 * refused. MarkdownView applies it to every link it renders.
 */
export function artifactLinkHref(url: string): string | null {
  return safeHref(url) ?? (isFileLinkPath(url) ? url : null);
}

/** True when an artifact's rendered Markdown shows `url` as a link. */
export function artifactShowsLink(url: string): boolean {
  return artifactLinkHref(url) !== null;
}

/**
 * True when a comment shows `url` as a link. Stricter than an artifact: a
 * comment links only by the link policy (http, https, mailto), never to an
 * upload, because comments do not show uploads.
 */
export function commentShowsLink(url: string): boolean {
  return isSafeHref(url);
}
