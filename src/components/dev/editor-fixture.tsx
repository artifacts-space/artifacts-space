"use client";

import { IconPencil } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { StickyChrome } from "@/components/artifact-page/sticky-chrome";
import { PageEditor } from "@/components/artifact-page/page-editor";
import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { ConfirmationsProvider } from "@/components/confirmations-provider";
import { Button } from "@/components/ui/button";
import type { ArtifactKind } from "@/lib/artifact-types";

import { fixtureArtifact, longJson, longMarkdown, longUi } from "./fixture-content";

/** Formats the fixture can open. */
export type EditorFixtureKind = Extract<ArtifactKind, "ui" | "json" | "markdown">;

const contentFor: Record<EditorFixtureKind, () => string> = { ui: longUi, json: longJson, markdown: longMarkdown };

/**
 * Development only: the artifact page's layout (pinned header and notice,
 * read view, footer) around the real page editor, with a long artifact and
 * no database. The layout e2e test opens Edit here. Save is never pressed.
 */
export function EditorFixture({ kind }: { kind: EditorFixtureKind }) {
  const artifact = useMemo(() => fixtureArtifact({ id: `fixture-${kind}`, kind, title: `Long ${kind} fixture`, content: contentFor[kind]() }), [kind]);
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
