"use client";

import { useCallback, useMemo, useRef } from "react";

import type { SaveArtifact } from "@/components/app/artifact-editor/use-autosave";
import { ArtifactHeader } from "@/components/artifact-page/artifact-header";
import { StickyChrome } from "@/components/artifact-page/sticky-chrome";
import { InlineBody, InlineSummary, InlineTitle } from "@/components/artifact-page/inline-fields";
import { PageInlineEditor } from "@/components/artifact-page/page-inline-editor";
import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { ConfirmationsProvider } from "@/components/confirmations-provider";
import type { ArtifactDto, ArtifactKind } from "@/lib/artifact-types";
import { visibilityCopy, visibilitySentence } from "@/lib/visibility-copy";

import { dataUi, fixtureArtifact, longJson, longMarkdown, longUi, shortUi, type EditorFixtureKind } from "./fixture-content";

const samples: Record<EditorFixtureKind, { kind: ArtifactKind; content: () => string }> = {
  ui: { kind: "ui", content: longUi },
  json: { kind: "json", content: longJson },
  markdown: { kind: "markdown", content: longMarkdown },
  blocks: { kind: "ui", content: shortUi },
  data: { kind: "ui", content: dataUi },
};

/** A save that keeps the change in memory, so autosave runs end to end without a database. */
function useMemorySave(initial: ArtifactDto): SaveArtifact {
  const saved = useRef(initial);
  return useCallback((_id, changes) => {
    saved.current = { ...saved.current, ...changes, updatedAt: new Date().toISOString() };
    return Promise.resolve({ success: true, data: saved.current });
  }, []);
}

/**
 * Development only: the artifact page's layout (pinned header,
 * heading, content, footer) around the real in-place page editor, with a
 * long artifact and no database. Saves stay in memory. The layout e2e test
 * edits here.
 */
export function EditorFixture({ kind }: { kind: EditorFixtureKind }) {
  const artifact = useMemo(() => fixtureArtifact({ id: `fixture-${kind}`, kind: samples[kind].kind, title: `Long ${kind} fixture`, content: samples[kind].content() }), [kind]);
  const save = useMemorySave(artifact);
  const onSaved = useCallback(() => undefined, []);
  return (
    <div className="min-h-screen">
      <StickyChrome>
        <ArtifactHeader visibility="private" sentence={visibilitySentence(visibilityCopy("private"))} content={artifact.content} />
      </StickyChrome>
      <main className="mx-auto w-full max-w-[960px] px-6 py-12 sm:py-16">
        <ConfirmationsProvider initial={[]}>
          <PageInlineEditor artifact={artifact} reviewed={false} onSaved={onSaved} save={save}>
            <InlineTitle>{artifact.title}</InlineTitle>
            <InlineSummary><p className="mt-4 max-w-2xl text-md leading-7 text-muted-foreground">{artifact.summary}</p></InlineSummary>
            <article className="mt-10">
              <InlineBody>
                <ArtifactView kind={artifact.kind} content={artifact.content} title={artifact.title} language="" files={artifact.files} />
              </InlineBody>
            </article>
          </PageInlineEditor>
        </ConfirmationsProvider>
        <p className="mt-10 text-sm leading-6 text-muted-foreground">Shared from artifacts.space, a shared artifact hub for coding agents.</p>
      </main>
      <footer className="border-t">
        <div className="mx-auto w-full max-w-[960px] px-6 py-6 text-sm text-muted-foreground">artifacts.space</div>
      </footer>
    </div>
  );
}
