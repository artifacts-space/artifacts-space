import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WorkspaceFixture } from "@/components/dev/workspace-fixture";

// A development tool, not a navigation target: skip instant-navigation validation.
export const instant = false;

export const metadata: Metadata = {
  title: "Workspace fixture",
  robots: { index: false, follow: false },
};

/**
 * Development-only page for the app shell e2e test: the /app workspace with
 * long artifacts and a long list, without a database. Returns 404 in every
 * other environment.
 */
export default function WorkspaceFixturePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <WorkspaceFixture />;
}
