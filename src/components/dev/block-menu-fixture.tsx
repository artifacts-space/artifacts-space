"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { SaveArtifact } from "@/components/app/artifact-editor/use-autosave";
import { InlineBody } from "@/components/artifact-page/inline-fields";
import { usePageEdit } from "@/components/artifact-page/page-edit-context";
import { PageEditorChromeProvider } from "@/components/artifact-page/page-editor-chrome";
import { PageInlineEditor } from "@/components/artifact-page/page-inline-editor";
import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { BlockLinkTarget } from "@/components/block-links/block-link-target";
import { ReaderBlockMenu } from "@/components/block-links/reader-block-menu";
import { takeQuotedComment, usePendingQuote } from "@/components/comments/quote-request";
import { ConfirmationsProvider } from "@/components/confirmations-provider";
import type { ArtifactDto } from "@/lib/artifact-types";

import { fixtureArtifact } from "./fixture-content";

/**
 * Development only: a Markdown artifact page for the block menu e2e test
 * (e2e/block-menu.spec.ts), with no database. As an editor, the real page
 * editor with block handles; the Markdown it would save shows under it, and
 * a stand-in for the comments shows what Comment sent. As a reader
 * (`?as=reader`), the read view, where a right-click offers only Copy link
 * to block. Both open block links (`#block=…`).
 */

export const blockMenuFixtureMarkdown = `# Four items waiting for you

Written November 11, 2026 by the Supahost agent. Write your answer under each item.

## Rate plan writes

- Frenchman's Cove goes first
- Then Sunset Pointe

> A person's lock beats a supplier close.

Closing paragraph of the fixture.
`;

function fixture(): ArtifactDto {
  return {
    ...fixtureArtifact({ id: "fixture-block-menu", kind: "markdown", title: "Block menu fixture", content: blockMenuFixtureMarkdown, publicId: "blockmenufixture000001" }),
    comments: "team",
    updatedBy: { id: "fixture", kind: "person", handle: "charles", name: "Charles" },
    harness: { id: "claude-code", stamped: "claude-code", overridden: false },
  };
}

/** A save that keeps the change in memory, so autosave runs without a database. */
function useMemorySave(initial: ArtifactDto): SaveArtifact {
  const saved = useRef(initial);
  return useCallback((_id, changes) => {
    saved.current = { ...saved.current, ...changes, updatedAt: new Date().toISOString() };
    return Promise.resolve({ success: true, data: saved.current });
  }, []);
}

/** The Markdown the editor would save, for the test to read. */
function SavedMarkdown() {
  const edit = usePageEdit();
  return <pre data-testid="fixture-markdown" className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-sm whitespace-pre-wrap">{edit?.draft.content ?? ""}</pre>;
}

/** Stands in for the comments under the page: shows the comment Comment started. */
function CommentStandIn({ publicId }: { publicId: string }) {
  const pending = usePendingQuote(publicId);
  const [body, setBody] = useState("");
  const [seen, setSeen] = useState<string | null>(null);
  if (pending !== seen) {
    setSeen(pending);
    if (pending !== null) setBody(pending);
  }
  useEffect(() => {
    if (pending !== null) takeQuotedComment(publicId);
  }, [pending, publicId]);
  return <pre data-testid="fixture-comment" className="mt-2 font-mono text-sm whitespace-pre-wrap">{body}</pre>;
}

function ReaderFixture({ artifact }: { artifact: ArtifactDto }) {
  return (
    <main className="mx-auto w-full max-w-[960px] px-6 py-12 sm:py-16">
      <h1 className="text-4xl font-medium">{artifact.title}</h1>
      <article className="mt-10" data-block-links="">
        <ReaderBlockMenu publicId={artifact.publicId} enabled>
          <ArtifactView kind="markdown" content={artifact.content} title={artifact.title} language="" files={[]} />
        </ReaderBlockMenu>
      </article>
      <BlockLinkTarget />
    </main>
  );
}

/** See the notes at the top of this file. */
export function BlockMenuFixture({ reader }: { reader: boolean }) {
  const artifact = useMemo(() => fixture(), []);
  const save = useMemorySave(artifact);
  const onSaved = useCallback(() => undefined, []);
  if (reader) return <ReaderFixture artifact={artifact} />;
  return (
    <PageEditorChromeProvider>
      <main className="mx-auto w-full max-w-[960px] px-6 py-12 sm:py-16">
        <ConfirmationsProvider initial={[]}>
          <PageInlineEditor artifact={artifact} reviewed={false} onSaved={onSaved} save={save}>
            <h1 className="text-4xl font-medium">{artifact.title}</h1>
            <article className="mt-10" data-block-links="">
              <InlineBody canComment>
                <ArtifactView kind="markdown" content={artifact.content} title={artifact.title} language="" files={[]} />
              </InlineBody>
            </article>
            <h2 className="mt-10 text-lg font-medium">Saved Markdown</h2>
            <SavedMarkdown />
          </PageInlineEditor>
        </ConfirmationsProvider>
        <h2 className="mt-10 text-lg font-medium">Comment</h2>
        <CommentStandIn publicId={artifact.publicId} />
        <BlockLinkTarget />
      </main>
    </PageEditorChromeProvider>
  );
}
