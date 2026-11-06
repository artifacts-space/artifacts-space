import type { ArtifactVisibility } from "@/lib/artifact-types";

/** How an artifact's page describes who can read it. */
export interface VisibilityCopy {
  /** The label above the title, before the kind: "Private · ui". */
  kicker: string;
  /** Whether the notice names who shared it. A private artifact is the reader's own. */
  showAuthor: boolean;
  /** The notice's last sentence. */
  note: string;
  /** Whether the page invites readers to make their own workspace. Only outside readers need that. */
  showSignUp: boolean;
}

/**
 * Honest labels for each visibility. Private: only the author can open the
 * page, so it says so. Team: only team members. Link and public: anyone may
 * read it, so the page keeps the user-content notice.
 */
export function visibilityCopy(visibility: ArtifactVisibility): VisibilityCopy {
  switch (visibility) {
    case "private":
      return { kicker: "Private", showAuthor: false, note: "Private. Only you can see this.", showSignUp: false };
    case "team":
      return { kicker: "Team only", showAuthor: true, note: "Only team members can see this.", showSignUp: false };
    default:
      return { kicker: "Shared artifact", showAuthor: true, note: "This is user-shared content; artifacts.space does not review it.", showSignUp: true };
  }
}
