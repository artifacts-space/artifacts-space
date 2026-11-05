"use client";

import {
  Bot,
  Check,
  KeyRound,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  Unplug,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  createTokenAction,
  revokeTokenAction,
  type ApiTokenDto,
} from "@/app/(workspace)/app/connections/actions";
import { CopyButton } from "@/components/copy-button";
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
  ["artifacts_create", "Capture a new artifact with project and session context."],
  ["artifacts_get", "Retrieve the complete contents of one artifact."],
  ["artifacts_list", "List and search artifacts by content or project."],
  ["artifacts_update", "Revise an artifact without losing its identity."],
  ["artifacts_delete", "Remove context that is no longer useful."],
];

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
  const [revokeId, setRevokeId] = useState("");
  const [revoking, setRevoking] = useState(false);

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

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

  async function revoke() {
    setRevoking(true);
    const result = await revokeTokenAction(revokeId);
    setRevoking(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setTokens((current) => current.filter((token) => token.id !== revokeId));
    setRevokeId("");
    toast.success("Token revoked. Connected agents can no longer use it.");
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] p-4 py-8 sm:p-6 sm:py-10">
      <div className="mb-8">
        <div className="mb-2 font-mono text-[9px] tracking-[0.14em] text-[#72a5ff]">AGENT ACCESS</div>
        <h1 className="text-3xl font-medium tracking-[-0.04em]">Connections</h1>
        <p className="mt-2 max-w-xl text-[13px] leading-6 text-white/35">One MCP endpoint for every harness. Tokens are shown once and stored only as secure hashes.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <section className="overflow-hidden rounded-xl border border-white/10 bg-[#14151a]">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <h2 className="text-sm font-medium text-white/80">Connect your agent</h2>
              <p className="mt-1 text-[11px] text-white/30">Add this configuration to your MCP-compatible client.</p>
            </div>
            <Bot className="size-4 text-[#72a5ff]" />
          </div>
          <div className="p-5">
            <div className="overflow-hidden rounded-lg border border-white/10 bg-[#0d0e11]">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
                <span className="font-mono text-[9px] text-white/30">mcp.json</span>
                <CopyButton value={config} label="Copy config" variant="ghost" className="h-7 text-[10px]" />
              </div>
              <pre className="overflow-x-auto p-5 font-mono text-[11px] leading-6 text-white/55"><code>{config}</code></pre>
            </div>
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-[#3980ff]/15 bg-[#1768ff]/[0.045] p-3.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#72a5ff]" />
              <p className="text-[11px] leading-5 text-white/40">Replace <code className="font-mono text-white/65">YOUR_TOKEN</code> with an access token from this page. Keep it out of source control.</p>
            </div>
          </div>
          <div className="border-t border-white/10 px-5 py-4">
            <div className="mb-4 font-mono text-[9px] tracking-[0.12em] text-white/25">AVAILABLE TOOLS</div>
            <div className="space-y-3">
              {tools.map(([tool, description]) => (
                <div key={tool} className="grid gap-1 sm:grid-cols-[155px_1fr] sm:gap-4">
                  <code className="font-mono text-[10px] text-[#82adfa]">{tool}</code>
                  <p className="text-[11px] leading-5 text-white/30">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="h-fit overflow-hidden rounded-xl border border-white/10 bg-[#14151a]">
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="text-sm font-medium text-white/80">Access tokens</h2>
            <p className="mt-1 text-[11px] text-white/30">Use a different token for each agent or device.</p>
          </div>
          <form onSubmit={create} className="border-b border-white/10 p-5">
            <Label htmlFor="token-name" className="text-[11px] text-white/50">New token name</Label>
            <div className="mt-2 flex gap-2">
              <Input id="token-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} placeholder="Claude Code · laptop" className="h-9 min-w-0 border-white/10 bg-black/15 text-xs" />
              <Button type="submit" disabled={creating || !name.trim()} className="h-9 bg-[#1768ff] px-3 text-white hover:bg-[#2f76ff]">
                {creating ? <Loader2 className="animate-spin" /> : <Plus />}<span className="sr-only">Create token</span>
              </Button>
            </div>
          </form>
          <div className="p-3">
            {tokens.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <KeyRound className="mx-auto size-5 text-white/20" />
                <p className="mt-3 text-xs text-white/35">No active tokens yet.</p>
                <p className="mt-1 text-[10px] text-white/20">Create one to connect your first agent.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {tokens.map((token) => (
                  <div key={token.id} className="group flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-white/[0.025]">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.025]"><KeyRound className="size-3.5 text-white/35" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium text-white/65">{token.name}</p>
                      <p className="mt-1 truncate font-mono text-[9px] text-white/25">{token.prefix}</p>
                      <p className="mt-1 font-mono text-[8px] text-white/20">
                        {token.lastUsedAt ? `LAST USED ${new Date(token.lastUsedAt).toLocaleDateString("en-US", { timeZone: "UTC" })}` : "NEVER USED"}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon-sm" onClick={() => setRevokeId(token.id)} aria-label={`Revoke ${token.name}`} className="text-white/25 hover:text-red-300"><Unplug /></Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <Dialog open={Boolean(newToken)} onOpenChange={(open) => { if (!open) setNewToken(""); }}>
        <DialogContent className="border-white/10 bg-[#191a1f]">
          <DialogHeader>
            <div className="mb-2 flex size-9 items-center justify-center rounded-lg border border-[#3980ff]/20 bg-[#1768ff]/10"><Check className="size-4 text-[#72a5ff]" /></div>
            <DialogTitle>Token created</DialogTitle>
            <DialogDescription className="leading-6 text-white/40">Copy this token now. For security, you will not be able to see it again.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#0d0e11] p-2 pl-3">
            <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-[#8cb5ff]">{newToken}</code>
            <CopyButton value={newToken} label="Copy" variant="secondary" className="h-8" />
          </div>
          <DialogFooter><Button onClick={() => setNewToken("")} className="bg-white text-black hover:bg-white/85">I saved my token</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(revokeId)} onOpenChange={(open) => { if (!open) setRevokeId(""); }}>
        <DialogContent className="border-white/10 bg-[#191a1f]">
          <DialogHeader>
            <DialogTitle>Revoke this token?</DialogTitle>
            <DialogDescription className="leading-6 text-white/40">Any agent using it will immediately lose access. You can create a new token at any time.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevokeId("")}>Cancel</Button>
            <Button variant="destructive" onClick={revoke} disabled={revoking}>{revoking ? <Loader2 className="animate-spin" /> : <Trash2 />} Revoke token</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
