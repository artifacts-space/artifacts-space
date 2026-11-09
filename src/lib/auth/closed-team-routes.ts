import { APIError, createAuthMiddleware } from "better-auth/api";

import { teamRoutesClosedOverHttp } from "./teams-plugin";

const closed = new Set(teamRoutesClosedOverHttp);

/**
 * Second lock on the team routes closed over HTTP: `disabledPaths` matches
 * the raw URL, and this matches the route Better Auth resolved, so another
 * spelling of the URL cannot reach them. In-process calls from our server
 * actions carry no request and pass.
 */
export const closedTeamRoutesHook = createAuthMiddleware((ctx) => {
  if (ctx.request && closed.has(ctx.path)) throw new APIError("NOT_FOUND", { message: "Not found" });
  return Promise.resolve();
});
