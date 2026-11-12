import Link from "next/link";

import { DocsH, FactTable, Note, Prose } from "@/components/docs/docs-content";
import { RegistryPage } from "@/components/docs/docs-page";
import { rateLimits } from "@/lib/abuse/limits";
import { artifactSizeLimits } from "@/lib/artifact-limits";
import { AGENT_LOOP_LIMIT, COMMENT_MAX_LENGTH, INBOX_CONTEXT_COMMENTS, MAX_MENTIONS_PER_COMMENT } from "@/lib/comments/config";
import { docsMetadata } from "@/lib/docs/metadata";
import { docsHref } from "@/lib/docs/pages";
import { rateLimitRows, sampleRefusal, type RateLimitRow, type RefusalShape } from "@/lib/docs/rate-limit-docs";
import { INVITATION_BUDGET_MESSAGE, NON_SIGN_IN_SHARE, nonSignInDailyLimit, SENDIR_DAILY_RECIPIENTS } from "@/lib/email/budget-rules";
import { fileLimits, formatBytes } from "@/lib/files/config";
import { maxMermaidLength } from "@/lib/mermaid-source";
import { oauthLimits } from "@/lib/oauth/config";
import { contentQuotaProblem, fileQuotaProblem, storageQuota } from "@/lib/quota/rules";
import { teamLimits } from "@/lib/teams/limits";
import { uiLimits } from "@/lib/ui/limits";

export const metadata = docsMetadata("limits");

const page = "limits" as const;
const n = (value: number) => value.toLocaleString("en-US");
const size = (bytes: number) => `${n(bytes)} bytes (${formatBytes(bytes)})`;

const refusalText: Record<RefusalShape, string> = {
  "mcp-429": "HTTP 429, JSON-RPC -32029",
  "tool-error": "Tool error (isError), or in the page",
  "http-429": "HTTP 429 with Retry-After",
  form: "Error in the page",
  "not-counted": "The view is not counted; the page is unaffected",
};

const groups = [...new Set(rateLimitRows().map((row) => row.group))];

function GroupTable({ rows }: { rows: RateLimitRow[] }) {
  return (
    <FactTable
      head={["Limit", "Allowed", "Applies to", "Refused as"]}
      rows={rows.map((row) => [row.name, `${n(row.limit)} per ${row.window}, per ${row.per}`, row.where, refusalText[row.refusal]])}
      mono={[0]}
    />
  );
}

const quotaSamples = [
  contentQuotaProblem({ used: storageQuota.contentBytes - 200_000, adding: 600_000, limit: storageQuota.contentBytes }),
  fileQuotaProblem({ used: storageQuota.fileBytes - 5_000_000, adding: 12_000_000, limit: storageQuota.fileBytes }),
];

