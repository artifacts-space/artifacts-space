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

/** A list that cannot be loaded, as when the request fails. */
const failToLoad: LoadDocumentMentionables = () => Promise.resolve({ success: false as const, error: "Suggestions could not be loaded." });

const loaders = { on: loadFixturePeople, late: loadFixturePeopleLate, fail: failToLoad } satisfies Record<string, LoadDocumentMentionables>;

/** How the fixture's list behaves: there at once, held until the test lets it arrive, or never loaded. */
export type FixtureMentions = keyof typeof loaders;

/**
 * Development only: turns on @mentions in the document editors inside, from
 * an in-memory list (e2e/document-mentions.spec.ts).
 */
export function DocumentMentionsFixture({ mode, children }: { mode: FixtureMentions; children: React.ReactNode }) {
  return <DocumentMentionsLoader load={loaders[mode]}>{children}</DocumentMentionsLoader>;
}
