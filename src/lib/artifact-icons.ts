import { z } from "zod";

import { artifactIconLimits } from "./artifact-icon-limits";

/**
 * Page icons beside an artifact's title, like Notion's. An icon is stored as
 * text and is exactly one of:
 * - one emoji (a single grapheme that is an RGI emoji), stored as the emoji itself;
 * - `tabler:<name>`, where <name> is in the curated list below;
 * - `file:<uuid>`, an uploaded image attached to the same artifact. Its
 *   rules (finished, image type, size, same artifact) need the database and
 *   live in src/lib/files/icon-file.ts; here only the shape is checked.
 * Everything else is refused at every boundary (server actions, MCP). Icons
 * render as text or as a Tabler component, never as HTML.
 */

/** The prefix of a Tabler icon id. */
export const TABLER_PREFIX = "tabler:";

/** The prefix of an uploaded image icon id. */
export const FILE_PREFIX = "file:";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Groups of the Icons tab, in display order. */
export const tablerIconGroups = ["Documents", "Planning", "Research", "Code", "Data", "Time", "Security", "People", "Status", "Things"] as const;
export type TablerIconGroup = (typeof tablerIconGroups)[number];

/** One curated Tabler icon: its id name, an accessible label, and search words. */
export interface TablerIconEntry {
  name: string;
  label: string;
  group: TablerIconGroup;
  keywords: string;
}

const entry = <Name extends string>(name: Name, label: string, group: TablerIconGroup, keywords = "") => ({ name, label, group, keywords }) satisfies TablerIconEntry;

