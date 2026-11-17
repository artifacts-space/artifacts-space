import { isPublicId } from "@/lib/public-id";

/*
 * What a person hands an agent when they say "this artifact": its
 * 22-character id, or more often its link, copied from the address bar,
 * the Share dialog, or a message. These rules read that value without a
 * database and without a request: a link is only ever taken apart as text,
 * never fetched, and only a link on this deployment's own host counts.
 *
 * Two older values are read as well, because people still hold them: the
 * artifact's internal id (a UUID), which the workspace's meta line copied
 * until it copied the link, and a legacy /share/<id> link. Both name a row
 * and nothing else: the caller resolves them through the same access check
 * as any read (src/lib/artifact-ref/resolve.ts).
 *
 * Pure and client-safe.
 */

/** What a value names, before any lookup. */
export type ArtifactRef =
  | { kind: "publicId"; publicId: string }
  /** The artifact's internal id, in lower case. */
  | { kind: "internalId"; id: string }
  /** The id of a legacy /share/<id> link. */
  | { kind: "shareId"; shareId: string };

/** Why a value names no artifact. */
export type ArtifactRefProblem = "empty" | "too-long" | "other-site" | "link-without-artifact" | "not-an-id";

export type ParsedArtifactRef = { ok: true; ref: ArtifactRef } | { ok: false; problem: ArtifactRefProblem };

/** Longer than any link the app gives out, a block link's quoted words included. */
export const ARTIFACT_REF_MAX_CHARS = 2048;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const shareIdPattern = /^[0-9a-f]{32}$/;
/** A value written as a link with a scheme: "https://…", or any other "<scheme>://". Words with a colon ("TODO: fix it") and "host:port/…" are not. */
const schemePattern = /^[a-z][a-z0-9+.-]*:\/\//i;
/** What people wrap a pasted link in: angle brackets, quotes, backticks, and the brackets of a Markdown link. */
const wrapping = /^[\s<>"'`([]+|[\s<>"'`)\].,;]+$/g;

/** True for the shape of an internal id (a UUID), in any letter case. */
export function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}

/** The value without the white space, brackets, and quotes around it. */
function unwrap(value: string): string {
  return value.replace(wrapping, "");
}

/** The host of an origin such as "https://artifacts.space", in lower case, with its port when it has one. */
function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * The value written out as a full link, or null when it is not written as
 * one. This site's host followed by a path ("artifacts.space/artifact/…",
 * "localhost:3000/artifact/…") is read first, so a host with a port is not
 * taken for a scheme; then a path on this site ("/artifact/…"); then a
 * value with a scheme and "//". Anything else is not a link: words that
 * hold a colon are refused as words, never as a link to another site.
 */
function writtenLink(value: string, host: string): string | null {
  const lower = value.toLowerCase();
  if (lower.startsWith(`${host}/`) || lower.startsWith(`${host}?`)) return `https://${value}`;
  if (value.startsWith("/")) return `https://${host}${value}`;
  return schemePattern.test(value) ? value : null;
}

/** The value as a URL when it is written as a link (see writtenLink). Null for anything else. */
function asLink(value: string, origin: string): URL | null {
  const host = hostOf(origin);
  const written = host ? writtenLink(value, host) : null;
  if (written === null) return null;
  try {
    return new URL(written);
  } catch {
    return null;
  }
}

/** The public id in the first path part after /artifact/: "<id>", or "<id>.md" for the Markdown version. */
function idInArtifactPath(parts: readonly string[]): string | null {
  const first = parts[1] ?? "";
  const id = first.endsWith(".md") ? first.slice(0, -3) : first;
  return isPublicId(id) ? id : null;
}

/** The artifact a workspace link names: /app?artifact=<id>, and no page under /app. */
function refInWorkspaceLink(url: URL, parts: readonly string[]): ArtifactRef | null {
  const publicId = url.searchParams.get("artifact") ?? "";
  return parts.length === 1 && isPublicId(publicId) ? { kind: "publicId", publicId } : null;
}

/** The share id a legacy /share/<id> link names. */
function refInShareLink(parts: readonly string[]): ArtifactRef | null {
  const shareId = parts[1] ?? "";
  return parts.length === 2 && shareIdPattern.test(shareId) ? { kind: "shareId", shareId } : null;
}

/** What a link on this site names: /artifact/<id> and everything under it, /app?artifact=<id>, or /share/<id>. */
function refInLink(url: URL): ArtifactRef | null {
  const parts = url.pathname.split("/").filter((part) => part !== "");
  if (parts[0] === "app") return refInWorkspaceLink(url, parts);
  if (parts[0] === "share") return refInShareLink(parts);
  if (parts[0] !== "artifact") return null;
  const publicId = idInArtifactPath(parts);
  return publicId ? { kind: "publicId", publicId } : null;
}

