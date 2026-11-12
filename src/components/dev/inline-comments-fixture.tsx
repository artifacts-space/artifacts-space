"use client";

import { useCallback, useMemo, useRef } from "react";

import type { SaveArtifact } from "@/components/app/artifact-editor/use-autosave";
import { InlineBody } from "@/components/artifact-page/inline-fields";
import { PageEditorChromeProvider } from "@/components/artifact-page/page-editor-chrome";
import { PageInlineEditor } from "@/components/artifact-page/page-inline-editor";
import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { CommentThread } from "@/components/comments/comment-thread";
import { MentionablesLoader, type LoadMentionables } from "@/components/comments/mentionables-context";
import type { ThreadApi } from "@/components/comments/use-comment-thread";
import { ConfirmationsProvider } from "@/components/confirmations-provider";
import { InlineCommentSurface } from "@/components/inline-comments/inline-comment-surface";
import { InlineCommentsProvider } from "@/components/inline-comments/inline-comments-provider";
import type { ArtifactDto } from "@/lib/artifact-types";
import type { CommentAnchor } from "@/lib/comments/anchor-rules";
import type { CommentView } from "@/lib/comments/views";
import { bodyFillsColumnClass } from "@/lib/page-width/rules";

import { fixtureArtifact } from "./fixture-content";

/**
 * Development only: a Markdown artifact with inline comments for the e2e
 * test (e2e/inline-comments.spec.ts), with no database. As an editor, the
 * real page editor; as a reader (`?as=reader`), the read view. The comments
 * live in memory behind the same calls the app makes (ThreadApi), so the
 * highlights, the cards at the text, and the Comments list are the real
 * ones. `?seed=1` starts with one open inline comment, one on words that are
 * no longer in the text, and one resolved.
 */

export const inlineCommentsFixtureMarkdown = `# Moving off the feed

The Supasync agent is the single writer, so nobody overwrites anybody. The Supahost agent sends its text by message.

## Rate plans

- Frenchman's Cove goes first
- Then Sunset Pointe

> A person's lock beats a supplier close.

Do not add a rate plan to a property that is still on the feed. Read the [cutover notes](https://example.com/cutover) before you start.
`;

const viewer = { userId: "fixture", handle: "charles", name: "Charles", kind: "person" as const, ownerName: null, label: "@charles" };

/** A comment by the fixture's viewer, as the server would return it. */
function fixtureComment(fields: { id: string; body: string; parentId?: string | null; anchor?: CommentAnchor | null; resolved?: boolean }): CommentView {
  const at = "2026-11-12T12:00:00.000Z";
  const anchor = fields.anchor ?? null;
  const top = !fields.parentId;
  return {
    id: fields.id,
    parentId: fields.parentId ?? null,
    body: fields.body,
    deleted: false,
    edited: false,
    author: viewer,
    mentions: [],
    canChange: true,
    anchored: anchor !== null,
    anchor,
    resolved: fields.resolved ? { at, by: viewer.label } : null,
    canResolve: top,
    createdAt: at,
    updatedAt: at,
  };
}

const seedComments: CommentView[] = [
  fixtureComment({ id: "seed-open", body: "Should Leah be able to write too?", anchor: { quote: "single writer", prefix: "The Supasync agent is the", suffix: ", so nobody overwrites" } }),
  fixtureComment({ id: "seed-reply", body: "Not yet.", parentId: "seed-open" }),
  fixtureComment({ id: "seed-changed", body: "This sentence was rewritten since.", anchor: { quote: "the double writer", prefix: "", suffix: "" } }),
  fixtureComment({ id: "seed-resolved", body: "Which one goes second?", anchor: { quote: "Then Sunset Pointe", prefix: "goes first", suffix: "" }, resolved: true }),
];

const done = <T,>(data: T) => Promise.resolve({ success: true as const, data });

