/** The stub account for local development. It signs in without an inbox. */
export const devUser = {
  email: "dev@artifacts.space",
  name: "Dev User",
} as const;

/** Dev sign-in works only under `next dev`, never in a build or on Vercel. */
export const isDevSignInEnabled = process.env.NODE_ENV === "development";
