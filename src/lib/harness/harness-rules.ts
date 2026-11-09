import { z } from "zod";

import { harnessFor, isHarnessId, type HarnessId } from "./harnesses";
import { harnessLimits } from "./limits";

/**
 * Which agent harness an MCP connection is: pure rules, no database.
 *
 * Clients name themselves in the MCP `initialize` request's `clientInfo`
 * (and, from the 2026-07-28 protocol on, in every request's `_meta`). OAuth
 * clients also register a `client_name` and sometimes a `software_id`. All of
 * it is untrusted text: it is checked with zod, cleaned, capped, and only
 * ever matched against the rules below or shown as plain text.
 */

/** The longest client name kept, after cleaning. */
export const MAX_CLIENT_NAME_CHARS = harnessLimits.maxLabelChars;
/** The longest client version kept, after cleaning. */
export const MAX_CLIENT_VERSION_CHARS = harnessLimits.maxVersionChars;

/** Where 2026-07-28 MCP clients put their clientInfo on every request. */
export const META_CLIENT_INFO_KEY = "io.modelcontextprotocol/clientInfo";

/** A harness as stamped on an artifact or version: the id, and the client's own name for "other". */
export interface HarnessStamp {
  harness: HarnessId;
  /**
   * For "other", the client's cleaned name, so its owner can tell unknown
   * clients apart on the Connections page. Never stored on artifacts or
   * versions, and never shown to readers.
   */
  label: string | null;
}

/** What a connection says about itself. Every field is optional and untrusted. */
export interface ClientSignals {
  /** clientInfo.name from MCP. */
  clientName?: string | null | undefined;
  /** The OAuth client's registered client_name. */
  oauthName?: string | null | undefined;
  /** The OAuth client's registered software_id. */
  softwareId?: string | null | undefined;
}

// Control characters, zero-width characters, and bidirectional overrides never reach storage or the page.
const unsafeChars = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;

