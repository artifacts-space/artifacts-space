/** A ready file as the app and agents see it. Keys and uploader ids stay on the server. */
export interface FileDto {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
}

/** The page URL that checks access and redirects to a short-lived R2 link. */
export function fileUrl(fileId: string, options: { download?: boolean } = {}): string {
  return `/api/files/${encodeURIComponent(fileId)}${options.download ? "?download=1" : ""}`;
}
