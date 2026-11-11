import type { ReactNode } from "react";

import { CodeSnippet, CommandSnippet } from "@/components/code/code-snippet";
import { Prose } from "@/components/docs/docs-content";
import { CursorInstallButton } from "@/components/setup/cursor-install-button";
import {
  CHATGPT_PLUGINS_URL,
  codexConfigToml,
  codexMcpAddCommand,
  codexMcpLoginCommand,
  FX_INSTALL_COMMAND,
  fxConfigJson,
  fxMcpAddCommand,
  fxMcpLoginCommand,
  fxMcpShowCommand,
  fxSkillInstallCommand,
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

/** ChatGPT on the web: a custom MCP server, added from the Plugins page by URL. */
export function ChatGptGuide({ origin, full = false }: ClientGuideProps) {
  return (
    <>
      <NoOneClick client="ChatGPT" />
      <Prose className="mt-2">
        <ol>
          <li>In ChatGPT on the web, open <a href={CHATGPT_PLUGINS_URL}><strong>Plugins</strong></a>. Choose <strong>+</strong>, then <strong>Add custom MCP server</strong>.</li>
          <li>Name it <code>artifacts.space</code>. Under <strong>Connection</strong>, paste the server URL <code>{mcpEndpoint(origin)}</code>.</li>
          <li>Choose <strong>OAuth</strong> for authentication. Leave the client ID and secret empty: ChatGPT registers itself.</li>
          <li>Choose <strong>I understand and want to continue</strong>, then <strong>Create as a plugin</strong>. Then install the plugin.</li>
        </ol>
      </Prose>
      <ApproveSteps opener="ChatGPT asks you to connect. A sign-in window opens." />
      <Label>Use it in a chat</Label>
      <Prose className="mt-2">
        <p>Start a new chat, type <code>@</code>, and choose <strong>artifacts.space</strong>. It reads without asking. Before it saves, changes, or deletes anything, it asks you. You can tell it to remember your answer for that tool until the chat ends.</p>
        <p>On ChatGPT Pro, ChatGPT can use the read tools: it finds and reads your artifacts, comments, and files. To save or change them, you need a Business, Enterprise, or Edu workspace.</p>
      </Prose>
      {full ? (
        <Prose className="mt-4">
          <p>You do not need Developer mode. In a Business workspace, only owners and admins can add a custom server. In Enterprise and Edu, an admin can give members the <strong>Create plugins with MCPs</strong> permission.</p>
          <p>ChatGPT on the web does not read the Codex config. If you added the server for Codex, add it here too. When new tools arrive, open the plugin and choose <strong>Refresh</strong>.</p>
        </Prose>
      ) : null}
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

/** Installing the agent itself, for the clients page: what it is, then its installer. */
function InstallStep({ label, about, command }: { label: string; about: string; command: string }) {
  return (
    <>
      <Label>{label}</Label>
      <Prose className="mt-2"><p>{about}</p></Prose>
      <CommandSnippet command={command} className="mt-2" />
      <Label>Connect it</Label>
    </>
  );
}

/** fx: install, `fx mcp add` with the URL, the skill from inside fx, then `fx mcp show`. */
export function FxGuide({ origin, full = false }: ClientGuideProps) {
  return (
    <>
      {full ? (
        <InstallStep label="Install fx" about="fx is a minimal, open-source coding agent CLI from Vercel Labs. It runs on macOS and Linux." command={FX_INSTALL_COMMAND} />
      ) : null}
      <p className="text-md leading-6 text-muted-foreground">Run one command. There is no token to copy.</p>
      <CommandSnippet command={fxMcpAddCommand(origin)} className="mt-3" />
      <Prose className="mt-2"><p>fx saves the server in <code>~/.fx/mcp.json</code>, sees that it uses sign-in, and opens your browser. Inside fx, <code>/mcp add artifacts {mcpEndpoint(origin)}</code> does the same.</p></Prose>
      <ApproveSteps opener={<>Your browser opens on the sign-in page. To sign in later or again, run <code>{fxMcpLoginCommand()}</code>.</>} />
      <Label>Add the skill</Label>
      <Prose className="mt-2"><p>Type this inside fx. It installs the skill to <code>~/.fx/skills</code>, so it works in every project.</p></Prose>
      <CodeSnippet title="fx" code={fxSkillInstallCommand()} className="mt-3" />
      <CheckStep note={<>fx connects and lists the artifacts tools. Inside fx, <code>/mcp</code> shows the same.</>}>
        <CommandSnippet command={fxMcpShowCommand()} />
      </CheckStep>
      {full ? (
        <>
          <Label>In mcp.json</Label>
          <Prose className="mt-2"><p>Or add the server to <code>~/.fx/mcp.json</code> by hand, then sign in with <code>{fxMcpLoginCommand()}</code>. In a project&apos;s <code>.mcp.json</code>, fx waits until you approve the server with <code>fx mcp approve artifacts</code>.</p></Prose>
          <CodeSnippet title="mcp.json" language="json" code={fxConfigJson(origin)} className="mt-3" />
          <Prose className="mt-4"><p>On a machine without a browser, such as over SSH, run <code>fx mcp login --no-browser artifacts</code>. fx prints a link to open on any device, and you paste back the address your browser ends up on.</p></Prose>
        </>
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
  chatgpt: ChatGptGuide,
  codex: CodexGuide,
  opencode: OpenCodeGuide,
  devin: DevinGuide,
  "kimi-code": KimiCodeGuide,
  fx: FxGuide,
  "other-clients": OtherClientsGuide,
};
