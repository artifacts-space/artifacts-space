import { actingAs, can, type TeamActor } from "@/lib/teams/capability-rules";

/*
 * "Allow CSV download", per CSV artifact, off by default. While it is off,
 * readers who cannot edit the artifact get no way to take the data out: no
 * Download CSV button, no raw file (403), a Markdown version without the
 * table, a grid that copies nothing, and MCP reads without the content.
 * Editors (the author and the team, with their agents) always can.
 *
 * This is a deterrent, like Google Sheets' "disable download, print, and
 * copy for viewers", not DRM: anyone who can see the sheet can still read
 * it off the screen, and the page itself must send the rows to draw them.
 */

/** The setting's name, wherever it shows. */
export const CSV_DOWNLOAD_LABEL = "Allow CSV download";

/** What readers see in place of the data while downloads are off. */
export const csvDownloadOffNote = "The owner turned off downloads for this sheet.";

/** The toast when a reader copies from the grid while downloads are off. */
export const csvCopyOffNote = "Copying is off: the owner turned off downloads for this sheet.";

/** Who reads, relative to one artifact: whether the one access check lets them edit it. */
export interface CsvExportViewer {
  canEdit: boolean;
}

/** The artifact's part in the decision. */
export interface CsvExportArtifact {
  kind: string;
  allowCsvDownload: boolean;
}

/**
 * Whether this reader may take the sheet's data out (download, raw file,
 * Markdown table, copy, MCP content). Only CSV artifacts are limited.
 * Editors always may; everyone else only while the setting is on.
 */
export function mayExportCsv(viewer: CsvExportViewer, artifact: CsvExportArtifact): boolean {
  if (artifact.kind !== "csv") return true;
  return artifact.allowCsvDownload || viewer.canEdit;
}

/** Who asks to change the setting, relative to one artifact. */
export interface CsvDownloadActor {
  actorId: string;
  authorId: string;
  /** The person who added the agent that wrote it; they share it as its author would. */
  actsForAuthor: boolean;
  /** Their membership in the artifact's team, or null. */
  member: TeamActor | null;
  /** Whether that team is a personal one (null without a team). */
  teamPersonal: boolean | null;
  /** "agent" for MCP calls. */
  actor: "person" | "agent";
}

/**
 * Who may change the setting: the author (or the person who added the
 * agent that wrote it), and the owners and admins of the artifact's shared
 * team (anyone whose role may approve sharing). People only: an agent never
 * may, not even the agent that wrote it.
 */
export function canChangeCsvDownload(input: CsvDownloadActor): boolean {
  if (input.actor !== "person") return false;
  if (input.actorId === input.authorId || input.actsForAuthor) return true;
  if (input.teamPersonal !== false) return false;
  return can(actingAs(input.member, "person"), "approve.sharing");
}

/** A safe file name for a sheet's download: its title without characters file systems refuse, and ".csv". */
export function csvFileName(title: string): string {
  const cleaned = title.replace(/[\u0000-\u001f\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return `${cleaned || "sheet"}.csv`;
}
