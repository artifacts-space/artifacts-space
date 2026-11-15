import { tablerIconEntries, type TablerIconName } from "@/lib/artifact-icons";

/**
 * Icons an interface can show with the Icon component and on a Button: the
 * curated page icons (src/lib/artifact-icons.ts), the small marks a screen
 * needs (arrows, a menu, a close mark), and brand marks for social links and
 * sign-in buttons. Names are Tabler names; each has a component in
 * src/components/artifact-view/ui/icon-glyphs.ts.
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

/**
 * Brand marks, outline only and drawn in the text color. Every name starts
 * with `brand-`, so none can clash with a plain icon. Marks of document,
 * notes, and workspace tools stay out: they are in this product's own market.
 */
export const brandUiIconNames = [
  "brand-github",
  "brand-gitlab",
  "brand-x",
  "brand-linkedin",
  "brand-youtube",
  "brand-instagram",
  "brand-facebook",
  "brand-tiktok",
  "brand-discord",
  "brand-mastodon",
  "brand-bluesky",
  "brand-threads",
  "brand-reddit",
  "brand-twitch",
  "brand-dribbble",
  "brand-behance",
  "brand-medium",
  "brand-apple",
  "brand-google",
  "brand-windows",
  "brand-android",
] as const;

/** The name a screen reader hears for each brand mark: the network's or provider's own name. */
export const brandMarkLabels: Record<BrandUiIconName, string> = {
  "brand-github": "GitHub",
  "brand-gitlab": "GitLab",
  "brand-x": "X",
  "brand-linkedin": "LinkedIn",
  "brand-youtube": "YouTube",
  "brand-instagram": "Instagram",
  "brand-facebook": "Facebook",
  "brand-tiktok": "TikTok",
  "brand-discord": "Discord",
  "brand-mastodon": "Mastodon",
  "brand-bluesky": "Bluesky",
  "brand-threads": "Threads",
  "brand-reddit": "Reddit",
  "brand-twitch": "Twitch",
  "brand-dribbble": "Dribbble",
  "brand-behance": "Behance",
  "brand-medium": "Medium",
  "brand-apple": "Apple",
  "brand-google": "Google",
  "brand-windows": "Windows",
  "brand-android": "Android",
};

export type ExtraUiIconName = (typeof extraUiIconNames)[number];
export type BrandUiIconName = (typeof brandUiIconNames)[number];
export type UiIconName = TablerIconName | ExtraUiIconName | BrandUiIconName;

const pageIconNames: TablerIconName[] = tablerIconEntries.map((entry) => entry.name);

const allIconNames: UiIconName[] = [...pageIconNames, ...extraUiIconNames, ...brandUiIconNames];

/** Every icon name an interface may use: page icons, screen marks, then brand marks. */
export const uiIconNames = allIconNames as [UiIconName, ...UiIconName[]];

/** The plain icons (page icons and screen marks), without the brand marks. */
export const plainUiIconNames: UiIconName[] = [...pageIconNames, ...extraUiIconNames];
