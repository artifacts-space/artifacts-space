"use client";

import { useCallback, useMemo, useRef } from "react";

import type { SaveArtifact } from "@/components/app/artifact-editor/use-autosave";
import { ArtifactHeader } from "@/components/artifact-page/artifact-header";
import { ArtifactHeaderMenu } from "@/components/artifact-page/artifact-header-menu";
import { PageAttachedFiles } from "@/components/artifact-page/page-attached-files";
import { PageConflictNotice, PageEditorChromeProvider } from "@/components/artifact-page/page-editor-chrome";
import { StickyChrome } from "@/components/artifact-page/sticky-chrome";
import { InlineBody, InlineSummary, InlineTitle } from "@/components/artifact-page/inline-fields";
import { PageInlineEditor } from "@/components/artifact-page/page-inline-editor";
import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { SheetFill } from "@/components/artifact-view/sheet-fill";
import { SheetFormatProvider, type SheetFormatSaver } from "@/components/artifact-view/sheet-format";
import { ConfirmationsProvider } from "@/components/confirmations-provider";
import { dropZoneProps } from "@/components/editor/rich/media-bridge";
import { EditorMediaProvider } from "@/components/editor/rich/media-context";
import type { AttachFilesApi } from "@/components/files/attached-files";
import type { ArtifactDto, ArtifactKind } from "@/lib/artifact-types";
import { appFlowCanvas } from "@/lib/canvas/fixtures";
import { bodyFillsColumnClass, pageColumnClass, usesFullWidth } from "@/lib/page-width/rules";
import type { FileDto } from "@/lib/files/types";
import { plainSheetFormat } from "@/lib/sheet-format/rules";
import { sheetAtLimit } from "@/lib/ui/fixtures/formats";
import { visibilityCopy, visibilitySentence } from "@/lib/visibility-copy";

import { CanvasCatchUp, type FixtureCatchUp } from "./catch-up-fixture";
import { fixtureMediaUpload, fixtureMediaUrl } from "./fixture-media";
import { counterPage, dataUi, fixtureArtifact, longJson, longMarkdown, longUi, shortUi, styledUi, type EditorFixtureKind } from "./fixture-content";

const samples: Record<EditorFixtureKind, { kind: ArtifactKind; content: () => string }> = {
  ui: { kind: "ui", content: longUi },
  json: { kind: "json", content: longJson },
  markdown: { kind: "markdown", content: longMarkdown },
  blocks: { kind: "ui", content: shortUi },
  styled: { kind: "ui", content: styledUi },
  data: { kind: "ui", content: dataUi },
  sheet: { kind: "csv", content: sheetAtLimit },
  canvas: { kind: "canvas", content: () => JSON.stringify(appFlowCanvas, null, 2) },
  html: { kind: "html", content: counterPage },
};

/** Sheet formatting kept in memory, so the format menus work without a database. */
const keepFormatInMemory: SheetFormatSaver = (next) => Promise.resolve(next);

/** A formatting save that always fails, as when the connection drops: the failing-save test uses it. */
const failFormatSave: SheetFormatSaver = () => Promise.reject(new Error("The fixture is offline."));

/** The summary an "agent" saves in the fixture's agent mode, just before the person's first save lands. */
const FIXTURE_AGENT_SUMMARY = "An agent rewrote this summary.";

/**
 * A save that keeps the change in memory, so autosave runs end to end
 * without a database. With `agentFirst`, an agent saves a new summary just
 * before the person's first save, which goes through over it, as the server
 * does (src/lib/artifact-save.ts).
 */
function useMemorySave(initial: ArtifactDto, agentFirst: boolean): SaveArtifact {
  const saved = useRef(initial);
  const agentPending = useRef(agentFirst);
  return useCallback((_id, changes) => {
    const overAgents = agentPending.current;
    agentPending.current = false;
    const before = overAgents ? { ...saved.current, summary: FIXTURE_AGENT_SUMMARY } : saved.current;
    saved.current = { ...before, ...changes, updatedAt: new Date().toISOString() };
    return Promise.resolve({ success: true, data: saved.current, savedOverAgents: overAgents });
  }, []);
}

/**
 * Attached files kept in memory, so "Attach file" and a file dropped on
 * the page run end to end without a database or file storage. A file
 * named `refused…` is refused by the attach, as the server refuses one
 * over the artifact's limit.
 */
