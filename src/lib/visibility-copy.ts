import type { ArtifactVisibility } from "@/lib/artifact-types";

/** How an artifact's page describes who can read it. */
export interface VisibilityCopy {
  /** The short label in the page header, beside its icon: "Private", "Team", "Link", "Public". */
  label: string;
  /** Whether the full sentence names who shared it. A private artifact is the reader's own. */
  showAuthor: boolean;
  /** Who can see it, the full sentence's last part. */
  note: string;
  /** Whether the page invites readers to make their own workspace. Only outside readers need that. */
  showSignUp: boolean;
}

const USER_CONTENT = "This is user-shared content; artifacts.space does not review it.";

/**
 * Honest labels for each visibility. Private: only the author can open the
 * page, so it says so. Team: only team members. Link and public: anyone with
 * the link, or anyone at all, may read it, so the page keeps the
 * user-content notice.
 */
export function visibilityCopy(visibility: ArtifactVisibility): VisibilityCopy {
  switch (visibility) {
    case "private":
      return { label: "Private", showAuthor: false, note: "Only you can see this.", showSignUp: false };
    case "team":
      return { label: "Team", showAuthor: true, note: "Only team members can see this.", showSignUp: false };
    case "link":
      return { label: "Link", showAuthor: true, note: `Anyone with the link can see this. ${USER_CONTENT}`, showSignUp: true };
    default:
      return { label: "Public", showAuthor: true, note: `Anyone can see this. ${USER_CONTENT}`, showSignUp: true };
  }
}

/** Who shared an artifact, for the full visibility sentence. */
export interface VisibilityByline {
  author: string;
  teamName: string | null;
}

/**
 * The full visibility sentence: the label, who shared it when that is not the
 * reader, and who can see it. "Private. Only you can see this." or "Team.
 * Shared by Dana in Platform. Only team members can see this." It is the
 * header label's tooltip and accessible name.
 */
export function visibilitySentence(copy: VisibilityCopy, byline: VisibilityByline | null = null): string {
  const shared = copy.showAuthor && byline ? `Shared by ${byline.author}${byline.teamName ? ` in ${byline.teamName}` : ""}. ` : "";
  return `${copy.label}. ${shared}${copy.note}`;
}
