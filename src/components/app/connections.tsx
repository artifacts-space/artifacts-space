"use client";

import { IconKey, IconLoader2, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  createTokenAction,
  revokeTokenAction,
  type ApiTokenDto,
} from "@/app/(workspace)/app/connections/actions";
import { ConnectedApps } from "@/components/app/connected-apps";
import { McpToolsTable } from "@/components/app/mcp-tools-table";
import { ConfirmDialog, useConfirm } from "@/components/confirm-dialog";
import { CodeBlock, CommandBlock } from "@/components/code-block";
import { CursorInstallButton } from "@/components/setup/cursor-install-button";
import { SkillInstall } from "@/components/setup/skill-install";
import { TokenRevealDialog } from "@/components/tokens/token-reveal-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ConnectedApp } from "@/lib/oauth/clients";
import { claudeMcpAddOAuthCommand, mcpConfigJson, mcpOAuthConfigJson, TOKEN_PLACEHOLDER } from "@/lib/setup/mcp-config";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export function Connections({
  initialTokens,
  initialApps,
  origin,
}: {
  initialTokens: ApiTokenDto[];
  initialApps: ConnectedApp[];
  origin: string;
}) {
  const [tokens, setTokens] = useState(initialTokens);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);
  const confirmRevoke = useConfirm("revokeToken");

  const config = mcpConfigJson(origin);

  async function create(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    const result = await createTokenAction(name);
    setCreating(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setTokens((current) => [result.data.record, ...current]);
    setNewToken(result.data.token);
    setName("");
  }

  /** Revokes one token. Resolves true once it no longer works. */
  async function revoke(id: string) {
    setRevoking(id);
    try {
      const result = await revokeTokenAction(id);
      if (!result.success) {
        toast.error(result.error);
        return false;
      }
      setTokens((current) => current.filter((token) => token.id !== id));
      toast.success("Token revoked.");
      return true;
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
      return false;
    } finally {
      setRevoking(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1440px] p-4 py-8 sm:p-6 sm:py-10">
      <div className="mb-6">
        <h1 className="text-xl font-medium tracking-[-0.01em]">Connections</h1>
        <p className="mt-1 max-w-xl text-md leading-6 text-muted-foreground">
          One MCP endpoint for every client. Approve apps in the browser, or use a token where nobody can.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <section className="card-surface overflow-hidden">
          <div className="border-b px-5 py-4">
            <h2 className="text-md font-medium">Connect a client</h2>
            <p className="mt-1 text-sm text-muted-foreground">Run this, then approve the app in your browser. No token to copy.</p>
          </div>
          <div className="grid gap-3 p-5">
            <CommandBlock command={claudeMcpAddOAuthCommand(origin)} />
            <div className="flex flex-wrap items-center gap-3">
              <CursorInstallButton origin={origin} />
              <p className="text-sm leading-6 text-muted-foreground">Or, for other clients that support OAuth, add this to mcp.json.</p>
            </div>
            <CodeBlock title="mcp.json" value={mcpOAuthConfigJson(origin)} />
          </div>
          <div className="border-t px-5 py-4">
            <h3 className="text-md font-medium">CI and headless use</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Where nobody can approve in a browser, send a token instead. Replace <code className="font-mono">{TOKEN_PLACEHOLDER}</code> with a token from this page, and keep it out of source control.
            </p>
            <CodeBlock title="mcp.json" value={config} className="mt-3" />
          </div>
          <div className="border-t px-5 py-4">
            <h3 className="text-md font-medium">Agent skill</h3>
            <div className="mt-2">
              <SkillInstall intro="Teach your agent when to save, update, and share artifacts." />
            </div>
          </div>
          <div className="border-t px-5 py-4">
            <h3 className="text-md font-medium">Tools</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">What your agent can do once connected.</p>
            <McpToolsTable />
          </div>
        </section>

        <div className="grid h-fit gap-6">
        <ConnectedApps initialApps={initialApps} />
        <section className="card-surface h-fit overflow-hidden">
          <div className="border-b px-5 py-4">
            <h2 className="text-md font-medium">Access tokens</h2>
            <p className="mt-1 text-sm text-muted-foreground">For CI and headless clients. Use one token per client or device so you can revoke them separately.</p>
          </div>
          <form onSubmit={(event) => void create(event)} noValidate className="border-b p-5">
            <Label htmlFor="token-name">Token name</Label>
            <div className="mt-2 flex gap-2">
              <Input id="token-name" value={name} onChange={(event) => { setName(event.target.value); }} maxLength={80} placeholder="Claude Code on laptop" className="h-9 min-w-0" />
              <Button type="submit" disabled={creating || !name.trim()} size="lg" className="px-3" aria-label="Create token">
                {creating ? <IconLoader2 className="animate-spin" /> : <IconPlus />}
              </Button>
            </div>
          </form>
          <div className="p-2">
            {tokens.length === 0 ? (
              <div className="px-4 py-10 text-center text-md text-muted-foreground">
                <p>No tokens yet.</p>
                <p className="mt-1 text-sm">Create one to connect your first client.</p>
              </div>
            ) : (
              <ul>
                {tokens.map((token) => (
                  <li key={token.id} className="flex items-center gap-3 rounded-sm px-3 py-2.5 hover:bg-muted/60">
                    <IconKey className="size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-md font-medium">{token.name}</p>
                      <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{token.prefix}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {token.lastUsedAt ? `Last used ${dateFormat.format(new Date(token.lastUsedAt))}` : "Never used"}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon-sm" disabled={revoking !== null} onClick={() => { confirmRevoke.request(() => revoke(token.id)); }} aria-label={`Revoke ${token.name}`} className="text-muted-foreground hover:text-destructive">
                      {revoking === token.id ? <IconLoader2 className="animate-spin" /> : <IconTrash />}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        </div>
      </div>

      <TokenRevealDialog token={newToken} origin={origin} onClose={() => { setNewToken(""); }} />

      <ConfirmDialog
        state={confirmRevoke.dialog}
        title="Revoke this token?"
        description="Any client using it loses access immediately. You can create a new token at any time."
        confirmLabel="Revoke"
      />
    </main>
  );
}
