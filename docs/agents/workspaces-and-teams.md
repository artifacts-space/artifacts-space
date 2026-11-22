# Workspaces, homes, projects, and harnesses

Part of the agent and contributor guide, [AGENTS.md](../../AGENTS.md), whose
rules apply here too. Read this before you change workspace lists, moving artifacts between Personal and teams, leaving a team, the sidebar's projects, or agent harness labels.

## Workspaces and an artifact's home

Decided by the owner on 16 Nov 2026: "if i move it to team - it should no
longer be in personal." Every artifact has one home: the shared team it is
shared through (team, link, or public), else its author's Personal
workspace (`artifactHomeScope` in `src/lib/projects/rules.ts`). A link or
public artifact approved by the personal team stays Personal.

- Places are exclusive. A workspace's lists, counts, search, and filters
  hold only the artifacts whose home it is. One condition says so in SQL
  (`scopeCondition` in `src/lib/artifact-list-scope.ts`: `personal` is what
  the viewer wrote, less what is shared through one of their shared teams;
  `team` is what is shared through that team) and one pure rule in the
  browser (`listedInWorkspace` in `src/lib/sharing/home-move-rules.ts`).
  Every new list or count of a workspace uses them. `artifact-list-scope.test.ts`
  reads the SQL, and `artifact-list-scope.db.test.ts` checks that each
  artifact a person wrote is in exactly one workspace.
- `mine` is for agents only: MCP `artifacts_list` with scope "mine" lists
  everything the caller wrote, in every workspace. Do not use it for a web
  list.
- An artifact shared through a team its author is no longer in stays in
  the author's Personal list, so it is never in no list. Leaving a team
  hands such artifacts to the team's longest-standing owner
  (`src/lib/sharing/transfer.ts`), so this is only a row left behind. What
  happens when an author and a home come apart is decided: see the next
  section.
- Views may cross the line; places may not. The one row that can be from
  another workspace is an artifact a link opened here: it names its
  workspace ("In Design", `elsewhereName`), and it is never counted.
- The verb matches. Sharing with a team is a move, so the Share dialog
  says "Move to <team>" on the picker and the button, says what the
  artifact leaves, and says "Ask to move to <team>" while the team's rule
  needs an approval; private reads as the move back. Link and public keep
  the word share. The words are pure functions in `home-move-rules.ts`;
  MCP descriptions for `visibility: "team"` say the same.
- Nothing seems to vanish. After a move the workspace's toast says where
  the artifact went, with "Open in <team>" and, where putting the sharing
  back applies at once, Undo (`useHomeMoves` in
  `src/components/app/home-moves.tsx`). A request that waits moves
  nothing and gets no Undo. Undo saves the old sharing through the same
  action, so the server decides again.
- `e2e/workspace-home.spec.ts` runs the move, Open in, Undo, the approval
  case, and the row's label on `/dev/workspace?scopes=1`, whose sharing is
  an in-memory stand-in (`src/components/dev/fixture-sharing.ts`).

## When an author and a home come apart

