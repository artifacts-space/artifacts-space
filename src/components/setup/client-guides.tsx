import type { ReactNode } from "react";

import { CodeSnippet, CommandSnippet } from "@/components/code/code-snippet";
import { Prose } from "@/components/docs/docs-content";
import { CursorInstallButton } from "@/components/setup/cursor-install-button";
import {
  codexConfigToml,
  codexMcpAddCommand,
  codexMcpLoginCommand,
  kimiMcpLoginCommand,
  opencodeConfigJson,
  opencodeMcpAddCommand,
  opencodeMcpAuthCommand,
  opencodeMcpListCommand,
  type McpClientId,
} from "@/lib/setup/client-installs";
import { claudeMcpAddOAuthCommand, mcpEndpoint, mcpOAuthConfigJson } from "@/lib/setup/mcp-config";

/**
 * Setup steps for each MCP client, shared by the quickstart picker and the
 * clients page. `full` adds the alternatives and fine print the picker
 * leaves out. Every path is the remote endpoint with OAuth: no token, and
 * nothing runs on the person's machine.
 */

/** Props every guide takes. */
export interface ClientGuideProps {
  /** The site origin, such as "https://artifacts.space". */
  origin: string;
  /** Show alternatives and fine print, for the clients page. */
  full?: boolean;
}

function Label({ children }: { children: ReactNode }) {
  return <p className="mt-6 text-sm font-medium text-muted-foreground first:mt-0">{children}</p>;
}

/** The sign-in and approval every OAuth client ends with. */
function ApproveSteps({ opener }: { opener: ReactNode }) {
  return (
    <>
      <Label>What happens next</Label>
      <Prose className="mt-2">
        <ol>
          <li>{opener}</li>
          <li>Sign in to artifacts.space, then approve the connection. Turn on <strong>Read-only access</strong> if the agent should only read.</li>
          <li>The agent sees the artifacts tools. It stays signed in, and you can revoke it on the <strong>Connections</strong> page.</li>
        </ol>
      </Prose>
    </>
  );
}

function NoOneClick({ client }: { client: string }) {
  return <p className="text-md leading-6 text-muted-foreground">There&apos;s no one-click link for {client} yet. It takes about a minute by hand.</p>;
}

/** Claude Code: one command, then authenticate from `/mcp`. */
export function ClaudeCodeGuide({ origin }: ClientGuideProps) {
  return (
    <>
      <p className="text-md leading-6 text-muted-foreground">Run one command. There is no token to copy.</p>
      <CommandSnippet command={claudeMcpAddOAuthCommand(origin)} className="mt-3" />
      <ApproveSteps opener={<>Start Claude Code, type <code>/mcp</code>, choose <strong>artifacts</strong>, then <strong>Authenticate</strong>. Your browser opens.</>} />
    </>
  );
}

/** Cursor: the one-click install link, with `mcp.json` as the fallback. */
export function CursorGuide({ origin, full = false }: ClientGuideProps) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <CursorInstallButton origin={origin} />
        <span className="text-sm text-muted-foreground">Opens Cursor with the server filled in.</span>
      </div>
      <Label>Or add it by hand</Label>
      <Prose className="mt-2">
        <p>Add this to <code>.cursor/mcp.json</code> in your project, or to <code>~/.cursor/mcp.json</code> for every project.</p>
      </Prose>
      <CodeSnippet title="mcp.json" language="json" code={mcpOAuthConfigJson(origin)} className="mt-3" />
      <ApproveSteps opener="Cursor asks you to confirm the server. When it asks you to sign in, your browser opens." />
      {full ? (
        <Prose className="mt-4">
          <p>The button only fills in the server URL. Nothing is installed until you confirm in Cursor, and no command runs on your computer.</p>
        </Prose>
      ) : null}
    </>
  );
}

