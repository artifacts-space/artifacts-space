/*
 * Which parts of the component gallery a page draws. The whole gallery takes
 * many seconds to draw and hydrate, so an e2e test that checks one specimen
 * asks for only the groups or specimens it reads:
 *
 *   /dev/components?show=Input                      the Input group, whole
 *   /dev/components?show=specs/Sign-in screen       one specimen of a group
 *   /dev/components?show=Input&show=specs/Sign-in screen
 *
 * Each `show` value is a group id (the section's id), optionally followed by
 * "/" and one specimen's name. The name is everything after the first "/",
 * so a name may hold a slash itself. With no `show`, the page draws all of it.
 */

/** What the page draws: null for everything, or, per group id, null for the whole group or the names of the specimens it keeps. */
export type GalleryFilter = ReadonlyMap<string, ReadonlySet<string> | null> | null;

function addShown(shown: Map<string, Set<string> | null>, value: string) {
  const slash = value.indexOf("/");
  const group = (slash === -1 ? value : value.slice(0, slash)).trim();
  if (group === "") return;
  if (slash === -1) {
    shown.set(group, null);
    return;
  }
  const name = value.slice(slash + 1).trim();
  const names = shown.get(group);
  // A whole group already asked for stays whole.
  if (names === null) return;
  if (name === "") {
    shown.set(group, null);
    return;
  }
  shown.set(group, new Set([...(names ?? []), name]));
}

/**
 * Reads the gallery's `show` search parameter (one value or several) into a
 * filter. Blank values are ignored; with none left, the whole gallery shows.
 */
export function parseGalleryFilter(show: string | readonly string[] | undefined): GalleryFilter {
  const values = typeof show === "string" ? [show] : (show ?? []);
  const shown = new Map<string, Set<string> | null>();
  for (const value of values) addShown(shown, value);
  return shown.size === 0 ? null : shown;
}

/** Whether the page draws any part of the group with this id. */
export function showsGroup(filter: GalleryFilter, group: string): boolean {
  return filter === null || filter.has(group);
}

/** Whether the page draws the named specimen of a group. */
export function showsSpecimen(filter: GalleryFilter, group: string, name: string): boolean {
  if (filter === null) return true;
  const names = filter.get(group);
  if (names === undefined) return false;
  return names === null || names.has(name);
}
