"use client";

import { IconApps, IconLoader2, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

import { revokeConnectedAppAction } from "@/app/(workspace)/app/connections/actions";
import { ConfirmDialog, useConfirm } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ConnectedApp } from "@/lib/oauth/clients";
import { accessLabels } from "@/lib/oauth/consent-copy";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

function formatDate(value: string | null) {
  return value ? dateFormat.format(new Date(value)) : null;
}

function AppRow({ app, revoking, onRevoke }: { app: ConnectedApp; revoking: boolean; onRevoke: () => void }) {
  const approved = formatDate(app.approvedAt);
  const lastActive = formatDate(app.lastActiveAt);
  return (
    <li className="flex items-center gap-3 rounded-sm px-3 py-2.5 hover:bg-muted/60">
      <IconApps className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-md font-medium">{app.name}</p>
          <Badge variant="outline" className="shrink-0 text-xs">{accessLabels[app.access]}</Badge>
        </div>
        {approved ? <p className="mt-0.5 text-xs text-muted-foreground">Approved {approved}</p> : null}
        <p className="mt-0.5 text-xs text-muted-foreground">{lastActive ? `Last active ${lastActive}` : "Not used yet"}</p>
      </div>
      <Button variant="ghost" size="icon-sm" disabled={revoking} onClick={onRevoke} aria-label={`Revoke ${app.name}`} className="text-muted-foreground hover:text-destructive">
        {revoking ? <IconLoader2 className="animate-spin" /> : <IconTrash />}
      </Button>
    </li>
  );
}

/** The MCP apps a person approved in the browser, each with a Revoke button. */
export function ConnectedApps({ initialApps }: { initialApps: ConnectedApp[] }) {
  const [apps, setApps] = useState(initialApps);
  const [revoking, setRevoking] = useState<string | null>(null);
  const confirmRevoke = useConfirm("revokeConnectedApp");

  /** Revokes one app. Resolves true once its tokens no longer work. */
  async function revoke(clientId: string) {
    setRevoking(clientId);
    try {
      const result = await revokeConnectedAppAction(clientId);
      if (!result.success) {
        toast.error(result.error);
        return false;
      }
      setApps((current) => current.filter((app) => app.clientId !== clientId));
      toast.success("Access revoked.");
      return true;
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
      return false;
    } finally {
      setRevoking(null);
    }
  }

  return (
    <section className="h-fit overflow-hidden rounded-md border bg-card">
      <div className="border-b px-5 py-4">
        <h2 className="text-md font-medium">Connected apps</h2>
        <p className="mt-1 text-sm text-muted-foreground">Apps you approved in the browser. Each one acts as you.</p>
      </div>
      <div className="p-2">
        {apps.length === 0 ? (
          <div className="px-4 py-8 text-center text-md text-muted-foreground">
            <p>No connected apps yet.</p>
            <p className="mt-1 text-sm">Add the MCP server to your client, then approve it here in the browser.</p>
          </div>
        ) : (
          <ul>
            {apps.map((app) => (
              <AppRow
                key={app.clientId}
                app={app}
                revoking={revoking === app.clientId}
                onRevoke={() => { confirmRevoke.request(() => revoke(app.clientId)); }}
              />
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        state={confirmRevoke.dialog}
        title="Revoke this app's access?"
        description="It loses access at once, and its tokens stop working. You can connect it again at any time."
        confirmLabel="Revoke"
      />
    </section>
  );
}
