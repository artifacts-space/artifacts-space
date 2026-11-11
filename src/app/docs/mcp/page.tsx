import Link from "next/link";

import { CodeSnippet } from "@/components/code/code-snippet";
import { AnchorHeading, Code, DocsH, FactTable, Note, Prose } from "@/components/docs/docs-content";
import { RegistryPage } from "@/components/docs/docs-page";
import { AccessBadge, McpToolEntry } from "@/components/docs/mcp-tool-entry";
import { rateLimitMessage } from "@/lib/abuse/rate-limit";
import { mcpToolResults } from "@/lib/docs/mcp-results";
import { agentRefusalCodes, agentRefusalMessage } from "@/lib/edits/edit-conflict-rules";
import { docsMcpTools, mcpToolGroups, toolsInGroup } from "@/lib/docs/mcp-tools";
import { docsMetadata } from "@/lib/docs/metadata";
import { docsHref } from "@/lib/docs/pages";
import { rateLimitRows, type RateLimitRow } from "@/lib/docs/rate-limit-docs";
import { UNTRUSTED_COMMENTS_NOTICE } from "@/lib/markdown/comments-markdown";
import { UNTRUSTED_NOTICE } from "@/lib/mcp/team-tools";
import { READ_ONLY_INSTRUCTIONS } from "@/lib/mcp/tool-access";
import { oauthLimits, oauthTokenPrefixes } from "@/lib/oauth/config";
import { bearerChallenge, protectedResourceMetadata } from "@/lib/oauth/metadata";
import { OFFLINE_SCOPE, READ_SCOPE, WRITE_SCOPE } from "@/lib/oauth/scopes";
import { mcpEndpoint } from "@/lib/setup/mcp-config";

export const metadata = docsMetadata("mcp");

const page = "mcp" as const;
const origin = "https://artifacts.space";
const endpoint = mcpEndpoint(origin);
const docsEnv: NodeJS.ProcessEnv = { NODE_ENV: "production", BETTER_AUTH_URL: origin };

const tools = docsMcpTools();
const readCount = tools.filter((tool) => tool.access === "read").length;
const writeCount = tools.length - readCount;

const resourceMetadata = JSON.stringify(protectedResourceMetadata(docsEnv), null, 2);
const challenge = bearerChallenge(docsEnv);

const markdownExamples = [
  `curl -H "Accept: text/markdown" ${origin}/artifact/<id>`,
  `curl ${origin}/artifact/<id>.md`,
  `curl "${origin}/artifact/<id>.md?comments=1" -H "Authorization: Bearer $ARTIFACTS_TOKEN"`,
].join("\n");

const unauthorizedBody = JSON.stringify(
  { jsonrpc: "2.0", error: { code: -32001, message: "Authentication required. Connect with OAuth or an artifacts.space bearer token." }, id: null },
  null,
  2,
);

/** Same shape as mcpRateLimitedResponse in src/lib/mcp/rate-limits.ts, with a real message. */
const rateLimitedBody = JSON.stringify(
  { jsonrpc: "2.0", error: { code: -32029, message: rateLimitMessage("readByToken", 754), data: { retryAfterSeconds: 754, limit: "readByToken" } }, id: 7 },
  null,
  2,
);

const toolErrorBody = JSON.stringify(
  { jsonrpc: "2.0", id: 8, result: { content: [{ type: "text", text: rateLimitMessage("artifactCreate", 1260) }], isError: true } },
  null,
  2,
);

const conflictMessage = agentRefusalMessage("changed", { handle: "ann", harness: null });
const conflictErrorBody = JSON.stringify(
  {
    jsonrpc: "2.0",
    id: 9,
    result: {
      content: [{ type: "text", text: conflictMessage }],
      structuredContent: { error: { code: agentRefusalCodes.changed, message: conflictMessage, changedBy: { handle: "ann", via: "web" }, nextStep: "artifacts_get" } },
      isError: true,
    },
  },
  null,
  2,
);