/** Claude Desktop and claude.ai: a custom connector, added by URL. */
export function ClaudeDesktopGuide({ origin, full = false }: ClientGuideProps) {
  return (
    <>
      <NoOneClick client="Claude Desktop" />
      <Prose className="mt-2">
        <ol>
          <li>Open <strong>Customize</strong>, then <strong>Connectors</strong>.</li>
          <li>Choose <strong>+ Add</strong>, then <strong>Add custom connector</strong>.</li>
          <li>Name it <code>artifacts.space</code> and paste the URL <code>{mcpEndpoint(origin)}</code>. Choose <strong>Continue</strong>.</li>
          <li>Keep the sign-in settings Claude finds, with <strong>Use Claude&apos;s published identity</strong> as the OAuth client. Add the connector.</li>
        </ol>
      </Prose>
      <ApproveSteps opener="Claude asks you to sign in. Your browser opens." />
      <Prose className="mt-4">
        <p>The connector lives in your Claude account, so it also works on claude.ai and in the mobile apps. Free plans can add one custom connector.</p>
        {full ? (
          <p>
            On Claude Team and Enterprise plans, an owner adds the connector first, under <strong>Organization settings</strong>, then <strong>Connectors</strong>. Then each person finds it in <strong>Customize</strong>, <strong>Connectors</strong>, and chooses <strong>Connect</strong> to sign in as themselves.
          </p>
        ) : null}
      </Prose>
    </>
  );
}

/** Codex: `codex mcp add` with the URL; the desktop app and CLI share config. */
export function CodexGuide({ origin, full = false }: ClientGuideProps) {
  return (
    <>
      <NoOneClick client="Codex" />
      <Label>In the terminal</Label>
      <CommandSnippet command={codexMcpAddCommand(origin)} className="mt-2" />
      <Prose className="mt-2"><p>Codex adds the server, sees that it uses sign-in, and opens your browser.</p></Prose>
      <Label>In the ChatGPT desktop app</Label>
      <Prose className="mt-2">
        <ol>
          <li>Open <strong>Settings</strong>, then <strong>MCP servers</strong>, then <strong>Add server</strong>.</li>
          <li>Name it <code>artifacts</code>, choose <strong>Streamable HTTP</strong>, and paste <code>{mcpEndpoint(origin)}</code>.</li>
          <li>Save, choose <strong>Restart</strong>, then <strong>Authenticate</strong> next to the server.</li>
        </ol>
      </Prose>
      {full ? (
        <>
          <Label>In config.toml</Label>
          <Prose className="mt-2"><p>Or add this to <code>~/.codex/config.toml</code>, then sign in with the command below.</p></Prose>
          <CodeSnippet title="config.toml" language="toml" code={codexConfigToml(origin)} className="mt-3" />
          <CommandSnippet command={codexMcpLoginCommand()} className="mt-3" />
        </>
      ) : null}
      <ApproveSteps opener="Your browser opens on the sign-in page." />
      <Prose className="mt-4"><p>The ChatGPT desktop app, the Codex CLI, and the IDE extension share one config, so you add the server once.</p></Prose>
    </>
  );
}

/** A step that checks the connection, with the command or text that shows it. */
function CheckStep({ children, note }: { children: ReactNode; note: ReactNode }) {
  return (
    <>
      <Label>Check the connection</Label>
      <div className="mt-2">{children}</div>
      <Prose className="mt-2"><p>{note}</p></Prose>
    </>
  );
}

/** OpenCode: `opencode mcp add` with the URL, then `opencode mcp auth`. */
export function OpenCodeGuide({ origin, full = false }: ClientGuideProps) {
  return (
    <>
      <p className="text-md leading-6 text-muted-foreground">Run one command. There is no token to copy.</p>
      <CommandSnippet command={opencodeMcpAddCommand(origin)} className="mt-3" />
      <Prose className="mt-2"><p>The command adds the server to this project. Add <code>--global</code> to use it in every project.</p></Prose>
      <Label>Sign in</Label>
      <CommandSnippet command={opencodeMcpAuthCommand()} className="mt-2" />
      <ApproveSteps opener={<>Run the command above, or open OpenCode, type <code>/mcps</code>, and choose <strong>artifacts</strong>. Your browser opens.</>} />
      <CheckStep note={<>The list shows <strong>artifacts</strong> as connected. If it shows <strong>needs authentication</strong>, sign in again.</>}>
        <CommandSnippet command={opencodeMcpListCommand()} />
      </CheckStep>
      {full ? (
        <>
          <Label>In opencode.json</Label>
          <Prose className="mt-2"><p>Or add the server to <code>opencode.json</code> in your project by hand. OpenCode turns on sign-in for remote servers by itself.</p></Prose>
          <CodeSnippet title="opencode.json" language="json" code={opencodeConfigJson(origin)} className="mt-3" />
          <Prose className="mt-4"><p>On a remote machine, your browser can fail to reach OpenCode after you sign in. If that happens, copy the URL from the address bar and paste it into OpenCode.</p></Prose>
        </>
      ) : null}
    </>
  );
}

