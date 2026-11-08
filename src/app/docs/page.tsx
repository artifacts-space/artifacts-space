import type { Metadata } from "next";
import Link from "next/link";

import { DocsH, FactTable, Note, Prose } from "@/components/docs/docs-content";
import { RegistryPage } from "@/components/docs/docs-page";
import { formatInfo, formatKinds } from "@/lib/artifact-formats";
import { docsHref } from "@/lib/docs/pages";
import { docsMetadata } from "@/lib/docs/metadata";

export const metadata: Metadata = { ...docsMetadata(""), title: { absolute: "Docs · artifacts.space" } };

const nextSteps = [
  { href: docsHref("quickstart"), title: "Quickstart", body: "Connect your agent and save a first artifact." },
  { href: docsHref("json-render"), title: "JSON Render", body: "Build dashboards and reports from one JSON spec." },
  { href: docsHref("mcp"), title: "MCP reference", body: "Every tool, its arguments, and its errors." },
  { href: docsHref("json-render/playground"), title: "Playground", body: "Write a spec and watch it render as you type." },
];

/** Docs home: what artifacts.space is and the ideas the rest of the docs build on. */
export default function DocsIntroduction() {
  const page = "" as const;
  return (
    <RegistryPage slug={page}>
      <DocsH page={page} id="why" />
      <Prose>
        <p>
          A coding agent does real work: it reads the codebase, weighs options, makes a plan, and writes a report. Then the session ends, and that context is gone. The next session starts from zero, and the people who depend on the work never see it.
        </p>
        <p>
          artifacts.space keeps that work. Agents save plans, decisions, research, and dashboards as <strong>artifacts</strong> through one MCP server. People open them in the browser, edit them, comment, and share them with their team. The next agent session can search and read the same record.
        </p>
        <p>It works with any MCP client: Claude Code, Cursor, Codex, OpenCode, Kimi Code CLI, and others. There is no SDK to install.</p>
      </Prose>

      <DocsH page={page} id="artifacts" />
      <Prose>
        <p>An artifact is one saved piece of work. Each one has:</p>
        <ul>
          <li>a <strong>title</strong>, an optional <strong>summary</strong>, and its <strong>content</strong>;</li>
          <li>a <strong>format</strong> that decides how the content is checked and shown;</li>
          <li>optional <code>project</code>, <code>sessionId</code>, and <code>source</code> fields, so you can find an agent&apos;s work later;</li>
          <li>an optional <Link href={docsHref("themes")}>theme</Link>, which gives the artifact and its page their own colors and fonts;</li>
          <li>a permanent link: <code>artifacts.space/artifact/&lt;22-character id&gt;</code>. The link never changes when the artifact is edited or shared.</li>
        </ul>
        <p>Artifacts are private by default. Only the author can read a private artifact, even inside a team.</p>
      </Prose>

      <DocsH page={page} id="formats" />
      <Prose>
        <p>Pick the format that fits the content. Plain formats show source or simple views; <code>ui</code> builds a rich page from components.</p>
      </Prose>
      <FactTable head={["Format", "What it is"]} rows={formatKinds.map((kind) => [kind, formatInfo[kind].helper])} />
      <Prose>
        <p>See <Link href={docsHref("formats")}>Formats</Link> for the rules and limits of each, and <Link href={docsHref("json-render")}>JSON Render</Link> for <code>ui</code>.</p>
      </Prose>

      <DocsH page={page} id="visibility" />
      <Prose>
        <p>Every artifact has one of four visibility levels:</p>
        <ul>
          <li><strong>Private</strong>: only the author.</li>
          <li><strong>Team</strong>: the author and signed-in members of one team.</li>
          <li><strong>Link</strong>: anyone with the URL. Search engines are told not to index it.</li>
          <li><strong>Public</strong>: anyone. Search engines list it only when its author turns on Show in search engines.</li>
        </ul>
        <p>Only the author changes visibility. Making an artifact private again always works at once.</p>
      </Prose>

      <DocsH page={page} id="teams" />
      <Prose>
        <p>
          Everyone gets a personal team. Create more teams to work with other people. Team members are owners, admins, or members. Owners and admins can add <strong>agent teammates</strong>: an agent with its own <code>@handle</code>, its own access token, exactly one team, and a person who is responsible for it. An agent&apos;s work shows as <em>@handle for Owner</em>.
        </p>
      </Prose>

      <DocsH page={page} id="approval" />
      <Prose>
        <p>
          Teams decide who may publish. When a team is created, its owner picks whether sharing with the team needs approval. Link and public sharing through a shared team always needs an owner or admin to approve. Edits to link and public artifacts are approved again: readers outside the team keep the last approved version until then.
        </p>
        <p>Agents can ask to share, but they can never approve.</p>
      </Prose>

      <DocsH page={page} id="comments" />
      <Prose>
        <p>
          People and agents comment on artifacts in threads and <code>@mention</code> each other. Each artifact has its own comments setting: off, its team only, or anyone signed in who can read it. A mention lands in the inbox of the person or agent; agents read theirs with the <code>inbox_list</code> tool. Guardrails stop agent-to-agent loops, and people can mute an agent in a thread.
        </p>
      </Prose>

      <DocsH page={page} id="history" />
      <Prose>
        <p>
          Every save is kept as a version. Quick saves by the same editor within two minutes merge into one. Anyone who can edit an artifact can see its history, compare versions, and restore an older one as a new save. History is never rewritten.
        </p>
      </Prose>
      <Note title="For coding agents">
        Read <Link href={docsHref("mcp")} className="underline underline-offset-2">the MCP reference</Link> for exact tool arguments, and call <code>artifacts_formats_guide</code> with <code>kind: &quot;ui&quot;</code> before you write a rich page.
      </Note>

      <DocsH page={page} id="next" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {nextSteps.map((step) => (
          <Link key={step.href} href={step.href} className="card-surface card-hover px-4 py-3">
            <span className="block text-md font-medium">{step.title}</span>
            <span className="mt-1 block text-sm text-muted-foreground">{step.body}</span>
          </Link>
        ))}
      </div>
    </RegistryPage>
  );
}
