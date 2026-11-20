"use client";

import { DocumentMentionsLoader, type LoadDocumentMentionables } from "@/components/editor/document-mentions-context";

/** The window event that lets a held list arrive (`late`). */
export const FIXTURE_MENTIONS_ARRIVE = "fixture:mentions-arrive";

/** Teammates and an agent to mention, so the document editor's suggestions run without a database. */
const loadFixturePeople: LoadDocumentMentionables = () =>
  Promise.resolve({
    success: true as const,
    data: {
      candidates: [
        { userId: "fixture-agent", handle: "claude-code", name: "Claude Code", kind: "agent" as const },
        { userId: "fixture-dana", handle: "dana", name: "Dana Reyes", kind: "person" as const },
        { userId: "fixture-leah", handle: "leah", name: "Leah Park", kind: "person" as const },
      ],
      self: { userId: "fixture-viewer", handle: "viewer", name: "Fixture Viewer", kind: "person" as const },
    },
  });

/** The same list, held until the page hears FIXTURE_MENTIONS_ARRIVE: a slow network, on the test's word. */
const loadFixturePeopleLate: LoadDocumentMentionables = async (publicId) => {
  await new Promise<void>((resolve) => { window.addEventListener(FIXTURE_MENTIONS_ARRIVE, () => { resolve(); }, { once: true }); });
  return loadFixturePeople(publicId);
};

/**
 * Development only: turns on @mentions in the document editors inside, from
 * an in-memory list (e2e/document-mentions.spec.ts). `late` holds the list
 * until the test lets it arrive.
 */
export function DocumentMentionsFixture({ late = false, children }: { late?: boolean; children: React.ReactNode }) {
  return <DocumentMentionsLoader load={late ? loadFixturePeopleLate : loadFixturePeople}>{children}</DocumentMentionsLoader>;
}
