import Link from "next/link";

import { CodeSnippet } from "@/components/code/code-snippet";
import { DocsH, Note, Prose } from "@/components/docs/docs-content";
import { RegistryPage } from "@/components/docs/docs-page";
import { docsMetadata } from "@/lib/docs/metadata";
import { docsHref } from "@/lib/docs/pages";
import { buildUiGuide } from "@/lib/ui/guide";

export const metadata = docsMetadata("json-render/prompting");

const prompt = `Make a ui artifact on artifacts.space for the Q3 reliability review.

1. Call artifacts_formats_guide with kind "ui" and follow it.
2. Use the incident data below. Lead with three Metrics (incidents,
   minutes down, mean time to recover) with change against Q2.
3. Add a stacked bar Chart of incidents per month by severity, and a
   Table of the five longest incidents.
4. Put the action items in a Checklist and the open risks in a Callout.
5. Keep it on one screen at a glance: Section, then a Grid of metrics.
6. Run artifacts_validate and fix every error before you save.
7. Save it with project "reliability" and summary in one sentence.

<paste the data here>`;

const agentsMd = `## artifacts.space
- Save plans, decisions, and reports as artifacts. Search with
  artifacts_list before you create one; update instead of duplicating.
- For dashboards and reports, use kind "ui": read
  artifacts_formats_guide (kind "ui") first, and run
  artifacts_validate before every save.
- Set project to the repository name and sessionId to this session.`;

/** The first lines of the real guide, to show what the agent gets back. */
const guidePreview = `${buildUiGuide().split("\n").slice(0, 12).join("\n")}\n…`;

/** How to ask an agent for a good ui artifact. */
export default function PromptingPage() {
  const page = "json-render/prompting" as const;
  return (
    <RegistryPage slug={page}>
      <DocsH page={page} id="guide" />
      <Prose>
        <p>
          The server carries its own manual. <code>artifacts_formats_guide</code> with <code>kind: &quot;ui&quot;</code> returns the rules, every component with its props (generated from the same catalog as the <Link href={docsHref("json-render/components")}>component pages</Link>), and a complete example. An agent that reads it first gets the format right far more often. Ask for it by name:
        </p>
      </Prose>
      <CodeSnippet title="artifacts_formats_guide · first lines" language="markdown" code={guidePreview} className="mt-4" />

      <DocsH page={page} id="prompt" />
      <Prose><p>Say what the page is for, which data goes where, and ask for validation. A prompt like this one works well:</p></Prose>
      <CodeSnippet title="Prompt" code={prompt} className="mt-4" />
      <Prose><p>To make it a habit in a repository, add a few lines to <code>AGENTS.md</code> or <code>CLAUDE.md</code>:</p></Prose>
      <CodeSnippet title="AGENTS.md" language="markdown" code={agentsMd} className="mt-4" />

      <DocsH page={page} id="habits" />
      <Prose>
        <ul>
          <li><strong>Lead with the answer.</strong> Metrics and a one-line Callout at the top; detail in Tabs or an Accordion below.</li>
          <li><strong>Pick the component that fits the data.</strong> Table for rows (up to 500), Chart for trends, KeyValue for settings, Steps for runbooks, Board for status, Calendar for dates.</li>
          <li><strong>Use formats, not strings.</strong> Send numbers with <code>format</code> and <code>currency</code> instead of &quot;$1.2M&quot; text, so axes, tables, and the data view stay exact.</li>
          <li><strong>Use short, readable keys</strong> such as <code>kpi-revenue</code>. Validation messages name them.</li>
          <li><strong>Validate, then save.</strong> <code>artifacts_validate</code> reports every problem at once; fix them all in one pass.</li>
          <li><strong>Update, do not duplicate.</strong> Save a new version of the same artifact with <code>artifacts_update</code>; its link stays the same and history keeps every version.</li>
          <li><strong>Mind the limits.</strong> Split very large data into several artifacts, or summarize it. See <Link href={docsHref("json-render/validation", "limits")}>Spec limits</Link>.</li>
        </ul>
      </Prose>

      <DocsH page={page} id="ideas" />
      <Prose>
        <ul>
          <li>A pull request review: KeyValue for the change summary, a Table of findings with severity badges, and Steps to reproduce.</li>
          <li>An incident report: a Timeline of events, Metrics for impact, and a Checklist of follow-ups.</li>
          <li>A migration plan: Steps with the commands, a Progress bar per phase, and a Callout for the rollback.</li>
          <li>A weekly status page: a Board of work by stage and a Calendar of the next two weeks.</li>
          <li>A benchmark: a scatter Chart of latency against payload, and a Table of the raw runs.</li>
        </ul>
      </Prose>
      <Note title="Try a prompt's output">
        Paste a spec your agent wrote into the <Link href={docsHref("json-render/playground")} className="underline underline-offset-2">playground</Link> to see it and its validation report side by side.
      </Note>
    </RegistryPage>
  );
}
