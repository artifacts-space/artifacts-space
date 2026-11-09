import { and, count, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { artifactVersion } from "@/db/schema";
import type { ViewableArtifact } from "@/lib/access";
import { loadArtifactByline } from "@/lib/artifact-byline";
import { parseArtifactIcon } from "@/lib/artifact-icons";
import { lastEditorsFor } from "@/lib/artifacts";
import { listComments } from "@/lib/comments/service";
import { filesForViewer } from "@/lib/files/download";
import { fileUrl } from "@/lib/files/types";
import { mayExportCsv } from "@/lib/csv-export/rules";
import { siteUrl } from "@/lib/site-origin";
import { resolveThemeFor } from "@/lib/themes/artifact-theme-context";
import { markdownThemeLabel } from "@/lib/themes/theme-privacy";
import { coverLabel } from "@/lib/covers/cover";
import { UserFacingError } from "@/lib/user-facing-error";

import type { ArtifactMarkdownInput } from "./artifact-markdown";
import { commentsToMarkdown, type CommentsForMarkdown } from "./comments-markdown";

/*
 * Gathers what the Markdown version shows, for a viewer the one access check
 * (getViewableArtifact) already let in. Every field comes from the version
 * this viewer is served, so readers outside the team never see a pending
 * edit, its title, or files attached after the approved version.
 */

/**
 * SQL counting the kept versions up to the served one: its place in the
 * history. The subquery is not correlated (it looks the version up by id),
 * so drizzle's unqualified column names cannot turn it into a self-compare.
 */
export function versionNumberQuery(db: Pick<ReturnType<typeof getDb>, "select">, artifactId: string, versionId: string | null) {
  const upTo = versionId ? sql`${artifactVersion.createdAt} <= (select v.created_at from artifact_version v where v.id = ${versionId})` : undefined;
  return db
    .select({ count: count() })
    .from(artifactVersion)
    .where(and(eq(artifactVersion.artifactId, artifactId), upTo));
}

async function versionNumber(viewable: ViewableArtifact): Promise<number | null> {
  const [row] = await versionNumberQuery(getDb(), viewable.record.id, viewable.version.versionId);
  return row && row.count > 0 ? row.count : null;
}

async function editorLabel(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const editor = (await lastEditorsFor([{ updatedBy: userId }])).get(userId);
  if (!editor) return null;
  return editor.handle ? `@${editor.handle}` : editor.name;
}

const signedOutComments: CommentsForMarkdown = {
  status: "unavailable",
  message: "Comments are shown only to signed-in readers. Send `Authorization: Bearer <token>` with an artifacts.space access token to read them.",
};

/**
 * The comment thread for this viewer, through the comment service's own
 * check (the artifact's comments setting). Hidden comments are never loaded:
 * a viewer the setting leaves out gets only the reason.
 */
async function commentsFor(userId: string | null, publicId: string): Promise<CommentsForMarkdown> {
  if (!userId) return signedOutComments;
  try {
    const { comments } = await listComments(userId, publicId);
    return { status: "shown", comments };
  } catch (error) {
    if (error instanceof UserFacingError) return { status: "unavailable", message: error.message };
    console.error("[markdown] Comments failed", error instanceof Error ? error.name : "unknown error");
    return { status: "unavailable", message: "The comments could not be loaded. Try again." };
  }
}

function emojiOf(icon: string | null): string | null {
  const parsed = parseArtifactIcon(icon);
  return parsed?.type === "emoji" ? parsed.emoji : null;
}

/** Loads everything the Markdown version shows. `withComments` adds the thread (?comments=1). */
export async function loadMarkdownInput(viewable: ViewableArtifact, userId: string | null, withComments: boolean): Promise<ArtifactMarkdownInput> {
  const { record, view } = viewable;
  const [files, byline, updatedBy, version, comments, resolvedTheme] = await Promise.all([
    filesForViewer(viewable),
    loadArtifactByline(record, viewable.isTeamMember),
    editorLabel(view.editedBy),
    versionNumber(viewable),
    withComments ? commentsFor(userId, record.publicId) : Promise.resolve(null),
    resolveThemeFor(record, view.theme),
  ]);
  return {
    title: view.title,
    emoji: emojiOf(view.icon),
    // The theme the page shows: its own, or the team default (marked); none for the site default. Team preset names stay with the team.
    theme: markdownThemeLabel(resolvedTheme, viewable.canEdit),
    cover: view.cover === null ? null : coverLabel(view.cover),
    summary: view.summary,
    kind: view.kind,
    language: view.language,
    content: view.content,
    exportable: mayExportCsv({ canEdit: viewable.canEdit }, { kind: view.kind, allowCsvDownload: record.allowCsvDownload }),
    url: siteUrl(`/artifact/${record.publicId}`),
    rawUrl: siteUrl(`/artifact/${record.publicId}/raw`),
    author: byline.author,
    updatedBy,
    updatedAt: view.updatedAt,
    version,
    approvedVersion: viewable.version.source === "approved",
    files: files.map((file) => ({ id: file.id, filename: file.filename, contentType: file.contentType, size: file.size, url: siteUrl(fileUrl(file.id)) })),
    comments: comments ? commentsToMarkdown(comments) : null,
  };
}
