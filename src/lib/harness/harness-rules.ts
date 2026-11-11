import { z } from "zod";

import type { ArtifactHarnessDto } from "@/lib/artifact-types";

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
  const collapsed = value.replace(unsafeChars, " ").replace(/\s+/g, " ").trim();
  // Cut by code point, never inside an emoji's surrogate pair; Postgres char_length counts the same way.
  const cleaned = Array.from(collapsed).slice(0, max).join("").trim();
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

/**
 * Finds the clientInfo in an MCP request body (one message or a batch). In a
 * batch an `initialize` wins over a per-request `_meta` one, so the
 * connection is always recorded. Null when none is there.
 */
export function clientInfoFromBody(body: unknown): RequestClientInfo | null {
  const messages: unknown[] = Array.isArray(body) ? body : [body];
  let first: RequestClientInfo | null = null;
  for (const message of messages) {
    const found = clientInfoOfMessage(message);
    if (found?.initialize) return found;
    first ??= found;
  }
  return first;
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
  // claude.ai calls itself "Anthropic/ClaudeAI"; a bare "Anthropic" could be any of its tools, so it is not enough.
  ["claude", /\b(claude|claudeai)\b/],
  ["fx", /^fx( cli)?$/],
  ["cursor", /\bcursor\b/],
  ["windsurf", /\b(windsurf|codeium)\b/],
  ["roo-code", /\broo( code| cline)?\b/],
  ["kilo-code", /\bkilo( ?code)?\b/],
  ["cline", /\bcline\b/],
  ["codex", /\bcodex\b/],
  // ChatGPT. OpenAI does not document the name its MCP client sends; developers report clientInfo
  // "openai-mcp" (User-Agent openai-mcp/1.0.0) from ChatGPT connectors, e.g.
  // https://community.openai.com/t/how-to-set-up-a-remote-mcp-server-and-connect-it-to-chatgpt-deep-research/1278375/16
  // OpenAI's API-hosted MCP tool may send the same name, so those saves read as ChatGPT too.
  // "ChatGPT" covers an OAuth registration that names it. Codex comes first: it is an OpenAI client too.
  ["chatgpt", /\b(chatgpt|openai mcp)\b/],
  ["gemini-cli", /\bgemini\b/],
  ["opencode", /\bopen ?code\b/],
  ["goose", /\bgoose\b/],
  ["amp", /^amp\b/],
  ["trae", /\btrae\b/],
  ["blackbox", /\bblackbox\b/],
  // VS Code itself, never a bare "Copilot": GitHub Copilot also runs in other editors and as a CLI.
  ["vscode-copilot", /\b(visual studio code|vs ?code)\b/],
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

/** What an artifact row says about its harness, for its DTO: what it shows, what was stamped, and whether someone chose it. */
export function artifactHarnessOf(row: { harness: string | null; harnessOverride: string | null }): ArtifactHarnessDto | null {
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

/** A stored harness id as a stamp, for a snapshot: the agent of the artifact's last agent save. Null when it had none. */
export function stampOf(id: string | null | undefined): HarnessStamp | null {
  return id ? { harness: harnessFor(id).id, label: null } : null;
}

/**
 * The harness a reader of the approved version is shown: the harness that
 * version recorded, never the artifact's latest stamp. The latest stamp can
 * belong to an edit that waits for approval or was denied, and readers must
 * never see the agent of content they are not shown. The artifact's own
 * choice wins, and applies at once without approval: like Full width it is
 * a label on the artifact, not content, so anyone who may edit it can set it.
 * That is acceptable for link and public artifacts because detection can be
 * wrong and only editors can correct it, and the byline names a tool, not an
 * author: History keeps the person and the agent that saved each version,
 * which no label changes.
 */
export function approvedHarnessOf(input: { harnessOverride: string | null; approvedHarness: string | null }): ArtifactHarnessDto | null {
  return artifactHarnessOf({ harness: input.approvedHarness, harnessOverride: input.harnessOverride });
}

/**
 * The harness to write on the latest version when an agent save changed
 * nothing, so History agrees with the byline; null when nothing changes (a
 * web save, or the version already records it). Versions record the agent
 * that saved, never the artifact's own choice, which is a label shown on
 * top (artifactHarnessOf, approvedHarnessOf). Never on a locked version:
 * the approved one (readers outside the team read its harness), one a
 * sharing decision names, or one another editor filed.
 */
export function restampTo(version: { harness: string | null; locked: boolean }, stamp: HarnessStamp | null | undefined): HarnessId | null {
  if (version.locked || !stamp || stamp.harness === version.harness) return null;
  return stamp.harness;
}
