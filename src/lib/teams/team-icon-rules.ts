import { binaryMegabytes, decimalMegabytes } from "@/lib/format-bytes";

import { can, type TeamActor } from "./capability-rules";

/**
 * Rules for a team's icon: who may change it, which pictures it accepts,
 * and where it is stored. Pure and client-safe: the browser applies the
 * picked-file rules (type, and 2 MB before it shrinks the image), and the
 * server re-checks the uploaded bytes (PNG or WebP, square, size, 1 MB).
 */

/** Largest image a person may pick, in binary bytes (2 MB). The browser shrinks it before upload. */
export const TEAM_ICON_SOURCE_MAX_BYTES = 2_097_152;

/**
 * Largest upload the server accepts, in decimal bytes (1 MB). What arrives is a
 * 256 px square of a few dozen KB. It stays below Next's 1 MiB server
 * action body limit, with room for the form's own bytes, so an oversized
 * upload gets this app's message instead of the framework's. That limit is
 * Next's default (`serverActions.bodySizeLimit`, unset in next.config.ts):
 * if it ever changes, check this cap and its test again.
 */
export const TEAM_ICON_UPLOAD_MAX_BYTES = 1_000_000;

/** The picked-file limit as people read it ("2 MB"), for copy that states it. */
export const TEAM_ICON_SOURCE_LIMIT_LABEL = binaryMegabytes(TEAM_ICON_SOURCE_MAX_BYTES);

/** The refusal for an upload over the server's cap, derived from the cap so the two never drift. */
export const TEAM_ICON_TOO_LARGE = `The icon can be at most ${decimalMegabytes(TEAM_ICON_UPLOAD_MAX_BYTES)}.`;

/** The side of the square the browser draws the icon at, in pixels. */
export const TEAM_ICON_SIDE = 256;

/** Smallest side the server accepts, in pixels. */
export const TEAM_ICON_MIN_SIDE = 16;

/** What a person may pick. SVG is never allowed: it can carry script. */
export const teamIconSourceTypes: ReadonlySet<string> = new Set(["image/png", "image/jpeg", "image/webp"]);

/** The file picker's accept list. */
export const TEAM_ICON_ACCEPT = "image/png,image/jpeg,image/webp";

/** What the server stores: the browser re-encodes every pick as one of these. */
export type TeamIconType = "image/png" | "image/webp";

const extensions: Record<TeamIconType, string> = { "image/png": "png", "image/webp": "webp" };

/** The membership fields the capability rule needs. */
export type TeamIconManager = TeamActor & { personal: boolean };

/**
 * Whether this member may upload, replace, or remove the team's icon: a
 * person (never an agent's token) in a shared team whose role may change
 * team settings. Personal teams have no icon.
 */
export function canManageTeamIcon(member: TeamIconManager | null | undefined): boolean {
  if (!member || member.personal || member.kind !== "person") return false;
  return can(member, "settings.team");
}

/** Why a picked file cannot become the team icon, written for the person who picked it, or null when the browser should try. */
export function teamIconSourceProblem(file: { type: string; size: number }): string | null {
  if (!teamIconSourceTypes.has(file.type)) return "Pick a PNG, JPEG, or WebP image.";
  if (file.size === 0) return "That file is empty. Pick another image.";
  if (file.size > TEAM_ICON_SOURCE_MAX_BYTES) return `Pick an image of ${TEAM_ICON_SOURCE_LIMIT_LABEL} or less.`;
  return null;
}

/** The largest centered square inside a picture: where to cut it from. */
export function centerSquare(width: number, height: number): { x: number; y: number; side: number } {
  const side = Math.min(width, height);
  return { x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), side };
}

// --- Checking the uploaded bytes ------------------------------------------

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function uint32BE(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset] ?? 0) << 24) >>> 0) + ((bytes[offset + 1] ?? 0) << 16) + ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0);
}

function uint32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) + ((bytes[offset + 1] ?? 0) << 8) + ((bytes[offset + 2] ?? 0) << 16) + (((bytes[offset + 3] ?? 0) << 24) >>> 0);
}

function uint24LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) + ((bytes[offset + 1] ?? 0) << 8) + ((bytes[offset + 2] ?? 0) << 16);
}

/** A checked picture: its type and size in pixels. */
export interface TeamIconImage {
  type: TeamIconType;
  width: number;
  height: number;
}

/**
 * Reads a PNG's size by walking its chunks: a 13-byte IHDR first, IEND
 * last with nothing after it, and no animation (acTL). Null when the bytes
 * are not a well-formed still PNG. Chunk CRCs are not checked: they guard
 * against corruption, not forgery, and the browser that drew the icon
 * wrote them.
 */
