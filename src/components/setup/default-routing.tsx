import Link from "next/link";

import { CodeSnippet } from "@/components/code/code-snippet";
import { FactTable, InlineCodeText, Prose } from "@/components/docs/docs-content";
import { docsHref } from "@/lib/docs/pages";
import { CLAUDE_CODE_DENY_ARTIFACT_SETTINGS, cursorRuleMdc, DEFAULT_INSTRUCTION_LINE, instructionFiles } from "@/lib/setup/default-routing";

/**
 * "Make it the default": the line people add to their agent's instructions,
 * so artifacts, docs, plans, reports, and pages land in artifacts.space
 * instead of a built-in tool. `full` adds where each harness reads it and the
 * optional Claude Code switch, for the clients page.
 */
export function DefaultRoutingSteps({ full = false }: { full?: boolean }) {
  return (
    <>
      <Prose>
        <p>
          Some agents have their own way to make pages and docs, such as the Artifact tool in Claude Code. Add one line to your agent&apos;s instructions, and it saves to artifacts.space every time. You can still ask for the built-in tool by name.
        </p>
      </Prose>
      <CodeSnippet title="Add this line" code={DEFAULT_INSTRUCTION_LINE} wrap className="mt-4" />
      {full ? <DefaultRoutingDetails /> : (
        <Prose>
          <p>
            In Claude Code, put it in <code>~/.claude/CLAUDE.md</code> for every project, or in the project&apos;s <code>CLAUDE.md</code>. Other agents read <code>AGENTS.md</code>. See <Link href={docsHref("clients", "default")}>where each agent reads it</Link>.
          </p>
        </Prose>
      )}
    </>
  );
}

function DefaultRoutingDetails() {
  return (
    <>
      <FactTable
        head={["Agent", "Every project", "One project"]}
        mono={[]}
        rows={instructionFiles.map((file) => [file.harness, <InlineCodeText key="every" text={file.everyProject} />, <InlineCodeText key="one" text={file.oneProject} />])}
      />
      <Prose><p>In Cursor, a project rule needs <code>alwaysApply: true</code> so it loads in every chat:</p></Prose>
      <CodeSnippet title=".cursor/rules/artifacts-space.mdc" language="markdown" code={cursorRuleMdc()} className="mt-4" />
      <Prose>
        <p>
          To turn off Claude Code&apos;s own Artifact tool as well, add this to <code>~/.claude/settings.json</code>. The built-in tool stays off until you remove the rule.
        </p>
      </Prose>
      <CodeSnippet title="~/.claude/settings.json" language="json" code={CLAUDE_CODE_DENY_ARTIFACT_SETTINGS} className="mt-4" />
    </>
  );
}
