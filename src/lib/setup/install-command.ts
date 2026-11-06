/**
 * The one command that sets up a coding agent for artifacts.space: it adds
 * the MCP server and asks for the access token.
 *
 * TODO: the `artifacts-space` CLI and its agent skill are not published to
 * npm yet, so this command does not work. When the package ships, keep the
 * command here in sync with it and set `SETUP_COMMAND_STATUS` to "published" so
 * the token dialog stops showing "Coming soon".
 */
export const SETUP_COMMAND = "npx artifacts-space@latest setup";

/** Whether people can run `SETUP_COMMAND` yet. */
export type SetupCommandStatus = "coming-soon" | "published";

/** "coming-soon" until the setup CLI is on npm; the UI marks the command that way. */
export const SETUP_COMMAND_STATUS: SetupCommandStatus = "coming-soon";
