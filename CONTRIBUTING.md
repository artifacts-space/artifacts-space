# Contributing

Thanks for helping. This guide covers the basics; [AGENTS.md](AGENTS.md) has
the full code standards, and it applies to people and coding agents alike.

## Set up

Follow **Self-hosting** in the [README](README.md) to install, fill in
`.env.local`, and run migrations. For most UI work, a local Postgres database
and no other services are enough: sign-in links print to the dev server log,
and `/api/dev/sign-in` signs you in as a dev user.

## Make a change

1. Open an issue first for anything larger than a small fix, so we can agree on
   the approach before you build it.
2. Keep each pull request to one change.
3. Add or update Vitest tests next to the code you change. Name them
   "should X when Y".
4. Run `pnpm check` and `pnpm build`. Both must pass. The git hooks lint
   staged files on commit and run `pnpm check` on push; do not skip them.
5. Use conventional commit messages: `feat:`, `fix:`, `chore:`, `refactor:`,
   `test:`, `docs:`. The pull request title becomes the commit on `main`, so it
   follows the same format.
6. CI must pass before the pull request enters the merge queue.

## Database changes

Edit `src/db/schema.ts`, run `pnpm db:generate`, and commit the migration in
`drizzle/`. Migrations must be additive and safe for existing rows. Read the
subquery tripwire in [AGENTS.md](AGENTS.md) before you write an access query.

## Security

Do not open a public issue for a vulnerability. Follow [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
