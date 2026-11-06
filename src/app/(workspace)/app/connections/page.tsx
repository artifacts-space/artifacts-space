import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Connections } from "@/components/app/connections";
import { listConnectedApps } from "@/lib/oauth/clients";
import { getSession } from "@/lib/session";
import { siteOrigin } from "@/lib/site-origin";
import { listApiTokens } from "@/lib/tokens";

export const metadata: Metadata = { title: "Connections" };
// Reads the signed-in session, so it renders per request.
export const instant = false;

export default async function ConnectionsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const [tokens, apps] = await Promise.all([listApiTokens(session.user.id), listConnectedApps(session.user.id)]);
  return <Connections initialTokens={tokens} initialApps={apps} origin={siteOrigin()} />;
}
