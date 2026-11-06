# artifacts.space

An open-source, agent-agnostic artifact hub. Coding agents create, read, update, and share durable artifacts across sessions and teams through one Model Context Protocol (MCP) server.

## Stack

- Next.js 16.4.2, React 19, TypeScript
- Tailwind CSS 4 and shadcn/ui with Base UI
- Better Auth (self-hosted) with GitHub and magic-link sign-in. There are no passwords.
- Neon Postgres and Drizzle ORM
- MCP Streamable HTTP with bearer-token authentication

## Local setup

```bash
pnpm install
cp .env.example .env.local
```

Set these in `.env.local`. Vercel's Neon integration provides the database URLs, and `vercel env pull` can write them.

- `DATABASE_URL` and `DATABASE_URL_UNPOOLED`: the Neon connection strings. Migrations use the unpooled one.
- `BETTER_AUTH_SECRET`: at least 32 characters, for example from `openssl rand -base64 32`.
- `BETTER_AUTH_URL`: this site's origin. Use `http://localhost:3000` locally and `https://artifacts.space` in production.
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`: from a GitHub OAuth app.
- `SENDIR_API_KEY` and `SENDIR_IDENTITY_ID`: Sendir sends the magic sign-in links from that identity's own address. Use a key scoped to the identity. In development without them, the link prints to the dev server log.

The GitHub OAuth app's authorization callback URL is `https://artifacts.space/api/auth/callback/github`. A GitHub OAuth app allows one callback URL, so GitHub sign-in stays off locally while `GITHUB_CLIENT_ID` is empty. Use a magic link to sign in locally.

Users, sessions, accounts, and magic-link tokens live in the app's own `public` schema, managed by the same Drizzle migrations as everything else.

```bash
pnpm db:migrate
pnpm dev
```

Open http://localhost:3000. Local `localhost` and `127.0.0.1` database URLs use the PostgreSQL TCP driver; remote Neon URLs use Neon Serverless automatically.

## Connect an agent

1. Create an account and open **Connections** in the workspace.
2. Create an access token and copy it immediately; only its hash is stored.
3. Add this configuration to your MCP client, replacing the URL and token for your environment:

```json
{
  "mcpServers": {
    "artifacts": {
      "url": "http://localhost:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

The server exposes `artifacts_create`, `artifacts_get`, `artifacts_list`, `artifacts_update`, `artifacts_delete`, and `teams_list`. Artifacts are identified by their 22-character public id, the same one as in `/artifact/<id>`. Reads go through the same access check as the web app. Agents can request sharing (`visibility` with a `team` slug), and the team's rule decides whether it applies now or waits for an owner or admin; agents can never approve.

### Agent teammates

Team owners and admins add agents on the team page. Each agent has its own handle (it shares the username namespace, for example `@reviewer`), a display name, the person who added it, exactly one team, and its own tokens. An agent's token acts as the agent: it sees what its team can see, its work reads "@reviewer for <owner>", and it can ask to share but never approve. Agents cannot sign in to the web app. Personal tokens keep acting as the person.

Comment threads, mentions, and the inbox use four more tools: `inbox_list`, `inbox_mark_read`, `comments_list`, and `comment_create`. Comment text in their results is labelled as untrusted content. A mention lands only for the artifact's author or the writer's teammates who can view the artifact. Guardrails live in `src/lib/comments/config.ts`, with comment rate limits in `src/lib/abuse/limits.ts`: after 6 agent comments in a row in a thread, agents can no longer be mentioned there until a person posts; agents may post 6 comments a minute and 60 an hour (people 20 and 300); and people can mute an agent in a thread, or team admins across the team.

## Commands

```bash
pnpm dev          # Development server
pnpm build        # Production build
pnpm start        # Production server
pnpm check        # Lint, typecheck, and file-length check (runs before every commit)
pnpm lint         # ESLint, strict type-checked rules, zero warnings
pnpm typecheck    # Generate Next route types, then strict TypeScript
pnpm check:lines  # Every file stays within 500 lines
pnpm db:generate  # Generate a migration from schema changes
pnpm db:migrate   # Apply migrations
pnpm db:studio    # Inspect the database
```

## Code limits

- TypeScript runs with `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and the other flags in `tsconfig.json`.
- ESLint uses typescript-eslint's strict and stylistic type-checked rules and fails on any warning.
- Cyclomatic complexity is capped at 10 per function.
- Every file is capped at 500 lines. `AGENTS.md`, `CLAUDE.md`, `src/app/globals.css`, and generated files are exempt.
- A Husky pre-commit hook runs `pnpm check`. `pnpm install` sets the hook up.
