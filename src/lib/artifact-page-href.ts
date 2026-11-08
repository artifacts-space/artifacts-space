/**
 * The path of an artifact's own page, the page its share link opens. A
 * relative path, so it opens on whichever host is serving the workspace.
 */
export function artifactPageHref(publicId: string): string {
  return `/artifact/${encodeURIComponent(publicId)}`;
}