/** The Tabler icons an artifact may use, in picker order. Each has a component in src/components/artifact-icon/tabler-icons.ts. */
export const tablerIconEntries = [
  entry("file-text", "Document", "Documents", "doc page markdown"),
  entry("notes", "Notes", "Documents", "memo"),
  entry("notebook", "Notebook", "Documents", "journal log"),
  entry("book", "Book", "Documents", "guide manual"),
  entry("book-2", "Handbook", "Documents", "reference"),
  entry("writing", "Writing", "Documents", "draft write"),
  entry("pencil", "Pencil", "Documents", "edit draft"),
  entry("feather", "Feather", "Documents", "essay prose"),
  entry("quote", "Quote", "Documents", "citation"),
  entry("report", "Report", "Documents", "summary"),
  entry("presentation", "Presentation", "Documents", "slides deck"),
  entry("clipboard", "Clipboard", "Documents", "paste"),
  entry("archive", "Archive", "Documents", "old box"),
  entry("folder", "Folder", "Documents", "files"),
  entry("paperclip", "Attachment", "Documents", "file attach"),
  entry("link", "Link", "Documents", "url"),
  entry("checklist", "Checklist", "Planning", "todo tasks"),
  entry("list-check", "Task list", "Planning", "todo done"),
  entry("clipboard-list", "Plan", "Planning", "roadmap steps"),
  entry("clipboard-check", "Done", "Planning", "complete approved"),
  entry("list-details", "Details", "Planning", "spec outline"),
  entry("map", "Map", "Planning", "roadmap"),
  entry("route", "Route", "Planning", "path journey"),
  entry("target", "Goal", "Planning", "objective okr"),
  entry("flag", "Milestone", "Planning", "flag"),
  entry("compass", "Direction", "Planning", "strategy"),
  entry("timeline", "Timeline", "Planning", "history"),
  entry("sitemap", "Structure", "Planning", "tree diagram"),
  entry("hierarchy", "Hierarchy", "Planning", "org tree"),
  entry("gavel", "Decision", "Planning", "ruling adr verdict"),
  entry("scale", "Trade-off", "Planning", "balance compare"),
  entry("rocket", "Launch", "Planning", "ship release"),
  entry("bulb", "Idea", "Research", "insight light"),
  entry("brain", "Thinking", "Research", "mind ai"),
  entry("search", "Research", "Research", "find investigate"),
  entry("microscope", "Analysis", "Research", "science study"),
  entry("flask", "Experiment", "Research", "lab test"),
  entry("school", "Learning", "Research", "study course"),
  entry("atom", "Science", "Research", "physics"),
  entry("language", "Language", "Research", "translate i18n"),
  entry("code", "Code", "Code", "source program"),
  entry("terminal-2", "Terminal", "Code", "shell cli command"),
  entry("brackets", "Brackets", "Code", "json syntax"),
  entry("git-branch", "Branch", "Code", "git"),
  entry("git-pull-request", "Pull request", "Code", "pr review git"),
  entry("git-merge", "Merge", "Code", "git"),
  entry("api", "API", "Code", "endpoint rest"),
  entry("bug", "Bug", "Code", "issue defect error"),
  entry("puzzle", "Puzzle", "Code", "plugin extension"),
  entry("plug", "Integration", "Code", "connect plugin"),
  entry("tool", "Tool", "Code", "fix utility"),
  entry("settings", "Settings", "Code", "config gear"),
  entry("adjustments", "Tuning", "Code", "options sliders"),
  entry("components", "Components", "Code", "ui design system"),
  entry("layout-dashboard", "Dashboard", "Code", "layout ui"),
  entry("robot", "Agent", "Code", "bot ai automation"),
  entry("package", "Package", "Code", "dependency box"),
  entry("database", "Database", "Data", "sql storage"),
  entry("server", "Server", "Data", "backend infra"),
  entry("cloud", "Cloud", "Data", "hosting"),
  entry("cpu", "Compute", "Data", "chip hardware"),
  entry("table", "Table", "Data", "spreadsheet csv grid"),
  entry("chart-bar", "Bar chart", "Data", "metrics stats"),
  entry("chart-line", "Line chart", "Data", "trend metrics"),
  entry("chart-pie", "Pie chart", "Data", "share breakdown"),
  entry("chart-dots", "Scatter", "Data", "plot"),
  entry("trending-up", "Growth", "Data", "trend up"),
  entry("stack-2", "Stack", "Data", "layers"),
  entry("versions", "Versions", "Data", "history copies"),
  entry("calendar", "Calendar", "Time", "date schedule"),
  entry("calendar-event", "Event", "Time", "meeting"),
  entry("clock", "Clock", "Time", "time"),
  entry("hourglass", "Waiting", "Time", "pending deadline"),
  entry("alarm", "Reminder", "Time", "alert"),
  entry("refresh", "Recurring", "Time", "repeat sync"),
  entry("lock", "Lock", "Security", "private secure"),
  entry("key", "Key", "Security", "secret access"),
  entry("shield", "Shield", "Security", "protect"),
  entry("shield-check", "Verified", "Security", "safe audit"),
  entry("fingerprint", "Identity", "Security", "auth"),
  entry("eye", "Review", "Security", "watch visible"),
  entry("users", "Team", "People", "group people"),
  entry("user", "Person", "People", "profile"),
  entry("message-circle", "Discussion", "People", "chat comment"),
  entry("mail", "Email", "People", "message letter"),
  entry("bell", "Notification", "People", "alert"),
  entry("speakerphone", "Announcement", "People", "news"),
  entry("lifebuoy", "Support", "People", "help"),
  entry("circle-check", "Approved", "Status", "ok yes"),
  entry("alert-triangle", "Warning", "Status", "risk caution"),
  entry("info-circle", "Info", "Status", "about"),
  entry("help-circle", "Question", "Status", "faq"),
  entry("ban", "Blocked", "Status", "stop no"),
  entry("bolt", "Fast", "Status", "energy quick"),
  entry("flame", "Hot", "Status", "fire urgent"),
  entry("sparkles", "New", "Status", "magic ai"),
  entry("star", "Star", "Status", "favorite"),
  entry("heart", "Heart", "Status", "love"),
  entry("trophy", "Win", "Status", "award"),
  entry("home", "Home", "Things", "house"),
  entry("building", "Company", "Things", "office"),
  entry("briefcase", "Work", "Things", "business"),
  entry("currency-dollar", "Money", "Things", "cost budget"),
  entry("shopping-cart", "Shop", "Things", "commerce"),
  entry("world", "World", "Things", "global web"),
  entry("palette", "Design", "Things", "color art"),
  entry("photo", "Image", "Things", "picture"),
  entry("device-laptop", "Laptop", "Things", "computer"),
  entry("device-mobile", "Mobile", "Things", "phone app"),
  entry("coffee", "Coffee", "Things", "break"),
  entry("leaf", "Leaf", "Things", "green nature"),
] as const satisfies readonly TablerIconEntry[];

/** One entry of the curated list, with its literal name. */
export type CuratedTablerIcon = (typeof tablerIconEntries)[number];

/** A curated Tabler icon name. */
export type TablerIconName = CuratedTablerIcon["name"];

const tablerNames: ReadonlySet<string> = new Set(tablerIconEntries.map((item) => item.name));

/** True when `name` is in the curated Tabler list. */
export function isTablerIconName(name: string): name is TablerIconName {
  return tablerNames.has(name);
}

/** A parsed icon, ready to render. */
export type ParsedArtifactIcon = { type: "emoji"; emoji: string } | { type: "tabler"; name: TablerIconName } | { type: "file"; fileId: string };

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

/**
 * Matches one fully qualified emoji (RGI_Emoji). Built at runtime because the
 * `v` flag needs ES2024; null where the engine lacks it (old browsers), and
 * then only the server's check applies.
 */
const rgiEmoji: RegExp | null = (() => {
  try {
    return new RegExp("^\\p{RGI_Emoji}$", "v");
  } catch {
    return null;
  }
})();

/** Text presentation selector-less emoji get VS16 (U+FE0F) to become fully qualified, e.g. "❤" to "❤️". */
const VS16 = "️";

function isSingleGrapheme(value: string): boolean {
  const first = graphemes.segment(value)[Symbol.iterator]().next();
  return !first.done && first.value.segment === value;
}

