import type { ReactNode } from "react";

import { CodeBlock, CommandBlock } from "@/components/code-block";
import { Prose } from "@/components/docs/docs-content";
import { CursorInstallButton } from "@/components/setup/cursor-install-button";
import {
  codexConfigToml,
  codexMcpAddCommand,
  codexMcpLoginCommand,
  opencodeConfigJson,
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
      <div className="mt-3"><CommandBlock command={claudeMcpAddOAuthCommand(origin)} /></div>
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
      <CodeBlock title="mcp.json" value={mcpOAuthConfigJson(origin)} className="mt-3" />
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
      <div className="mt-2"><CommandBlock command={codexMcpAddCommand(origin)} /></div>
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
          <CodeBlock title="config.toml" value={codexConfigToml(origin)} className="mt-3" />
          <div className="mt-3"><CommandBlock command={codexMcpLoginCommand()} /></div>
        </>
      ) : null}
      <ApproveSteps opener="Your browser opens on the sign-in page." />
      <Prose className="mt-4"><p>The ChatGPT desktop app, the Codex CLI, and the IDE extension share one config, so you add the server once.</p></Prose>
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

/** Any other client: the endpoint, OpenCode's config, and how discovery works. */
export function OtherClientsGuide({ origin, full = false }: ClientGuideProps) {
  return (
    <>
      <Prose className="mt-0">
        <p>Point any client that supports OAuth for remote servers at <code>{mcpEndpoint(origin)}</code> over Streamable HTTP. It needs only the URL.</p>
        <p>OpenCode reads remote servers from <code>opencode.json</code>:</p>
      </Prose>
      <CodeBlock title="opencode.json" value={opencodeConfigJson(origin)} className="mt-3" />
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
  devin: DevinGuide,
  "other-clients": OtherClientsGuide,
};
