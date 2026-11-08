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
  per: "user" | "token" | "team" | "network" | "email address";
  /** Where the limit is checked, in words. */
  where: string;
  refusal: RefusalShape;
  group: "MCP and artifacts" | "Files and pages" | "Comments" | "Teams and accounts" | "Sign-in and OAuth";
}

export const rateLimitPlacements: Record<RateLimitName, LimitPlacement> = {
  readByToken: { per: "token", where: "Every MCP read tool call", refusal: "mcp-429", group: "MCP and artifacts" },
  readByUser: { per: "user", where: "MCP read tool calls and opening artifacts in the workspace", refusal: "mcp-429", group: "MCP and artifacts" },
  artifactUpdateByToken: { per: "token", where: "artifacts_update, artifacts_restore_version, files_attach", refusal: "mcp-429", group: "MCP and artifacts" },
  artifactCreate: { per: "user", where: "artifacts_create, files_create_artifact, and the web app", refusal: "tool-error", group: "MCP and artifacts" },
  artifactUpdate: { per: "user", where: "Every artifact edit, from MCP and the web app", refusal: "tool-error", group: "MCP and artifacts" },
  organize: { per: "user", where: "Project and tag changes, from MCP and the web app", refusal: "tool-error", group: "MCP and artifacts" },
  sharingRequest: { per: "user", where: "Sharing and comments-setting changes (making private is never limited)", refusal: "tool-error", group: "MCP and artifacts" },
  fileUpload: { per: "user", where: "files_request_upload and web uploads", refusal: "tool-error", group: "Files and pages" },
  fileDownloadByNetwork: { per: "network", where: "/api/files views and downloads", refusal: "http-429", group: "Files and pages" },
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
  teamInviteByUserHour: { per: "user", where: "Team invitations sent", refusal: "form", group: "Teams and accounts" },
  teamInviteByUserDay: { per: "user", where: "Team invitations sent", refusal: "form", group: "Teams and accounts" },
  teamInviteByTeamDay: { per: "team", where: "Team invitations sent", refusal: "form", group: "Teams and accounts" },
  teamCreate: { per: "user", where: "New teams", refusal: "form", group: "Teams and accounts" },
  agentCreate: { per: "user", where: "New agent teammates", refusal: "form", group: "Teams and accounts" },
  tokenCreate: { per: "user", where: "New access tokens", refusal: "form", group: "Teams and accounts" },
  magicLinkByNetwork: { per: "network", where: "Sign-in links", refusal: "http-429", group: "Sign-in and OAuth" },
  magicLinkByNetworkDay: { per: "network", where: "Sign-in links, each day", refusal: "http-429", group: "Sign-in and OAuth" },
  magicLinkByEmail: { per: "email address", where: "Sign-in links", refusal: "http-429", group: "Sign-in and OAuth" },
  oauthRegister: { per: "network", where: "OAuth app registration (MCP clients)", refusal: "http-429", group: "Sign-in and OAuth" },
  oauthAuthorize: { per: "network", where: "OAuth authorization requests", refusal: "http-429", group: "Sign-in and OAuth" },
  oauthToken: { per: "network", where: "OAuth token requests and refreshes", refusal: "http-429", group: "Sign-in and OAuth" },
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
