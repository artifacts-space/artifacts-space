import { fileLimits } from "./config";

/** Characters kept in a stored filename. Everything else becomes a dash. */
const unsafeCharacters = /[^A-Za-z0-9._-]+/g;
const repeatedDashes = /-{2,}/g;
const edgeJunk = /^[-.]+|[-.]+$/g;

function stripPath(name: string): string {
  const parts = name.split(/[/\\]/);
  return parts[parts.length - 1] ?? "";
}

/**
 * A filename that is safe in an object key and a download header: the last
 * path segment only, ASCII letters, digits, dot, dash, and underscore, no
 * leading dots, and at most 120 characters with the extension kept. Falls
 * back to "file" (plus the extension) when nothing usable is left.
 */
export function sanitizeFilename(name: string): string {
  const base = stripPath(name.normalize("NFKD").replace(/[̀-ͯ]/g, ""));
  const cleaned = base.replace(unsafeCharacters, "-").replace(repeatedDashes, "-").replace(/[-.]+$/, "");
  const dot = cleaned.lastIndexOf(".");
  const hasExtension = dot > 0 && dot < cleaned.length - 1 && cleaned.length - dot <= 11;
  const stem = (hasExtension ? cleaned.slice(0, dot) : cleaned).replace(edgeJunk, "") || "file";
  const extension = hasExtension ? cleaned.slice(dot).toLowerCase() : "";
  const room = fileLimits.maxFilenameLength - extension.length;
  return `${stem.slice(0, room).replace(edgeJunk, "") || "file"}${extension}`;
}

/** Matches the object keys this app creates: files/<uuid>/<sanitized name>. */
const objectKeyPattern = /^files\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]{1,120}$/;

/**
 * The R2 object key for a file. The server generates the id; the only part
 * that comes from the uploader is the sanitized filename suffix.
 */
export function fileObjectKey(fileId: string, filename: string): string {
  const key = `files/${fileId.toLowerCase()}/${sanitizeFilename(filename)}`;
  if (!objectKeyPattern.test(key)) throw new Error("The file key could not be built.");
  return key;
}

/** True for keys this app created. */
export function isFileObjectKey(key: string): boolean {
  return objectKeyPattern.test(key);
}

/**
 * A Content-Disposition value: inline or attachment, with an ASCII filename
 * and an RFC 5987 UTF-8 copy for browsers that read it.
 */
export function contentDisposition(filename: string, inline: boolean): string {
  const safe = sanitizeFilename(filename);
  const encoded = encodeURIComponent(safe).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? "inline" : "attachment"}; filename="${safe}"; filename*=UTF-8''${encoded}`;
}
