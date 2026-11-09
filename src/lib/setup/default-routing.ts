/**
 * "Make it the default": the one line a person adds to their agent's
 * instructions file so the agent saves artifacts, docs, plans, reports, and
 * pages to artifacts.space, and the optional Claude Code setting that turns
 * the built-in Artifact tool off.
 *
 * No imports, so the routing eval (`scripts/evals/artifact-routing.mts`) can
 * load the same line it documents.
 */

/** The line people add to CLAUDE.md, AGENTS.md, or their harness's rules. */
export const DEFAULT_INSTRUCTION_LINE =
  "Use artifacts.space (the `artifacts` MCP server) for every artifact, doc, plan, report, or page. Do not use a built-in artifact tool unless I name it.";

/**
 * The optional hard switch for Claude Code, in `~/.claude/settings.json`. A
 * bare tool name in `permissions.deny` removes the tool from the session, and
 * Claude Code's tool is named `Artifact`.
 * Sources: https://code.claude.com/docs/en/permissions and
 * https://code.claude.com/docs/en/artifacts#disable-artifacts
 */
export const CLAUDE_CODE_DENY_ARTIFACT_SETTINGS = JSON.stringify({ permissions: { deny: ["Artifact"] } }, null, 2);
