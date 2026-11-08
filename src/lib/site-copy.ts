/*
 * Site copy the owner edits by hand. The Open Graph image (src/app/opengraph-image.tsx)
 * reads these, so a change here ships a new social preview on the next deploy.
 */

/** The headline on the site's social preview image. Keep it to about 60 characters. */
export const OG_HEADLINE = "The human context layer for coding agents.";

/** The wordmark next to the planet logo on every social preview image. */
export const OG_WORDMARK = "artifacts.space";

/** The site's meta description, and the description in link previews of the site and of shared artifacts. Keep it under 160 characters. */
export const OG_DESCRIPTION = 
  "Context for people who work with coding agents. Agents save plans, decisions, and reviews as artifacts. You read, comment, and share. Any agent, any account.";

/** The public source repository, linked from the site headers. */
export const REPO_URL = "https://github.com/artifacts-space/artifacts-space";
