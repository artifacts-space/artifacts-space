# Sign-in, sessions, and abuse limits

Part of the agent and contributor guide, [AGENTS.md](../../AGENTS.md), whose
rules apply here too. Read this before you change sign-in (GitHub, Google, password, emailed links), sessions, the OAuth endpoints and their limits, the bot check, the feedback webhook, domain verification, or search engine listing.

## Security model: sign-in and abuse

- GitHub and Google sign-in (`src/lib/auth/social-auth-options.ts`, rules in
  `google-sign-in-rules.ts` and `social-request-rules.ts`):
  - A sign-in whose email matches an existing account joins it only when the
    provider says it verified the email and the account's email is
    confirmed. Keep `trustedProviders` empty: a trusted provider links on an
    email it never verified.
  - Google is checked again in Better Auth's `user.validateUserInfo`
    (`googleIdentityProblem`). An unverified Google email is refused at every
    step. A verified one is trusted to create or join an account only when
    Google hosts the mailbox: `@gmail.com`, `@googlemail.com`, or a Workspace
    `hd` claim equal to the address's domain. A consumer Google account on an
    outside address stays "verified" after its owner loses that mailbox. A
    Google account that is already linked keeps signing in.
  - Only the browser redirect flow signs in with Google
    (`disableIdTokenSignIn`). The server fixes the scopes (openid, email,
    profile): `socialSignInGuard` refuses `scopes` and `additionalParams` on
    `/sign-in/social` and `/link-social`, and earlier grants are not included.
  - Google's tokens are never stored (`accountHooks` drops them); GitHub's
    access token is stored as GitHub issued it.
  - Each provider is configured only when both its values are set, not blank,
    and not `replace-with-…`. Google is also off on Vercel previews
    (`VERCEL_ENV=preview`), whose URLs are not registered redirect URIs.
  - `social-account-linking.test.ts` and `social-sign-in-hardening.test.ts`
    run Better Auth in memory from the start request through the provider
    callback, with the providers' endpoints stubbed (`social-auth-harness.ts`).
