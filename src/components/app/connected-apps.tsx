"use client";

import { IconLoader2, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

import { revokeConnectedAppAction } from "@/app/(workspace)/app/connections/actions";
import { ConfirmDialog, useConfirm } from "@/components/confirm-dialog";
import { ConnectionHarness, type SaveConnectionHarness } from "@/components/harness/connection-harness";
import { HarnessIcon } from "@/components/harness/harness-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { HarnessId } from "@/lib/harness/harnesses";
import type { ConnectedApp } from "@/lib/oauth/clients";
import { accessLabels } from "@/lib/oauth/consent-copy";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

function formatDate(value: string | null) {
  return value ? dateFormat.format(new Date(value)) : null;
}

interface AppRowProps {
  app: ConnectedApp;
  revoking: boolean;
  onRevoke: () => void;
  saveHarness: SaveConnectionHarness | undefined;
  onHarnessSaved: (override: HarnessId | null) => void;
}

function AppRow({ app, revoking, onRevoke, saveHarness, onHarnessSaved }: AppRowProps) {
  const approved = formatDate(app.approvedAt);
  const lastActive = formatDate(app.lastActiveAt);
  return (
    <li data-connected-app={app.name} className="flex items-start gap-3 rounded-sm px-3 py-2.5 hover:bg-muted/60">
      <span className="flex h-6 shrink-0 items-center text-muted-foreground"><HarnessIcon id={app.harness.override ?? app.harness.detected} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-md font-medium">{app.name}</p>
          <Badge variant="outline" className="shrink-0 text-xs">{accessLabels[app.access]}</Badge>
        </div>
        {approved ? <p className="mt-0.5 text-xs text-muted-foreground">Approved {approved}</p> : null}
        <p className="mt-0.5 text-xs text-muted-foreground">{lastActive ? `Last active ${lastActive}` : "Not used yet"}</p>
        <ConnectionHarness target={{ kind: "oauth", clientId: app.clientId }} harness={app.harness} name={app.name} save={saveHarness} onSaved={onHarnessSaved} />
      </div>
      <Button variant="ghost" size="icon-sm" disabled={revoking} onClick={onRevoke} aria-label={`Revoke ${app.name}`} className="text-muted-foreground hover:text-destructive">
        {revoking ? <IconLoader2 className="animate-spin" /> : <IconTrash />}
      </Button>
    </li>
  );
}

/**
 * The MCP apps a person approved in the browser, each with the agent it was
 * detected as (and a way to change it) and a Revoke button. `saveHarness`
 * stands in for the server action in the component gallery.
 */
export function ConnectedApps({ initialApps, saveHarness }: { initialApps: ConnectedApp[]; saveHarness?: SaveConnectionHarness }) {
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
    <section className="card-surface h-fit overflow-hidden">
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
                saveHarness={saveHarness}
                onHarnessSaved={(override) => { setApps((current) => current.map((item) => (item.clientId === app.clientId ? { ...item, harness: { ...item.harness, override } } : item))); }}
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