/** Untrusted text cleaned for storage: unsafe characters out, whitespace collapsed, capped. Null when nothing is left. */
export function cleanClientText(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const cleaned = value.replace(unsafeChars, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();
  return cleaned || null;
}

const clientInfoSchema = z.object({
  name: z.string().max(512),
  version: z.string().max(512).optional(),
});

/** A clientInfo checked and cleaned, or null when it is missing or malformed. */
export interface ClientInfo {
  name: string;
  version: string | null;
}

/** Parses an untrusted clientInfo value. Anything that is not `{ name, version? }` strings within size is ignored. */
export function parseClientInfo(value: unknown): ClientInfo | null {
  const parsed = clientInfoSchema.safeParse(value);
  if (!parsed.success) return null;
  const name = cleanClientText(parsed.data.name, MAX_CLIENT_NAME_CHARS);
  if (!name) return null;
  return { name, version: cleanClientText(parsed.data.version, MAX_CLIENT_VERSION_CHARS) };
}

const messageSchema = z.object({
  method: z.string().max(100),
  params: z.object({ clientInfo: z.unknown().optional(), _meta: z.record(z.string(), z.unknown()).optional() }).loose().optional(),
});

/** The clientInfo one JSON-RPC message carries: the initialize request's, else the per-request `_meta` one. */
function clientInfoOfMessage(message: unknown): { info: ClientInfo; initialize: boolean } | null {
  const parsed = messageSchema.safeParse(message);
  if (!parsed.success) return null;
  const { method, params } = parsed.data;
  const initialize = method === "initialize";
  const info = parseClientInfo(initialize ? params?.clientInfo : undefined) ?? parseClientInfo(params?._meta?.[META_CLIENT_INFO_KEY]);
  return info ? { info, initialize } : null;
}

/** The clientInfo a request body carries, and whether it came with `initialize` (the moment a client names itself). */
export interface RequestClientInfo {
  info: ClientInfo;
  initialize: boolean;
}

/** Finds the clientInfo in an MCP request body (one message or a batch). Null when none is there. */
export function clientInfoFromBody(body: unknown): RequestClientInfo | null {
  const messages: unknown[] = Array.isArray(body) ? body : [body];
  for (const message of messages) {
    const found = clientInfoOfMessage(message);
    if (found) return found;
  }
  return null;
}

/** Lowercase words only: "Visual Studio Code - Insiders" becomes "visual studio code insiders". */
export function normalizeClientName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * How a client name maps to a harness, tried in order: the more specific
 * rule first (Claude Code before Claude, Cursor and Windsurf before VS Code,
 * Roo and Kilo before Cline). Matched against normalizeClientName's words.
 */
const harnessRules: readonly (readonly [HarnessId, RegExp])[] = [
  ["claude-code", /\bclaude ?code\b/],
  ["claude", /\b(claude|anthropic)\b/],
  ["fx", /^fx( cli)?$/],
  ["cursor", /\bcursor\b/],
  ["windsurf", /\b(windsurf|codeium)\b/],
  ["roo-code", /\broo( code| cline)?\b/],
  ["kilo-code", /\bkilo( ?code)?\b/],
  ["cline", /\bcline\b/],
  ["codex", /\bcodex\b/],
  ["gemini-cli", /\bgemini\b/],
  ["opencode", /\bopen ?code\b/],
  ["goose", /\bgoose\b/],
  ["amp", /^amp\b/],
  ["trae", /\btrae\b/],
  ["blackbox", /\bblackbox\b/],
  ["vscode-copilot", /\b(visual studio code|vs ?code|copilot)\b/],
];

/**
 * Library defaults that name the MCP SDK, not the harness, such as
 * "ai-sdk-mcp-client". A connection that sends one is matched by its OAuth
 * registration instead, such as an app that registered as "Cursor".
 */
const genericNames = /^(ai sdk mcp client|mcp client|mcp|client|mcp remote|example client|test client|mcp inspector|inspector client)$/;

/** True when a client name only names an MCP library, not a harness. */
export function isGenericClientName(name: string): boolean {
  return genericNames.test(normalizeClientName(name));
}

/** The known harness one name maps to, or null. */
export function matchHarness(name: string | null | undefined): HarnessId | null {
  if (!name) return null;
  const words = normalizeClientName(name);
  if (!words) return null;
  for (const [id, rule] of harnessRules) {
    if (rule.test(words)) return id;
  }
  return null;
}

/** The names to try, best first: a specific clientInfo name, then the OAuth registration, then a generic clientInfo name. */
function candidates(signals: ClientSignals): string[] {
  const clientName = cleanClientText(signals.clientName, MAX_CLIENT_NAME_CHARS);
  const generic = clientName !== null && isGenericClientName(clientName);
  const ordered = [generic ? null : clientName, cleanClientText(signals.oauthName, MAX_CLIENT_NAME_CHARS), cleanClientText(signals.softwareId, MAX_CLIENT_NAME_CHARS), generic ? clientName : null];
  return ordered.filter((name): name is string => name !== null);
}

/**
 * The harness a connection is, from what it says about itself: the first
 * name a rule recognizes, else "Other agent" with the best name kept as its
 * label (null when the client gave no name at all).
 */
export function detectHarness(signals: ClientSignals): HarnessStamp {
  const names = candidates(signals);
  for (const name of names) {
    const harness = matchHarness(name);
    if (harness) return { harness, label: null };
  }
  return { harness: "other", label: names[0] ?? null };
}

/** A stored override, if it is a harness id this version knows; otherwise none. */
export function overrideOf(value: string | null | undefined): HarnessId | null {
  return isHarnessId(value) ? value : null;
}

/**
 * The harness a connection stamps on what it saves: the person's override
 * for that connection, else what was detected.
 */
export function connectionStamp(detected: HarnessStamp, connectionOverride: string | null | undefined): HarnessStamp {
  const override = overrideOf(connectionOverride);
  return override ? { harness: override, label: null } : detected;
}

/**
 * The harness an artifact shows. Precedence: the artifact's own override
 * (set from its menu), then what its last agent save stamped (which already
 * applied the connection's override over detection). Null when no agent
 * ever saved it and nobody chose one.
 */
export function effectiveHarness(artifactOverride: string | null | undefined, stamped: string | null | undefined): HarnessId | null {
  return overrideOf(artifactOverride) ?? (stamped ? harnessFor(stamped).id : null);
}

/** The full precedence in one place: artifact override, then connection override, then detected. */
export function resolveHarness(input: { artifactOverride?: string | null | undefined; connectionOverride?: string | null | undefined; detected: HarnessStamp }): HarnessStamp {
  const artifactOverride = overrideOf(input.artifactOverride);
  if (artifactOverride) return { harness: artifactOverride, label: null };
  return connectionStamp(input.detected, input.connectionOverride);
}

/** What an artifact row says about its harness, for its DTO: what it shows, what was stamped, and whether someone chose it. */
export function artifactHarnessOf(row: { harness: string | null; harnessOverride: string | null }): { id: HarnessId; stamped: HarnessId | null; overridden: boolean } | null {
  const id = effectiveHarness(row.harnessOverride, row.harness);
  if (!id) return null;
  return { id, stamped: row.harness ? harnessFor(row.harness).id : null, overridden: overrideOf(row.harnessOverride) !== null };
}

/**
 * The column a save writes for its stamp, or nothing for a save from the web
 * app (which keeps the artifact's last agent stamp). Only the id: an unknown
 * client's own name stays on its connection, for its owner.
 */
export function stampColumns(stamp: HarnessStamp | null | undefined): { harness: HarnessId } | Record<string, never> {
  if (!stamp) return {};
  return { harness: stamp.harness };
}

/**
 * The harness a new version records. A save in the web app records none,
 * even when the artifact has an override. An agent's save records the
 * artifact's override when it has one, else the save's stamp.
 */
export function versionStamp(artifactOverride: string | null | undefined, stamp: HarnessStamp | null | undefined): HarnessStamp | null {
  if (!stamp) return null;
  return resolveHarness({ artifactOverride, detected: stamp });
}

/** A stored harness id as a stamp, for snapshots of what an artifact already showed. Null when it had none. */
export function stampOf(id: string | null | undefined): HarnessStamp | null {
  return id ? { harness: harnessFor(id).id, label: null } : null;
}

/**
 * The harness a reader of the approved version is shown: the harness that
 * version recorded, never the artifact's latest stamp. The latest stamp can
 * belong to an edit that waits for approval or was denied, and readers must
 * never see the agent of content they are not shown. The artifact's own
 * choice wins.
 */
export function approvedHarnessOf(input: { harnessOverride: string | null; approvedHarness: string | null }) {
  return artifactHarnessOf({ harness: input.approvedHarness, harnessOverride: input.harnessOverride });
}
