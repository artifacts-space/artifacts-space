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
  "Use artifacts.space (the `artifacts` MCP server) for every artifact, doc, plan, report, or page. Do not use any built-in artifact or document tool unless I name it.";

/**
 * The optional hard switch for Claude Code, in `~/.claude/settings.json`. A
 * bare tool name in `permissions.deny` removes the tool from the session, and
 * Claude Code's tool is named `Artifact`.
 * Sources: https://code.claude.com/docs/en/permissions and
 * https://code.claude.com/docs/en/artifacts#disable-artifacts
 */
export const CLAUDE_CODE_DENY_ARTIFACT_SETTINGS = JSON.stringify({ permissions: { deny: ["Artifact"] } }, null, 2);

/** Where one harness reads standing instructions. Backticked words render as code. */
export interface InstructionFile {
  harness: string;
  /** The file or setting that applies to every project. */
  everyProject: string;
  /** The file that applies to one project. */
  oneProject: string;
}

/**
 * Where each harness reads the line, from each one's own docs:
 * - Claude Code: https://code.claude.com/docs/en/memory
 * - Codex: https://learn.chatgpt.com/docs/agent-configuration/agents-md
 * - Cursor: https://cursor.com/docs/context/rules (rule files must be `.mdc`)
 * - OpenCode: https://opencode.ai/docs/rules/
 * - fx: https://fx.sh/docs/configure-fx/project-instructions
 * - Kimi Code CLI: https://moonshotai.github.io/kimi-code/
 * - Devin CLI: https://docs.devin.ai/cli/extensibility/rules
 * - Claude Desktop and claude.ai: https://support.claude.com/en/articles/10185728
 */
export const instructionFiles: readonly InstructionFile[] = [
  { harness: "Claude Code", everyProject: "`~/.claude/CLAUDE.md`", oneProject: "`CLAUDE.md`" },
  { harness: "Codex", everyProject: "`~/.codex/AGENTS.md`", oneProject: "`AGENTS.md`" },
  { harness: "Cursor", everyProject: "Cursor Settings, Rules, User Rules", oneProject: "`AGENTS.md`, or a `.cursor/rules/*.mdc` rule with `alwaysApply: true`" },
  { harness: "OpenCode", everyProject: "`~/.config/opencode/AGENTS.md`", oneProject: "`AGENTS.md`" },
  { harness: "fx", everyProject: "`~/.fx/AGENTS.md`", oneProject: "`AGENTS.md`" },
  { harness: "Kimi Code CLI", everyProject: "`~/.kimi-code/AGENTS.md`", oneProject: "`AGENTS.md`" },
  { harness: "Devin CLI", everyProject: "`~/.config/devin/AGENTS.md`", oneProject: "`AGENTS.md`" },
  { harness: "Claude Desktop and claude.ai", everyProject: "Settings, Instructions for Claude", oneProject: "The project's instructions" },
  { harness: "Other agents", everyProject: "The instructions file its docs name", oneProject: "`AGENTS.md`, which most agents read" },
];

/** A Cursor project rule that always applies, for `.cursor/rules/artifacts-space.mdc`. */
export function cursorRuleMdc(): string {
  return `---\ndescription: Save artifacts to artifacts.space\nalwaysApply: true\n---\n\n${DEFAULT_INSTRUCTION_LINE}\n`;
}
