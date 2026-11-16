import { createHash } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { artifactFile, type ArtifactFileRecord, type ArtifactRecord } from "@/db/schema";
import { fileRefsInContent } from "@/lib/files/refs";
import { toFileDto } from "@/lib/files/store";
import type { FileDto } from "@/lib/files/types";
import { loadArtifactThemeContext } from "@/lib/themes/artifact-theme-context";
import type { Theme } from "@/lib/themes/schema";
import { resolveArtifactTheme } from "@/lib/themes/team-preset-rules";

import { captureHashInput, captureModesFor, type CaptureDrawing, type CaptureFileFacts } from "./capture-rules";
import type { FramePadding } from "./limits";
import { frameSpecText, type CanvasFrameRead } from "./read";
import { validateCanvas } from "./validate";

/**
 * What a canvas's frames look like right now, for frame captures: each
 * frame that can be drawn, with the hash of its content in every mode its
 * theme draws. Only the server makes a hash, from the newest saved content,
 * the resolved theme, and the artifact's files, so every caller agrees on it.
 */

/** One frame that can be drawn, and the drawings of it. */
export interface BoardFrame {
  width: number;
  /** The least height the frame asks for, or null when it follows its content. */
  height: number | null;
  padding: FramePadding;
  /** The frame's ui spec as JSON text. */
  spec: string;
  /** One drawing for each mode the theme draws. */
  drawings: CaptureDrawing[];
}

/** A canvas as the capture host draws it. */
export interface CaptureBoard {
  /** The theme the canvas renders with. */
  theme: Theme;
  /** The artifact's files, as its page lists them. */
  files: FileDto[];
  /** Every frame that can be drawn, in board order. A frame with errors is left out: it is never drawn. */
  frames: BoardFrame[];
}

/** The team theme could not be read, so no hash can be trusted: the site theme must never stand in for it. */
export class ThemeUnreadableError extends Error {
  constructor() {
    super("The canvas's theme could not be read.");
    this.name = "ThemeUnreadableError";
  }
}

/**
 * The theme a canvas renders with. Unlike resolveThemeFor, a failed read of
 * the team's theme throws: a hash made with the site theme in its place
 * would call an image current that shows the wrong colors.
 */
async function boardTheme(record: Pick<ArtifactRecord, "userId" | "visibility" | "teamId" | "theme">): Promise<Theme> {
  try {
    const context = await loadArtifactThemeContext({ userId: record.userId, visibility: record.visibility, teamId: record.teamId }, [record.theme]);
    return resolveArtifactTheme(record.theme, context).theme;
  } catch (error) {
    // The name only, so a failure that lasts can be found without logging a theme or a team.
    console.error("[captures] A canvas's theme could not be read", error instanceof Error ? error.name : "unknown error");
    throw new ThemeUnreadableError();
  }
}

/** The artifact's ready files, in the order its page lists them. */
async function boardFiles(artifactId: string): Promise<ArtifactFileRecord[]> {
  return getDb()
    .select()
    .from(artifactFile)
    .where(and(eq(artifactFile.artifactId, artifactId), eq(artifactFile.status, "ready")))
    .orderBy(asc(artifactFile.attachedAt), asc(artifactFile.createdAt));
}

function fileFacts(fileId: string, files: ReadonlyMap<string, ArtifactFileRecord>): CaptureFileFacts {
  const file = files.get(fileId);
  if (!file) return { id: fileId, attached: false };
  return { id: fileId, attached: true, key: file.key, name: file.filename, size: file.size, type: file.contentType };
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function frameOnBoard(frame: CanvasFrameRead, theme: Theme, files: ReadonlyMap<string, ArtifactFileRecord>): BoardFrame | null {
  const spec = frameSpecText(frame);
  if (frame.spec === null || spec === null) return null;
  const named = fileRefsInContent("ui", spec).map((fileId) => fileFacts(fileId, files));
  const drawings: CaptureDrawing[] = [];
  for (const mode of captureModesFor(theme.mode)) {
    const input = captureHashInput({ width: frame.width, height: frame.height, padding: frame.padding, spec: frame.spec, theme, mode, files: named });
    if (input === null) return null;
    drawings.push({ frameHash: sha256(input), mode });
  }
  return { width: frame.width, height: frame.height, padding: frame.padding, spec, drawings };
}

/**
 * Reads the board from an artifact row. A canvas that cannot be drawn has
 * no frames. Throws ThemeUnreadableError when the theme could not be read.
 */
export async function loadCaptureBoard(record: Pick<ArtifactRecord, "id" | "userId" | "visibility" | "teamId" | "theme" | "content">): Promise<CaptureBoard> {
  const [theme, fileRows] = await Promise.all([boardTheme(record), boardFiles(record.id)]);
  const files = fileRows.map(toFileDto);
  const canvas = validateCanvas(record.content);
  if (!canvas.renderable) return { theme, files, frames: [] };
  const withErrors = new Set(canvas.issues.flatMap((issue) => (issue.severity === "error" && issue.frameId !== undefined ? [issue.frameId] : [])));
  const byId = new Map(fileRows.map((row) => [row.id, row]));
  const frames = canvas.frames.flatMap((frame) => (withErrors.has(frame.id) ? [] : frameOnBoard(frame, theme, byId) ?? []));
  return { theme, files, frames };
}

/** Every drawing on the board, in board order. */
export function boardDrawings(board: CaptureBoard): CaptureDrawing[] {
  return board.frames.flatMap((frame) => frame.drawings);
}
