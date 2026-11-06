/**
 * Every rate limit in one place. Counts are per key (a user, or a hashed
 * network address for signed-out visitors) per window. Limits are generous
 * for real work and stop runaway agents and scripted abuse.
 */
export const rateLimits = {
  /** New artifacts per user per hour, from the web app and MCP together. */
  artifactCreate: { limit: 120, windowSeconds: 3600 },
  /** Sharing changes per user per hour (making an artifact private is never limited). */
  sharingRequest: { limit: 30, windowSeconds: 3600 },
  /** Reports per signed-in user per hour. */
  reportByUser: { limit: 10, windowSeconds: 3600 },
  /** Reports per network address per hour, signed in or not. */
  reportByNetwork: { limit: 5, windowSeconds: 3600 },
} as const satisfies Record<string, { limit: number; windowSeconds: number }>;

export type RateLimitName = keyof typeof rateLimits;

/** What each limit protects, in words for the error message. */
export const rateLimitMessages: Record<RateLimitName, string> = {
  artifactCreate: "You have created a lot of artifacts in the last hour.",
  sharingRequest: "You have changed sharing a lot in the last hour.",
  reportByUser: "You have sent a lot of reports in the last hour.",
  reportByNetwork: "We have received a lot of reports from your network in the last hour.",
};
