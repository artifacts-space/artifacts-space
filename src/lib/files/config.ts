/**
 * File upload rules: the size cap, the allowed types, and how each type is
 * shown. Client-safe (no server imports), so the uploader shows the same
 * limits the server enforces.
 */

/** Every upload and download limit, in one place. */
export const fileLimits = {
  /** Largest file, in bytes (25 MB). */
  maxBytes: 25 * 1024 * 1024,
  /** Most files attached to one artifact. */
  maxFilesPerArtifact: 20,
  /** Most uploads one person may have waiting to finish at once. */
  maxPendingPerUser: 20,
  /** How long a presigned upload URL works, in seconds. */
  uploadUrlSeconds: 10 * 60,
  /** How long a presigned download URL works, in seconds. */
  downloadUrlSeconds: 15 * 60,
  /** Uploads not finished within this time are deleted. */
  pendingTtlMs: 60 * 60 * 1000,
  /** Finished uploads not attached to an artifact within this time are deleted. */
  unattachedTtlMs: 24 * 60 * 60 * 1000,
  /** Longest stored filename, in characters. */
  maxFilenameLength: 120,
} as const;

/** How a file shows on a page. */
export type FileCategory = "image" | "pdf" | "video" | "audio" | "text" | "document";

interface FileTypeInfo {
  /** Lowercase extensions, without the dot. The first is the default. */
  extensions: readonly string[];
  category: FileCategory;
  /** Short name for people. */
  label: string;
}

/** Allowed content types. Anything else is refused. */
export const allowedFileTypes = {
  "image/png": { extensions: ["png"], category: "image", label: "PNG image" },
  "image/jpeg": { extensions: ["jpg", "jpeg"], category: "image", label: "JPEG image" },
  "image/gif": { extensions: ["gif"], category: "image", label: "GIF image" },
  "image/webp": { extensions: ["webp"], category: "image", label: "WebP image" },
  "image/avif": { extensions: ["avif"], category: "image", label: "AVIF image" },
  "application/pdf": { extensions: ["pdf"], category: "pdf", label: "PDF" },
  "text/plain": { extensions: ["txt", "md", "log"], category: "text", label: "Text" },
  "text/csv": { extensions: ["csv"], category: "document", label: "CSV" },
  "application/json": { extensions: ["json"], category: "document", label: "JSON" },
  "application/zip": { extensions: ["zip"], category: "document", label: "ZIP archive" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { extensions: ["docx"], category: "document", label: "Word document" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { extensions: ["xlsx"], category: "document", label: "Excel workbook" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { extensions: ["pptx"], category: "document", label: "PowerPoint deck" },
  "video/mp4": { extensions: ["mp4"], category: "video", label: "MP4 video" },
  "video/webm": { extensions: ["webm"], category: "video", label: "WebM video" },
  "audio/mpeg": { extensions: ["mp3"], category: "audio", label: "MP3 audio" },
  "audio/wav": { extensions: ["wav"], category: "audio", label: "WAV audio" },
} as const satisfies Record<string, FileTypeInfo>;

export type AllowedFileType = keyof typeof allowedFileTypes;

/** Other names browsers and tools use for allowed types. */
const typeAliases: Readonly<Record<string, AllowedFileType>> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "text/markdown": "text/plain",
  "text/x-markdown": "text/plain",
  "application/x-zip-compressed": "application/zip",
  "application/x-zip": "application/zip",
  "audio/mp3": "audio/mpeg",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "application/csv": "text/csv",
};

/** Declared types that say nothing, so the extension decides. */
const vagueTypes = new Set(["", "application/octet-stream", "binary/octet-stream", "application/vnd.ms-excel"]);

const extensionTypes = new Map<string, AllowedFileType>(
  (Object.entries(allowedFileTypes) as [AllowedFileType, FileTypeInfo][]).flatMap(([type, info]) => info.extensions.map((extension) => [extension, type] as const)),
);

/** True when `type` is one of the allowed content types. */
export function isAllowedFileType(type: string): type is AllowedFileType {
  return Object.hasOwn(allowedFileTypes, type);
}

/** The lowercase extension of a filename, without the dot, or "". */
export function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return "";
  return filename.slice(dot + 1).toLowerCase();
}

function baseType(declared: string): string {
  return (declared.split(";")[0] ?? "").trim().toLowerCase();
}

/**
 * The allowed content type for an upload, or null. A declared type wins when
 * it is allowed (after aliases); a missing or generic one falls back to the
 * filename's extension.
 */
export function resolveFileType(filename: string, declared: string | undefined): AllowedFileType | null {
  const type = baseType(declared ?? "");
  const aliased = typeAliases[type] ?? type;
  if (isAllowedFileType(aliased)) return aliased;
  if (!vagueTypes.has(type)) return null;
  return extensionTypes.get(fileExtension(filename)) ?? null;
}

/** The allowed types as a short list for people, such as in the upload hint. */
export const allowedTypesHint = "Images, PDF, text, CSV, JSON, ZIP, Word, Excel, PowerPoint, MP4, WebM, MP3, and WAV";

/** The `accept` attribute for file pickers. */
export const fileInputAccept = [
  ...Object.keys(allowedFileTypes),
  ...[...extensionTypes.keys()].map((extension) => `.${extension}`),
].join(",");

/** The outcome of checking an upload request. */
export type UploadCheck =
  | { ok: true; contentType: AllowedFileType }
  | { ok: false; error: string };

/** Formats a byte count for people, such as "2.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  const units = ["KB", "MB", "GB"] as const;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit] ?? "GB"}`;
}

/**
 * Checks a requested upload before any URL is signed: a size within the cap
 * and an allowed type. Errors are written for the person or agent uploading.
 */
export function checkUpload(input: { filename: string; contentType?: string | undefined; size: number }): UploadCheck {
  if (!Number.isInteger(input.size) || input.size <= 0) return { ok: false, error: "The file is empty. Choose a file with content." };
  if (input.size > fileLimits.maxBytes) {
    return { ok: false, error: `The file is ${formatBytes(input.size)}. The limit is ${formatBytes(fileLimits.maxBytes)}.` };
  }
  const contentType = resolveFileType(input.filename, input.contentType);
  if (!contentType) return { ok: false, error: `This file type is not supported. Upload ${allowedTypesHint}.` };
  return { ok: true, contentType };
}

/** How a file of this type shows on a page. */
export function fileCategory(contentType: string): FileCategory {
  return isAllowedFileType(contentType) ? allowedFileTypes[contentType].category : "document";
}

/** A short type name for people, such as "PDF". */
export function fileTypeLabel(contentType: string): string {
  return isAllowedFileType(contentType) ? allowedFileTypes[contentType].label : "File";
}

/** Types a browser may show in the page. Everything else downloads. */
const inlineCategories: ReadonlySet<FileCategory> = new Set(["image", "pdf", "video", "audio", "text"]);

/** True when a file of this type is safe to show inline; false means it downloads as an attachment. */
export function isInlineType(contentType: string): boolean {
  return isAllowedFileType(contentType) && inlineCategories.has(allowedFileTypes[contentType].category);
}