/**
 * The emoji as it is stored, or null when `value` is not exactly one emoji.
 * A bare symbol such as "❤" is stored fully qualified ("❤️").
 */
export function normalizeEmoji(value: string): string | null {
  if (!rgiEmoji || value.length === 0 || value.length > artifactIconLimits.maxInputLength) return null;
  if (!isSingleGrapheme(value)) return null;
  if (rgiEmoji.test(value)) return value;
  const qualified = `${value}${VS16}`;
  return isSingleGrapheme(qualified) && rgiEmoji.test(qualified) ? qualified : null;
}

/** Parses a stored or submitted icon. Null when it is neither one emoji nor an allowed Tabler id. */
export function parseArtifactIcon(value: string | null | undefined): ParsedArtifactIcon | null {
  if (!value) return null;
  if (value.startsWith(FILE_PREFIX)) {
    const fileId = value.slice(FILE_PREFIX.length).toLowerCase();
    return uuidPattern.test(fileId) ? { type: "file", fileId } : null;
  }
  if (value.startsWith(TABLER_PREFIX)) {
    const name = value.slice(TABLER_PREFIX.length);
    return isTablerIconName(name) ? { type: "tabler", name } : null;
  }
  const emoji = normalizeEmoji(value);
  return emoji ? { type: "emoji", emoji } : null;
}

/** The stored form of a parsed icon. */
export function storedIcon(icon: ParsedArtifactIcon): string {
  if (icon.type === "file") return `${FILE_PREFIX}${icon.fileId}`;
  return icon.type === "emoji" ? icon.emoji : `${TABLER_PREFIX}${icon.name}`;
}

/**
 * The stored form of submitted icon text: null to remove the icon ("" or
 * only spaces), the normalized icon, or undefined when it is not allowed.
 */
export function normalizeIconInput(value: string | null): string | null | undefined {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = parseArtifactIcon(trimmed);
  return parsed ? storedIcon(parsed) : undefined;
}

/** The error an invalid icon gets, written for the person or agent who sent it. */
export const ICON_RULE_MESSAGE = 'Use one emoji (such as "🚀"), "tabler:<name>" from the allowed list (such as "tabler:rocket"), or "file:<file id>" for an uploaded image. Send null or "" to remove the icon.';

/** The uploaded file an icon points at, or null for emoji, Tabler, and no icon. */
export function iconFileId(icon: string | null | undefined): string | null {
  const parsed = parseArtifactIcon(icon);
  return parsed?.type === "file" ? parsed.fileId : null;
}

/**
 * Validates and normalizes an icon at a boundary. Accepts one emoji, an
 * allowed `tabler:<name>`, or null / "" (remove). Outputs the stored form.
 */
export const artifactIconInputSchema = z
  .union([z.string().max(artifactIconLimits.maxInputLength, ICON_RULE_MESSAGE), z.null()])
  .transform((value, context) => {
    const normalized = normalizeIconInput(value);
    if (normalized !== undefined) return normalized;
    context.addIssue({ code: "custom", message: ICON_RULE_MESSAGE });
    return z.NEVER;
  });

/** True when `value` is acceptable icon input: one emoji, an allowed Tabler id, null, or "". */
export function isAcceptedIconInput(value: string | null): boolean {
  return normalizeIconInput(value) !== undefined;
}

/** The emoji to put before a page title in the browser tab, or "" (Tabler icons and no icon add nothing). */
export function iconTitlePrefix(icon: string | null | undefined): string {
  const parsed = parseArtifactIcon(icon);
  return parsed?.type === "emoji" ? `${parsed.emoji} ` : "";
}

/** A short, plain name for an icon, for labels and diffs. */
export function iconLabel(icon: string | null | undefined): string {
  const parsed = parseArtifactIcon(icon);
  if (!parsed) return "No icon";
  if (parsed.type === "emoji") return parsed.emoji;
  if (parsed.type === "file") return "Custom image";
  return tablerIconEntries.find((item) => item.name === parsed.name)?.label ?? parsed.name;
}

/** Curated Tabler icons matching a search, by label, name, group, or keyword. */
export function searchTablerIcons(query: string): readonly CuratedTablerIcon[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return tablerIconEntries;
  return tablerIconEntries.filter((item) => {
    const haystack = `${item.label} ${item.name} ${item.group} ${item.keywords}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** The field description agents read on artifacts_create and artifacts_update. */
export const ICON_FIELD_DESCRIPTION = `Optional page icon shown beside the title. One emoji (such as "🚀" or "🧪"), or "tabler:<name>" with one of: ${tablerIconEntries.map((item) => item.name).join(", ")}. Or "file:<file id>" for your own image: upload a PNG, JPEG, GIF, WebP, or AVIF of at most 1 MB (files_request_upload, PUT, files_finalize) and pass its id; it is attached to this artifact on save, and a file already attached to another artifact is refused. SVG is not accepted. On update, null or "" removes the icon; leave it out to keep it. Icon changes follow the same approval rule as title changes.`;
