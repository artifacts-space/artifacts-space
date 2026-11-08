import { z } from "zod";

import { FILE_PREFIX } from "@/lib/artifact-icons";

import { coverGradient, coverGradientIdList, coverGradients, type CoverGradient } from "./gradients";
import { artifactCoverLimits } from "./limits";

/**
 * Artifact covers: a slim banner above the artifact. A cover is stored as
 * text and is exactly one of:
 * - a gradient id from src/lib/covers/gradients.ts, such as "mist";
 * - `file:<uuid>`, an uploaded image attached to the same artifact, with an
 *   optional vertical focal point as `@<0-100>` (percent from the top; 50,
 *   the centre, is never stored). The file rules (finished, image type, size,
 *   same artifact) need the database and live in src/lib/files/cover-file.ts.
 * Nothing else is accepted: never a remote URL. Covers render as theme
 * custom properties or an access-checked image, never as raw CSS.
 */

/** The focal point used when none is stored: the image's vertical centre. */
export const DEFAULT_COVER_POSITION = 50;

/** Where people and agents read the rules. */
export const COVER_DOCS_PATH = "/docs/themes#covers";

/** A parsed cover, ready to render. */
export type ParsedCover = { type: "gradient"; gradient: CoverGradient } | { type: "image"; fileId: string; position: number };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const positionPattern = /^(\d{1,3})$/;

function parsePosition(raw: string | undefined): number | null {
  if (raw === undefined) return DEFAULT_COVER_POSITION;
  if (!positionPattern.test(raw)) return null;
  const value = Number(raw);
  return value <= 100 ? value : null;
}

function parseImageCover(value: string): ParsedCover | null {
  const [rawId = "", rawPosition, extra] = value.slice(FILE_PREFIX.length).split("@");
  const fileId = rawId.toLowerCase();
  const position = parsePosition(rawPosition);
  if (extra !== undefined || !uuidPattern.test(fileId) || position === null) return null;
  return { type: "image", fileId, position };
}

/** Parses a stored or submitted cover. Null when it is neither a gradient id nor `file:<uuid>[@0-100]`. */
export function parseArtifactCover(value: string | null | undefined): ParsedCover | null {
  if (!value) return null;
  if (value.startsWith(FILE_PREFIX)) return parseImageCover(value);
  const gradient = coverGradient(value);
  return gradient ? { type: "gradient", gradient } : null;
}

/** The stored form of a parsed cover. */
export function storedCover(cover: ParsedCover): string {
  if (cover.type === "gradient") return cover.gradient.id;
  const position = Math.round(Math.min(100, Math.max(0, cover.position)));
  return position === DEFAULT_COVER_POSITION ? `${FILE_PREFIX}${cover.fileId}` : `${FILE_PREFIX}${cover.fileId}@${String(position)}`;
}

/**
 * The stored form of submitted cover text: null to remove the cover ("" or
 * only spaces), the normalized cover, or undefined when it is not allowed.
 */
export function normalizeCoverInput(value: string | null): string | null | undefined {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = parseArtifactCover(trimmed);
  return parsed ? storedCover(parsed) : undefined;
}

/** The error an invalid cover gets, written for the person or agent who sent it. */
export const COVER_RULE_MESSAGE = `Use a gradient id (one of: ${coverGradientIdList()}) or "file:<file id>" for an uploaded image. Remote URLs are not accepted. Send null or "" to remove the cover.`;

/**
 * Validates and normalizes a cover at a boundary. Accepts a gradient id,
 * `file:<uuid>` with an optional `@<0-100>` focal point, or null / ""
 * (remove). Outputs the stored form.
 */
export const artifactCoverInputSchema = z
  .union([z.string().max(artifactCoverLimits.maxInputLength, COVER_RULE_MESSAGE), z.null()])
  .transform((value, context) => {
    const normalized = normalizeCoverInput(value);
    if (normalized !== undefined) return normalized;
    context.addIssue({ code: "custom", message: COVER_RULE_MESSAGE });
    return z.NEVER;
  });

