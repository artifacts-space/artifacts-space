import { randomUUID } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { mcpConnection } from "@/db/connection-schema";
import { oauthClient, oauthConsent } from "@/db/oauth-schema";
import { apiToken } from "@/db/schema";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";

import type { McpConnectionRef } from "./connection-ref";
import { connectionStamp, detectHarness, overrideOf, type ClientInfo, type HarnessStamp } from "./harness-rules";
import type { HarnessId } from "./harnesses";

/**
 * Storage for what each MCP connection says it is. The MCP route records the
 * clientInfo a client sends; saves read the connection's stamp; the
 * Connections page reads and overrides it. Thin on purpose: the decisions
 * are in harness-rules.ts.
 */

/** The unique key a connection's row is found by. */
function keyOf(ref: McpConnectionRef) {
  return ref.kind === "oauth"
    ? { where: and(eq(mcpConnection.userId, ref.userId), eq(mcpConnection.oauthClientId, ref.clientId)), target: [mcpConnection.userId, mcpConnection.oauthClientId], values: { oauthClientId: ref.clientId, apiTokenId: null } }
    : { where: eq(mcpConnection.apiTokenId, ref.tokenId), target: [mcpConnection.apiTokenId], values: { oauthClientId: null, apiTokenId: ref.tokenId } };
}

/** Keeps the clientInfo a connection sent. The row changes only when the name or version did. */
export async function recordClientInfo(ref: McpConnectionRef, info: ClientInfo): Promise<void> {
  const key = keyOf(ref);
  const now = new Date();
  await getDb()
    .insert(mcpConnection)
    .values({ id: randomUUID(), userId: ref.userId, ...key.values, clientName: info.name, clientVersion: info.version, clientChangedAt: now })
    .onConflictDoUpdate({
      target: key.target,
      set: { clientName: info.name, clientVersion: info.version, clientChangedAt: now, updatedAt: now },
      setWhere: sql`${mcpConnection.clientName} is distinct from excluded.client_name or ${mcpConnection.clientVersion} is distinct from excluded.client_version`,
    });
}

/** The OAuth registration's name and software id, for an OAuth connection; nothing for a token. */
async function registrationOf(ref: McpConnectionRef): Promise<{ oauthName: string | null; softwareId: string | null }> {
  if (ref.kind !== "oauth") return { oauthName: null, softwareId: null };
  const [client] = await getDb().select({ name: oauthClient.name, softwareId: oauthClient.softwareId }).from(oauthClient).where(eq(oauthClient.clientId, ref.clientId)).limit(1);
  return { oauthName: client?.name ?? null, softwareId: client?.softwareId ?? null };
}

/** What the database knows about one connection: its stored clientInfo name and override, and the OAuth registration. */
async function loadSignals(ref: McpConnectionRef) {
  const [rows, registration] = await Promise.all([
    getDb().select({ clientName: mcpConnection.clientName, override: mcpConnection.harnessOverride }).from(mcpConnection).where(keyOf(ref).where).limit(1),
    registrationOf(ref),
  ]);
  const row = rows[0];
  return { clientName: row?.clientName ?? null, override: row?.override ?? null, ...registration };
}

/**
 * The harness a connection stamps on what it saves: the person's override,
 * else what it was detected as. `requestInfo` is clientInfo this very request
 * carried (newer clients send it every time); it wins over the stored one.
 */
export async function loadConnectionStamp(ref: McpConnectionRef, requestInfo: ClientInfo | null = null): Promise<HarnessStamp> {
  const signals = await loadSignals(ref);
  // A client that names itself on every request (and may never send initialize) is stored the first time it saves.
  if (requestInfo && requestInfo.name !== signals.clientName) await recordClientInfo(ref, requestInfo);
  const detected = detectHarness({ clientName: requestInfo?.name ?? signals.clientName, oauthName: signals.oauthName, softwareId: signals.softwareId });
  return connectionStamp(detected, signals.override);
}

/** A connection's harness for the Connections page. */
export interface ConnectionHarnessDto {
  /** What the client was detected as. */
  detected: HarnessId;
  /** The client's own name, for "Other agent" only. Untrusted text: shown as plain text to its owner. */
  detectedLabel: string | null;
  /** The person's choice, or null to use what was detected. */
  override: HarnessId | null;
}

/** One connection's harness from its stored row and OAuth registration. */
export function toConnectionHarness(signals: { clientName: string | null; override: string | null; oauthName?: string | null; softwareId?: string | null }): ConnectionHarnessDto {
  const detected = detectHarness(signals);
  return { detected: detected.harness, detectedLabel: detected.label, override: overrideOf(signals.override) };
}

/** Every connection row a person has, keyed "oauth:<clientId>" or "api:<tokenId>". */
export async function loadConnectionRows(userId: string): Promise<Map<string, { clientName: string | null; override: string | null }>> {
  const rows = await getDb()
    .select({ oauthClientId: mcpConnection.oauthClientId, apiTokenId: mcpConnection.apiTokenId, clientName: mcpConnection.clientName, override: mcpConnection.harnessOverride })
    .from(mcpConnection)
    .where(eq(mcpConnection.userId, userId));
  return new Map(rows.map((row) => [row.oauthClientId ? `oauth:${row.oauthClientId}` : `api:${row.apiTokenId ?? ""}`, { clientName: row.clientName, override: row.override }]));
}

/** True when the connection is the person's own and still live: an app they approved, or a token they have not revoked. */
async function ownsConnection(ref: McpConnectionRef): Promise<boolean> {
  if (ref.kind === "oauth") {
    const [row] = await getDb().select({ id: oauthConsent.id }).from(oauthConsent).where(and(eq(oauthConsent.userId, ref.userId), eq(oauthConsent.clientId, ref.clientId))).limit(1);
    return Boolean(row);
  }
  const [row] = await getDb().select({ id: apiToken.id }).from(apiToken).where(and(eq(apiToken.id, ref.tokenId), eq(apiToken.userId, ref.userId), isNull(apiToken.revokedAt))).limit(1);
  return Boolean(row);
}

/**
 * Sets or clears (null) the harness a person chose for one of their own
 * connections. It applies to that connection's later saves; artifacts it
 * already saved keep theirs. Returns false when the connection is not theirs.
 */
export async function setConnectionHarnessOverride(ref: McpConnectionRef, harness: HarnessId | null): Promise<boolean> {
  if (!(await ownsConnection(ref))) return false;
  await enforceRateLimit("harnessChoice", ref.userId);
  const key = keyOf(ref);
  const now = new Date();
  await getDb()
    .insert(mcpConnection)
    .values({ id: randomUUID(), userId: ref.userId, ...key.values, harnessOverride: harness })
    .onConflictDoUpdate({ target: key.target, set: { harnessOverride: harness, updatedAt: now } });
  return true;
}
