import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Relative imports: drizzle-kit loads this file without the "@/" alias.
import { harnessLimits } from "../lib/harness/limits";

import { user } from "./auth-schema";
import { oauthClient } from "./oauth-schema";
import { apiToken } from "./schema";

// What one MCP connection says it is (src/lib/harness): an approved OAuth app
// for one person, or one API token. The MCP transport is stateless, so the
// clientInfo from `initialize` is kept here for the requests that follow.
// The person can override the harness on the Connections page; it applies to
// later saves. Rows go with the app's registration or the token.
export const mcpConnection = pgTable(
  "mcp_connection",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    oauthClientId: text("oauth_client_id").references(() => oauthClient.clientId, { onDelete: "cascade" }),
    apiTokenId: text("api_token_id").references(() => apiToken.id, { onDelete: "cascade" }),
    // clientInfo.name and .version as the client sent them, cleaned and capped. Untrusted text.
    clientName: text("client_name"),
    clientVersion: text("client_version"),
    // The harness id the person chose. Null uses what was detected.
    harnessOverride: text("harness_override"),
    clientSeenAt: timestamp("client_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("mcp_connection_oauth_idx").on(table.userId, table.oauthClientId),
    uniqueIndex("mcp_connection_token_idx").on(table.apiTokenId),
    index("mcp_connection_user_idx").on(table.userId),
    check("mcp_connection_kind_check", sql`(${table.oauthClientId} is null) <> (${table.apiTokenId} is null)`),
    check("mcp_connection_client_name_check", sql`char_length(${table.clientName}) <= ${sql.raw(String(harnessLimits.maxLabelChars))}`),
    check("mcp_connection_client_version_check", sql`char_length(${table.clientVersion}) <= ${sql.raw(String(harnessLimits.maxVersionChars))}`),
    check("mcp_connection_override_check", sql`char_length(${table.harnessOverride}) <= ${sql.raw(String(harnessLimits.maxIdChars))}`),
  ],
);

export type McpConnectionRecord = typeof mcpConnection.$inferSelect;
