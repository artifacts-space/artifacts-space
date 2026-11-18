/*
 * An entry's name in a zip is data a stranger wrote. It becomes a name a
 * drop can carry only when it is readable UTF-8 text with no control
 * characters, stays inside the zip's own folder (no leading slash, no drive
 * letter, no `..` part), and is not absurdly long. Backslashes, which some
 * tools write between folders, are read as slashes before those checks, so
 * `..\x` is refused like `../x`. Everything else about the path is for the
 * page path rules to judge, as for a dropped folder.
 *
 * Pure, safe for the server and the browser.
 */

/** Why an entry's name cannot be used. */
export type ZipNameProblem = "unreadable-name" | "unsafe-name" | "long-name";

/** An entry's name made usable, or why it cannot be, with a form of it that is safe to show as text. */
export type ZipEntryName = { ok: true; name: string } | { ok: false; problem: ZipNameProblem; shown: string };

/** Longest name read from a zip, in characters: well past the longest page path, so a name a little too long still gets a path to fix. */
export const maxZipNameLength = 512;

const strict = new TextDecoder("utf-8", { fatal: true });
const lenient = new TextDecoder("utf-8");
const controlCharacters = /[\u0000-\u001f\u007f]/;
const driveLetter = /^[a-z]:/i;

/** The name as text to show in a list, never used as a path: unreadable bytes and control characters become a replacement mark, cut to a short length. */
export function shownZipName(bytes: Uint8Array): string {
  return lenient.decode(bytes).replace(new RegExp(controlCharacters.source, "g"), "\ufffd").slice(0, 120);
}

function decoded(bytes: Uint8Array): string | null {
  try {
    return strict.decode(bytes);
  } catch {
    return null;
  }
}

/**
 * The usable name of an entry, from its bytes: slashes between folders, and
 * no part that leaves the zip's folder.
 */
export function zipEntryName(bytes: Uint8Array): ZipEntryName {
  const text = decoded(bytes);
  if (text === null || controlCharacters.test(text)) return { ok: false, problem: "unreadable-name", shown: shownZipName(bytes) };
  const shown = text.slice(0, 120);
  if (text.length > maxZipNameLength) return { ok: false, problem: "long-name", shown };
  const name = text.replaceAll("\\", "/");
  if (name.startsWith("/") || driveLetter.test(name) || name.split("/").includes("..")) return { ok: false, problem: "unsafe-name", shown };
  return { ok: true, name };
}
