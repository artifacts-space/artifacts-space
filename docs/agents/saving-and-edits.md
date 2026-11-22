# Concurrent edits and autosave

Part of the agent and contributor guide, [AGENTS.md](../../AGENTS.md), whose
rules apply here too. Read this before you change any save path, `baseVersion`, edit leases, catch-up, versions, or what an autosave costs.

## Concurrent edits

A person's work wins over an agent's (`src/lib/edits`, rules in
`edit-conflict-rules.ts`, the write in `src/lib/artifact-save.ts`). Every
tool that hands an agent an artifact it may edit also hands it `versionId`
and `baseVersion` (`src/lib/mcp/edit-conflict-tools.ts`); `artifacts_update`
and `artifacts_restore_version` take `baseVersion` back. The checks live in
the UPDATE itself, one statement, never a read-then-write:

- An agent save with a `baseVersion` matches only while the artifact's
  `updated_at` is still that one; otherwise it throws `EditConflictError`,
  a typed tool error (`artifact_changed`). Without one, any change matches
  only while the artifact's newest save is not a person's (`personSavedLast`:
  `person_saved_at` is the row's save time, or the newest version is a
  person's), or it is refused with `base_version_required`, whose message
  tells the agent to read it and pass its `baseVersion`; artifacts agents
  saved last still take saves without one. A title, content, or format
  change also matches only while no person's edit lease is live
  (`artifact_being_edited`). Leases come only from the web editor's "I'm
  editing" signal (`src/lib/edits/actions.ts`): on input, at most every 20 s,
  about 60 s long, never on a timer; a closing editor cuts its lease to one
  signal interval (leases are per person, so another open tab keeps it).
- A save attaches its uploads (content media, icon, cover) in the same
  statement as its guarded write (`writeAndAttach`, a CTE), so a refused save
  attaches nothing and a landed one never names an upload it did not attach.
- The canvas frame tools (`src/lib/mcp/canvas-tools.ts`; the edits are pure
  functions in `src/lib/canvas/frame-edits.ts`) change one frame by reading
  the row, applying the edit, and saving the whole canvas through
  `updateArtifact`. That is a read-then-write, so `baseVersion` is required
  there, never optional: the tool refuses when the row it read is not at that
  base, and the UPDATE checks again, so the edit is always made on the
  content the agent read and two agents changing different frames never undo
  each other. Any new tool that changes part of an artifact's content follows
  the same rule.
- A person's web save with `expectedUpdatedAt` falls back, when the artifact
  moved on, to "only agents saved since" (`onlyAgentsSavedSince`): the base is
  not later than the row's last save, no person's save is later by
  `artifact.person_saved_at` (set by every person's save in its own UPDATE,
  never by an agent's), and no version a person saved is later. The versions
  cover saves the column never saw (older rows, and the previous deployment
  during a rollout); there is no backfill. It lands over agents' saves and
  reports `savedOverAgents`; another person's newer save still refuses it.
- Save times come from the database clock in whole milliseconds, a
  millisecond or more after the row's last save (`src/lib/edits/save-time.ts`),
  never from an app server's clock. Every write of `artifact.updated_at` uses
  `nextSaveTime`/`firstSaveTime`, so a base names exactly one save.
- On a link or public artifact, a save (and a files change,
  `recordArtifactChange`) decides its approval before its UPDATE, for exactly
  the row it changes, and writes its version and approval (approved version,
  edit request, canceled requests, an approver's audit row) in the same
  statement (`src/lib/versions/save-write.ts`, like a replaced file). The
  UPDATE runs only while the row keeps the save time, visibility, team, and
  approved version the plan was made for, read from the row's own columns;
  when another save or decision moved it on, the save is planned again on the
  new row. So no save can land between another save and its approval. On
  private and team artifacts the version is filed just after the UPDATE:
  dated at its save and placed before any newer one, and merges and restamps
  run only while the row is still at that save (`artifactStillAt`). History's
  newest version and the approved version are always the newest save's.
- Snapshots (`versionMatching`, `ensureHistoryStart`) reuse the version a
  save filed when one shows the row, and are credited by `snapshotSource`: a
  person when `person_saved_at` is the row's save time, never the artifact's
  last agent.
- History merges quick saves only with the same source key (the person, and
  for an agent's save its harness, or "agent" when unknown: `saveSourceKey`).
  Whether a save is an agent's comes from who saved it
  (`artifact_version.by_agent`; older versions read their harness), never
  from the harness alone, so a web save never folds into an agent's version
  or the reverse.
- The editor never swaps incoming content under content the person changed
  and has not saved (`replacesContentUnderEdits`). After a save over agents,
  it keeps the agents' changes to fields the person never touched. Keep every
  new agent write path for content, title, or format on `writeArtifactSave`.
- Every result an agent gets after its own save carries the `baseVersion` of
  that save and shows what it wrote (`asSaved`), never a later read.
- An open canvas or interface catches up with a newer save when its tab comes
  back (`src/lib/edits/catch-up-rules.ts`, `catchUpAction`, and
  `src/components/app/artifact-editor/use-catch-up.tsx`). On focus and when
  the tab becomes visible, never on a timer, the editor asks whether the
  artifact moved on; a second signal within 5 seconds is dropped. The newer
  save reaches the editor as a restore does (`onUpdated`, then useAutosave
  rebases the draft), and a notice says who changed what (`CatchUpNotice`).
  A canvas marks its changed frames (`ChangedFramesContext`, read by
  `CanvasFrame`, so the full-screen board marks them too) until the notice is
  dismissed. Nothing is asked while the editor holds unsaved changes or a
  save is on its way, and an answer that arrives after the person typed is
  dropped (`takesAnswer`): their own save settles it, as above. The editor
  asks from the newest save its tab made (`knownUpdatedAt`), so the person's
  own cover, icon, or theme save is never reported as news. A check that
  never answers stops blocking the next one after 30 seconds. Editors only: the action
  reads through the editable-artifact checks, so a reader of the approved
  version never gets the latest one. It is on only where a page wrapped its
  editors in `ServerCatchUp` (`/app`, and the artifact page's `EditSurface`);
  a fixture uses `CatchUpProvider` (`catch-up-fixture.tsx`,
  `e2e/catch-up.spec.ts`). Documents and the other formats keep to a reload
  (`catchesUp`): a caret in text that moves under it needs more care. There
  is no push channel yet, so a tab that stays in view does not update until
  it is focused again.

## What an autosave costs

An autosave is one request and the server renders no page for it. The save
action (`updateArtifactAction`) calls no `revalidatePath`: in a Server
Function that renders the page the editor is on inside the save's response,
and the artifact page then asked for itself again after every save, so each
autosave cost two renders of the page (the owner, 2026-11-19: "slow to save
when user makes change", #255). The editor already shows what it saved.
The page around it catches up through `useQuietRefresh`
(`src/components/app/artifact-editor/`): `soon` asks for the page once,
`QUIET_REFRESH_MS` after the last save, which is twice the longest gap
between two autosaves, so typing that goes on renders nothing; `now` asks at
once, for a change that reaches the page outside the autosave (a restore, a
newer save taken when the tab came back, "Made with"); what the autosave
hands back, someone else's merged version included, goes through `soon`,
since the editor shows it from its own copy. Leaving with a refresh still
owed asks at once: that request is for the page being opened, and it makes
the browser drop the pages it kept, so Back asks the server again. The artifact page's
`EditSurface` and `/app`'s `Dashboard` (`refreshAfterSaves`) use it; the
fixtures do not, since they have no server copy. Do not put a
`revalidatePath` or a per-save `router.refresh()` back on the autosave path;
a save that must show at once on the server's page goes through `now`.
`e2e/autosave-refresh-db.spec.ts` counts the requests against a real
database, and types while the quiet refresh's render is on its way.

On the server a save is as slow as its chain of statements is long: on
production each statement is its own HTTPS round trip (`neon-http`). An
autosave that continues a session on a private or team artifact is 13
statements, 6 round trips deep (it was 18 and 13, #255), and
`src/lib/save-query-budget.db.test.ts` holds it there: a change that adds a
statement to the save path fails that test and has to say why. The test
gives every statement the same length (`roundTripMs`), as production's round
trips are, so it counts what waits for what, not which local answer came
first (it once counted 7 when the rate limit's two statements beat the
artifact's read), and it keeps the rate limiter's sweep of old buckets
(one hit in 50) out of the count. How it stays short:

- Checks that need nothing of each other start together and refuse in a
  fixed order (`firstRefusal` in `src/lib/artifact-save.ts`): the rate
  limit (started beside the read of the artifact, `startSaveLimit`), the
  agent rule, and the quota. Do not turn them back into a chain of awaits.
  Because the limit starts before the artifact is read, an attempt that
  files nothing (the artifact is gone, the content is refused) counts
  against it too.
- The history is read once after the write (`readHistory` in
  `src/lib/versions/history.ts`): the latest version and the protected
  versions, together. The latest version comes without its text
  (`latestVersionBeside`): the database compares the content with the saved
  row by hash, and returns the text only when it can point at uploaded
  files, which the rule that keeps a dropped file restorable reads
  (`dropsShownImage`; `content-file-lifecycle.db.test.ts` fails without it).
  Never read `latestVersion` (the whole row) on the private or team save
  path, apart from `ensureHistoryStart`, which runs once, when the artifact
  has no version yet. A link or public save still reads it (`planSave` in
  `src/lib/versions/save-write.ts`): it decides whether the write reuses
  the latest version, inside the one statement that writes both.
- History is pruned only when a save added a version row (`fileSave`'s
  `added`, `newVersion` for a link or public artifact). A save that merged
  into the session's version adds nothing to prune; versions that age out
  go with the next new version or the cleanup job (`pruneAllVersions`).

The editor waits a second after the last change (`AUTOSAVE_DELAY_MS`), saves
at least every 5 seconds while typing goes on, and at most once every 2
(`AUTOSAVE_MIN_INTERVAL_MS`, 1,800 an hour, half the `artifactAutosave`
cap). It was 5 seconds until #255: a small change made right after a save
then showed "Saving…" for up to four more seconds. "Saving…" shows from the
first keystroke, on purpose: a label that switched between "Unsaved" and
"Saving…" would flicker every couple of seconds while someone types.
