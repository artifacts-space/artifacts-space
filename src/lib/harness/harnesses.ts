/**
 * The agent harnesses artifacts.space knows: the coding agents and apps that
 * connect over MCP. Each artifact an agent saves records the harness it came
 * through (src/lib/harness/harness-rules.ts detects it), shown as "via
 * Claude Code" with the harness's icon. This list is the one source for
 * every surface that names harnesses: the byline, the pickers, the docs, and
 * the landing page.
 *
 * Icons live in public/agent-icons/<id>.svg. They are single-color marks
 * drawn in `currentColor`, so they follow the theme when used as a CSS mask
 * (HarnessIcon) and draw black in a plain <img>. Most come from the
 * memories.sh agent marquee; fx has no published logo license, so it gets a
 * neutral "fx" monogram. The marks belong to their owners and only name the
 * tool that made an artifact.
 */

/** Every harness id, in the order pickers list them. "other" is last. */
export const harnessIds = [
  "claude-code",
  "claude",
  "codex",
  "cursor",
  "vscode-copilot",
  "windsurf",
  "gemini-cli",
  "opencode",
  "cline",
  "roo-code",
  "kilo-code",
  "goose",
  "amp",
  "trae",
  "fx",
  "blackbox",
  "other",
] as const;

export type HarnessId = (typeof harnessIds)[number];

/** A known harness: its id, display name, and icon path (null for "other", which shows a robot). */
export interface Harness {
  id: HarnessId;
  name: string;
  /** The icon under public/, or null for the generic robot icon. */
  icon: string | null;
}

const icon = (file: string) => `/agent-icons/${file}.svg`;

/** Every harness with its display name and icon, in picker order. */
export const harnesses: readonly Harness[] = [
  { id: "claude-code", name: "Claude Code", icon: icon("claude-code") },
  { id: "claude", name: "Claude", icon: icon("claude-code") },
  { id: "codex", name: "Codex", icon: icon("codex") },
  { id: "cursor", name: "Cursor", icon: icon("cursor") },
  { id: "vscode-copilot", name: "VS Code Copilot", icon: icon("vscode-copilot") },
  { id: "windsurf", name: "Windsurf", icon: icon("windsurf") },
  { id: "gemini-cli", name: "Gemini CLI", icon: icon("gemini-cli") },
  { id: "opencode", name: "OpenCode", icon: icon("opencode") },
  { id: "cline", name: "Cline", icon: icon("cline") },
  { id: "roo-code", name: "Roo Code", icon: icon("roo-code") },
  { id: "kilo-code", name: "Kilo Code", icon: icon("kilo-code") },
  { id: "goose", name: "Goose", icon: icon("goose") },
  { id: "amp", name: "Amp", icon: icon("amp") },
  { id: "trae", name: "Trae", icon: icon("trae") },
  { id: "fx", name: "fx", icon: icon("fx") },
  { id: "blackbox", name: "Blackbox", icon: icon("blackbox") },
  { id: "other", name: "Other agent", icon: null },
];

const byId = new Map<string, Harness>(harnesses.map((harness) => [harness.id, harness]));

/** The "Other agent" entry, for clients no rule recognizes. */
export const otherHarness: Harness = { id: "other", name: "Other agent", icon: null };

/** True when `value` is a known harness id. */
export function isHarnessId(value: unknown): value is HarnessId {
  return typeof value === "string" && byId.has(value);
}

/** The harness for a stored id. An id this list no longer has reads as "Other agent". */
export function harnessFor(id: string): Harness {
  return byId.get(id) ?? otherHarness;
}
