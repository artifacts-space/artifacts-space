"use client";

import { IconAlertTriangle, IconCheck, IconLoader2, IconPlugConnected } from "@tabler/icons-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { accessAbilities } from "@/lib/oauth/consent-copy";
import { consentScope } from "@/lib/oauth/scopes";

const genericError = "Something went wrong. Check your connection and try again.";

interface ConsentFormProps {
  /** The signed query string the OAuth server sent, passed back unchanged. */
  oauthQuery: string;
  clientName: string;
  clientUri: string | null;
  identityNote: string;
  returnTo: string | null;
  requestedScope: string;
  /** False when the app only asked to read, so there is nothing to choose. */
  canWrite: boolean;
  email: string;
}

/** Sends the decision to the OAuth server and follows its redirect back to the app. */
async function sendDecision(accept: boolean, scope: string, oauthQuery: string): Promise<string> {
  const response = await fetch("/api/auth/oauth2/consent", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ accept, scope, oauth_query: oauthQuery }),
  });
  const body: unknown = await response.json().catch(() => null);
  const url = typeof body === "object" && body !== null && "url" in body && typeof body.url === "string" ? body.url : null;
  if (!response.ok || !url) throw new Error("consent failed");
  return url;
}

function AppHeading({ name, uri }: { name: string; uri: string | null }) {
  return (
    <div className="mb-6">
      <span className="card-surface mb-4 flex size-10 items-center justify-center text-muted-foreground">
        <IconPlugConnected className="size-5" />
      </span>
      <h1 className="text-2xl font-medium tracking-[-0.015em] text-balance">Connect {name}</h1>
      {uri ? <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{uri}</p> : null}
    </div>
  );
}

/** Approve or deny an app's request to use artifacts.space, with an optional read-only grant. */
export function ConsentForm({ oauthQuery, clientName, clientUri, identityNote, returnTo, requestedScope, canWrite, email }: ConsentFormProps) {
  const switchId = useId();
  const [readOnly, setReadOnly] = useState(!canWrite);
  const [pending, setPending] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState("");
  const abilities = accessAbilities[readOnly ? "read" : "full"];

  async function decide(accept: boolean) {
    setPending(accept ? "approve" : "deny");
    setError("");
    try {
      window.location.assign(await sendDecision(accept, consentScope(requestedScope, readOnly), oauthQuery));
    } catch {
      setError(genericError);
      setPending(null);
    }
  }

  return (
    <div className="w-full max-w-[420px]">
      <AppHeading name={clientName} uri={clientUri} />
      <p className="text-md leading-6 text-muted-foreground">
        {clientName} wants to use your artifacts as <span className="text-foreground">{email}</span>. It can:
      </p>
      <ul className="mt-3 space-y-2">
        {abilities.map((ability) => (
          <li key={ability} className="flex gap-2 text-md leading-6">
            <IconCheck className="mt-1 size-4 shrink-0 text-muted-foreground" />
            {ability}
          </li>
        ))}
      </ul>

      {canWrite ? (
        <div className="card-surface mt-5 flex items-start justify-between gap-4 px-4 py-3">
          <label htmlFor={switchId} className="min-w-0">
            <span className="block text-md font-medium">Read-only access</span>
            <span className="mt-0.5 block text-sm leading-5 text-muted-foreground">Let it read and search, but not change anything.</span>
          </label>
          <Switch id={switchId} checked={readOnly} onCheckedChange={setReadOnly} disabled={pending !== null} className="mt-1" />
        </div>
      ) : null}

      <p className="mt-5 flex gap-2 rounded-md border border-dashed px-3 py-2.5 text-sm leading-5 text-muted-foreground">
        <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
        {identityNote}
      </p>

      {error ? (
        <p role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm leading-5 text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex gap-2">
        <Button size="lg" className="flex-1" disabled={pending !== null} onClick={() => void decide(true)}>
          {pending === "approve" ? <IconLoader2 className="animate-spin" /> : null} Approve
        </Button>
        <Button size="lg" variant="outline" className="flex-1" disabled={pending !== null} onClick={() => void decide(false)}>
          {pending === "deny" ? <IconLoader2 className="animate-spin" /> : null} Deny
        </Button>
      </div>
      <p className="mt-4 text-sm leading-5 text-muted-foreground">
        {returnTo ? `You go back to ${returnTo} after you choose. ` : ""}You can disconnect it at any time in Connections.
      </p>
    </div>
  );
}
