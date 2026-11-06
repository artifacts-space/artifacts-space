import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Dashboard } from "@/components/app/dashboard";
import { listArtifacts } from "@/lib/artifacts";
import { getRequestOrigin } from "@/lib/origin";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Artifacts" };
// Reads the signed-in session, so it renders per request.
export const instant = false;

export default async function AppPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const [artifacts, origin] = await Promise.all([
    listArtifacts(session.user.id),
    getRequestOrigin(),
  ]);

  return <Dashboard initialArtifacts={artifacts} origin={origin} />;
}
