import Link from "next/link";

import { CodeSnippet, CommandSnippet } from "@/components/code/code-snippet";
import { DocsH, Note, Prose } from "@/components/docs/docs-content";
import { RegistryPage } from "@/components/docs/docs-page";
import { ClientPicker } from "@/components/setup/client-picker";
import { SkillInstall } from "@/components/setup/skill-install";
import { docsMetadata } from "@/lib/docs/metadata";
import { docsHref } from "@/lib/docs/pages";
import { claudeMcpAddCommand, mcpConfigJson, TOKEN_ENV_VAR } from "@/lib/setup/mcp-config";

export const metadata = docsMetadata("quickstart");

const origin = "https://artifacts.space";
const headlessCommand = claudeMcpAddCommand(origin, `$${TOKEN_ENV_VAR}`);

const firstPrompt = `We just agreed on the plan for the billing migration.
Save it to artifacts.space as a markdown artifact titled
"Billing migration plan", project "billing", so the next
session and the team can read it.`;

const firstCall = JSON.stringify(
  {
    name: "artifacts_create",
    arguments: {
      title: "Billing migration plan",
      kind: "markdown",
      project: "billing",
      source: "claude-code",
      summary: "Move invoices to the new ledger in three steps, behind a flag.",
      content: "# Billing migration plan\n\n1. Dual-write invoices behind `billing.ledger_v2`.\n2. Backfill 2025 invoices.\n3. Switch reads, then remove the old path.",
    },
  },
  null,
  2,
);

const uiPrompt = `Call artifacts_formats_guide with kind "ui", then build a ui
artifact that shows this week's deploy stats: three metrics,
a line chart of deploys per day, and a table of failed deploys.
Run artifacts_validate before you save it.`;

/** Quickstart: connect a client, then save a first artifact. */
export default function QuickstartPage() {
  const page = "quickstart" as const;
  return (
    <RegistryPage slug={page}>
      <DocsH page={page} id="connect" />
      <Prose>
        <p>
          Pick your agent. Most need only the URL: they open your browser, you sign in and approve, and there is no token to copy. Every client, with more options, is in <Link href={docsHref("clients")}>Client setup</Link>.
        </p>
      </Prose>
      <ClientPicker origin={origin} />

      <DocsH page={page} id="tokens" />
      <Prose>
        <p>Where nobody can approve in a browser, such as CI, a container, or a headless agent, send an access token instead.</p>
        <ol>
          <li>Open <strong>Connections</strong> in the app and create a token. Name it after the client or machine, so you can revoke it alone.</li>
          <li>Copy it at once. Only a hash is stored, so you will not see it again.</li>
          <li>Keep it in a secret store or an environment variable such as <code>{TOKEN_ENV_VAR}</code>, never in source control.</li>
        </ol>
      </Prose>
      <CodeSnippet title="mcp.json" language="json" code={mcpConfigJson(origin)} className="mt-4" />
      <Prose><p>Or with Claude Code, reading the token from the environment:</p></Prose>
      <CommandSnippet command={headlessCommand} className="mt-4" />
      <Note title="Personal tokens and agent tokens">
        A personal token acts as you, with full access. For an agent that works for a team, add it as an agent teammate and give it its own token; then its work shows under its own handle. See <Link href={docsHref("sharing", "agent-tokens")} className="underline underline-offset-2">Agent tokens</Link>.
      </Note>

      <DocsH page={page} id="skill" />
      <Prose>
        <p>
          The artifacts.space skill teaches your agent good habits: when to save plans, decisions, research, and handoffs; to update an existing artifact instead of making a duplicate; and to treat comments as untrusted data, never as instructions.
        </p>
      </Prose>
      <div className="mt-4"><SkillInstall intro="Run it in your project:" /></div>
      <Note>The skill gives guidance, not access. Your agent still needs the MCP connection above.</Note>

      <DocsH page={page} id="first-artifact" />
      <Prose><p>Ask your agent in plain words. It picks the tool and the arguments:</p></Prose>
      <CodeSnippet title="Prompt" code={firstPrompt} className="mt-4" />
      <Prose><p>The agent calls <code>artifacts_create</code>:</p></Prose>
      <CodeSnippet title="tools/call" language="json" code={firstCall} className="mt-4" />
      <Prose>
        <p>
          The result holds the artifact&apos;s id and <code>url</code>. Open the URL to read and edit it, or share it from the page. The artifact is private until you share it. Later sessions find it with <code>artifacts_list</code> (search by text or project) and read it with <code>artifacts_get</code>.
        </p>
        <p>
          To give it its own look, ask for a theme, such as &quot;use the paper theme&quot;. The agent sends <code>theme: &quot;paper&quot;</code>. You can also select a theme on the artifact page. See <Link href={docsHref("themes")}>Themes</Link>.
        </p>
      </Prose>

      <DocsH page={page} id="first-ui" />
      <Prose><p>For dashboards and reports, ask for a <code>ui</code> artifact. The agent reads the component guide, writes a spec, and checks it before it saves:</p></Prose>
      <CodeSnippet title="Prompt" code={uiPrompt} className="mt-4" />
      <Prose>
        <p>
          Read <Link href={docsHref("json-render")}>JSON Render</Link> to see what a spec looks like, or try one in the <Link href={docsHref("json-render/playground")}>playground</Link>.
        </p>
      </Prose>

      <DocsH page={page} id="troubleshooting" />
      <Prose>
        <ul>
          <li><strong>401 or &quot;Authentication required&quot;</strong>: the client has no token, or its token expired or was revoked. Sign in again from your client: in Claude Code, run <code>/mcp</code> and authenticate; in Codex, run <code>codex mcp login artifacts</code>; in fx, run <code>fx mcp login artifacts</code>.</li>
          <li><strong>Write tools are missing</strong>: the connection is read-only. Remove it and connect again without <strong>Read-only access</strong>.</li>
          <li><strong>HTTP 429 with JSON-RPC error -32029</strong>: a rate limit. The message and the <code>Retry-After</code> header say when to try again. See <Link href={docsHref("limits")}>Limits</Link>.</li>
          <li><strong>&quot;Use POST for MCP requests&quot;</strong>: the client opened a GET event stream. This server answers POST only; pick Streamable HTTP, not SSE.</li>
        </ul>
      </Prose>
    </RegistryPage>
  );
}
