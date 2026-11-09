# Contributing

Thanks for helping. This guide gets you from a fresh clone to a merged pull
request. [AGENTS.md](AGENTS.md) holds the full code standards. It applies to
people and coding agents alike, so read it before your first change.

By taking part, you agree to follow the [code of conduct](CODE_OF_CONDUCT.md).

## Find something to work on

- Bugs and feature ideas live in
  [issues](https://github.com/artifacts-space/artifacts-space/issues). Use the
  issue forms, so we have what we need to help.
- Open an issue first for anything larger than a small fix. Then we can agree
  on the approach before you spend time on it.
- Security problems never go in a public issue. Follow
  [SECURITY.md](SECURITY.md).

## Set up

You need:

- Node.js 22.22.1 or later. CI and production run the version in
  [`.nvmrc`](.nvmrc), so use that one if you can. With nvm, run `nvm use`.
- pnpm 10. Run `corepack enable` to get the version pinned in `package.json`.
- A local Postgres database.

```bash
pnpm install                 # also installs the Husky git hooks
cp .env.example .env.local   # then fill it in
pnpm db:migrate              # local database only
pnpm dev                     # http://localhost:3000
```

For most UI work, you only need `DATABASE_URL`, `BETTER_AUTH_SECRET`, and
`BETTER_AUTH_URL` in `.env.local`. Without email keys, sign-in links print to
the dev server log, and `/api/dev/sign-in` signs you in as a local dev user.
The other variables (GitHub sign-in, R2 files, email, cron) are explained in
`.env.example` and in **Self-hosting** in the [README](README.md).

Never commit `.env.local` or any secret.

## Make a change

1. Branch from `main`. Keep each pull request to one change.
2. Follow the code standards in [AGENTS.md](AGENTS.md). Two that catch people
   out:
   - Every color is a token in `src/app/globals.css`. Never write a literal
     color or a palette class such as `text-red-500` in a component.
   - Read the Next.js 16.4 notes. This version differs from most tutorials
     and from most models' training data.
3. Add or update Vitest tests next to the code: `foo.ts` and `foo.test.ts`.
   Name each test "should X when Y". Security checks need a test that fails
   when access is wrongly granted.
4. Run both of these before you push. Both must pass:

   ```bash
   pnpm check   # typecheck, lint (0 warnings), 500-line check, migration check, unit tests
   pnpm build   # production build; it never touches a database locally
   ```

   If you changed UI, `pnpm test:e2e` renders the component gallery on a phone
   and a desktop viewport.

### Git hooks

`pnpm install` sets up three Husky hooks:

- `pre-commit` lints the staged files.
- `commit-msg` checks the commit message.
- `pre-push` runs `pnpm check`.

Never skip them with `--no-verify`. If a hook fails, fix the cause.

### Commit messages

Use [conventional commits](https://www.conventionalcommits.org/): `feat:`,
`fix:`, `chore:`, `refactor:`, `test:`, `docs:`, `perf:`, or `ci:`. Keep the
header to 100 characters or fewer, and put the detail in the body.

```text
fix: keep the comment box open when a mention fails to send
```

## Database changes

1. Edit `src/db/schema.ts` (or `src/db/oauth-schema.ts`).
2. Run `pnpm db:generate` and commit the new migration in `drizzle/`.
3. Run `pnpm db:migrate` only against your local or a throwaway database.
   Never run it against a shared or production database.

Production applies migrations when a merged change deploys, while the old code
is still serving. So migrations must be additive and backward compatible: no
drops, renames, type changes, or new `NOT NULL` columns without a default.
`pnpm check` rejects these. Never edit a migration that has already been
merged. Read the database section and the subquery tripwire in
[AGENTS.md](AGENTS.md) before you write an access query.

## Open a pull request

1. Push your branch and open a pull request against `main`. Every change lands
   through a pull request; nobody pushes to `main` directly.
2. Write the title as a conventional commit message. The merge queue
   squash-merges, so the title becomes the commit on `main`.
3. Fill in the template: what changes for the person using it, and how you
   checked it.
4. These checks must pass: **Lint and typecheck**, **Unit tests**, **Build**,
   **Component gallery**, and **Dependency review**. CodeQL also scans the
   code.
5. A maintainer reviews it and adds it to the merge queue.

### New dependencies

Add one only when it is essential, and prefer what is already installed. Pin
an exact version that is at least two weeks old. [AGENTS.md](AGENTS.md)
explains the one exception, for security fixes.

## Coding agents

Agents follow the same rules as people, and the hooks and CI check them the
same way. A person stays responsible for each pull request an agent opens:
read the diff, run the checks, and answer review comments.

### Measure tool routing

Agents pick tools by their words: the MCP server instructions and the tool
descriptions in `src/lib/mcp/routing-copy.ts`. When you change those words,
run the routing eval before and after, and put both numbers in the pull
request:

```bash
pnpm eval:routing                          # the server's own words only
pnpm eval:routing --variant default-line   # plus the "make it the default" line
```

It sends about 30 everyday prompts ("write up the plan", "make a report for
the team", "save this for later") and a few near misses to Claude Code
headless (`claude -p`), and reports how many saved to artifacts.space and
which near misses saved when they should not. The `artifacts` server is a
local stub that serves the same words and records calls, so nothing is saved.

It uses your own Claude Code login, and one pass counts against your plan's
usage (about $3 to $4 of usage at Opus rates), so run it on demand, never on a
schedule or in CI. The prompts are in
`scripts/evals/artifact-routing-cases.json`; the options are in the header of
`scripts/evals/artifact-routing.mts`. The stub serves
`scripts/evals/artifact-routing-tools.json`, which the eval rebuilds from the
code before each pass; `pnpm check` fails when it is stale, and
`pnpm exec vitest run scripts/evals/artifact-routing-tools.test.ts --update`
refreshes it. Reports go to `scripts/evals/results/`,
which git ignores. One pass varies by a prompt or two between runs, so treat
small differences as noise.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