export function readPng(bytes: Uint8Array): TeamIconImage | null {
  if (!pngSignature.every((value, index) => bytes[index] === value)) return null;
  if (uint32BE(bytes, 8) !== 13 || ascii(bytes, 12, 4) !== "IHDR") return null;
  const image: TeamIconImage = { type: "image/png", width: uint32BE(bytes, 16), height: uint32BE(bytes, 20) };
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = uint32BE(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    const end = offset + 12 + length;
    if (end > bytes.length || type === "acTL") return null;
    if (type === "IEND") return end === bytes.length ? image : null;
    offset = end;
  }
  return null;
}

function readVp8x(bytes: Uint8Array): { width: number; height: number } | null {
  const animated = ((bytes[20] ?? 0) & 0x02) !== 0;
  if (animated) return null;
  return { width: uint24LE(bytes, 24) + 1, height: uint24LE(bytes, 27) + 1 };
}

function readVp8l(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes[20] !== 0x2f) return null;
  const bits = uint32LE(bytes, 21);
  return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
}

function readVp8(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
  return { width: ((bytes[26] ?? 0) | ((bytes[27] ?? 0) << 8)) & 0x3fff, height: ((bytes[28] ?? 0) | ((bytes[29] ?? 0) << 8)) & 0x3fff };
}

const webpReaders: Record<string, (bytes: Uint8Array) => { width: number; height: number } | null> = { VP8X: readVp8x, VP8L: readVp8l, "VP8 ": readVp8 };

/**
 * Reads a WebP's size from its first chunk (VP8, VP8L, or VP8X). The RIFF
 * length must cover the file exactly, and animated WebP is refused. Null
 * when the bytes are not a still WebP.
 */
export function readWebp(bytes: Uint8Array): TeamIconImage | null {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return null;
  if (uint32LE(bytes, 4) + 8 !== bytes.length) return null;
  const reader = webpReaders[ascii(bytes, 12, 4)];
  const size = reader ? reader(bytes) : null;
  return size ? { type: "image/webp", ...size } : null;
}

/**
 * Checks an uploaded team icon by its bytes, never by its name or the type
 * the browser claims: a still PNG or WebP of at most 1 MB, square, between
 * 16 and 256 pixels a side. Returns the picture, or why it was refused.
 */
export function checkTeamIconBytes(bytes: Uint8Array): { ok: true; image: TeamIconImage } | { ok: false; error: string } {
  if (bytes.length === 0) return { ok: false, error: "That file is empty. Pick another image." };
  if (bytes.length > TEAM_ICON_UPLOAD_MAX_BYTES) return { ok: false, error: TEAM_ICON_TOO_LARGE };
  const image = readPng(bytes) ?? readWebp(bytes);
  if (!image) return { ok: false, error: "The icon must be a PNG or WebP image." };
  if (image.width !== image.height) return { ok: false, error: "The icon must be square." };
  if (image.width < TEAM_ICON_MIN_SIDE || image.width > TEAM_ICON_SIDE) return { ok: false, error: `The icon must be between ${String(TEAM_ICON_MIN_SIDE)} and ${String(TEAM_ICON_SIDE)} pixels wide.` };
  return { ok: true, image };
}

// --- Where icons live -----------------------------------------------------

const teamIdPattern = /^[A-Za-z0-9_-]{1,64}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const keyFile = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(png|webp)$/;

/**
 * The storage key for a new icon: team-icons/<team id>/<uuid>.<png|webp>.
 * The server makes the id; nothing in the key comes from the upload.
 */
export function teamIconKey(teamId: string, id: string, type: TeamIconType): string {
  if (!teamIdPattern.test(teamId) || !uuidPattern.test(id)) throw new Error("The icon key could not be built.");
  return `team-icons/${teamId}/${id}.${extensions[type]}`;
}

/**
 * What a stored key says, when it is an icon key of this team: its id and
 * type. Null for anything else, so a key from another team, a file key, or
 * a URL is never served or deleted as this team's icon.
 */
export function parseTeamIconKey(teamId: string, key: string | null | undefined): { id: string; type: TeamIconType } | null {
  if (!key || !teamIdPattern.test(teamId)) return null;
  const prefix = `team-icons/${teamId}/`;
  if (!key.startsWith(prefix)) return null;
  const match = keyFile.exec(key.slice(prefix.length));
  if (!match?.[1]) return null;
  return { id: match[1], type: match[2] === "webp" ? "image/webp" : "image/png" };
}

/**
 * The page URL that checks the viewer is in the team and redirects to a
 * short-lived link, or null when the team has no icon. The `v` changes with
 * every new icon, so browsers never show an old one.
 */
export function teamIconUrl(teamId: string, key: string | null | undefined): string | null {
  const parsed = parseTeamIconKey(teamId, key);
  if (!parsed) return null;
  return `/api/teams/${encodeURIComponent(teamId)}/icon?v=${parsed.id}`;
}

/**
 * The letter shown when a team has no icon: the first letter or digit of its
 * name, upper-cased without a locale, so the server and every browser draw
 * the same letter (a Turkish locale would turn "i" into "İ").
 */
export function teamMonogram(name: string): string {
  const match = /[\p{L}\p{N}]/u.exec(name);
  return match ? match[0].toUpperCase() : "T";
}
