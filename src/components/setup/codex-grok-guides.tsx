import { CodeSnippet, CommandSnippet } from "@/components/code/code-snippet";
import { Prose } from "@/components/docs/docs-content";
import { ApproveSteps, CheckStep, type ClientGuideProps, Label, NoOneClick } from "@/components/setup/guide-parts";
import { Button } from "@/components/ui/button";
import {
  CODEX_SETTINGS_LINK,
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
 * link. The docs show them, and the Connections page shows them in its
 * "Add to" dialog, so they live apart from the other guides and that page
 * loads only these two.
 */

/**
 * Codex: `codex mcp add` with the URL; the desktop app and CLI share config.
 * Steps from https://learn.chatgpt.com/docs/extend/mcp?surface=cli; the
 * desktop app's menu names are not checked in the app itself.
 */
export function CodexGuide({ origin, full = false, hideNoOneClick }: ClientGuideProps) {
  return (
    <>
      <NoOneClick client="Codex" hidden={hideNoOneClick} />
      <Label>In the terminal</Label>
      <CommandSnippet command={codexMcpAddCommand(origin)} className="mt-2" />
      <Prose className="mt-2"><p>Codex adds the server, sees that it uses sign-in, and opens your browser.</p></Prose>
      <Label>In the ChatGPT desktop app</Label>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button render={<a href={CODEX_SETTINGS_LINK} />} nativeButton={false} variant="outline" size="sm">Open Codex settings</Button>
        <span className="text-sm text-muted-foreground">If you have the ChatGPT desktop app, this opens its Settings.</span>
      </div>
      <Prose className="mt-2">
        <ol>
          <li>In <strong>Settings</strong>, choose <strong>MCP servers</strong>, then <strong>Add server</strong>.</li>
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
      <CheckStep note={<>The list shows <strong>artifacts</strong>. In the ChatGPT desktop app, the server list shows <strong>Authenticate</strong> next to a server you still need to sign in to.</>}>
        <CommandSnippet command={codexMcpListCommand()} />
      </CheckStep>
      <Prose className="mt-4"><p>The ChatGPT desktop app, the Codex CLI, and the IDE extension share one config, so you add the server once.</p></Prose>
    </>
  );
}

/**
 * Grok Bot: a custom connector in the desktop app, or a message that asks a Bot to add it.
 * Steps from https://docs.x.ai/grok-bot/computer-and-apps; the menu names
 * are not checked in the app itself.
 */
export function GrokBotGuide({ origin, full = false, hideNoOneClick }: ClientGuideProps) {
  return (
    <>
      <NoOneClick client="Grok Bot" hidden={hideNoOneClick} />
      <Label>In the desktop app</Label>
      <Prose className="mt-2">
        <ol>
          <li>Open <strong>Connect apps</strong>. At the bottom, choose <strong>Add a custom connector</strong>.</li>
          <li>Name it <code>artifacts</code> and choose <strong>Remote HTTPS</strong>.</li>
          <li>Paste the server URL <code>{mcpEndpoint(origin)}</code>. Leave the HTTP headers and the Client ID empty.</li>
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
