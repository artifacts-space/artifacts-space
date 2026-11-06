import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Connections } from "@/components/app/connections";
import { getSession } from "@/lib/session";
import { siteOrigin } from "@/lib/site-origin";
import { listApiTokens } from "@/lib/tokens";

export const metadata: Metadata = { title: "Connections" };
// Reads the signed-in session, so it renders per request.
export const instant = false;

export default async function ConnectionsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const tokens = await listApiTokens(session.user.id);
  return <Connections initialTokens={tokens} origin={siteOrigin()} />;
}