- Password sign-in (`src/lib/auth/password-sign-in-rules.ts`,
  `password-sign-in-options.ts`), for test logins such as connector directory
  reviewers, who need a login and a password with no MFA or emailed code:
  - Only `/sign-in/email` is open, and only for an account that has a
    password login (Better Auth's `credential` account, `account_id` equal to
    the user id). Sign-up is off (`disableSignUp`), no reset email is
    configured, and `/sign-up/email`, `/request-password-reset`,
    `/reset-password` (and `/reset-password/:token`), `/change-password`,
    and `/verify-password` answer "not found", over HTTP (`disabledPaths`)
    and on the resolved route for in-process calls too
    (`passwordSignInGuard`). `accountHooks` refuse any Better Auth write of a
    credential account or a password, which is also what stops the
    server-only `setPassword`. The sign-in body is strict: email, password,
    `callbackURL`; no `rememberMe`, so sessions keep their length. Its answer
    leaves out the session `token` (the httpOnly cookie is the session).
  - Where it shows: the public sign-in page shows no password control until
    someone types an address under a reviewer domain
    (`src/lib/auth/reviewer-domains.ts`: `@artifacts.space`, plus
    `@example.com` only outside production builds). That is decided from the
    typed text in the browser, with no request, so it reveals nothing about
    accounts; the emailed link stays offered. The unlisted page
    `/sign-in/reviewer` (`noindex, nofollow`, in no sitemap, linked from
    nowhere) has the same form; the owner gives its URL to each directory.
    Both keep `?next=`, so an MCP client's OAuth approval continues.
  - A wrong password, an unknown email, and an account without a password
    get the same 401 and the same words. Limits, in Postgres before Better
    Auth runs (`src/lib/auth/password-sign-in-route.ts`): per network (IPv6
    by its /64, `networkPrefixKey`; other limits keep one address) 20 per 15
    minutes and 100 a day, per network and address together 10 per 15
    minutes, and per address 500 failures an hour, counted only when Better
    Auth answers 401. So someone else failing from their own network cannot
    lock a reviewer out. The address ceiling caps noise, not guessing:
    reviewer passwords come only from the owner's script, from random bytes
    far beyond guessing range, so its window is an hour, which bounds how
    long someone who knows a reviewer address can keep it locked during a
    review. Addresses are keyed with HMAC under the server secret. The route
    takes JSON only and fails closed.
  - Accounts with a password get no sign-in link: `sendMagicLink` skips them
    silently (`skipLinksForPasswordAccounts`), with the same answer as any
    address. The reset script is their recovery.
  - A GitHub or Google login never joins an account with a password, at
    sign-in or from `/link-social` (`passwordAccountLinkProblem` in
    `validateUserInfo`), even when the provider verified the same address:
    the refusal is `password_account_not_linkable`, shown as the neutral
    address message.
  - Only the owner sets a password, with `pnpm -s reviewer:create --email
    <name>@artifacts.space --name "<name>" --username <username>`
    (`scripts/create-reviewer-account.mts`). It creates a new account only
    (never adds a password to an existing one), with a confirmed email, a
    chosen username, the personal team, a random 32-character password hashed
    by Better Auth's hasher, and three private sample artifacts.
    `--reset-password` replaces the password of an account that already has a
    password login and, in the same transaction, deletes its sessions, OAuth
    access and refresh tokens and approvals, its access tokens and those of
    agents it added, its MCP connection records, and unused sign-in links.
    Run with the site's `BETTER_AUTH_SECRET` set, it also deletes the
    address's failure count (`passwordFailureBucketKey`), so a reviewer locked
    out by the 500-an-hour ceiling can sign in with the new password at once;
    without it the reset says the count was not cleared.
    A browser that already holds the session may keep the 5-minute session
    cookie cache until it expires. Emails must be under a reviewer domain;
    `@example.com` only for a database on this machine, never with the
    shared flag. It prints the password once, alone on stdout, and never
    writes it anywhere. It uses only the database URL set for the run (never
    `.env.local`) and refuses one that is not on this machine unless
    `ALLOW_SHARED_REVIEWER_ACCOUNT=1` is set for that one run; that is the
    owner's call. Find these accounts with
    `select user_id from account where provider_id = 'credential'`.
  - Demo data for the directory test cases: `pnpm -s reviewer:seed --email
    <reviewer>@artifacts.space --commenter-email <other reviewer>@artifacts.space
    [--reset [--preview]]` (`scripts/seed-reviewer-demo.mts`, same database
    guard). It
    refuses accounts without a password login, seeds through the app's own
    services (loaded in plain Node by `scripts/app-module-hooks.mts`), and turns
    the reviewer's email and push notifications off before the other reviewer's
    comment mentions them. `--reset` removes everything the account owns, not
    only the demo data (every artifact, project, inbox entry, and
    notification), and seeds again, so a second take starts from the same
    state. It has no prompt: it prints how many artifacts and projects will go
    first, and how many of the artifacts are not demo data, and stops if one
    cannot be removed. `--reset --preview` prints that line and changes
    nothing. An account that holds only some
    of the demo titles is refused with the titles named, until a reset.
    Modules the script loads must stay loadable by plain Node (syntax Node can
    strip: no parameter properties or enums; no `.tsx`);
    `scripts/app-module-hooks.test.ts` checks that without a database.
