import Link from "next/link";

import { CodeSnippet, CommandSnippet } from "@/components/code/code-snippet";
import { DocsH, Note, Prose } from "@/components/docs/docs-content";
import { RegistryPage } from "@/components/docs/docs-page";
import { clientGuides } from "@/components/setup/client-guides";
import { ClientLogo } from "@/components/setup/client-logos";
import { docsMetadata } from "@/lib/docs/metadata";
import { docsHref } from "@/lib/docs/pages";
import { codexHeadlessConfigToml, mcpClients } from "@/lib/setup/client-installs";
import { claudeMcpAddCommand, mcpConfigJson, TOKEN_ENV_VAR } from "@/lib/setup/mcp-config";

export const metadata = docsMetadata("clients");

const origin = "https://artifacts.space";

/**
 * Client setup: one section per MCP client. Every path is the remote
 * endpoint over Streamable HTTP, signed in with OAuth in the browser, with
 * tokens only for headless use. The steps follow each client's own docs:
 * - Cursor: https://cursor.com/docs/context/mcp/install-links and https://cursor.com/docs/context/mcp
 * - Claude: https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp
 * - Codex: https://learn.chatgpt.com/docs/extend/mcp?surface=cli
 * - OpenCode: https://opencode.ai/docs/mcp-servers/
 * - Devin: https://docs.devin.ai/work-with-devin/mcp
 * - Kimi Code CLI: https://moonshotai.github.io/kimi-code/en/customization/mcp.html
 * - fx: https://fx.sh/docs/capabilities/mcp, https://fx.sh/docs/using-fx/cli, and https://fx.sh/docs/capabilities/skills
 */
export default function ClientsPage() {
  const page = "clients" as const;
  return (
    <RegistryPage slug={page}>
      <Prose className="mt-0">
        <p>
          Every client connects to the same endpoint. Cursor has a one-click button. The others take a command, a config file, or a short form, and none of them needs a token: you sign in and approve in your browser.
        </p>
      </Prose>

      {mcpClients.map((client) => {
        const Guide = clientGuides[client.id];
        return (
          <section key={client.id} aria-labelledby={client.id}>
            <DocsH page={page} id={client.id} icon={<ClientLogo id={client.id} className="size-5" />} />
            <div className="mt-4"><Guide origin={origin} full /></div>
          </section>
        );
      })}

      <DocsH page={page} id="headless" />
      <Prose>
        <p>
          Where nobody can approve in a browser, such as CI, a container, or a cloud agent, send an access token. Create one on the <strong>Connections</strong> page and keep it in an environment variable such as <code>{TOKEN_ENV_VAR}</code>, never in source control.
        </p>
      </Prose>
      <CodeSnippet title="mcp.json" language="json" code={mcpConfigJson(origin)} className="mt-4" />
      <Prose><p>Claude Code, reading the token from the environment:</p></Prose>
      <CommandSnippet command={claudeMcpAddCommand(origin, `$${TOKEN_ENV_VAR}`)} className="mt-4" />
      <Prose><p>Codex, in <code>~/.codex/config.toml</code>:</p></Prose>
      <CodeSnippet title="config.toml" language="toml" code={codexHeadlessConfigToml(origin)} className="mt-4" />
      <Note title="Give team agents their own token">
        An agent that works for a team should be an agent teammate with its own token, so its work shows under its own handle. See <Link href={docsHref("sharing", "agent-tokens")} className="underline underline-offset-2">Agent tokens</Link>.
      </Note>
      <p className="mt-10 text-xs text-muted-foreground">Product names and logos belong to their owners. They show compatibility only.</p>
    </RegistryPage>
  );
}
