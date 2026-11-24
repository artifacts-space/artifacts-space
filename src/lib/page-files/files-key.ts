import type { FileDto } from "@/lib/files/types";

/**
 * A text that names an artifact's page files as they are now (each one's
 * id, path, and last replace), or undefined when it has none. A page frame
 * loads under its files address when this is set, and again when it
 * changes (PageFrame's `filesKey`). Pure.
 */
export function pageFilesKeyOf(files: readonly Pick<FileDto, "id" | "pagePath" | "replacedAt">[]): string | undefined {
  const pageFiles = files.filter((file) => file.pagePath !== undefined);
  if (pageFiles.length === 0) return undefined;
  return pageFiles.map((file) => `${file.id}:${file.pagePath ?? ""}:${file.replacedAt ?? ""}`).join("|");
}