- OAuth endpoint limits (`src/lib/abuse/limits.ts`). Hosted apps (assistants
  on the web, desktop, and phones) reach us for all their users from a few
  shared addresses, so nothing that succeeds is limited per address except a
  load backstop. Every per-address key here (backstop, failures,
  registration, and the stored `registered_network`) uses
  `networkPrefixKey`: IPv6 by /64, IPv4 per address, like the password
  sign-in limits:
  - Token endpoint (`src/lib/oauth/token-limits.ts`, rules in
    `token-limit-rules.ts`): before Better Auth runs, the backstop is counted
    (`oauthToken`), and one indexed lookup decides whether the request
    presents a code or refresh token this server issued to its client, in
    any state (waiting, used, rotated, expired, revoked). Read the client id
    exactly as Better Auth does (`presentedClientId`: any Authorization
    header first, then the body). A known credential goes on to Better
    Auth, so a replayed rotated token revokes its family, a used code
    revokes what it issued, and a dead connection gets `invalid_grant`, not
    a 429, however many times it fails. A request with no known credential
    reserves a failure for its address on arrival
    (`oauthTokenFailuresByNetwork`, one atomic upsert, so floods cannot
    overshoot). Once the address is over that limit, such a request still
    goes on to Better Auth when Better Auth can answer it with lookups
    alone (`unknownCredentialRoute`): it carries a code or refresh token
    and names its client the plain way (body or Basic header). A hosted
    app's shared address is often over the limit, and a connection whose
    token or app we no longer hold must hear `invalid_grant` or
    `invalid_client` and ask the person to connect again; a 429 would be
    retried forever. The answer is Better Auth's own, word for word what it
    says under the limit, so the limit tells a caller nothing new. Do not
    answer these requests ourselves: client checks come before the grant
    lookup in Better Auth, and a copy of them would drift. Only costly
    requests wait with a 429: no code or refresh token, no plainly named
    client, a client assertion (it must be verified), or a
    metadata-document client id we have not stored (`isStoredClient`;
    Better Auth would fetch its document). A usable refresh also
    meets its connection's limit (`oauthRefreshByConnection`). After the
    answer, a 4xx to a known credential counts a failure for the address,
    and a 200 to a refresh counts for the connection. The failure limit
    only caps costly error work, and the backstop bounds the lookups: codes
    (about 190 bits), refresh tokens and client secrets (about 182 bits)
    are what stop guessing. Do not add a per-credential or per-address
    lockout for known credentials: a thief with a rotated token could use
    it to keep the app's replay from reaching reuse detection. Do
    not add a per-client failure lockout: client ids are public, so anyone
    could trigger it. Counter keys are HMACs under the server secret, never
    a token or a plain hash of one. A connection is the person and the app
    (Better Auth's refresh-token family): never the presented token (it
    rotates) and never the client id alone (a metadata-document app uses
    one for all its users).
  - Registration (`src/lib/oauth/registration-limits.ts`): `oauthRegister`
    per address per hour, a share of `maxUnapprovedClientsPerNetwork`
    unapproved apps per address, and a pool of `maxUnapprovedClients`
    (`src/lib/oauth/config.ts`). The route tags each new app with its
    address (`oauth_client.registered_network`) after any success answer
    that names a `client_id` (not only a 201), then trims the address's
    share and then the pool in one statement each (`trimUnapproved` keeps
    the newest evictable apps, or drops the new one, so concurrent
    registrations cannot leave either over its cap; its SQL is tested
    directly in `src/lib/oauth/limit-store.db.test.ts`). Only apps past
    `unapprovedEvictionGraceMinutes` that were never approved, hold no
    tokens, and came from no metadata document are evicted; an evicted
    client id fails like an unknown one. A registration is refused only when
    nothing in the full share (429) or full pool (503) is old enough, with
    `Retry-After` until the oldest leaves the grace period. The tag is
    cleared on approval and by the cleanup job after
    `registeredNetworkHours`, so it is gone within a day, well inside what
    the privacy page states for rate-limit data. That page reads its number
    from `rateLimitRetentionDays` (`src/lib/abuse/limits.ts`), which also
    sets the counter cleanup age; change the constant, never the sentence.
  - Better Auth's own in-memory limits on these two endpoints are raised far
    above ours (`betterAuthEndpointBursts`); keep them there, or they
    throttle hosted apps first. Refusals are 429s in the OAuth error shape
    with `Retry-After`, and the checks fail open like the other OAuth limits.
    Authorization requests keep `oauthAuthorize` per address.
