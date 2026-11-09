/**
 * Pure rules for the tabs on a team page. Each tab, and each view inside the
 * Shared artifacts tab, has its own URL (`?tab=artifacts&view=approval`), so
 * notifications and emails can open the right place. Client-safe.
 */

export const teamTabs = ["members", "permissions", "artifacts", "themes"] as const;
export type TeamTab = (typeof teamTabs)[number];

export const artifactViews = ["shared", "approval", "reports"] as const;
export type ArtifactView = (typeof artifactViews)[number];

/** What the viewer may see on this team page. */
export interface TeamTabAccess {
  /** A personal team has one member and no settings. */
  personal: boolean;
  /** The viewer approves sharing and edits here (an owner or admin of a shared team). */
  reviews: boolean;
  /** The viewer handles reader reports here (an owner or admin of any team). */
  reports: boolean;
}

/** The tab and the Shared artifacts view the page opens on. */
export interface TeamTabSelection {
  tab: TeamTab;
  view: ArtifactView;
}

export const teamTabLabels: Record<TeamTab, string> = {
  members: "Members",
  permissions: "Permissions",
  artifacts: "Shared artifacts",
  themes: "Themes",
};

export const artifactViewLabels: Record<ArtifactView, string> = {
  shared: "Shared",
  approval: "Needs approval",
  reports: "Reports",
};

/** The tabs the viewer sees, in order. Personal teams have no permissions or themes to show. */
export function availableTeamTabs(access: TeamTabAccess): TeamTab[] {
  return access.personal ? ["members", "artifacts"] : [...teamTabs];
}

/** The views inside Shared artifacts the viewer sees, in order. */
export function availableArtifactViews(access: TeamTabAccess): ArtifactView[] {
  const views: ArtifactView[] = ["shared"];
  if (access.reviews) views.push("approval");
  if (access.reports) views.push("reports");
  return views;
}

function single(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function pick<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return allowed.find((item) => item === value) ?? fallback;
}

/**
 * The selection in the search params. An unknown tab, or one the viewer
 * cannot see, opens Members; an unknown view opens Shared.
 */
export function parseTeamTabs(params: Record<string, string | string[] | undefined>, access: TeamTabAccess): TeamTabSelection {
  return {
    tab: pick(single(params.tab), availableTeamTabs(access), "members"),
    view: pick(single(params.view), availableArtifactViews(access), "shared"),
  };
}

/** The search string for a selection. The view is named only on the Shared artifacts tab, and only when it is not Shared. */
export function teamTabSearch(selection: TeamTabSelection): string {
  const params = new URLSearchParams({ tab: selection.tab });
  if (selection.tab === "artifacts" && selection.view !== "shared") params.set("view", selection.view);
  return `?${params.toString()}`;
}

/** The URL of a team page opened on a tab, for links from notifications and emails. */
export function teamTabHref(slug: string, tab: TeamTab, view: ArtifactView = "shared"): string {
  return `/teams/${encodeURIComponent(slug)}${teamTabSearch({ tab, view })}`;
}

/** Narrows a tab id from a UI event. */
export function isTeamTab(value: unknown): value is TeamTab {
  return typeof value === "string" && (teamTabs as readonly string[]).includes(value);
}

/** Narrows a view id from a UI event. */
export function isArtifactView(value: unknown): value is ArtifactView {
  return typeof value === "string" && (artifactViews as readonly string[]).includes(value);
}
