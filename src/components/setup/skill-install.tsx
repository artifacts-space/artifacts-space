import { CommandSnippet } from "@/components/code/code-snippet";
import { SKILL_INSTALL_COMMAND, SKILL_INSTALL_STATUS } from "@/lib/setup/install-command";

const comingSoon = SKILL_INSTALL_STATUS === "coming-soon";

/**
 * The agent skill install command, shown next to the MCP setup. While the
 * skills repository is private it carries a "Coming soon" badge and says the
 * MCP connection works without it.
 */
export function SkillInstall({ intro }: { intro: string }) {
  return (
    <div className="grid min-w-0 gap-2.5">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-5 text-muted-foreground">
        {intro}
        {comingSoon ? <span className="rounded-sm border px-1.5 text-xs">Coming soon</span> : null}
      </p>
      <CommandSnippet command={SKILL_INSTALL_COMMAND} copyLabel="Copy skill command" />
      <p className="text-sm leading-5 text-muted-foreground">
        {comingSoon
          ? "The skill is not public yet. Your agent can use the MCP server without it."
          : "Run it in your project. It works with Claude Code, Cursor, Codex, and other agents."}
      </p>
    </div>
  );
}