/** Reads a link: only http and https, and only on this deployment's host (either scheme), count. */
function parseLink(url: URL, origin: string): ParsedArtifactRef {
  const ours = (url.protocol === "https:" || url.protocol === "http:") && url.host.toLowerCase() === hostOf(origin);
  if (!ours) return { ok: false, problem: "other-site" };
  const ref = refInLink(url);
  return ref ? { ok: true, ref } : { ok: false, problem: "link-without-artifact" };
}

/**
 * Reads a value as an artifact reference: the 22-character id, the
 * artifact's link on `origin` (this deployment's own origin) in any form
 * the app gives out, or one of the two older values above. White space,
 * angle brackets, and quotes around it are ignored. Nothing is fetched and
 * nothing is looked up.
 */
export function parseArtifactRef(value: string, origin: string): ParsedArtifactRef {
  if (value.length > ARTIFACT_REF_MAX_CHARS) return { ok: false, problem: "too-long" };
  const text = unwrap(value);
  if (text === "") return { ok: false, problem: "empty" };
  if (isPublicId(text)) return { ok: true, ref: { kind: "publicId", publicId: text } };
  if (isUuid(text)) return { ok: true, ref: { kind: "internalId", id: text.toLowerCase() } };
  const link = asLink(text, origin);
  return link ? parseLink(link, origin) : { ok: false, problem: "not-an-id" };
}

/** How much of a refused value is repeated back. */
const SHOWN_CHARS = 24;

/**
 * A short, cleaned piece of a refused value, for the refusal: letters,
 * digits, and the few marks an id or a link holds, and never more than
 * SHOWN_CHARS of them. The value came from outside, so the refusal labels
 * it as untrusted text.
 */
export function shownPiece(value: string): string {
  const cleaned = unwrap(value).replace(/[^A-Za-z0-9._:/-]+/g, "");
  return cleaned.length > SHOWN_CHARS ? `${cleaned.slice(0, SHOWN_CHARS)}…` : cleaned;
}

/** What an artifact's link looks like on this deployment, for refusals and tool descriptions. */
export function artifactLinkShape(origin: string): string {
  return `${origin}/artifact/<22 characters>`;
}

/** The sentence every refusal ends with: the value, shortened and labelled. Nothing for a value with nothing to show. */
function given(value: string): string {
  const piece = shownPiece(value);
  return piece ? ` The value given (untrusted text, shortened): "${piece}".` : "";
}

const findByWords = "To find an artifact here by its title or words, use artifacts_list.";

const problemWords: Record<ArtifactRefProblem, (origin: string) => string> = {
  empty: (origin) => `Give the artifact's 22-character id or its link, such as ${artifactLinkShape(origin)}. ${findByWords}`,
  "too-long": (origin) => `This is too long to be an artifact's id or link. Give the 22-character id or the link, such as ${artifactLinkShape(origin)}.`,
  "other-site": (origin) =>
    `This link is to another site, so no tool here reads it. An artifact's link here looks like ${artifactLinkShape(origin)}. If the link came from another tool, that tool reads it. ${findByWords}`,
  "link-without-artifact": (origin) => `This link is on this site but names no artifact. An artifact's link looks like ${artifactLinkShape(origin)}. ${findByWords}`,
  "not-an-id": (origin) =>
    `This is not an artifact's id. An id here is 22 letters and digits, the last part of the artifact's link, such as ${artifactLinkShape(origin)}. If the value came from another tool's link, that tool reads it. ${findByWords}`,
};

/** The refusal for a value that names no artifact by its shape, written for an agent. */
export function artifactRefProblemMessage(problem: ArtifactRefProblem, value: string, origin: string): string {
  return `${problemWords[problem](origin)}${problem === "too-long" ? "" : given(value)}`;
}

/**
 * The refusal for an older value (an internal id or a legacy share link)
 * that leads to no artifact the caller can read. One sentence for "does not
 * exist" and "exists, but not for you": the caller must not learn which.
 */
export function unresolvedRefMessage(kind: "internalId" | "shareId", value: string, origin: string): string {
  const what = kind === "internalId" ? "No artifact you can read has this id. It looks like a UUID; an" : "This older share link leads to no artifact you can read. An";
  return `${what} artifact's id here is 22 letters and digits, the last part of its link, such as ${artifactLinkShape(origin)}. If the value came from another tool's link, that tool reads it. ${findByWords}${given(value)}`;
}
