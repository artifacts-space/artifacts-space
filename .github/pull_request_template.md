## What changes

<!-- One change per pull request. Say what it does for the person using it. Link the issue: "Closes #123". -->

## How you checked it

<!-- Commands you ran and what you saw. For UI changes, say what to look at. -->

## Checklist

- [ ] `pnpm check` passes
- [ ] `pnpm build` passes
- [ ] Tests added or updated next to the code, named "should X when Y"
- [ ] Security checks have a test that fails when access is wrongly granted
- [ ] Colors are tokens from `globals.css`, with no literal colors
- [ ] Database changes are additive, come with a migration in `drizzle/`, and ran only against a local database
- [ ] New dependencies are essential, pinned exactly, and at least two weeks old
- [ ] Git hooks ran (no `--no-verify`)

<!-- Leave a box unchecked and say why if it does not apply. The title becomes the commit on main: a conventional commit message (feat:, fix:, chore:, refactor:, test:, docs:, perf:, ci:) of 100 characters or fewer. -->
