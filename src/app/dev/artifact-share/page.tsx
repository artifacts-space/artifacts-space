import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArtifactShareFixture } from "@/components/dev/artifact-share-fixture";

// A development tool, not a navigation target: skip instant-navigation validation.
export const instant = false;

export const metadata: Metadata = {
  title: "Artifact share fixture",
  robots: { index: false, follow: false },
};

/**
 * Development-only page for the artifact page share e2e test: the artifact
 * page's header with fixture data and no database. `?as=reader` shows it to
 * someone who may not share (the read-only status); otherwise to its owner,
 * with Share saving in memory. Returns 404 in every other environment.
 */
export default async function ArtifactShareFixturePage({ searchParams }: PageProps<"/dev/artifact-share">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { as } = await searchParams;
  return <ArtifactShareFixture as={as === "reader" ? "reader" : "owner"} />;
}