function useMemoryAttach(artifact: ArtifactDto): AttachFilesApi {
  const uploaded = useRef(new Map<string, FileDto>());
  const attached = useRef<FileDto[]>([]);
  return useMemo(() => ({
    send: (file, report) => {
      report.progress(100);
      const stored: FileDto = { id: crypto.randomUUID(), filename: file.name, contentType: file.type || "application/octet-stream", size: file.size, createdAt: new Date().toISOString(), replacedAt: null };
      uploaded.current.set(stored.id, stored);
      return Promise.resolve({ success: true, data: stored });
    },
    attach: (_artifactId, fileIds) => {
      const files = fileIds.flatMap((fileId) => uploaded.current.get(fileId) ?? []);
      if (files.some((file) => file.filename.startsWith("refused"))) return Promise.resolve({ success: false, error: "An artifact holds at most 20 files. Remove some first." });
      attached.current = [...attached.current, ...files];
      return Promise.resolve({ success: true, data: { ...artifact, files: attached.current } });
    },
    replace: () => Promise.resolve({ success: false, error: "The fixture does not replace files." }),
    discard: (fileId) => Promise.resolve(uploaded.current.delete(fileId)),
  }), [artifact]);
}

/** "I'm editing" stays in the tab: the fixture has no database. */
const keepSignalInTab = () => Promise.resolve(null);

/**
 * Development only: the artifact page's layout (pinned header,
 * heading, content, footer) around the real in-place page editor, with a
 * long artifact and no database. Saves stay in memory, or fail on purpose
 * (`failingSaves`) for the test of a save that does not go through, or go
 * over an agent's save first (`agentSaves`) for the notice that says so. With
 * `catchUp`, the editor finds an agent's save of the canvas when the tab
 * comes back (e2e/catch-up.spec.ts). The layout e2e test edits here.
 */
export function EditorFixture({ kind, failingSaves = false, agentSaves = false, catchUp = null }: { kind: EditorFixtureKind; failingSaves?: boolean; agentSaves?: boolean; catchUp?: FixtureCatchUp }) {
  const artifact = useMemo(() => fixtureArtifact({ id: `fixture-${kind}`, kind: samples[kind].kind, title: `Long ${kind} fixture`, content: samples[kind].content() }), [kind]);
  const save = useMemorySave(artifact, agentSaves);
  const onSaved = useCallback(() => undefined, []);
  const attachApi = useMemoryAttach(artifact);
  return (
    <div className="min-h-screen">
      <PageEditorChromeProvider>
        <StickyChrome>
          <ArtifactHeader visibility="private" sentence={visibilitySentence(visibilityCopy("private"))} content={artifact.content} menu={<ArtifactHeaderMenu />} />
        </StickyChrome>
        <main className={`mx-auto w-full py-12 sm:py-16 ${pageColumnClass(usesFullWidth(artifact.kind, false))}`}>
          <ConfirmationsProvider initial={[]}>
            <CanvasCatchUp artifact={artifact} mode={catchUp}>
            {/* As on the artifact page: the column is the document's drop zone, and here its uploads stay in the tab. */}
            <EditorMediaProvider upload={fixtureMediaUpload} urlFor={fixtureMediaUrl}>
            <div {...dropZoneProps()}>
            <PageInlineEditor artifact={artifact} reviewed={false} onSaved={onSaved} save={save} signalEditing={keepSignalInTab}>
              <InlineTitle>{artifact.title}</InlineTitle>
              <InlineSummary><p className="mt-4 text-md leading-7 text-muted-foreground">{artifact.summary}</p></InlineSummary>
              <PageConflictNotice />
              <article className={`mt-10 ${bodyFillsColumnClass}`}>
                <SheetFill artifactKey={artifact.publicId}>
                  <SheetFormatProvider stored={plainSheetFormat} save={failingSaves ? failFormatSave : keepFormatInMemory}>
                    <InlineBody>
                      <ArtifactView kind={artifact.kind} content={artifact.content} title={artifact.title} language="" files={artifact.files} />
                    </InlineBody>
                  </SheetFormatProvider>
                </SheetFill>
              </article>
              {/* As on the artifact page: the attached files of a format that keeps them beside its content. */}
              <PageAttachedFiles api={attachApi} />
            </PageInlineEditor>
            </div>
            </EditorMediaProvider>
            </CanvasCatchUp>
          </ConfirmationsProvider>
          <p className="mt-10 text-sm leading-6 text-muted-foreground">Shared from artifacts.space, a shared artifact hub for coding agents.</p>
        </main>
      </PageEditorChromeProvider>
      <footer className="border-t">
        <div className={`mx-auto w-full py-6 text-sm text-muted-foreground ${pageColumnClass(false)}`}>artifacts.space</div>
      </footer>
    </div>
  );
}