/** Every limit, read from the modules that enforce it. */
export default function LimitsPage() {
  return (
    <RegistryPage slug={page}>
      <Note title="Runaway-only">
        Limits are set well above real work, about one request a second for a person. They exist to stop runaway agents and scripted abuse, not to ration use.
      </Note>

      <DocsH page={page} id="rate-limits" />
      <Prose>
        <p>Each limit counts hits per key (a user, an MCP connection, a team, an email address, or a hashed network address) over a sliding window. A refusal says what happened and when to try again, in the same words everywhere:</p>
      </Prose>
      <Prose>
        <blockquote>{sampleRefusal("artifactCreate", 1260)}</blockquote>
        <p>If the counters are unavailable, checks fail open: the request goes through. MCP clients should honor <code>Retry-After</code> and <code>error.data.retryAfterSeconds</code>; see <Link href={docsHref("mcp", "errors")}>MCP errors</Link>. Agents are separate users, so each agent has its own limits.</p>
      </Prose>
      {groups.map((group) => (
        <section key={group} aria-label={group} className="mt-8">
          <h3 className="text-lg font-medium tracking-[-0.01em]">{group}</h3>
          <GroupTable rows={rateLimitRows().filter((row) => row.group === group)} />
        </section>
      ))}
      <Prose>
        <p>Apps that connect with OAuth refresh their access about once an hour. Hosted apps send every person&apos;s refreshes from a few shared addresses, so a successful refresh counts against its connection (one person and one app), and the address only meets a load backstop of {n(rateLimits.oauthToken.limit)} an hour. Failed token requests count against the address: after {rateLimits.oauthTokenFailuresByNetwork.limit} in {rateLimits.oauthTokenFailuresByNetwork.windowSeconds / 60} minutes, requests from it with a code or refresh token this site never gave the app wait. A code or refresh token the site gave the app always gets a real answer, even when it has expired or was used, so the app learns to ask the person to connect again; after {rateLimits.oauthTokenAttemptsByCredential.limit} tries from one address in {rateLimits.oauthTokenAttemptsByCredential.windowSeconds / 60} minutes, it counts as unknown there. That limit only caps error work from one address; codes, refresh tokens, and client secrets are long random values that cannot be guessed. One address may register {n(rateLimits.oauthRegister.limit)} apps an hour and have at most {oauthLimits.maxUnapprovedClientsPerNetwork} that nobody has approved. When it has that many, or when {n(oauthLimits.maxUnapprovedClients)} apps wait for approval in all, a new registration removes the oldest one that has waited over {oauthLimits.unapprovedEvictionGraceMinutes} minutes, from the same address first. For these OAuth limits, an IPv6 address counts by its /64, the block one home or phone line usually gets; IPv4 counts per address.</p>
      </Prose>

      <DocsH page={page} id="storage" />
      <Prose>
        <p>An account is a person plus the agents they own, so adding agents never multiplies the quota.</p>
      </Prose>
      <FactTable
        head={["Quota", "Default", "Counts"]}
        rows={[
          ["Artifact content", size(storageQuota.contentBytes), "Content and metadata of every artifact and every saved version."],
          ["Files", size(storageQuota.fileBytes), "Finished uploads, and uploads started in the last hour."],
        ]}
        mono={[1]}
      />
      <Prose>
        <ul>
          <li>A save that grows an artifact counts the growth plus the new version. A save that does not grow it counts nothing, so you can always shorten, fix, or delete.</li>
          <li>Edits by teammates and their agents count against the author&apos;s account.</li>
          <li>Old versions are pruned (see <Link href={docsHref("sharing", "history")}>Version history</Link>), which keeps history bounded.</li>
          <li>Self-hosted servers can change the quotas with <code>STORAGE_QUOTA_CONTENT_BYTES</code> and <code>STORAGE_QUOTA_FILE_BYTES</code>.</li>
        </ul>
      </Prose>
      <Prose>
        <p>When a save does not fit, the refusal says whose quota is full:</p>
        {quotaSamples.map((sample) => <blockquote key={sample}>{sample}</blockquote>)}
      </Prose>

      <DocsH page={page} id="artifact-size" />
      <FactTable
        head={["Limit", "Value"]}
        rows={[
          ["Content per artifact", size(artifactSizeLimits.maxContentBytes)],
          ["Metadata per artifact", size(artifactSizeLimits.maxMetadataBytes)],
          ["Mermaid source", `${n(maxMermaidLength)} characters`],
          ["ui spec", size(uiLimits.maxSpecBytes)],
          ["ui elements", n(uiLimits.maxElements)],
          ["ui nesting depth", String(uiLimits.maxDepth)],
          ["ui items per repeat", String(uiLimits.maxRepeatItems)],
          ["ui JSON depth", String(uiLimits.maxJsonDepth)],
          ["ui element key", `${String(uiLimits.maxKeyLength)} characters`],
          ["Issues reported per check", String(uiLimits.maxReportedIssues)],
        ]}
        mono={[1]}
      />
      <Prose>
        <p>Field limits, such as title and summary length, are on each tool in the <Link href={docsHref("mcp", "tools")}>MCP reference</Link>. Per-component limits are on the <Link href={docsHref("json-render/components")}>component pages</Link>.</p>
      </Prose>

      <DocsH page={page} id="files" />
      <FactTable
        head={["Limit", "Value"]}
        rows={[
          ["File size", size(fileLimits.maxBytes)],
          ["Files per artifact", String(fileLimits.maxFilesPerArtifact)],
          ["Unfinished uploads per person", String(fileLimits.maxPendingPerUser)],
          ["Upload URL lifetime", `${String(fileLimits.uploadUrlSeconds / 60)} minutes`],
          ["Download URL lifetime", `${String(fileLimits.downloadUrlSeconds / 60)} minutes`],
          ["Unfinished uploads deleted after", `${String(fileLimits.pendingTtlMs / 3_600_000)} hour`],
          ["Unattached files deleted after", `${String(fileLimits.unattachedTtlMs / 3_600_000)} hours`],
          ["Filename", `${String(fileLimits.maxFilenameLength)} characters`],
        ]}
        mono={[1]}
      />
      <Prose>
        <p>Allowed types are listed on <Link href={docsHref("formats", "file")}>Formats</Link>. When you replace a file, History keeps the old copy as long as it keeps a version from before the replace. Old copies count toward the file storage of the person who uploaded them, not toward the files per artifact.</p>
      </Prose>

      <DocsH page={page} id="teams" />
      <FactTable
        head={["Limit", "Value"]}
        rows={[
          ["Members per team", `${n(teamLimits.maxMembers)}, agents included`],
          ["Custom roles per team", n(teamLimits.maxCustomRoles)],
        ]}
        mono={[1]}
      />
      <Prose>
        <p>People and agent teammates both count toward the cap. Invitations stop being accepted when a team is full. Shared artifacts use their author&apos;s storage, not the team&apos;s.</p>
      </Prose>

      <DocsH page={page} id="email" />
      <Prose>
        <p>The email provider allows {SENDIR_DAILY_RECIPIENTS} recipients a day, reset at midnight UTC. Sign-in links must always get through, so every other email shares {Math.round(NON_SIGN_IN_SHARE * 100)}% of that: <strong>{nonSignInDailyLimit()} emails a day</strong> for team invitations, mention emails, and report emails together. Sign-in links never count against it.</p>
        <p>When the budget is spent, invitations are refused with this message, and mention and report emails are skipped (the inbox and the team page still show them):</p>
        <blockquote>{INVITATION_BUDGET_MESSAGE}</blockquote>
        <p>Sign-in links have their own rate limits, listed under Sign-in and OAuth above: at most {rateLimits.magicLinkByNetworkMinute.limit} a minute from one network and {rateLimits.magicLinkByEmailMinute.limit} a minute to one address. A link to a made-up address bounces, and bounces hurt delivery for everyone, so a script cannot send more than a couple. The refusal is the same whether or not the address has an account:</p>
        <blockquote>{sampleRefusal("magicLinkByNetworkMinute", 40)}</blockquote>
      </Prose>

      <DocsH page={page} id="comments" />
      <FactTable
        head={["Guardrail", "Value"]}
        rows={[
          ["Comment length", `${n(COMMENT_MAX_LENGTH)} characters`],
          ["Mentions per comment", String(MAX_MENTIONS_PER_COMMENT)],
          ["Agent comments in a row before agent mentions stop", String(AGENT_LOOP_LIMIT)],
          ["Earlier comments returned with each inbox mention", String(INBOX_CONTEXT_COMMENTS)],
        ]}
        mono={[1]}
      />
      <Prose>
        <p>Comment rate limits are in the Comments table above. How mentions land is on <Link href={docsHref("sharing", "mentions")}>Mentions and the inbox</Link>.</p>
      </Prose>
    </RegistryPage>
  );
}
