import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WorkspaceFixture } from "@/components/dev/workspace-fixture";
import { parseProjectFilter } from "@/lib/projects/filter-params";

// A development tool, not a navigation target: skip instant-navigation validation.
export const instant = false;

export const metadata: Metadata = {
  title: "Workspace fixture",
  robots: { index: false, follow: false },
};

/**
 * Development-only page for the app shell e2e test: the /app workspace with
 * long artifacts, a long list, and projects, without a database. The
 * project filter in the URL works as on /app. Returns 404 in every other
 * environment.
 */
export default async function WorkspaceFixturePage({ searchParams }: PageProps<"/dev/workspace">) {
  if (process.env.NODE_ENV !== "development") notFound();
  return <WorkspaceFixture projectFilter={parseProjectFilter(await searchParams)} />;
}
