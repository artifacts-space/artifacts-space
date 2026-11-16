import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Relative imports: drizzle-kit loads this file without the "@/" alias.
import { captureLimits, captureModes, captureStatuses, captureTypes } from "../lib/canvas/capture-rules";

import { user } from "./schema";

const quoted = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(", "));

/*
 * Frame captures (src/lib/canvas/captures.ts): images of canvas frames, drawn
 * by the browser of someone who may edit the canvas, so agents can see what a
 * frame looks like. A capture is the image of one content (`frame_hash`: the
 * frame's size, padding, spec, theme, and files) in one mode, cut into parts.
 * Its parts live in R2 under captures/<artifact id>/<capture id>/<n>.
 *
 * A row is pending while its parts upload, ready once the server checked
 * them, and removed while its objects are being deleted. `artifact_id` has no
 * foreign key on purpose: a removed row outlives its artifact until its
 * objects are gone, so the cleanup job can always finish a removal.
 */
export const frameCapture = pgTable(
  "frame_capture",
  {
    // In every object key, so two captures never share a key.
    id: text("id").primaryKey(),
    artifactId: text("artifact_id").notNull(),
    mode: text("mode", { enum: captureModes }).notNull(),
    // SHA-256 of what decides the pixels, made by the server only.
    frameHash: text("frame_hash").notNull(),
    status: text("status", { enum: captureStatuses }).notNull().default("pending"),
    partCount: integer("part_count").notNull(),
    columns: integer("columns").notNull(),
    // The frame's width and full height in CSS pixels, and how much of the height the parts cover.
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    drawnHeight: integer("drawn_height").notNull(),
    contentType: text("content_type", { enum: captureTypes }).notNull(),
    // All parts together. It counts toward the storage quota of whoever drew it.
    bytes: integer("bytes").notNull(),
    // True when a picture or diagram could not be drawn.
    partial: boolean("partial").notNull().default(false),
    // Who drew it. Agents get the time, never the person.
    capturedBy: text("captured_by").references(() => user.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
  },
  (table) => [
    // What a canvas has of one content: the needed list, start, finish, and reads.
    index("frame_capture_content_idx").on(table.artifactId, table.frameHash, table.mode, table.status),
    // A person's captures: the storage quota, and the cap on unfinished ones.
    index("frame_capture_captured_by_idx").on(table.capturedBy, table.status),
    // The cleanup job: pending rows past their time, and removals to finish.
    index("frame_capture_status_started_idx").on(table.status, table.startedAt),
    check("frame_capture_mode_check", sql`${table.mode} in (${quoted(captureModes)})`),
    check("frame_capture_status_check", sql`${table.status} in (${quoted(captureStatuses)})`),
    check("frame_capture_type_check", sql`${table.contentType} in (${quoted(captureTypes)})`),
    check("frame_capture_parts_check", sql`${table.partCount} between 1 and ${sql.raw(String(captureLimits.maxParts))} and ${table.columns} between 1 and 2`),
    check("frame_capture_bytes_check", sql`${table.bytes} > 0 and ${table.bytes} <= ${sql.raw(String(captureLimits.maxParts * captureLimits.maxPartBytes))}`),
  ],
);

export type FrameCaptureRecord = typeof frameCapture.$inferSelect;
