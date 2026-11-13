import { CodeSnippet, CommandSnippet } from "@/components/code/code-snippet";
import { CopyCode } from "@/components/copy-code";
import { Prose } from "@/components/docs/docs-content";
import { ApproveSteps, CheckStep, type ClientGuideProps, Label, NoOneClick } from "@/components/setup/guide-parts";
import {
  CODEX_PLUGIN_NAME,
  codexConfigToml,
  codexMcpAddCommand,
  codexMcpListCommand,
  codexMcpLoginCommand,
  GROK_CONNECTORS_URL,
  grokBotAddMessage,
} from "@/lib/setup/client-installs";
import { mcpEndpoint } from "@/lib/setup/mcp-config";

/**
 * The guides for Codex and Grok Bot, the two desktop apps with no install
 * link. Their "Add to" buttons on the Connections page open these sections
 * of the clients page, so the steps live in one place.
 */

/**
 * Codex: a custom MCP server added from Plugins in the app, or
 * `codex mcp add` in the terminal. The app's steps follow its "Add custom
 * MCP server" form as the owner saw it in November 2026; what the app shows
 * after "Create as a plugin" is not checked. The terminal steps are from
 * https://learn.chatgpt.com/docs/extend/mcp?surface=cli.
 */
export function CodexGuide({ origin, full = false }: ClientGuideProps) {
  return (
    <>
      <NoOneClick client="Codex" />
      <Label>In the Codex app</Label>
      <Prose className="mt-2">
        <ol>
          <li>Open <strong>Plugins</strong>. Choose <strong>Add</strong>, then <strong>Add custom MCP server</strong>.</li>
          <li>Name it <code>{CODEX_PLUGIN_NAME}</code>. Under <strong>Connection</strong>, keep <strong>Server URL</strong> and paste <CopyCode value={mcpEndpoint(origin)} />.</li>
          <li>Set <strong>Authentication</strong> to <strong>OAuth</strong>. Leave <strong>Advanced OAuth settings</strong> as they are.</li>
          <li>Select <strong>I understand and want to continue</strong>, then choose <strong>Create as a plugin</strong>.</li>
        </ol>
      </Prose>
      <Label>In the terminal</Label>
      <CommandSnippet command={codexMcpAddCommand(origin)} className="mt-2" />
      <Prose className="mt-2"><p>Codex adds the server, sees that it uses sign-in, and opens your browser. The Codex CLI and the IDE extension share one config, so the command covers both.</p></Prose>
      {full ? (
        <>
          <Label>In config.toml</Label>
          <Prose className="mt-2"><p>Or add this to <code>~/.codex/config.toml</code>, then sign in with the command below.</p></Prose>
          <CodeSnippet title="config.toml" language="toml" code={codexConfigToml(origin)} className="mt-3" />
          <CommandSnippet command={codexMcpLoginCommand()} className="mt-3" />
        </>
      ) : null}
      <ApproveSteps opener="Codex asks you to sign in. Your browser opens on the sign-in page." />
      <CheckStep note={<>In the Codex app, open <strong>Plugins</strong>: <strong>{CODEX_PLUGIN_NAME}</strong> shows under <strong>Installed</strong>. In the terminal, the list shows <strong>artifacts</strong>.</>}>
        <CommandSnippet command={codexMcpListCommand()} />
      </CheckStep>
    </>
  );
}

/**
 * Grok Bot: a custom connector in the desktop app, or a message that asks a Bot to add it.
 * Steps from https://docs.x.ai/grok-bot/computer-and-apps; the menu names
 * are not checked in the app itself.
 */
export function GrokBotGuide({ origin, full = false }: ClientGuideProps) {
  return (
    <>
      <NoOneClick client="Grok Bot" />
      <Label>In the desktop app</Label>
      <Prose className="mt-2">
        <ol>
          <li>Open <strong>Connect apps</strong>. At the bottom, choose <strong>Add a custom connector</strong>.</li>
          <li>Name it <code>artifacts</code> and choose <strong>Remote HTTPS</strong>.</li>
          <li>Paste the server URL <CopyCode value={mcpEndpoint(origin)} />. Leave the HTTP headers and the Client ID empty.</li>
          <li>Choose <strong>Add plugin</strong>. When the app shows <strong>Needs auth</strong>, choose <strong>Authenticate</strong>.</li>
        </ol>
      </Prose>
      <Label>Or ask a Bot</Label>
      <Prose className="mt-2"><p>Send this message in a chat. The Bot adds the server. If it shows a sign-in card, choose <strong>Connect</strong>.</p></Prose>
      <CodeSnippet title="Message" code={grokBotAddMessage(origin)} wrap className="mt-3" />
      <ApproveSteps opener="Your browser opens on the sign-in page." />
      <CheckStep
        note={<>Open <strong>Connect apps</strong>. <strong>artifacts</strong> shows under <strong>Installed</strong>. <strong>Added</strong> means it is installed but not signed in yet. If it shows <strong>Needs auth</strong> or <strong>Disconnected</strong>, choose <strong>Authenticate</strong>.</>}
      />
      {full ? (
        <Prose className="mt-4">
          <p>In a team, an admin&apos;s MCP policy decides which servers you can add. If the app refuses to save the server, ask your admin to allow it.</p>
          <p>Grok on the web takes the same URL: open <a href={GROK_CONNECTORS_URL}>grok.com/connectors</a>, choose <strong>New Connector</strong>, then <strong>Custom</strong>.</p>
        </Prose>
      ) : null}
    </>
  );
}
