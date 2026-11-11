import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Relative imports: drizzle-kit loads this file without the "@/" alias.
import { fileLimits } from "../lib/files/config";

import { artifact, artifactFile, artifactVersion, user } from "./schema";

/*
 * Old copies of replaced files (src/lib/files/replace.ts). Replacing a file
 * keeps its `artifact_file` row, so its id, place, and links stay; the row
 * takes the new upload's object, and what it held before moves here. Only
 * people who can edit the artifact reach a copy, through History. Readers of
 * an approved version get the copy that was current when that version was
 * saved. A copy is kept while any version in the history was saved while it
 * was current (copies.ts), so it follows version retention.
 */
export const artifactFileCopy = pgTable(
  "artifact_file_copy",
  {
    id: text("id").primaryKey(),
    // The file entry it was replaced in. Set null when the entry goes; the cleanup job then removes the copy.
    fileId: text("file_id").references(() => artifactFile.id, { onDelete: "set null" }),
    // Set null when the artifact goes; the cleanup job then removes the copy.
    artifactId: text("artifact_id").references(() => artifact.id, { onDelete: "set null" }),
    // The R2 object the entry held before: files/<id>/<name>.
    key: text("key").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    // Who uploaded this copy. It counts toward their account's file storage quota.
    uploaderId: text("uploader_id").references(() => user.id, { onDelete: "set null" }),
    // When this copy became the current file: the replace before it, or null for the file as first attached.
    currentFrom: timestamp("current_from", { withTimezone: true }),
    // When a newer upload replaced it.
    replacedAt: timestamp("replaced_at", { withTimezone: true }).notNull().defaultNow(),
    replacedBy: text("replaced_by").references(() => user.id, { onDelete: "set null" }),
    // The version the replace filed, for History ("Replaced report.pdf").
    versionId: text("version_id").references(() => artifactVersion.id, { onDelete: "set null" }),
  },
  (table) => [
    uniqueIndex("artifact_file_copy_key_idx").on(table.key),
    index("artifact_file_copy_file_replaced_idx").on(table.fileId, table.replacedAt),
    index("artifact_file_copy_artifact_idx").on(table.artifactId),
    index("artifact_file_copy_uploader_idx").on(table.uploaderId),
    // Account deletion sets replaced_by null; the index keeps that from scanning every copy.
    index("artifact_file_copy_replaced_by_idx").on(table.replacedBy),
    index("artifact_file_copy_version_idx").on(table.versionId),
    check("artifact_file_copy_size_check", sql`${table.size} > 0 and ${table.size} <= ${sql.raw(String(fileLimits.maxBytes))}`),
  ],
);

export type ArtifactFileCopyRecord = typeof artifactFileCopy.$inferSelect;
