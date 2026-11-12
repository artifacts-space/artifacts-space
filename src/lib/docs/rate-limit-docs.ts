import { rateLimitMessages, rateLimits, type RateLimitName } from "@/lib/abuse/limits";
import { rateLimitMessage } from "@/lib/abuse/rate-limit";

/**
 * Where each rate limit applies and how a refusal arrives, for the Limits
 * and MCP pages. Numbers and messages come from src/lib/abuse/limits.ts;
 * the Record type makes a new limit fail the typecheck until it is placed here.
 */

/** How a client sees a refusal. */
export type RefusalShape = "mcp-429" | "tool-error" | "http-429" | "form" | "not-counted";

interface LimitPlacement {
  /** Who is counted: a user, a token, a team, or a network address. */
  per: "user" | "token" | "team" | "network" | "email address" | "connection";
  /** Where the limit is checked, in words. */
  where: string;
  refusal: RefusalShape;
  group: "MCP and artifacts" | "Files and pages" | "Comments" | "Teams and accounts" | "Sign-in and OAuth";
}

export const rateLimitPlacements: Record<RateLimitName, LimitPlacement> = {
  readByToken: { per: "token", where: "Every MCP read tool call", refusal: "mcp-429", group: "MCP and artifacts" },
  readByUser: { per: "user", where: "MCP read tool calls and opening artifacts in the workspace", refusal: "mcp-429", group: "MCP and artifacts" },
  artifactUpdateByToken: { per: "token", where: "artifacts_update, artifacts_restore_version, files_attach, files_replace", refusal: "mcp-429", group: "MCP and artifacts" },
  artifactCreate: { per: "user", where: "artifacts_create, files_create_artifact, and the web app", refusal: "tool-error", group: "MCP and artifacts" },
  artifactUpdate: { per: "user", where: "Every artifact edit, from MCP and the web app, except web autosaves that continue an editing session", refusal: "tool-error", group: "MCP and artifacts" },
  artifactAutosave: { per: "user", where: "Web editor autosaves that continue an editing session (the editor sends at most one every 5 seconds)", refusal: "form", group: "MCP and artifacts" },
  organize: { per: "user", where: "Project and tag changes, from MCP and the web app", refusal: "tool-error", group: "MCP and artifacts" },
  clientInfoRecord: { per: "user", where: "Storing what an MCP client says it is on initialize (over the limit it is not stored; the request still runs)", refusal: "not-counted", group: "MCP and artifacts" },
  editLease: { per: "user", where: "The web editor's \"I'm editing\" signal while you type, which keeps agents from overwriting your typing", refusal: "not-counted", group: "MCP and artifacts" },
  harnessChoice: { per: "user", where: "Changing an artifact's \"Made with\" agent or a connection's agent in the web app", refusal: "form", group: "MCP and artifacts" },
  sharingRequest: { per: "user", where: "Sharing and comments-setting changes (making private is never limited)", refusal: "tool-error", group: "MCP and artifacts" },
  fileUpload: { per: "user", where: "files_request_upload and web uploads", refusal: "tool-error", group: "Files and pages" },
  fileDownloadByNetwork: { per: "network", where: "/api/files views and downloads", refusal: "http-429", group: "Files and pages" },
  fileRequestByNetwork: { per: "network", where: "Every /api/files request: views, downloads, and video and audio playback (seeks and later parts)", refusal: "http-429", group: "Files and pages" },
  fileRangeByNetworkFile: { per: "network", where: "/api/files playback of one file: seeks and later parts", refusal: "http-429", group: "Files and pages" },
  teamIconByUser: { per: "user", where: "/api/teams/<id>/icon team icon views (browsers keep each icon for a day)", refusal: "http-429", group: "Files and pages" },
  teamIconByNetwork: { per: "network", where: "/api/teams/<id>/icon team icon views", refusal: "http-429", group: "Files and pages" },
  artifactPageByNetwork: { per: "network", where: "/artifact/<id> pages", refusal: "http-429", group: "Files and pages" },
  viewByNetwork: { per: "network", where: "Counted views of public artifact pages", refusal: "not-counted", group: "Files and pages" },
  viewByNetworkArtifact: { per: "network", where: "Counted views of one public artifact page", refusal: "not-counted", group: "Files and pages" },
  ogImageByNetwork: { per: "network", where: "Artifact preview images (cache misses only)", refusal: "http-429", group: "Files and pages" },
  reportByUser: { per: "user", where: "Reports from signed-in readers", refusal: "form", group: "Files and pages" },
  reportByNetwork: { per: "network", where: "Reports, signed in or not", refusal: "form", group: "Files and pages" },
  reportByNetworkDay: { per: "network", where: "Reports, signed in or not, each day", refusal: "form", group: "Files and pages" },
  reportByNetworkArtifact: { per: "network", where: "Reports about one artifact, signed in or not", refusal: "form", group: "Files and pages" },
  agentCommentMinute: { per: "user", where: "Comments by an agent", refusal: "tool-error", group: "Comments" },
  agentCommentHour: { per: "user", where: "Comments by an agent", refusal: "tool-error", group: "Comments" },
  personCommentMinute: { per: "user", where: "Comments by a person", refusal: "form", group: "Comments" },
  personCommentHour: { per: "user", where: "Comments by a person", refusal: "form", group: "Comments" },
  commentResolveMinute: { per: "user", where: "Resolving or reopening a comment thread", refusal: "form", group: "Comments" },
  commentResolveHour: { per: "user", where: "Resolving or reopening a comment thread", refusal: "form", group: "Comments" },
  teamInviteByUserHour: { per: "user", where: "Team invitations sent", refusal: "form", group: "Teams and accounts" },
  teamInviteByUserDay: { per: "user", where: "Team invitations sent", refusal: "form", group: "Teams and accounts" },
  teamInviteByTeamDay: { per: "team", where: "Team invitations sent", refusal: "form", group: "Teams and accounts" },
  teamCreate: { per: "user", where: "New teams", refusal: "form", group: "Teams and accounts" },
  agentCreate: { per: "user", where: "New agent teammates", refusal: "form", group: "Teams and accounts" },
  tokenCreate: { per: "user", where: "New access tokens", refusal: "form", group: "Teams and accounts" },
  feedbackByUser: { per: "user", where: "\"Something's not working\" reports from the account menu", refusal: "form", group: "Teams and accounts" },
  pushDevice: { per: "user", where: "Turning on browser notifications in Settings", refusal: "form", group: "Teams and accounts" },
  pushTest: { per: "user", where: "Send a test notification in Settings", refusal: "form", group: "Teams and accounts" },
  magicLinkByNetworkMinute: { per: "network", where: "Sign-in links, in a burst", refusal: "http-429", group: "Sign-in and OAuth" },
  magicLinkByNetwork: { per: "network", where: "Sign-in links", refusal: "http-429", group: "Sign-in and OAuth" },
  magicLinkByNetworkDay: { per: "network", where: "Sign-in links, each day", refusal: "http-429", group: "Sign-in and OAuth" },
  magicLinkByEmailMinute: { per: "email address", where: "Sign-in links, from any network", refusal: "http-429", group: "Sign-in and OAuth" },
  magicLinkByEmail: { per: "email address", where: "Sign-in links, from any network", refusal: "http-429", group: "Sign-in and OAuth" },
  oauthRegister: { per: "network", where: "OAuth app registration (MCP clients)", refusal: "http-429", group: "Sign-in and OAuth" },
  oauthAuthorize: { per: "network", where: "OAuth authorization requests", refusal: "http-429", group: "Sign-in and OAuth" },
  oauthToken: { per: "network", where: "Every OAuth token request: a load backstop, high so hosted apps that serve many people from one address are not slowed", refusal: "http-429", group: "Sign-in and OAuth" },
  oauthTokenFailuresByNetwork: { per: "network", where: "Failed OAuth token requests (only failures count); over it, requests without a currently valid code or refresh token wait, and valid ones still go through", refusal: "http-429", group: "Sign-in and OAuth" },
  oauthRefreshByConnection: { per: "connection", where: "Successful OAuth refreshes for one person and one app, from any network", refusal: "http-429", group: "Sign-in and OAuth" },
};

/** One row of the rate limit table. */
export interface RateLimitRow extends LimitPlacement {
  name: RateLimitName;
  limit: number;
  window: string;
  message: string;
}

/** The window in words: "minute", "15 minutes", "hour", or "day". */
export function windowText(seconds: number): string {
  if (seconds === 60) return "minute";
  if (seconds === 3600) return "hour";
  if (seconds === 86_400) return "day";
  if (seconds % 60 === 0 && seconds < 3600) return `${String(seconds / 60)} minutes`;
  return `${String(seconds)} s`;
}

/** Every limit with its number, window, placement, and real message. */
export function rateLimitRows(): RateLimitRow[] {
  return (Object.keys(rateLimits) as RateLimitName[]).map((name) => ({
    name,
    limit: rateLimits[name].limit,
    window: windowText(rateLimits[name].windowSeconds),
    message: rateLimitMessages[name],
    ...rateLimitPlacements[name],
  }));
}

/** A refusal message exactly as the server writes it, for a wait of `seconds`. */
export function sampleRefusal(name: RateLimitName, seconds: number): string {
  return rateLimitMessage(name, seconds);
}
