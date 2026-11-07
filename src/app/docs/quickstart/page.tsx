import Link from "next/link";

import { CodeBlock, CommandBlock } from "@/components/code-block";
import { DocsH, Note, Prose } from "@/components/docs/docs-content";
import { RegistryPage } from "@/components/docs/docs-page";
import { SkillInstall } from "@/components/setup/skill-install";
import { docsMetadata } from "@/lib/docs/metadata";
import { docsHref } from "@/lib/docs/pages";
import { claudeMcpAddCommand, claudeMcpAddOAuthCommand, mcpConfigJson, mcpEndpoint, mcpOAuthConfigJson, TOKEN_ENV_VAR } from "@/lib/setup/mcp-config";

export const metadata = docsMetadata("quickstart");

const origin = "https://artifacts.space";
const endpoint = mcpEndpoint(origin);
const opencodeConfig = JSON.stringify({ $schema: "https://opencode.ai/config.json", mcp: { artifacts: { type: "remote", url: endpoint } } }, null, 2);
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
      <DocsH page={page} id="claude-code" />
      <Prose>
        <p>Run one command. There is no token to copy: Claude Code finds the sign-in server from the endpoint.</p>
      </Prose>
      <div className="mt-4"><CommandBlock command={claudeMcpAddOAuthCommand(origin)} /></div>
      <Prose>
        <ol>
          <li>Start Claude Code and type <code>/mcp</code>.</li>
          <li>Choose <strong>artifacts</strong>, then <strong>Authenticate</strong>. Your browser opens.</li>
          <li>Sign in, then approve the connection. Turn on <strong>Read-only access</strong> if the agent should only read.</li>
          <li>Back in Claude Code, the server shows as connected, with its tools.</li>
        </ol>
        <p>
          The connection stays signed in: access tokens last one hour, and the client refreshes them. Each refresh token lasts 30 days and is replaced on every use. See and revoke connected apps on the <strong>Connections</strong> page in the app.
        </p>
      </Prose>

      <DocsH page={page} id="other-clients" />
      <Prose>
        <p>Clients that support OAuth for remote MCP servers need only the URL. For Cursor, add this to <code>.cursor/mcp.json</code> in your project, or <code>~/.cursor/mcp.json</code> for every project:</p>
      </Prose>
      <CodeBlock title="mcp.json" value={mcpOAuthConfigJson(origin)} className="mt-4" />
      <Prose>
        <p>OpenCode reads remote servers from <code>opencode.json</code>:</p>
      </Prose>
      <CodeBlock title="opencode.json" value={opencodeConfig} className="mt-4" />
      <Prose>
        <p>
          Any other client: point it at <code>{endpoint}</code> over Streamable HTTP. A request without a token gets a <code>401</code> with a <code>WWW-Authenticate</code> header that names the protected-resource metadata, so OAuth-aware clients can find the sign-in server by themselves. If your client cannot do OAuth, use a token.
        </p>
      </Prose>

      <DocsH page={page} id="tokens" />
      <Prose>
        <p>Where nobody can approve in a browser, such as CI, a container, or a headless agent, send an access token instead.</p>
        <ol>
          <li>Open <strong>Connections</strong> in the app and create a token. Name it after the client or machine, so you can revoke it alone.</li>
          <li>Copy it at once. Only a hash is stored, so you will not see it again.</li>
          <li>Keep it in a secret store or an environment variable such as <code>{TOKEN_ENV_VAR}</code>, never in source control.</li>
        </ol>
      </Prose>
      <CodeBlock title="mcp.json" value={mcpConfigJson(origin)} className="mt-4" />
      <Prose><p>Or with Claude Code, reading the token from the environment:</p></Prose>
      <div className="mt-4"><CommandBlock command={headlessCommand} /></div>
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
      <CodeBlock title="Prompt" value={firstPrompt} className="mt-4" />
      <Prose><p>The agent calls <code>artifacts_create</code>:</p></Prose>
      <CodeBlock title="tools/call" value={firstCall} className="mt-4" />
      <Prose>
        <p>
          The result holds the artifact&apos;s id and <code>url</code>. Open the URL to read and edit it, or share it from the page. The artifact is private until you share it. Later sessions find it with <code>artifacts_list</code> (search by text or project) and read it with <code>artifacts_get</code>.
        </p>
      </Prose>

      <DocsH page={page} id="first-ui" />
      <Prose><p>For dashboards and reports, ask for a <code>ui</code> artifact. The agent reads the component guide, writes a spec, and checks it before it saves:</p></Prose>
      <CodeBlock title="Prompt" value={uiPrompt} className="mt-4" />
      <Prose>
        <p>
          Read <Link href={docsHref("json-render")}>JSON Render</Link> to see what a spec looks like, or try one in the <Link href={docsHref("json-render/playground")}>playground</Link>.
        </p>
      </Prose>

      <DocsH page={page} id="troubleshooting" />
      <Prose>
        <ul>
          <li><strong>401 or &quot;Authentication required&quot;</strong>: the client has no token, or its token expired or was revoked. In Claude Code, run <code>/mcp</code> and authenticate again.</li>
          <li><strong>Write tools are missing</strong>: the connection is read-only. Remove it and connect again without <strong>Read-only access</strong>.</li>
          <li><strong>HTTP 429 with JSON-RPC error -32029</strong>: a rate limit. The message and the <code>Retry-After</code> header say when to try again. See <Link href={docsHref("limits")}>Limits</Link>.</li>
          <li><strong>&quot;Use POST for MCP requests&quot;</strong>: the client opened a GET event stream. This server answers POST only; pick Streamable HTTP, not SSE.</li>
        </ul>
      </Prose>
    </RegistryPage>
  );
}
