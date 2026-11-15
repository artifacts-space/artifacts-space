import { tablerIconEntries, type TablerIconName } from "@/lib/artifact-icons";

/**
 * Icons an interface can show with the Icon component and on a Button: the
 * curated page icons (src/lib/artifact-icons.ts), plus the small marks a
 * screen needs (arrows, a menu, a close mark). Names are Tabler names; each
 * has a component in src/components/artifact-view/ui/icon-glyphs.ts.
 */

/** Screen marks that are not page icons. */
export const extraUiIconNames = [
  "arrow-right",
  "arrow-left",
  "arrow-up-right",
  "chevron-right",
  "chevron-left",
  "chevron-down",
  "chevron-up",
  "check",
  "x",
  "plus",
  "minus",
  "menu-2",
  "dots",
  "external-link",
  "download",
  "upload",
  "send",
  "player-play",
  "trash",
  "copy",
  "filter",
  "share",
  "bookmark",
  "tag",
  "at",
  "phone",
  "map-pin",
  "credit-card",
  "gift",
  "truck",
  "thumb-up",
  "login",
  "logout",
  "sun",
  "moon",
] as const;

export type ExtraUiIconName = (typeof extraUiIconNames)[number];
export type UiIconName = TablerIconName | ExtraUiIconName;

const pageIconNames: TablerIconName[] = tablerIconEntries.map((entry) => entry.name);

const allIconNames: UiIconName[] = [...pageIconNames, ...extraUiIconNames];

/** Every icon name an interface may use, page icons first. */
export const uiIconNames = allIconNames as [UiIconName, ...UiIconName[]];
