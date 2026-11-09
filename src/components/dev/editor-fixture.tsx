"use client";

import { useCallback, useMemo, useRef } from "react";

import type { SaveArtifact } from "@/components/app/artifact-editor/use-autosave";
import { ArtifactHeader } from "@/components/artifact-page/artifact-header";
import { ArtifactHeaderMenu } from "@/components/artifact-page/artifact-header-menu";
import { PageConflictNotice, PageEditorChromeProvider } from "@/components/artifact-page/page-editor-chrome";
import { StickyChrome } from "@/components/artifact-page/sticky-chrome";
import { InlineBody, InlineSummary, InlineTitle } from "@/components/artifact-page/inline-fields";
import { PageInlineEditor } from "@/components/artifact-page/page-inline-editor";
import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { SheetFill } from "@/components/artifact-view/sheet-fill";
import { SheetFormatProvider, type SheetFormatSaver } from "@/components/artifact-view/sheet-format";
import { ConfirmationsProvider } from "@/components/confirmations-provider";
import type { ArtifactDto, ArtifactKind } from "@/lib/artifact-types";
import { pageColumnClass, usesFullWidth } from "@/lib/page-width/rules";
import { plainSheetFormat } from "@/lib/sheet-format/rules";
import { sheetAtLimit } from "@/lib/ui/fixtures/formats";
import { visibilityCopy, visibilitySentence } from "@/lib/visibility-copy";

import { dataUi, fixtureArtifact, longJson, longMarkdown, longUi, shortUi, type EditorFixtureKind } from "./fixture-content";

const samples: Record<EditorFixtureKind, { kind: ArtifactKind; content: () => string }> = {
  ui: { kind: "ui", content: longUi },
  json: { kind: "json", content: longJson },
  markdown: { kind: "markdown", content: longMarkdown },
  blocks: { kind: "ui", content: shortUi },
  data: { kind: "ui", content: dataUi },
  sheet: { kind: "csv", content: sheetAtLimit },
};

/** Sheet formatting kept in memory, so the format menus work without a database. */
const keepFormatInMemory: SheetFormatSaver = (next) => Promise.resolve(next);

/** A formatting save that always fails, as when the connection drops: the failing-save test uses it. */
const failFormatSave: SheetFormatSaver = () => Promise.reject(new Error("The fixture is offline."));

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
 * long artifact and no database. Saves stay in memory, or fail on purpose
 * (`failingSaves`) for the test of a save that does not go through. The
 * layout e2e test edits here.
 */
export function EditorFixture({ kind, failingSaves = false }: { kind: EditorFixtureKind; failingSaves?: boolean }) {
  const artifact = useMemo(() => fixtureArtifact({ id: `fixture-${kind}`, kind: samples[kind].kind, title: `Long ${kind} fixture`, content: samples[kind].content() }), [kind]);
  const save = useMemorySave(artifact);
  const onSaved = useCallback(() => undefined, []);
  return (
    <div className="min-h-screen">
      <PageEditorChromeProvider>
        <StickyChrome>
          <ArtifactHeader visibility="private" sentence={visibilitySentence(visibilityCopy("private"))} content={artifact.content} menu={<ArtifactHeaderMenu />} />
        </StickyChrome>
        <main className={`mx-auto w-full py-12 sm:py-16 ${pageColumnClass(usesFullWidth(artifact.kind, false))}`}>
          <ConfirmationsProvider initial={[]}>
            <PageInlineEditor artifact={artifact} reviewed={false} onSaved={onSaved} save={save}>
              <InlineTitle>{artifact.title}</InlineTitle>
              <InlineSummary><p className="mt-4 max-w-2xl text-md leading-7 text-muted-foreground">{artifact.summary}</p></InlineSummary>
              <PageConflictNotice />
              <article className="mt-10">
                <SheetFill artifactKey={artifact.publicId}>
                  <SheetFormatProvider stored={plainSheetFormat} save={failingSaves ? failFormatSave : keepFormatInMemory}>
                    <InlineBody>
                      <ArtifactView kind={artifact.kind} content={artifact.content} title={artifact.title} language="" files={artifact.files} />
                    </InlineBody>
                  </SheetFormatProvider>
                </SheetFill>
              </article>
            </PageInlineEditor>
          </ConfirmationsProvider>
          <p className="mt-10 text-sm leading-6 text-muted-foreground">Shared from artifacts.space, a shared artifact hub for coding agents.</p>
        </main>
      </PageEditorChromeProvider>
      <footer className="border-t">
        <div className="mx-auto w-full max-w-[960px] px-6 py-6 text-sm text-muted-foreground">artifacts.space</div>
      </footer>
    </div>
  );
}
