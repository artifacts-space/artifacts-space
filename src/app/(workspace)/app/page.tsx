import type { Metadata } from "next";

import { Dashboard } from "@/components/app/dashboard";
import { listArtifacts } from "@/lib/artifacts";
import { getRequestOrigin } from "@/lib/origin";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Artifacts" };

export default async function AppPage() {
  const session = await getSession();
  const [artifacts, origin] = await Promise.all([
    listArtifacts(session!.user.id),
    getRequestOrigin(),
  ]);

  return <Dashboard initialArtifacts={artifacts} origin={origin} />;
}