- Web sessions last 30 days from the last workspace visit (`src/lib/auth/session-config.ts`). Server
  components cannot set cookies, so the renewed session cookie reaches the
  browser only through `src/proxy.ts` on workspace pages; keep that path.
  Signed-in visitors skip `/` and the sign-in pages on cookie presence
  (`src/lib/auth/entry-rules.ts`), and `/?home` shows the landing page. Only
  `/` may trust cookie presence: every other redirect toward the workspace
  checks the real session and expires a stale cookie, or it can loop.
- "Something's not working" (account menu, `src/components/feedback`) posts
  to Slack through the Incoming Webhook in `SLACK_FEEDBACK_WEBHOOK_URL` (set
  in Vercel Production and Preview). It is a secret: never hardcode, log, or
  print it, and never post to it from tests (mock `fetch`). A URL that does
  not start with `https://hooks.slack.com/` counts as unconfigured. A report
  carries the note, the sender's name and email, the page path (no query or
  hash), the team slug, browser, viewport, deploy, and time. It must never
  carry artifact content, titles, file names, or anything typed in the
  editor. Rules and the Slack message live in
  `src/lib/feedback/feedback-rules.ts`; every value a person controls is
  escaped `plain_text`.
- `/.well-known/openai-apps-challenge` serves OpenAI's plugin domain
  verification token from `OPENAI_APPS_CHALLENGE_TOKEN`, as the exact token in
  `text/plain` and nothing else
  (`src/lib/domain-verification/openai-challenge-rules.ts`). Unset or blank
  returns 404, never an empty 200. The token is not a secret, but keep it out
  of code; it is read at request time, so the build needs none.