/** The uploaded file a cover shows, or null for a gradient and no cover. */
export function coverFileId(cover: string | null | undefined): string | null {
  const parsed = parseArtifactCover(cover);
  return parsed?.type === "image" ? parsed.fileId : null;
}

/** The same image cover with another focal point; gradients and no cover come back unchanged. */
export function withCoverPosition(cover: string | null, position: number): string | null {
  const parsed = parseArtifactCover(cover);
  if (parsed?.type !== "image") return cover;
  return storedCover({ ...parsed, position });
}

/** A short, plain name for a cover, for labels, diffs, and the Markdown version. Never a file URL. */
export function coverLabel(cover: string | null | undefined): string {
  const parsed = parseArtifactCover(cover);
  if (!parsed) return "No cover";
  if (parsed.type === "gradient") return parsed.gradient.name;
  return parsed.position === DEFAULT_COVER_POSITION ? "Image" : `Image (focus ${String(parsed.position)}%)`;
}

/** How an agent sees a cover: the value it can send back, and the image's focal point (null for gradients and no cover). */
export function mcpCoverFields(cover: string | null): { cover: string | null; coverPosition: number | null } {
  const parsed = parseArtifactCover(cover);
  if (!parsed) return { cover: null, coverPosition: null };
  if (parsed.type === "gradient") return { cover: parsed.gradient.id, coverPosition: null };
  return { cover: `${FILE_PREFIX}${parsed.fileId}`, coverPosition: parsed.position };
}

/** What resolveCoverChange decided: the stored cover to save (undefined keeps it), or why it cannot. */
export type CoverChange = { ok: true; cover: string | null | undefined } | { ok: false; message: string };

const POSITION_WITHOUT_IMAGE = "coverPosition only applies to an image cover. Set cover to \"file:<file id>\" in the same call, or leave coverPosition out.";

/**
 * Combines an agent's `cover` and `coverPosition` into the stored cover.
 * `cover` undefined keeps the current one; null or "" removes it. A position
 * alone moves the focal point of the current image cover.
 */
export function resolveCoverChange(cover: string | null | undefined, position: number | undefined, current: string | null): CoverChange {
  const next = cover === undefined ? undefined : normalizeCoverInput(cover);
  if (next === undefined && cover !== undefined) return { ok: false, message: COVER_RULE_MESSAGE };
  if (position === undefined) return { ok: true, cover: next };
  const base = next === undefined ? current : next;
  if (coverFileId(base) === null) return { ok: false, message: POSITION_WITHOUT_IMAGE };
  return { ok: true, cover: withCoverPosition(base, position) };
}

/** What covers_list-style results show for each gradient. */
export function coverGradientSummaries(): { id: string; name: string }[] {
  return coverGradients.map(({ id, name }) => ({ id, name }));
}

/** The field description agents read on artifacts_create and artifacts_update. */
export const COVER_FIELD_DESCRIPTION = `Optional slim cover banner above the artifact. A gradient id (one of: ${coverGradientIdList()}; they follow the artifact's theme and the reader's light or dark mode), or "file:<file id>" for your own image: upload a PNG, JPEG, GIF, WebP, or AVIF of at most 2 MB (files_request_upload, PUT, files_finalize) and pass its id. Prefer a JPEG (or a PNG) about 2400 px wide or less: link previews draw only JPEG and PNG covers; it is attached to this artifact on save. SVG and remote URLs are not accepted. On update, null or "" removes the cover; leave it out to keep it. Cover changes follow the same approval rule as title changes.`;

/** The field description for the focal point. */
export const COVER_POSITION_DESCRIPTION = "For an image cover: the vertical focal point, 0 (top) to 100 (bottom); 50 centres it. Sent alone on update, it moves the current image cover.";
