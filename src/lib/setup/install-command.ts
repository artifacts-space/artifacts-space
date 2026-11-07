/** The public GitHub repository that holds the artifacts.space agent skill. */
export const SKILLS_REPO = "artifacts-space/skills";

/**
 * The command that adds the artifacts.space agent skill to a project with the
 * skills.sh CLI. The skill teaches an agent when to save, update, and share
 * artifacts; the MCP server (see `mcp-config.ts`) is what gives it access.
 */
export const SKILL_INSTALL_COMMAND = `npx skills add ${SKILLS_REPO}`;

/** Whether people can run `SKILL_INSTALL_COMMAND` yet. */
export type SkillInstallStatus = "coming-soon" | "published";

/**
 * "published" since artifacts-space/skills went public. Set it back to
 * "coming-soon" only if the repository goes private again; the UI then marks
 * the command that way and points people to the MCP setup instead.
 */
export const SKILL_INSTALL_STATUS: SkillInstallStatus = "published";