- Search engines list an artifact page only when it is public, someone who
  may share it (its author, or the person who added the agent that wrote it,
  while still in the agent's team) turned on "Show in search engines"
  (`artifact.show_in_search`), and the account is past the new-account wait
  (`src/lib/search/search-rules.ts`).
  Every other artifact response sends `X-Robots-Tag: noindex, nofollow`; the
  Markdown and raw versions, preview images, and files always do. Agents
  cannot change the setting, and it turns off when the artifact stops being
  public or changes owner.
- An address that cannot receive mail (Sendir's 422 `recipient_undeliverable`
  or `recipient_suppressed`) is refused with the code `EMAIL_UNDELIVERABLE`
  (`src/lib/auth/undeliverable-address.ts`), and the sign-in form and the
  invite dialog name the typed address. The refusal is about the address
  alone: Better Auth calls the magic-link send hook for every address, with
  or without an account, and only after the sign-in limits passed
  (`src/app/api/auth/[...all]/undeliverable-address.test.ts` fails if a known
  and an unknown address ever get different answers). Never log the address.
  Better Auth swallows what `sendInvitationEmail` throws, so a refused
  invitation email reaches `inviteMemberAction` through
  `invitation-send-refusal.ts`; the action then deletes the new invitation.
- Bot check on sign-in links (`src/lib/abuse/bot-check-rules.ts`,
  `bot-check.ts`, `bot-check-client.ts`; Vercel BotID, the `botid` package).
  Scripts drove browsers to the sign-in form and asked for links to
  strangers' addresses, 10 to 25 a day from as many networks, so the rate
  limits never saw them; the strangers reported the mail as spam, which puts
  everyone's sign-in email at risk (the owner's choice of BotID, 2026-11-19).
  - It guards one request only: `POST /api/auth/sign-in/magic-link`
    (`SIGN_IN_LINK_PATH`, the one constant the server's `isMagicLinkRequest`
    and the browser's protect list both read), checked in the auth route
    after the sign-in limits: a burst meets the counters in Postgres first
    and never reaches the check's outbound call, which takes a round trip to
    the host and cannot be cancelled. Agents are this product's users: never add
    the check to MCP, the OAuth endpoints, the API, tokens, or anything else
    an agent or app calls (a route test fails if those are checked). A
    verified bot (`isVerifiedBot`: an assistant that signs its requests) is
    let through like a person.
  - The browser side starts from `AuthForm` alone (`startSignInLinkBotCheck`,
    `initBotId`), so no other page loads it, and only when the sign-in page
    passes `botCheck` (`botCheckRuns` at build time): the check fetches the
    host's script before the request, so on a self-hosted server, where that
    script does not exist, starting it would fail every request for a link. Do not move it to
    `instrumentation-client.ts`, which runs on every page, and do not use the
    `BotIdClient` component: its inline script does not run after a client
    navigation to the sign-in page, and every such person would be refused.
    The check adds its headers in the `window.fetch` it installs then, so
    the auth client must look `fetch` up when a request is sent:
    `customFetchImpl: fetchWhenSent` in `src/lib/auth/client.ts` does that
    (the bullet on the auth client, below). What bypasses the check is any reference to `fetch` taken
    when a module loads, Better Auth's own default included.
  - It fails open: off Vercel (`botCheckRuns`: development, tests,
    self-hosting), on an error, or with no verdict in `botCheckTimeoutMs`,
    the link is sent. The refusal (403 `BOT_SUSPECTED`) is the same for
    every address. A refusal logs one bare line (`[auth] Sign-in link
    refused: suspected bot`), so a spike shows in the logs; never log the
    request. The host also lists every check under the project's Firewall
    tab (traffic filter: BotID).
  - The switch, if real people are refused: a bypass rule in the Vercel
    Firewall for the sign-in link path. It needs no deploy, and a request it
    matched (`bypassed`) is let through whatever else the verdict says
    (`refusesSignInLink`). Removing the check altogether is a revert.
  - The auth client looks `fetch` up when a request is sent
    (`fetchWhenSent` in `src/lib/auth/client.ts`). Better Auth otherwise
    keeps the `fetch` from when its module loads, before the bot check
    replaces it, and the form's request then carries no proof: #252 shipped
    that way on 2026-11-19, production refused every emailed sign-in link,
    and it was rolled back within minutes. `src/lib/auth/client.test.ts`
    and `e2e/sign-in-bot-refusal.spec.ts` hold this. Anything else that
    sends the sign-in link request must go through `window.fetch` as it is
    at that moment.
  - An automated browser (Playwright, headless Chrome) is refused even with
    the proof: that is the check working, so only a person's browser can
    show that people pass. No test in this repository runs the real check.
    What a script can still show by hand on a deployment, in the network
    log: the form's request carries an `x-is-human` header, and the
    challenge script (`/149e9513-…/c.js`) was requested just before it.
    Neither was there in #252.
  - Nothing here proves that a real browser passes: BotID runs only on a
    Vercel deployment, and previews are behind Vercel sign-in. After any
    change to the browser side, ask for a link on a preview from a real
    browser (an address at a domain that cannot receive mail sends nothing)
    and confirm the answer is not `BOT_SUSPECTED`.
  - The privacy page describes it (what was collected, the cookies list,
    and the one exception to "No outside service loads in your browser").
    Change that page in the same pull request as any change to where or how
    the check runs.
  - The level is Deep Analysis, the paid one (the owner, 2026-11-19: the
    free Basic level only checks that the challenge was solved, which a
    script driving a whole browser does). It is set in code, which takes
    precedence over the project's dashboard setting:
    `SIGN_IN_LINK_CHECK_LEVEL` in `bot-check-rules.ts`, read by the
    browser's protect list and by the server's `checkBotId`. The two must
    name the same level or the check fails for everyone;
    `bot-check.test.ts` holds them together. Vercel bills each `checkBotId`
    call at this level ($1 per 1,000 on Pro when this was written), which is
    one more reason the limits run first. It brings in Vercel's
    bot-detection vendor, Kasada, whose script loads on the sign-in pages
    before the request and may set its own cookies: the privacy page names
    it under the bot check and in the list of providers. Going back to
    Basic is that one constant, the one test that pins its value on purpose
    (`bot-check-rules.test.ts`, so a silent downgrade fails), and the
    privacy page.
  - At this level the browser loads the vendor's script and waits for it to
    be ready before it sends the request, and the host's code does not bound
    that wait. The form does (`withinSignInLinkWait`, `signInLinkWaitMs`):
    with no answer in that time it stops being busy and shows the refusal's
    message, which names GitHub and Google. Keep any new sender of the
    sign-in link request behind the same wait.
