"use client";

import { IconMessage, IconPalette } from "@tabler/icons-react";
import { useState } from "react";

import { ArtifactHeader } from "@/components/artifact-page/artifact-header";
import { ArtifactPageFooter } from "@/components/artifact-page/artifact-page-footer";
import { ArtifactPageTheme } from "@/components/artifact-page/artifact-page-theme";
import { VisibilityBadge } from "@/components/artifact-page/visibility-badge";
import { ThemePicker } from "@/components/artifact-theme/theme-picker";
import { CommentComposer } from "@/components/comments/comment-composer";
import { CommentItem, type CommentHandlers } from "@/components/comments/comment-item";
import type { WriteOutcome } from "@/components/comments/use-comment-thread";
import { Button } from "@/components/ui/button";
import type { ArtifactVisibility } from "@/lib/artifact-types";
import type { CommentView } from "@/lib/comments/views";
import { themeLabel } from "@/lib/themes/artifact-theme";
import { resolveTheme } from "@/lib/themes/resolve";
import { visibilityCopy, visibilitySentence } from "@/lib/visibility-copy";

const visibilities: readonly ArtifactVisibility[] = ["private", "team", "link", "public"];
const byline = { author: "Dana", teamName: "Platform" };

const sampleComment: CommentView = {
  id: "fixture-comment",
  parentId: null,
  body: "Looks good. @claude-code can you add the rollout dates? cc @dana",
  deleted: false,
  edited: false,
  author: { userId: "fixture-sam", handle: "sam", name: "Sam", kind: "person", ownerName: null, label: "@sam" },
  mentions: [{ handle: "claude-code", kind: "agent" }, { handle: "dana", kind: "person" }],
  canChange: true,
  createdAt: "2026-11-02T15:04:00.000Z",
  updatedAt: "2026-11-02T15:04:00.000Z",
};

/** The gallery never posts: every action reports that it is a sample. */
const sampleRefusal = (): Promise<WriteOutcome> => Promise.resolve({ ok: false, error: "This is a sample thread." });
const sampleHandlers: CommentHandlers = { onReply: () => undefined, onEdit: sampleRefusal, onDelete: sampleRefusal, onMute: sampleRefusal };

/**
 * The parts of the artifact page around the artifact (the header, a comment
 * thread, and the footer) inside ArtifactPageTheme, wearing the theme a picker
 * chooses the way the page does, plus each visibility's label. For the
 * gallery and its e2e test. The header is not pinned here, so the gallery
 * scrolls as before.
 */
export function ArtifactHeaderSpecimen() {
  const [theme, setTheme] = useState<string | null>(null);
  const resolved = resolveTheme(theme, null);
  const trigger = (
    <Button type="button" variant="outline" size="sm">
      <IconPalette /> Page theme: {themeLabel(theme)}
    </Button>
  );
  return (
    <div className="space-y-3">
      <ThemePicker value={theme} onChange={setTheme} trigger={trigger} />
      <ArtifactPageTheme theme={resolved.theme} data-page-theme={resolved.presetId ?? "custom"} className="overflow-hidden rounded-md border">
        <ArtifactHeader visibility="private" sentence={visibilitySentence(visibilityCopy("private"))} content="# Release plan" />
        <section aria-label="Comments" className="mx-auto w-full max-w-[960px] space-y-3 px-6 py-8">
          <h2 className="flex items-center gap-2 text-md font-medium">
            <IconMessage className="size-4 text-muted-foreground" aria-hidden /> Comments
          </h2>
          <div className="card-surface divide-y px-4 sm:px-5">
            <CommentItem comment={sampleComment} agent={undefined} handlers={sampleHandlers} />
          </div>
          <div className="card-surface p-3 sm:p-4">
            <CommentComposer label="Write a comment" placeholder="Write a comment" submitLabel="Comment" onSubmit={sampleRefusal} />
          </div>
        </section>
        <ArtifactPageFooter />
      </ArtifactPageTheme>
      <div className="flex flex-wrap gap-2" data-visibility-badges="">
        {visibilities.map((visibility) => (
          <VisibilityBadge key={visibility} visibility={visibility} sentence={visibilitySentence(visibilityCopy(visibility), byline)} />
        ))}
      </div>
    </div>
  );
}
