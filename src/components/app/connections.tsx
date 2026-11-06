"use client";

import { IconKey, IconLoader2, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  createTokenAction,
  revokeTokenAction,
  type ApiTokenDto,
} from "@/app/(workspace)/app/connections/actions";
import { ConfirmDialog, useConfirm } from "@/components/confirm-dialog";
import { CopyButton } from "@/components/copy-button";
import { CopyableValue } from "@/components/copyable-value";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const tools = [
  ["artifacts_create", "Create an artifact with a title, format, project, and content."],
  ["artifacts_get", "Return one artifact in full."],
  ["artifacts_list", "List and search artifacts by text or project."],
  ["artifacts_update", "Change an artifact in place."],
  ["artifacts_delete", "Remove an artifact."],
  ["teams_list", "List your teams, for sharing and team scopes."],
  ["inbox_list", "List unread @mentions with the thread around them."],
  ["inbox_mark_read", "Mark mentions read once handled."],
  ["comments_list", "Read the comment thread on an artifact."],
  ["comment_create", "Comment or reply, with @mentions."],
];

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export function Connections({
  initialTokens,
  origin,
}: {
  initialTokens: ApiTokenDto[];
  origin: string;
}) {
  const [tokens, setTokens] = useState(initialTokens);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);
  const confirmRevoke = useConfirm("revokeToken");

  const endpoint = `${origin}/api/mcp`;
  const config = JSON.stringify(
    {
      mcpServers: {
        artifacts: {
          url: endpoint,
          headers: { Authorization: "Bearer YOUR_TOKEN" },
        },
      },
    },
    null,
    2,
  );

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
        <p className="mt-1 max-w-xl text-[13px] leading-6 text-muted-foreground">
          One MCP endpoint for every client. Tokens are shown once and stored as hashes.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <section className="overflow-hidden rounded-md border bg-card">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-medium">Connect a client</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">Add this configuration to any MCP client, then replace the token.</p>
          </div>
          <div className="p-5">
            <div className="overflow-hidden rounded-md border bg-background/60">
              <div className="flex h-10 items-center justify-between border-b px-4">
                <span className="font-mono text-xs text-muted-foreground">mcp.json</span>
                <CopyButton value={config} label="Copy" variant="ghost" size="sm" className="text-xs" />
              </div>
              <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-6"><code>{config}</code></pre>
            </div>
            <p className="mt-3 text-[13px] leading-6 text-muted-foreground">
              Replace <code className="font-mono">YOUR_TOKEN</code> with a token from this page. Keep it out of source control.
            </p>
          </div>
          <div className="border-t px-5 py-4">
            <h3 className="text-sm font-medium">Tools</h3>
            <table className="mt-3 w-full border-collapse text-[13px]">
              <tbody>
                {tools.map(([tool, description]) => (
                  <tr key={tool} className="border-t">
                    <td className="py-2 pr-6 align-top font-mono text-xs whitespace-nowrap">{tool}</td>
                    <td className="py-2 align-top leading-5 text-muted-foreground">{description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="h-fit overflow-hidden rounded-md border bg-card">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-medium">Access tokens</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">Use one token per client or device so you can revoke them separately.</p>
          </div>
          <form onSubmit={(event) => void create(event)} noValidate className="border-b p-5">
            <Label htmlFor="token-name" className="text-xs">Token name</Label>
            <div className="mt-2 flex gap-2">
              <Input id="token-name" value={name} onChange={(event) => { setName(event.target.value); }} maxLength={80} placeholder="Claude Code on laptop" className="h-9 min-w-0 text-[13px]" />
              <Button type="submit" disabled={creating || !name.trim()} size="lg" className="px-3" aria-label="Create token">
                {creating ? <IconLoader2 className="animate-spin" /> : <IconPlus />}
              </Button>
            </div>
          </form>
          <div className="p-2">
            {tokens.length === 0 ? (
              <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                <p>No tokens yet.</p>
                <p className="mt-1 text-xs">Create one to connect your first client.</p>
              </div>
            ) : (
              <ul>
                {tokens.map((token) => (
                  <li key={token.id} className="flex items-center gap-3 rounded-sm px-3 py-2.5 hover:bg-muted/60">
                    <IconKey className="size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{token.name}</p>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{token.prefix}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
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

      <Dialog open={Boolean(newToken)} onOpenChange={(open) => { if (!open) setNewToken(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Token created</DialogTitle>
            <DialogDescription className="leading-6">Copy it now. It will not be shown again.</DialogDescription>
          </DialogHeader>
          <CopyableValue value={newToken} />
          <DialogFooter><Button onClick={() => { setNewToken(""); }}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        state={confirmRevoke.dialog}
        title="Revoke this token?"
        description="Any client using it loses access immediately. You can create a new token at any time."
        confirmLabel="Revoke"
      />
    </main>
  );
}
