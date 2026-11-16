import { parseArtifactLinkSearch, type ArtifactLink } from "./app-link";
import { openArtifactLink } from "./app-link-rules";
import type { ArtifactListItemDto } from "./artifact-types";

/**
 * Pure rules for the /app address bar, which names the open artifact
 * (`?artifact=<publicId>`) so the page can be copied, bookmarked, reloaded,
 * and walked with Back and Forward. Every other query param (team, project,
 * tags, a fixture's switches) stays as it is. A link's `comments=1` and
 * `comment=<id>` are one-shot: they never survive a write. Client-safe.
 */

/** How the browser history takes a write: a new entry, or in place of the current one. */
export type UrlWriteMode = "push" | "replace";

/** A write to the address bar: the new query string (with its `?`, or empty) and how it goes in. */
export interface UrlWrite {
  mode: UrlWriteMode;
  search: string;
}

/**
 * Why the open artifact changed, for the address bar: the person opened it
 * (`push`, a history entry), the workspace fell back to its first artifact
 * with nothing chosen (`clear`, back to plain /app), or the address bar
 * already led (`null`: a link or Back, so the URL names it already).
 */
export type SelectionIntent = "push" | "clear" | null;

/** The artifact the query string names, or null when it names none or a malformed one. */
export function namedArtifact(search: string): string | null {
  return parseArtifactLinkSearch(new URLSearchParams(search))?.publicId ?? null;
}

/** A query string as the browser writes it: `?a=b`, or empty when there are no params. */
function asSearch(params: URLSearchParams): string {
  const text = params.toString();
  return text ? `?${text}` : "";
}

/**
 * The query string that names `publicId` (or no artifact, for null), with a
 * link's one-shot comment params dropped and every other param kept in
 * place. An artifact param already there keeps its position.
 */
export function searchNaming(search: string, publicId: string | null): string {
  const params = new URLSearchParams(search);
  params.delete("comments");
  params.delete("comment");
  if (publicId) params.set("artifact", publicId);
  else params.delete("artifact");
  return asSearch(params);
}

/** Whether `next` differs from `search` once both are read as params (so `?` alone and an empty string agree). */
function differs(search: string, next: string): boolean {
  return asSearch(new URLSearchParams(search)) !== next;
}

/**
 * What the address bar takes when the open artifact changes to `shown`
 * (its public id, or null when nothing is open). The person's own pick
 * pushes a history entry naming it; a fallback with nothing chosen (after a
 * delete, or an empty list) replaces the entry with plain /app; a change the
 * address bar led (a link, Back, Forward) writes nothing when the URL
 * already names it. Null when the address bar is already right.
 */
export function selectionUrlWrite(search: string, shown: string | null, intent: SelectionIntent): UrlWrite | null {
  if (intent === "push" && shown) {
    const next = searchNaming(search, shown);
    return differs(search, next) ? { mode: "push", search: next } : null;
  }
  const keep = intent === null && shown !== null && namedArtifact(search) === shown;
  const next = searchNaming(search, keep ? shown : null);
  return differs(search, next) ? { mode: "replace", search: next } : null;
}

/**
 * What a change of the address bar the workspace did not write opens (a link
 * from a notification, Back, Forward, a reload's first draw): the artifact
 * it names, from the list or as the server's copy pinned to the top
 * (`target`, what the server found for that link); a load when neither has
 * it (the server decides whether the viewer may still read it); `failed`
 * when the server could not check the link just now; and, for plain /app,
 * the artifact plain /app last showed (`plainShown`, chosen implicitly)
 * while the list holds it, else the first. `none` when plain /app meets an
 * empty list.
 */
export type AddressStep =
  | { kind: "open"; artifacts: ArtifactListItemDto[]; selectedId: string; publicId: string }
  | { kind: "load"; publicId: string }
  | { kind: "failed" }
  | { kind: "none" };

interface AddressInput {
  artifacts: ArtifactListItemDto[];
  /** The link the address bar holds, or null for plain /app. */
  link: ArtifactLink | null;
  target: ArtifactListItemDto | null;
  /** The server could not check the link just now. */
  failed: boolean;
  plainShown: string | null;
  /** Artifacts deleted in this visit: a server answer drawn before the delete (Back restores it) never brings one back. */
  deleted: ReadonlySet<string>;
}

/** The step a change of the address bar takes; see AddressStep. */
export function addressStep({ artifacts, link, target, failed, plainShown, deleted }: AddressInput): AddressStep {
  if (!link) {
    const shown = artifacts.find((artifact) => artifact.publicId === plainShown) ?? artifacts[0];
    return shown ? { kind: "open", artifacts, selectedId: shown.id, publicId: shown.publicId } : { kind: "none" };
  }
  const outcome = openArtifactLink(artifacts, link, target && !deleted.has(target.id) ? target : null);
  if (outcome.kind === "open") return { ...outcome, publicId: link.publicId };
  return failed ? { kind: "failed" } : { kind: "load", publicId: link.publicId };
}
