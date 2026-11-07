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
 * "coming-soon" while the skills repository is private; the UI marks the
 * command that way and points people to the MCP setup instead.
 *
 * TODO: flip when artifacts-space/skills is public: set this to "published".
 */
export const SKILL_INSTALL_STATUS: SkillInstallStatus = "coming-soon";
