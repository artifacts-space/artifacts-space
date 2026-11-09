import { and, count, desc, eq, gt, isNotNull, isNull, lt, max, notExists, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { mcpConnection } from "@/db/connection-schema";
import { oauthAccessToken, oauthClient, oauthConsent, oauthRefreshToken } from "@/db/oauth-schema";
import { toConnectionHarness, type ConnectionHarnessDto } from "@/lib/harness/connection-store";

import { hashOAuthToken, oauthLimits } from "./config";
import { accessFromScopes, type McpAccess } from "./scopes";
import { oauthAccessTokenSecret, oauthTokenGrant } from "./token-rules";

const hourMs = 3_600_000;

/** A person's approved MCP app, for the Connections page. */
export interface ConnectedApp {
  clientId: string;
  name: string;
  uri: string | null;
  access: McpAccess;
  approvedAt: string | null;
  lastActiveAt: string | null;
  /** The agent harness it was detected as, and the person's override. */
  harness: ConnectionHarnessDto;
}

/** An app asking for access, for the consent page. */
export interface ConsentClient {
  clientId: string;
  name: string | null;
  uri: string | null;
  /** True when the app published a Client ID Metadata Document at an HTTPS URL it controls. */
  fromMetadataDocument: boolean;
}

const hasConsent = (clientId: typeof oauthClient.clientId) =>
  getDb().select({ one: sql`1` }).from(oauthConsent).where(eq(oauthConsent.clientId, clientId));

/**
 * Checks an OAuth access token for the MCP resource. Returns who it acts as,
 * with what access, and through which app, or null. Revoked apps fail at once, because revoking
 * deletes the person's approval and every token.
 */
export async function authenticateOAuthAccessToken(token: string, resource: string, now = new Date()) {
  const secret = oauthAccessTokenSecret(token);
  if (!secret) return null;
  const [row] = await getDb()
    .select({
      clientId: oauthAccessToken.clientId,
      userId: oauthAccessToken.userId,
      scopes: oauthAccessToken.scopes,
      resources: oauthAccessToken.resources,
      expiresAt: oauthAccessToken.expiresAt,
      revoked: oauthAccessToken.revoked,
      confirmation: oauthAccessToken.confirmation,
      clientDisabled: oauthClient.disabled,
      consentId: oauthConsent.id,
    })
    .from(oauthAccessToken)
    .innerJoin(oauthClient, eq(oauthClient.clientId, oauthAccessToken.clientId))
    .leftJoin(oauthConsent, and(eq(oauthConsent.clientId, oauthAccessToken.clientId), eq(oauthConsent.userId, oauthAccessToken.userId)))
    .where(eq(oauthAccessToken.token, hashOAuthToken(secret)))
    .limit(1);
  if (!row) return null;
  const grant = oauthTokenGrant({ ...row, approved: row.consentId !== null }, resource, now);
  return grant ? { ...grant, clientId: row.clientId } : null;
}

/** An app's details for the consent page, or null when no such app is registered. */
export async function getConsentClient(clientId: string): Promise<ConsentClient | null> {
  const [row] = await getDb()
    .select({ clientId: oauthClient.clientId, name: oauthClient.name, uri: oauthClient.uri, discoveryId: oauthClient.clientDiscoveryId, disabled: oauthClient.disabled })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId))
    .limit(1);
  if (!row || row.disabled) return null;
  return { clientId: row.clientId, name: row.name, uri: row.uri, fromMetadataDocument: row.discoveryId !== null };
}