/** Kimi Code CLI: an entry in `mcp.json`, then `/mcp-config login` inside Kimi Code. */
export function KimiCodeGuide({ origin, full = false }: ClientGuideProps) {
  return (
    <>
      <NoOneClick client="Kimi Code CLI" />
      <Prose className="mt-2">
        <p>Add this to <code>~/.kimi-code/mcp.json</code> for every project, or to <code>.kimi-code/mcp.json</code> in one project. Or type <code>/mcp-config</code> in Kimi Code and ask it to add the server.</p>
      </Prose>
      <CodeSnippet title="mcp.json" language="json" code={mcpOAuthConfigJson(origin)} className="mt-3" />
      <Label>Sign in</Label>
      <Prose className="mt-2"><p>Start a new Kimi Code session, because open sessions do not see a new server. Then type:</p></Prose>
      <CodeSnippet title="Kimi Code" code={kimiMcpLoginCommand()} className="mt-3" />
      <ApproveSteps opener="Kimi Code shows a sign-in link. Open it in your browser." />
      <CheckStep note={<>Kimi Code lists <strong>artifacts</strong> with its connection status.</>}>
        <CodeSnippet title="Kimi Code" code="/mcp" />
      </CheckStep>
      {full ? (
        <Prose className="mt-4">
          <p>Kimi Code CLI replaced the older Kimi CLI. It has no <code>kimi mcp add</code> command. Run <code>kimi migrate</code> to move your servers, then sign in to each one again.</p>
        </Prose>
      ) : null}
    </>
  );
}

/** Devin: a custom MCP server with OAuth. */
export function DevinGuide({ origin, full = false }: ClientGuideProps) {
  return (
    <>
      <NoOneClick client="Devin" />
      <Prose className="mt-2">
        <ol>
          <li>Open <strong>Customize</strong>, then <strong>MCPs</strong>. Choose <strong>Add MCP</strong>, then <strong>Add custom MCP</strong>.</li>
          <li>Name it <code>artifacts</code> and choose the <strong>HTTP</strong> transport.</li>
          <li>Paste the server URL <code>{mcpEndpoint(origin)}</code> and choose <strong>OAuth</strong> as the authentication method. Set <strong>Access</strong> to <strong>Personal</strong>.</li>
          <li>Save, then choose <strong>Connect</strong> next to the server.</li>
        </ol>
      </Prose>
      <ApproveSteps opener="Devin gives you a link. Open it to sign in." />
      <Prose className="mt-4">
        <p>Adding a custom MCP server needs the <strong>Manage MCP Servers</strong> permission in Devin. Without it, use <strong>Suggest MCP Integration</strong> to ask an admin.</p>
        {full ? (
          <p>
            For a Devin that works for your whole team, add it as an agent teammate instead. Choose <strong>Auth Header</strong>, keep the key <code>Authorization</code>, and set the value to <code>Bearer</code> and the agent&apos;s token. Its work then shows under its own handle.
          </p>
        ) : null}
      </Prose>
    </>
  );
}

/** Any other client: the endpoint, and how discovery works. */
export function OtherClientsGuide({ origin, full = false }: ClientGuideProps) {
  return (
    <>
      <Prose className="mt-0">
        <p>Point any client that supports OAuth for remote servers at <code>{mcpEndpoint(origin)}</code> over Streamable HTTP. It needs only the URL.</p>
      </Prose>
      <ApproveSteps opener="The client opens your browser when it first connects." />
      {full ? (
        <Prose className="mt-4">
          <p>
            A request without a token gets a <code>401</code> with a <code>WWW-Authenticate</code> header that names the protected-resource metadata, so OAuth-aware clients find the sign-in server by themselves. Clients can register with a Client ID Metadata Document or dynamic client registration. If your client cannot do OAuth, use a token.
          </p>
        </Prose>
      ) : null}
    </>
  );
}

/** Each client's guide, by id. */
export const clientGuides: Record<McpClientId, (props: ClientGuideProps) => ReactNode> = {
  "claude-code": ClaudeCodeGuide,
  cursor: CursorGuide,
  "claude-desktop": ClaudeDesktopGuide,
  codex: CodexGuide,
  opencode: OpenCodeGuide,
  devin: DevinGuide,
  "kimi-code": KimiCodeGuide,
  "other-clients": OtherClientsGuide,
};