/** Teammates to mention, so the comment box's suggestions run without a database. */
const loadFixtureMentionables: LoadMentionables = () => done({
  candidates: [
    { userId: "fixture-dana", handle: "dana", name: "Dana Reyes", kind: "person" as const },
    { userId: "fixture-leah", handle: "leah", name: "Leah Park", kind: "person" as const },
    { userId: "fixture-agent", handle: "claude-code", name: "Claude Code", kind: "agent" as const },
  ],
  self: { userId: viewer.userId, handle: viewer.handle, name: viewer.name, kind: "person" as const },
});
const noMentions = { mentions: { notified: [], refused: [] } };

/** A thread kept in memory, behind the calls the app makes to the server. */
function memoryThreadApi(seed: readonly CommentView[]): ThreadApi {
  let comments = [...seed];
  let created = 0;
  const change = (id: string, apply: (comment: CommentView) => CommentView) => {
    comments = comments.map((comment) => (comment.id === id ? apply(comment) : comment));
  };
  return {
    load: () => done({ comments, agents: [], viewerId: viewer.userId }),
    create: (_publicId, body, parentId, anchor) => {
      created += 1;
      comments = [...comments, fixtureComment({ id: `made-${String(created)}`, body, parentId, anchor })];
      return done(noMentions);
    },
    update: (id, body) => {
      change(id, (comment) => ({ ...comment, body, edited: true }));
      return done(noMentions);
    },
    remove: (id) => {
      change(id, (comment) => ({ ...comment, body: "", deleted: true, anchor: null, canChange: false, canResolve: false }));
      return done(null);
    },
    resolve: (id, resolved) => {
      change(id, (comment) => ({ ...comment, resolved: resolved ? { at: new Date().toISOString(), by: viewer.label } : null }));
      return done(null);
    },
    setMute: () => done(null),
    markRead: () => done(null),
  };
}

const artifact: ArtifactDto = {
  ...fixtureArtifact({ id: "fixture-inline-comments", kind: "markdown", title: "Inline comments fixture", content: inlineCommentsFixtureMarkdown, publicId: "inlinecommentsfixture01" }),
  comments: "team",
  updatedBy: { id: "fixture", kind: "person", handle: "charles", name: "Charles" },
};

/** A save that keeps the change in memory, so autosave runs without a database. */
function useMemorySave(initial: ArtifactDto): SaveArtifact {
  const saved = useRef(initial);
  return useCallback((_id, changes) => {
    saved.current = { ...saved.current, ...changes, updatedAt: new Date().toISOString() };
    return Promise.resolve({ success: true, data: saved.current });
  }, []);
}

/** The artifact's words: the page editor for an editor, the read view for a reader. */
function FixtureBody({ reader }: { reader: boolean }) {
  const save = useMemorySave(artifact);
  const onSaved = useCallback(() => undefined, []);
  const view = <ArtifactView kind="markdown" content={artifact.content} title={artifact.title} language="" files={[]} />;
  if (reader) return <article className={`mt-10 ${bodyFillsColumnClass}`}><InlineCommentSurface>{view}</InlineCommentSurface></article>;
  return (
    <ConfirmationsProvider initial={[]}>
      <PageInlineEditor artifact={artifact} reviewed={false} onSaved={onSaved} save={save}>
        <article className={`mt-10 ${bodyFillsColumnClass}`} data-block-links="">
          <InlineBody canComment>{view}</InlineBody>
        </article>
      </PageInlineEditor>
    </ConfirmationsProvider>
  );
}

/** See the notes at the top of this file. */
export function InlineCommentsFixture({ reader, seeded }: { reader: boolean; seeded: boolean }) {
  const api = useMemo(() => memoryThreadApi(seeded ? seedComments : []), [seeded]);
  return (
    <PageEditorChromeProvider>
      <MentionablesLoader load={loadFixtureMentionables}>
      <main className="mx-auto w-full max-w-[960px] px-6 py-12 sm:py-16">
        <InlineCommentsProvider publicId={artifact.publicId} kind="markdown" canComment api={api}>
          <h1 className="text-4xl font-medium">{artifact.title}</h1>
          <FixtureBody reader={reader} />
          <CommentThread publicId={artifact.publicId} className="mt-12 border-t pt-8" raised />
        </InlineCommentsProvider>
      </main>
      </MentionablesLoader>
    </PageEditorChromeProvider>
  );
}
