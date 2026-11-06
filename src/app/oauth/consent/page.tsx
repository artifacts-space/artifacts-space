import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { ConsentForm } from "@/components/oauth/consent-form";
import { getAuth } from "@/lib/auth/server";
import { getConsentClient } from "@/lib/oauth/clients";
import { identityNote, returnDestination } from "@/lib/oauth/consent-copy";
import { oauthSignInPath, searchFromParams } from "@/lib/oauth/resume";
import { requestsWrite } from "@/lib/oauth/scopes";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Connect an app", robots: { index: false, follow: false } };
export const instant = false;

function Problem({ title, body }: { title: string; body: string }) {
  return (
    <div className="w-full max-w-[420px]">
      <h1 className="text-2xl font-medium tracking-[-0.015em]">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
      <Link href="/app/connections" className="mt-6 inline-block text-[13px] underline underline-offset-4">Go to Connections</Link>
    </div>
  );
}

async function hasValidSignature(search: string) {
  try {
    const { secret } = await getAuth().$context;
    return await verifyOAuthQueryParams(search, secret);
  } catch {
    return false;
  }
}

/**
 * The OAuth consent page. The OAuth server sends people here with a signed
 * copy of the app's request; the form approves or denies it.
 */
export default async function ConsentPage({ searchParams }: PageProps<"/oauth/consent">) {
  const search = searchFromParams(await searchParams);
  const session = await getSession();
  if (!session) redirect(oauthSignInPath(search));

  const query = new URLSearchParams(search);
  const clientId = query.get("client_id");
  const [valid, client] = await Promise.all([hasValidSignature(search), clientId ? getConsentClient(clientId) : null]);

  return (
    <AuthShell>
      {!valid ? (
        <Problem title="This request has expired" body="Go back to your app and start the connection again." />
      ) : !client ? (
        <Problem title="This app is not registered" body="Go back to your app and start the connection again. If it keeps happening, the app may have been removed." />
      ) : (
        <ConsentForm
          oauthQuery={search}
          clientName={client.name?.trim() || "An unnamed app"}
          clientUri={client.uri}
          identityNote={identityNote(client)}
          returnTo={returnDestination(query.get("redirect_uri"))}
          requestedScope={query.get("scope") ?? ""}
          canWrite={requestsWrite(query.get("scope"))}
          email={session.user.email}
        />
      )}
    </AuthShell>
  );
}
