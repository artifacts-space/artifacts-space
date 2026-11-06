/**
 * Every rate limit in one place. Counts are per key (a user, a token, a team,
 * or a hashed network address for signed-out visitors) per window. Limits are
 * runaway-only: generous for real work (about one request a second for a
 * person), and they stop runaway agents and scripted abuse. Never ration.
 */
const hour = 3600;
const day = 86_400;

export const rateLimits = {
  /** New artifacts per user per hour, from the web app and MCP together. */
  artifactCreate: { limit: 120, windowSeconds: hour },
  /** Artifact edits (content, fields, or attached files) per user per hour, from the web app and MCP together. */
  artifactUpdate: { limit: 1200, windowSeconds: hour },
  /** Artifact edits per MCP token per hour, so one runaway agent leaves room for the person's other agents. */
  artifactUpdateByToken: { limit: 600, windowSeconds: hour },
  /** Reads (MCP read tools and opening artifacts in the workspace) per user per hour. */
  readByUser: { limit: 3600, windowSeconds: hour },
  /** MCP read tool calls per token per hour. */
  readByToken: { limit: 1800, windowSeconds: hour },
  /** File views and downloads (/api/files) per network address per hour. */
  fileDownloadByNetwork: { limit: 3600, windowSeconds: hour },
  /** Artifact page views (/artifact/<id>) per network address per hour. */
  artifactPageByNetwork: { limit: 1800, windowSeconds: hour },
  /** Sharing changes per user per hour (making an artifact private is never limited). */
  sharingRequest: { limit: 30, windowSeconds: hour },
  /** Reports per signed-in user per hour. */
  reportByUser: { limit: 10, windowSeconds: hour },
  /** Reports per network address per hour, signed in or not. */
  reportByNetwork: { limit: 5, windowSeconds: hour },
  /** Started file uploads per user per hour, from the web app and MCP together. */
  fileUpload: { limit: 200, windowSeconds: hour },
  /** Comments per agent per minute and per hour. Agents are stricter, to stop runaway loops. */
  agentCommentMinute: { limit: 6, windowSeconds: 60 },
  agentCommentHour: { limit: 60, windowSeconds: hour },
  /** Comments per person per minute and per hour. */
  personCommentMinute: { limit: 20, windowSeconds: 60 },
  personCommentHour: { limit: 300, windowSeconds: hour },
  /** Team invitations per inviting person per hour and per day, and per team per day. Each one sends an email. */
  teamInviteByUserHour: { limit: 20, windowSeconds: hour },
  teamInviteByUserDay: { limit: 50, windowSeconds: day },
  teamInviteByTeamDay: { limit: 100, windowSeconds: day },
  /** Sign-in links per network address and per email address per hour. Each one sends an email. */
  magicLinkByNetwork: { limit: 10, windowSeconds: hour },
  magicLinkByEmail: { limit: 5, windowSeconds: hour },
  /** New teams, agents, and access tokens per person per hour. Each agent gets its own limits, so agents are capped too. */
  teamCreate: { limit: 10, windowSeconds: hour },
  agentCreate: { limit: 20, windowSeconds: hour },
  tokenCreate: { limit: 30, windowSeconds: hour },
  /** MCP app registrations (OAuth dynamic client registration) per network address per hour. */
  oauthRegister: { limit: 20, windowSeconds: hour },
  /** OAuth authorization requests per network address per hour. */
  oauthAuthorize: { limit: 60, windowSeconds: hour },
  /** OAuth token requests (code exchanges and refreshes) per network address per hour. */
  oauthToken: { limit: 300, windowSeconds: hour },
} as const satisfies Record<string, { limit: number; windowSeconds: number }>;

export type RateLimitName = keyof typeof rateLimits;

/** What each limit protects, in words for the error message. */
export const rateLimitMessages: Record<RateLimitName, string> = {
  artifactCreate: "You have created a lot of artifacts in the last hour.",
  artifactUpdate: "You have changed artifacts a lot in the last hour.",
  artifactUpdateByToken: "This connection has changed artifacts a lot in the last hour.",
  readByUser: "You have read a lot of artifacts in the last hour.",
  readByToken: "This connection has read a lot in the last hour.",
  fileDownloadByNetwork: "Your network has opened a lot of files in the last hour.",
  artifactPageByNetwork: "Your network has opened a lot of artifact pages in the last hour.",
  sharingRequest: "You have changed sharing a lot in the last hour.",
  reportByUser: "You have sent a lot of reports in the last hour.",
  reportByNetwork: "We have received a lot of reports from your network in the last hour.",
  fileUpload: "You have uploaded a lot of files in the last hour.",
  agentCommentMinute: "You have posted a lot of comments in the last minute.",
  agentCommentHour: "You have posted a lot of comments in the last hour.",
  personCommentMinute: "You have posted a lot of comments in the last minute.",
  personCommentHour: "You have posted a lot of comments in the last hour.",
  teamInviteByUserHour: "You have sent a lot of invitations in the last hour.",
  teamInviteByUserDay: "You have sent a lot of invitations today.",
  teamInviteByTeamDay: "This team has sent a lot of invitations today.",
  magicLinkByNetwork: "Your network has asked for a lot of sign-in links in the last hour.",
  magicLinkByEmail: "This email address has asked for a lot of sign-in links in the last hour.",
  teamCreate: "You have created a lot of teams in the last hour.",
  agentCreate: "You have added a lot of agents in the last hour.",
  tokenCreate: "You have created a lot of access tokens in the last hour.",
  oauthRegister: "Your network has registered a lot of apps in the last hour.",
  oauthAuthorize: "Your network has started a lot of app connections in the last hour.",
  oauthToken: "Your network has asked for a lot of access tokens in the last hour.",
};
