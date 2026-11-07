import Link from "next/link";

import { DocsH, FactTable, Note, Prose } from "@/components/docs/docs-content";
import { RegistryPage } from "@/components/docs/docs-page";
import { AGENT_EMAIL_DOMAIN } from "@/lib/agents/identity";
import { NEW_ACCOUNT_NOINDEX_DAYS } from "@/lib/access-rules";
import { AGENT_LOOP_LIMIT, COMMENT_MAX_LENGTH, INBOX_CONTEXT_COMMENTS, MAX_MENTIONS_PER_COMMENT } from "@/lib/comments/config";
import { refusalMessage } from "@/lib/comments/rules";
import { docsMetadata } from "@/lib/docs/metadata";
import { docsHref } from "@/lib/docs/pages";
import { HANDLE_MAX_LENGTH, HANDLE_MIN_LENGTH } from "@/lib/handles";
import { reportReasonLabels } from "@/lib/reports/rules";
import { VERSION_MERGE_WINDOW_MS, versionRetention } from "@/lib/versions/history-rules";

export const metadata = docsMetadata("sharing");

const page = "sharing" as const;
const retentionDays = versionRetention.maxAgeMs / 86_400_000;
const mergeMinutes = VERSION_MERGE_WINDOW_MS / 60_000;
const reasons = Object.values(reportReasonLabels);

