import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MermaidFixture } from "@/components/dev/mermaid-fixture";

// A development tool, not a navigation target: skip instant-navigation validation.
export const instant = false;

export const metadata: Metadata = {
  title: "Diagram fixture",
  robots: { index: false, follow: false },
};

/**
 * Development-only page for the Markdown diagram e2e test: fenced mermaid
 * blocks in the read view and the rich editor, without a database
 * (mermaid-fixture.tsx). Returns 404 in every other environment.
 */
export default function MermaidFixturePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <MermaidFixture />;
}
