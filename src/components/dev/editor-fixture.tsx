"use client";

import { IconPencil } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { StickyChrome } from "@/components/artifact-page/sticky-chrome";
import { PageEditor } from "@/components/artifact-page/page-editor";
import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { ConfirmationsProvider } from "@/components/confirmations-provider";
import { Button } from "@/components/ui/button";
import type { ArtifactDto, ArtifactKind } from "@/lib/artifact-types";
import { specJson, type DocElement } from "@/lib/docs/spec-builders";
import { checkoutRolloutSpec } from "@/lib/preview/samples";

/** Formats the fixture can open. */
export type EditorFixtureKind = Extract<ArtifactKind, "ui" | "json" | "markdown">;

/** The rollout dashboard twelve times over: a long ui with charts, timelines, and tables. */
function longUi(): string {
  const elements: Record<string, DocElement> = {};
  const sections: string[] = [];
  for (let copy = 0; copy < 12; copy++) {
    for (const [key, element] of Object.entries(checkoutRolloutSpec.elements)) {
      const children = element.children?.map((child) => `${child}-${String(copy)}`);
      elements[`${key}-${String(copy)}`] = children ? { ...element, children } : element;
    }
    sections.push(`page-${String(copy)}`);
  }
  elements.root = { type: "Stack", props: { gap: "lg" }, children: sections };
  return specJson({ version: checkoutRolloutSpec.version, root: "root", elements });
}

function longJson(): string {
  return JSON.stringify({ items: Array.from({ length: 200 }, (_, index) => ({ id: index, name: `Item ${String(index)}`, tags: ["alpha", "beta"] })) }, null, 2);
}

function longMarkdown(): string {
  return Array.from({ length: 60 }, (_, index) => `## Section ${String(index + 1)}\n\nA paragraph that runs long enough to wrap across a line or two in the reader, so the page is tall.\n`).join("\n");
}

const contentFor: Record<EditorFixtureKind, () => string> = { ui: longUi, json: longJson, markdown: longMarkdown };

function fixtureArtifact(kind: EditorFixtureKind): ArtifactDto {
  const now = "2026-11-07T12:00:00.000Z";
  return {
    id: `fixture-${kind}`,
    publicId: "fixture00000000000000a",
    title: `Long ${kind} fixture`,
    icon: null,
    theme: null,
    cover: null,
    summary: "A long artifact for layout tests.",
    content: contentFor[kind](),
    kind,
    language: "",
    project: null, tags: [],
    sessionId: "",
    source: "web",
    visibility: "private",
    comments: "off",
    teamId: null,
    authorId: "fixture",
    originalAuthorId: null,
    pendingSharing: null,
    pendingEdit: null,
    pendingComments: null,
    files: [],
    updatedBy: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Development only: the artifact page's layout (pinned header and notice,
 * read view, footer) around the real page editor, with a long artifact and
 * no database. The layout e2e test opens Edit here. Save is never pressed.
 */
export function EditorFixture({ kind }: { kind: EditorFixtureKind }) {
  const artifact = useMemo(() => fixtureArtifact(kind), [kind]);
  const [editing, setEditing] = useState(false);
  return (
    <div className="min-h-screen">
      <StickyChrome>
        <header className="mx-auto flex h-14 w-full max-w-[960px] items-center px-6 text-sm font-medium">Editor fixture</header>
        <div role="note" className="border-b bg-muted/50">
          <p className="mx-auto w-full max-w-[960px] px-6 py-2 text-sm leading-5 text-muted-foreground">Only you can see this artifact.</p>
        </div>
      </StickyChrome>
      <main className="mx-auto w-full max-w-[960px] px-6 py-12 sm:py-16">
        <ConfirmationsProvider initial={[]}>
          {editing ? (
            <PageEditor artifact={artifact} onClose={() => { setEditing(false); }} />
          ) : (
            <div>
              <div className="mb-6 flex justify-end">
                <Button variant="outline" size="sm" onClick={() => { setEditing(true); }}><IconPencil /> Edit</Button>
              </div>
              <h1 className="text-4xl font-medium tracking-[-0.03em]">{artifact.title}</h1>
              <article className="mt-10">
                <ArtifactView kind={artifact.kind} content={artifact.content} title={artifact.title} language="" files={artifact.files} />
              </article>
            </div>
          )}
        </ConfirmationsProvider>
        <p className="mt-10 text-sm leading-6 text-muted-foreground">Shared from artifacts.space, a shared artifact hub for coding agents.</p>
      </main>
      <footer className="border-t">
        <div className="mx-auto w-full max-w-[960px] px-6 py-6 text-sm text-muted-foreground">artifacts.space</div>
      </footer>
    </div>
  );
}
