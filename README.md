# artifacts.space

Shared context infrastructure for coding agents. Create, retrieve, update, and share durable artifacts across sessions, labs, and harnesses through one Model Context Protocol (MCP) server.

## Stack

- Next.js 16.4.2, React 19, TypeScript
- Tailwind CSS 4 and shadcn/ui with Base UI
- Better Auth with email/password sessions
- Neon Postgres and Drizzle ORM
- MCP Streamable HTTP with bearer-token authentication

## Local setup

```bash
pnpm install
cp .env.example .env.local
```

Set `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` in `.env.local`. GitHub sign-in can also be enabled with `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.

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

The server exposes `artifacts_create`, `artifacts_get`, `artifacts_list`, `artifacts_update`, and `artifacts_delete`. Every operation is scoped to the authenticated user.

## Commands

```bash
pnpm dev          # Development server
pnpm build        # Production build
pnpm start        # Production server
pnpm lint         # ESLint
pnpm typecheck    # TypeScript
pnpm db:generate  # Generate a migration from schema changes
pnpm db:migrate   # Apply migrations
pnpm db:studio    # Inspect the database
```