Decided by the owner on 18 Nov 2026 (#219). "Their artifacts in a team" are
the rows `homeInTeamCondition` (`src/lib/sharing/transfer.ts`) matches: the
team is the home (any visibility but private) and the person is the author.
These four outcomes are the rule; whoever builds account deletion or team
deletion builds to them.

1. **An account is deleted:** its artifacts whose home is a team go to that
   team first, by the same rule as leaving (2), before any of the account's
   rows are deleted. `artifact.user_id` cascades on delete, so deleting a
   user row today deletes those artifacts with it: an account deletion path
   MUST run the hand-over (`reconcileTeamArtifacts` for each of its shared
   teams, after its memberships are gone) before it deletes the user. The
   rule says nothing about the account's own Personal artifacts.
2. **Leaving a team, or being removed:** the team's longest-standing owner
   takes the person's artifacts there, with the person kept as the first
   author (`reconcileTeamArtifacts`, run after every departure by
   `reconcileAfterDeparture`). Who that is comes from one rule,
   `heirAfterLeaving` in `transfer-rules.ts` (`pickTransferOwner` over the
   members who stay); any screen that names the new owner uses it, never a
   copy.
3. **Before leaving:** the person sees which of their artifacts stay behind,
   who becomes their owner, and can move some or all to Personal first
   (`LeaveTeamButton`, `LeaveChoiceDialog`, actions in
   `src/app/(workspace)/teams/leave-actions.ts`, words in
   `src/lib/teams/departure-rules.ts`). A move is the Share dialog's private
   choice (`requestArtifactSharing`, visibility private), so every rule of
   that path applies; a move that waits is never shown as done. With
   artifacts to choose about, the dialog has no "Don't ask again" and shows
   even when the plain leave confirm was turned off; with none, the plain
   confirm stays. The remove confirm tells the owner or admin what becomes
   of the member's artifacts and asks under its own kind
   (`removeMemberWithArtifacts`). Being removed sends no notification today.
4. **A team is deleted:** each artifact whose home is the team returns to
   its author's Personal workspace as private. `artifact.team_id` is set to
   null on team delete while `visibility` stays `team`, so a team deletion
   path MUST first make each such artifact private (through the sharing
   service, as a move to Personal does) before it deletes the team. Team
   deletion is off today (`disableOrganizationDeletion`).

No code deletes a person's account or a team today. Removing an agent
(`removeAgent` in `src/lib/agents/service.ts`) is the one path that deletes
a user row, and it hands over first. The safety net is
`listUnfindableArtifacts` (`src/lib/sharing/unfindable.ts`): artifacts no
signed-in person can find in a workspace, or a `team` artifact with no team.
`unfindable.db.test.ts` runs it in the CI **Database tests** job and expects
none; `departure.db.test.ts` runs the preview, the move, and the hand-over.
`e2e/team-leave.spec.ts` runs both dialogs on `/dev/team` (`?leaving=<n>`,
`?move=wait|refuse`), whose leave actions are an in-memory stand-in
(`src/components/dev/fixture-leave.tsx`).

## Projects in the sidebar

An artifact's project lives in the artifact's home scope
(`src/lib/projects/rules.ts`): the shared team it is shared with, else its
author. The sidebar's rules are in `src/lib/projects/sidebar-rules.ts` and
`sidebar-queries.ts`.

- **Personal and team are separate** (the owner's decision, 16 Nov 2026:
  "personal projects show personal projects and team show team - keep them
  separate"). A person's own list holds only the projects they made, the
  empty ones too. A team's tab holds only that team's. A team's project
  never shows in a person's own list, in any state, and is created,
  renamed, and deleted on the team's tab. Never load a team's project into
  a person's own list: a person once could delete a team's empty project
  for everyone from a list that read as theirs.
- **An artifact does not need a project.** Artifacts without one are listed
  plainly after the projects, newest first, under the quiet heading
  "Artifacts" (`sidebar-loose-artifacts.tsx`). Never show them as a row that
  looks like a project: no dot, no count, no chevron, and nothing at all
  when there are none (`showsLoose`). A choice says "No project" (the
  picker, a card's menu, the filter); the product never says "Unfiled".
  Drop a card on that section to take it out of its project; it shows while
  a card is dragged even when it lists nothing.

## Agent harnesses

An artifact records the agent harness it came through ("via Claude Code").
People still own their artifacts: a harness is a label, never an account.
The list of harnesses, with names and icons, is `src/lib/harness/harnesses.ts`
(icons in `public/agent-icons/`, single-color `currentColor` marks drawn as a
CSS mask by `HarnessIcon`); use it on every surface that names harnesses.
Detection is pure (`src/lib/harness/harness-rules.ts`): the MCP `initialize`
`clientInfo` (or the per-request `_meta` one), then the OAuth client's name or
`software_id`; anything unknown is "Other agent". The MCP transport is
stateless, so `mcp_connection` keeps what each OAuth app or API token said
it was, and the person's override from the Connections page. Saves over MCP
stamp `artifact.harness` and the version's `harness`; web saves stamp nothing.
An artifact's own override (its More menu, for anyone who may edit it) wins
over the connection's override, which wins over detection. The artifact's
override is a label, not content: it applies at once, files no version, and
needs no approval, so readers of the approved version see it too. That is
deliberate: any team member who may edit the artifact can relabel it without
review, because detection can be wrong and the byline names a tool, not an
author. Versions record the agent that actually saved them, so History stays
factual; the override is a label shown on top in bylines. clientInfo is
untrusted: it is checked with zod, cleaned, capped, and shown only as plain
text to the connection's owner. The byline is what the client claims, not a
verified attribution: any client can name itself "Claude Code", and the
byline's tooltip says so. Readers see the harness name and icon, never
OAuth client ids or raw client names.