/** The apps a person approved, newest first, with access level and last activity. */
export async function listConnectedApps(userId: string): Promise<ConnectedApp[]> {
  const rows = await getDb()
    .select({
      clientId: oauthClient.clientId,
      name: oauthClient.name,
      uri: oauthClient.uri,
      scopes: oauthConsent.scopes,
      softwareId: oauthClient.softwareId,
      approvedAt: oauthConsent.updatedAt,
      lastActiveAt: max(oauthAccessToken.createdAt),
      clientName: mcpConnection.clientName,
      harnessOverride: mcpConnection.harnessOverride,
    })
    .from(oauthConsent)
    .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
    .leftJoin(oauthAccessToken, and(eq(oauthAccessToken.clientId, oauthConsent.clientId), eq(oauthAccessToken.userId, userId)))
    .leftJoin(mcpConnection, and(eq(mcpConnection.oauthClientId, oauthConsent.clientId), eq(mcpConnection.userId, userId)))
    .where(eq(oauthConsent.userId, userId))
    .groupBy(oauthConsent.id, oauthClient.id, mcpConnection.id)
    .orderBy(desc(oauthConsent.updatedAt));

  return rows.map((row) => ({
    clientId: row.clientId,
    name: row.name?.trim() || "Unnamed app",
    uri: row.uri,
    access: accessFromScopes(row.scopes) ?? "read",
    approvedAt: row.approvedAt?.toISOString() ?? null,
    lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
    harness: toConnectionHarness({ clientName: row.clientName, override: row.harnessOverride, oauthName: row.name, softwareId: row.softwareId }),
  }));
}

/**
 * Disconnects an app from one person: deletes their approval first (which
 * makes every token fail at once), then their access and refresh tokens.
 * The app's registration stays; the cleanup job removes it once nobody uses it.
 */
export async function revokeConnectedApp(userId: string, clientId: string): Promise<void> {
  const db = getDb();
  await db.delete(oauthConsent).where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId)));
  await db.delete(oauthAccessToken).where(and(eq(oauthAccessToken.userId, userId), eq(oauthAccessToken.clientId, clientId)));
  await db.delete(oauthRefreshToken).where(and(eq(oauthRefreshToken.userId, userId), eq(oauthRefreshToken.clientId, clientId)));
  // What the app said it was, and the harness the person chose for it, go too.
  await db.delete(mcpConnection).where(and(eq(mcpConnection.userId, userId), eq(mcpConnection.oauthClientId, clientId)));
}

/** How many registered apps nobody has approved yet, within the cleanup window. */
export async function countUnapprovedClients(now = Date.now()): Promise<number> {
  const since = new Date(now - oauthLimits.unapprovedClientHours * hourMs);
  const [row] = await getDb()
    .select({ total: count() })
    .from(oauthClient)
    .where(and(or(gt(oauthClient.createdAt, since), isNull(oauthClient.createdAt)), notExists(hasConsent(oauthClient.clientId))));
  return row?.total ?? 0;
}

/**
 * Deletes registered apps nobody approved within the window (and that hold no
 * tokens), expired access tokens, and refresh tokens that expired or were
 * rotated out a week ago. Returns how many rows of each went.
 */
export async function cleanupOAuth(now = Date.now()) {
  const db = getDb();
  const unapprovedBefore = new Date(now - oauthLimits.unapprovedClientHours * hourMs);
  const dayAgo = new Date(now - 24 * hourMs);
  const weekAgo = new Date(now - 7 * 24 * hourMs);

  const clients = await db
    .delete(oauthClient)
    .where(
      and(
        lt(oauthClient.createdAt, unapprovedBefore),
        notExists(hasConsent(oauthClient.clientId)),
        notExists(db.select({ one: sql`1` }).from(oauthRefreshToken).where(eq(oauthRefreshToken.clientId, oauthClient.clientId))),
      ),
    )
    .returning();
  const accessTokens = await db.delete(oauthAccessToken).where(lt(oauthAccessToken.expiresAt, dayAgo)).returning();
  const refreshTokens = await db
    .delete(oauthRefreshToken)
    .where(or(lt(oauthRefreshToken.expiresAt, dayAgo), and(isNotNull(oauthRefreshToken.revoked), lt(oauthRefreshToken.revoked, weekAgo))))
    .returning();

  return { clients: clients.length, accessTokens: accessTokens.length, refreshTokens: refreshTokens.length };
}
