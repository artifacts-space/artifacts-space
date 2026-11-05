import type { Metadata } from "next";

import { Connections } from "@/components/app/connections";
import { getRequestOrigin } from "@/lib/origin";
import { getSession } from "@/lib/session";
import { listApiTokens } from "@/lib/tokens";

export const metadata: Metadata = { title: "Connections" };

export default async function ConnectionsPage() {
  const session = await getSession();
  const [tokens, origin] = await Promise.all([
    listApiTokens(session!.user.id),
    getRequestOrigin(),
  ]);
  return <Connections initialTokens={tokens} origin={origin} />;
}
