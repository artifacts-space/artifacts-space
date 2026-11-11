/** A ready file as the app and agents see it. Keys and uploader ids stay on the server. */
export interface FileDto {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
  /** When a newer upload replaced the file's content, or null. Its id, place, and name stay. */
  replacedAt: string | null;
  /** True for media a content save attached (an embed in the document): it changes in the document, so it is never replaced. Set by the server. */
  embedded?: boolean;
  /** True for an image the artifact, or one of its versions, shows as its icon or cover: it changes through those pickers, so it is never replaced. Set by the server. */
  pictured?: boolean;
}

/** An old copy of a replaced file, for History. Only people who may edit the artifact see these. */
export interface OldFileDto {
  /** The file entry it belongs to. */
  fileId: string;
  copyId: string;
  filename: string;
  contentType: string;
  size: number;
  /** When a newer upload replaced it. */
  replacedAt: string;
}

/**
 * The page URL that checks access and redirects to a short-lived R2 link.
 * `replacedAt` (FileDto.replacedAt) gives a replaced file a new URL, so a
 * browser that kept the redirect for the old content (redirect-cache-rules.ts)
 * opens the new one.
 */
export function fileUrl(fileId: string, options: { download?: boolean; replacedAt?: string | null | undefined } = {}): string {
  const params = new URLSearchParams();
  if (options.download) params.set("download", "1");
  if (options.replacedAt) params.set("v", String(Date.parse(options.replacedAt)));
  const query = params.toString();
  return `/api/files/${encodeURIComponent(fileId)}${query ? `?${query}` : ""}`;
}

/** The History link that opens or downloads an old copy of a replaced file, for people who may edit the artifact. */
export function oldCopyUrl(file: Pick<OldFileDto, "fileId" | "copyId">, options: { download?: boolean } = {}): string {
  return `/api/files/${encodeURIComponent(file.fileId)}/copies/${encodeURIComponent(file.copyId)}${options.download ? "?download=1" : ""}`;
}