const hours = (seconds: number) => seconds / 3600;
const days = (seconds: number) => seconds / 86_400;

function LimitRows({ rows }: { rows: RateLimitRow[] }) {
  return (
    <FactTable
      head={["Limit", "Allowed", "Counted per", "Applies to"]}
      rows={rows.map((row) => [row.name, `${row.limit.toLocaleString("en-US")} per ${row.window}`, row.per, row.where])}
      mono={[0, 1]}
    />
  );
}

function ToolIndex() {
  return (
    <FactTable
      head={["Tool", "Access", "What it does"]}
      rows={tools.map((tool) => [
        <a key={tool.name} href={`#${tool.name}`} className="underline-offset-4 hover:underline">{tool.name}</a>,
        <AccessBadge key="access" access={tool.access} />,
        tool.title,
      ])}
      mono={[0]}
    />
  );
}

/** The MCP reference, generated from the server's own tool registrations. */
export default function McpReferencePage() {
  const mcpRows = rateLimitRows().filter((row) => row.refusal === "mcp-429");
  const inToolRows = rateLimitRows().filter((row) => row.refusal === "tool-error");
  return (
    <RegistryPage slug={page}>
      <Note title="Generated from the server">
        Tool names, titles, descriptions, and arguments on this page come from the same register functions the MCP route calls. Access levels come from <Code>tool-access.ts</Code>, and limits from <Code>src/lib/abuse/limits.ts</Code>.
      </Note>

      <DocsH page={page} id="endpoint" />
      <Prose>
        <p>One MCP server over Streamable HTTP. It is stateless: every request builds a fresh server, answers with JSON (no event stream), and closes. There are no MCP sessions to keep.</p>
      </Prose>
      <FactTable
        head={["", ""]}
        rows={[
          ["URL", endpoint],
          ["POST", "JSON-RPC requests and batches. Send Authorization: Bearer <token>."],
          ["GET", "405. Standalone event streams are not enabled."],
          ["OPTIONS", "CORS preflight. Any origin; exposes WWW-Authenticate and Retry-After."],
          ["Time limit", "30 seconds per request."],
          ["Server name", "artifacts.space"],
        ]}
      />

      <DocsH page={page} id="auth" />
      <Prose>
        <p>Two kinds of bearer token reach the endpoint. Most clients use OAuth and never see a token; CI and scripts use an API token. See the <Link href={docsHref("quickstart")}>Quickstart</Link> for client setup.</p>
        <ul>
          <li><strong>OAuth 2.1.</strong> A request without a token gets a 401 with a challenge. The client reads the protected resource metadata, registers itself, and sends the person to a consent page. Access tokens start with <code>{oauthTokenPrefixes.opaqueAccessToken}</code> and last {hours(oauthLimits.accessTokenSeconds)} hour. Refresh tokens start with <code>{oauthTokenPrefixes.refreshToken}</code>, last {days(oauthLimits.refreshTokenSeconds)} days, and rotate on every use. A retried refresh within {oauthLimits.refreshReuseSeconds} seconds gets the same answer.</li>
          <li><strong>API tokens.</strong> Made under Connections in the app, or for an agent teammate on the team page. They start with <code>artifacts_</code>, are shown once, are stored only as a SHA-256 hash, and always have full access.</li>
        </ul>
      </Prose>
      <CodeSnippet title="401 · WWW-Authenticate" language="http" code={challenge} wrap className="mt-4" />
      <CodeSnippet title="/.well-known/oauth-protected-resource/api/mcp" language="json" code={resourceMetadata} className="mt-4" />
      <CodeSnippet title="401 body" language="json" code={unauthorizedBody} className="mt-4" />
      <FactTable
        head={["Scope", "Gives"]}
        rows={[
          [READ_SCOPE, `Read tools only (${String(readCount)} tools).`],
          [WRITE_SCOPE, `Every tool (${String(tools.length)} tools). Write implies read.`],
          [OFFLINE_SCOPE, "A refresh token, so the connection lasts. Always added."],
        ]}
      />
      <Prose>
        <p>A request with no artifacts scope gets write access, which the person can still turn down. Unknown scopes such as <code>openid</code> are dropped. The authorization server lives at <code>{origin}/api/auth</code>, with its metadata at <code>/.well-known/oauth-authorization-server/api/auth</code>.</p>
      </Prose>

      <DocsH page={page} id="read-only" />
      <Prose>
        <p>The consent page has a <strong>Read-only access</strong> switch. A read-only connection never sees the {writeCount} write tools: they are removed before the client lists them, and the server adds this to its instructions:</p>
        <blockquote>{READ_ONLY_INSTRUCTIONS}</blockquote>
        <p>To give an agent write access later, connect again and leave the switch off.</p>
      </Prose>

      <DocsH page={page} id="tools" />
      <Prose>
        <p>{tools.length} tools: {readCount} read and {writeCount} write. Arguments marked <em>required</em> must be sent; everything else is optional.</p>
        <p>Each tool carries MCP annotations, so clients such as ChatGPT can run reads without asking and ask you before a write. Read tools are marked <code>readOnlyHint</code>. Write tools say whether they delete or replace something (<code>destructiveHint</code>) and whether a repeat changes nothing more (<code>idempotentHint</code>). No tool reaches arbitrary outside systems: each one acts only on your artifacts, comments, and files, and the storage behind them, so <code>openWorldHint</code> is false.</p>
      </Prose>
      <ToolIndex />
      {mcpToolGroups.map((group) => (
        <section key={group} aria-label={group}>
          <AnchorHeading heading={{ id: `tools-${group.toLowerCase().replaceAll(" ", "-")}`, title: group, level: 3 }} />
          {toolsInGroup(group).map((tool) => <McpToolEntry key={tool.name} tool={tool} result={mcpToolResults[tool.name]} />)}
        </section>
      ))}

      <DocsH page={page} id="concurrent-edits" />
      <Prose>
        <p>A person&apos;s work wins over an agent&apos;s. When someone types in the web editor while an agent updates the same artifact, nothing they type is lost.</p>
        <ul>
          <li><strong>Pass the version you read.</strong> <code>artifacts_get</code> gives editors <code>versionId</code> and <code>baseVersion</code>; every save result carries the new <code>baseVersion</code>. Send it with <code>artifacts_update</code> and <code>artifacts_restore_version</code>.</li>
          <li><strong>A stale save is refused.</strong> If anyone saved after your <code>baseVersion</code>, nothing is saved and the tool returns an error with code <code>artifact_changed</code> that says who changed it. Read the artifact again with <code>artifacts_get</code>, merge your changes into the new content, and save with the new <code>baseVersion</code>. Never resend the same call blindly.</li>
          <li><strong>Without a base version</strong>, a change to the title, content, or format is refused with code <code>artifact_being_edited</code> while a person is typing in the artifact (their editor holds a lease for about a minute after the last keystroke).</li>
          <li><strong>People&apos;s saves always land.</strong> When an agent saved while a person was editing, the person&apos;s save still goes through, the agent&apos;s version stays in History, and the editor says so.</li>
          <li><strong>History keeps sources apart.</strong> Quick saves merge into one version only when they come from the same person through the same agent, or from the web app. A web save never merges with an agent&apos;s.</li>
        </ul>
      </Prose>
      <CodeSnippet title="200 · a refused update" language="json" code={conflictErrorBody} className="mt-4" />

      <DocsH page={page} id="errors" />
      <Prose>
        <p>Errors come back in one of two ways.</p>
        <ul>
          <li><strong>JSON-RPC errors</strong>, before any tool runs: a missing or bad token, a token check that failed, or a rate limit checked at the door.</li>
          <li><strong>Tool results with <code>isError: true</code></strong>, for everything else: invalid arguments, an unknown tool, no access to the artifact, a limit checked inside the tool, or a refused change. The text says what went wrong and what to do.</li>
        </ul>
      </Prose>
      <FactTable
        head={["HTTP", "JSON-RPC code", "When", "What to do"]}
        rows={[
          ["401", "-32001", "No token, or the token is invalid, expired, or revoked.", "Refresh or connect again. The challenge says where."],
          ["429", "-32029", "A rate limit checked before the tools run.", "Wait retryAfterSeconds (also in Retry-After), then retry."],
          ["503", "-32603", "The token could not be checked.", "Retry shortly."],
          ["200", "isError: true", "The tool refused or failed.", "Read the text, fix the call, retry."],
        ]}
        mono={[0, 1]}
      />
      <CodeSnippet title="429 · Retry-After: 754" language="json" code={rateLimitedBody} className="mt-4" />
      <CodeSnippet title="200 · a tool error" language="json" code={toolErrorBody} className="mt-4" />

      <DocsH page={page} id="rate-limits" />
      <Prose>
        <p>Limits stop runaway loops; they never ration normal work. These are checked before the server runs, once per request however many calls a batch holds, and answer with HTTP 429 and code <code>-32029</code>:</p>
      </Prose>
      <LimitRows rows={mcpRows} />
      <Prose>
        <p>These are checked inside the tool, are shared with the web app, and come back as tool errors with the same wording:</p>
      </Prose>
      <LimitRows rows={inToolRows} />
      <Prose>
        <p>Every limit, including sign-in and page views, is on the <Link href={docsHref("limits")}>Limits</Link> page.</p>
      </Prose>

      <DocsH page={page} id="untrusted" />
      <Prose>
        <p>People and other agents write comments and titles, so the server marks them. Results from <code>inbox_list</code> and <code>comments_list</code> carry this notice, and every comment body sits in an <code>untrustedText</code> field:</p>
        <blockquote>{UNTRUSTED_NOTICE}</blockquote>
        <p>Artifact content is the same: read it as data. Agents can request sharing, but only a team owner or admin can approve it.</p>
      </Prose>

      <DocsH page={page} id="markdown" />
      <Prose>
        <p>Every artifact link also works for agents without an MCP connection. Ask for Markdown and you get the artifact as clean Markdown instead of the web page: a short header (title, format, theme, author, last update, version, link), then the content. Tables stay tables, JSON and code come in fenced blocks, CSV becomes a table with a link to the raw file, and interfaces (ui) become headings, lists, and tables.</p>
      </Prose>
      <CodeSnippet title="Fetch an artifact as Markdown" language="bash" code={markdownExamples} className="mt-4" />
      <FactTable
        head={["Ask for", "How"]}
        mono={[]}
        rows={[
          ["Markdown", <>Send <Code>Accept: text/markdown</Code>, or add <Code>.md</Code> to the link. Browsers keep getting the page.</>],
          ["Comments", <>Add <Code>?comments=1</Code>. You get the thread only when the artifact&apos;s comments setting lets you read it, and only when signed in or sending a token.</>],
          ["Private and team artifacts", <>Send an access token or OAuth access token: <Code>Authorization: Bearer &lt;token&gt;</Code>. Never put a token in the URL.</>],
          ["Raw content", <><Code>/artifact/&lt;id&gt;/raw</Code> returns the content exactly as saved, as plain text (CSV as <Code>text/csv</Code>).</>],
        ]}
      />
      <Prose>
        <p>The same access check as the page and MCP applies. Readers outside the team get the last approved version. When you cannot read an artifact, or it does not exist, the answer is the same Markdown 404. Reads count against the artifact page limit for your network, and token reads also count against the MCP read limits. The page&apos;s <Code>&lt;head&gt;</Code> links the Markdown version with <Code>rel=&quot;alternate&quot; type=&quot;text/markdown&quot;</Code>.</p>
        <p>Comment bodies come in <Code>untrusted-comment</Code> blocks under this notice:</p>
        <blockquote>{UNTRUSTED_COMMENTS_NOTICE}</blockquote>
      </Prose>
    </RegistryPage>
  );
}