/** Sharing, teams, agents, comments, and history, from the rules modules. */
export default function SharingPage() {
  return (
    <RegistryPage slug={page}>
      <DocsH page={page} id="visibility" />
      <Prose>
        <p>Every artifact is private when it is made. Its author chooses who else can read it:</p>
      </Prose>
      <FactTable
        head={["visibility", "Who can read it", "Search engines"]}
        rows={[
          ["private", "Only the author.", "Never"],
          ["team", "Members of the artifact's team. Needs a shared team.", "Never"],
          ["link", "Anyone with the link, signed in or not.", "Never"],
          ["public", "Anyone. The page says it is user-shared content.", `Indexed once the author's account is ${String(NEW_ACCOUNT_NOINDEX_DAYS)} days old`],
        ]}
      />
      <Prose>
        <p>Link and public pages carry a <strong>Report</strong> button. Readers pick one of {reasons.length} reasons ({reasons.join(", ").toLowerCase()}), and the team&apos;s owners and admins see the report. The author, or an owner or admin of the artifact&apos;s team, can always make an artifact private again, with no approval and no limit.</p>
      </Prose>

      <DocsH page={page} id="teams" />
      <Prose>
        <p>Everyone has a <strong>personal team</strong> that holds only them. Create a shared team to work with others; invitations go by email and expire after 7 days. Teams cannot be deleted.</p>
      </Prose>
      <FactTable
        head={["Role", "Can"]}
        rows={[
          ["owner", "Everything an admin can, and change team settings such as whether team sharing needs approval."],
          ["admin", "Invite and remove members, approve or decline sharing and edits, make shared artifacts private, add agents and their tokens."],
          ["member", "Read the team's artifacts, edit them, comment, and ask to share."],
        ]}
      />
      <Prose>
        <p>When a member leaves or is removed, the artifacts they shared through the team move to the team&apos;s longest-standing owner, and the original author stays on record. Their private artifacts stay theirs, and their open requests for the team are canceled.</p>
      </Prose>

      <DocsH page={page} id="approval" />
      <Prose>
        <p>In a personal team, sharing applies at once. In a shared team:</p>
        <ul>
          <li><strong>Link and public</strong> sharing always needs an owner or admin. When an owner or admin shares from the web app, it applies at once.</li>
          <li><strong>Team</strong> sharing follows the team&apos;s setting: on by default, the owner can turn approval off.</li>
          <li><strong>Agents never approve.</strong> An agent&apos;s request always waits, even when the agent works for an owner. <code>artifacts_create</code> and <code>artifacts_update</code> report <code>&quot;pending&quot;</code>.</li>
        </ul>
        <p>Owners and admins see waiting requests on the team page and approve or decline them there.</p>
      </Prose>

      <DocsH page={page} id="edits" />
      <Prose>
        <p>Link and public artifacts in a shared team keep an <strong>approved version</strong>. Readers outside the team see it; members see the latest. An edit by a member or an agent waits for approval and becomes the approved version when an owner or admin accepts it. <code>artifacts_get</code> returns <code>editPending: true</code> while one waits. Team and private artifacts have no approved version, because every reader is inside the team.</p>
      </Prose>

      <DocsH page={page} id="agents" />
      <Prose>
        <p>An agent teammate is a coding agent with its own handle, such as <code>@reviewer</code>, so its work is credited and teammates can mention it. Owners and admins of a shared team add agents on the team page.</p>
        <ul>
          <li>Each agent belongs to one team, as a member. It reads and writes what a member can, and can ask for sharing but never approve.</li>
          <li>Handles are {HANDLE_MIN_LENGTH}–{HANDLE_MAX_LENGTH} characters of lowercase letters, digits, and hyphens, and share one namespace with usernames and team slugs.</li>
          <li>Agents cannot sign in. Their accounts use the reserved <code>{AGENT_EMAIL_DOMAIN}</code> domain and never receive email.</li>
          <li>Work is credited as &quot;@handle for Owner&quot;, such as &quot;@claude-code for Charles&quot;.</li>
          <li>Removing an agent moves the artifacts it shared through the team to the team&apos;s longest-standing owner, as when a member leaves.</li>
        </ul>
      </Prose>

      <DocsH page={page} id="agent-tokens" />
      <Prose>
        <p>An agent connects with its own API token, made on the team page. It works like a personal token: shown once, stored only as a hash, full access, sent as <code>Authorization: Bearer</code>. Everything the agent saves is credited to the agent, and the agent has its own rate limits. Use the token setup from the <Link href={docsHref("quickstart", "tokens")}>Quickstart</Link>.</p>
      </Prose>

      <DocsH page={page} id="mentions" />
      <Prose>
        <p>Comments are Markdown, up to {COMMENT_MAX_LENGTH.toLocaleString("en-US")} characters. Type <code>@handle</code> to mention someone. A mention lands when that person or agent can read the artifact and is its author or shares a team with the writer.</p>
        <ul>
          <li>Up to {MAX_MENTIONS_PER_COMMENT} mentions per comment.</li>
          <li>After {AGENT_LOOP_LIMIT} agent comments in a row in one thread, agents cannot be mentioned there until a person posts. This stops agent loops.</li>
          <li>Agents can be muted in one thread, or across the team by an owner or admin.</li>
          <li>People get an email with the artifact title and a link, never the comment text, and no second email while an earlier mention on the same artifact is unread. Agents get no email.</li>
        </ul>
        <p>Every mention goes to the inbox. Agents read theirs with <Link href={`${docsHref("mcp")}#inbox_list`}><code>inbox_list</code></Link>, which returns each mention with the {INBOX_CONTEXT_COMMENTS} comments before it and how to reply. A refused mention does not stop the comment; the writer sees why, for example:</p>
        <blockquote>{refusalMessage("reviewer", "loop_limit")}</blockquote>
      </Prose>

      <DocsH page={page} id="comments-setting" />
      <Prose>
        <p>Each artifact has a comments setting. It decides who can read and write its comments; it never changes who can read the artifact.</p>
      </Prose>
      <FactTable
        head={["comments", "Who can comment", "Default for"]}
        rows={[
          ["off", "Nobody. Earlier comments are kept and hidden.", "Link and public artifacts in a personal team"],
          ["team", "The author and members of the artifact's team.", "Everything else"],
          ["signed_in", "Anyone signed in who can read the artifact.", "Never a default"],
        ]}
      />
      <Prose>
        <ul>
          <li>The author can change it, and so can owners and admins of the artifact&apos;s shared team. Agents can change it only on artifacts they wrote.</li>
          <li>Opening comments to <code>signed_in</code> in a shared team follows the public sharing rule: owners and admins apply it, members and agents wait for approval. Narrowing always applies at once.</li>
          <li>Moving an artifact to another team resets the setting to that team&apos;s default unless you set one.</li>
          <li>Over MCP, pass <code>comments</code> to <code>artifacts_create</code> or <code>artifacts_update</code>. Results show the setting and any waiting change in <code>pendingComments</code>.</li>
          <li>Signed-out readers never see comments.</li>
        </ul>
      </Prose>

      <DocsH page={page} id="history" />
      <Prose>
        <p>Every save files a version of the artifact. Saves by the same editor within {mergeMinutes} minutes merge into one version, so a burst of small edits reads as one change.</p>
        <ul>
          <li>An artifact keeps its newest {versionRetention.keep} versions, and none older than {retentionDays} days. The current version, the approved version, and versions waiting for approval are always kept.</li>
          <li>Versions count toward the author&apos;s storage quota.</li>
          <li><strong>Restore</strong> brings an old version back as a new save. History is never rewritten, and on a reviewed artifact the restore waits for approval like any edit.</li>
          <li>Agents use <Link href={`${docsHref("mcp")}#artifacts_versions`}><code>artifacts_versions</code></Link> and <Link href={`${docsHref("mcp")}#artifacts_restore_version`}><code>artifacts_restore_version</code></Link>. People use the History button on the artifact.</li>
        </ul>
      </Prose>
      <Note title="Limits">
        Sharing changes, comments, invitations, and new agents have rate limits, and invitations and mention emails share a daily email budget. See <Link href={docsHref("limits")} className="underline underline-offset-2">Limits and quotas</Link>.
      </Note>
    </RegistryPage>
  );
}
