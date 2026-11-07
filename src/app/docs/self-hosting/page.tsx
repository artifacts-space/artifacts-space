import Link from "next/link";

import { CodeBlock, CommandBlock } from "@/components/code-block";
import { DocsH, FactTable, Note, Prose } from "@/components/docs/docs-content";
import { RegistryPage } from "@/components/docs/docs-page";
import { envDocs } from "@/lib/docs/env-docs";
import { docsMetadata } from "@/lib/docs/metadata";
import { DOCS_REPOSITORY, docsHref } from "@/lib/docs/pages";
import { fileLimits } from "@/lib/files/config";
import { oauthLimits } from "@/lib/oauth/config";
import { versionRetention } from "@/lib/versions/history-rules";

import vercelConfig from "../../../../vercel.json";

export const metadata = docsMetadata("self-hosting");

const page = "self-hosting" as const;

const cronRows = vercelConfig.crons.map((cron) => [cron.path, cron.schedule]);

const corsRule = JSON.stringify(
  [{ AllowedOrigins: ["https://artifacts.example.com"], AllowedMethods: ["PUT", "GET", "HEAD"], AllowedHeaders: ["content-type"], MaxAgeSeconds: 3600 }],
  null,
  2,
);

const localSteps = `git clone ${DOCS_REPOSITORY}.git
cd artifacts-space
pnpm install
cp .env.example .env.local     # fill in DATABASE_URL, BETTER_AUTH_SECRET, CRON_SECRET
pnpm db:migrate
pnpm dev`;

/** Running your own artifacts.space, from the code's own configuration. */
export default function SelfHostingPage() {
  return (
    <RegistryPage slug={page}>
      <DocsH page={page} id="stack" />
      <Prose>
        <p>artifacts.space is one Next.js app. To run your own you need:</p>
        <ul>
          <li><strong>Postgres.</strong> Neon in production; any Postgres on localhost for development.</li>
          <li><strong>A host for Next.js 16.</strong> The repository is set up for Vercel, including its crons.</li>
          <li><strong>Sendir</strong> for email: sign-in links, invitations, mentions, and reports. People sign in with email links, so production needs it.</li>
          <li><strong>Cloudflare R2</strong> for uploaded files. Without it, everything but files works.</li>
          <li><strong>A GitHub OAuth app</strong>, if you want GitHub sign-in. Optional.</li>
        </ul>
        <p>Node and pnpm versions follow <code>package.json</code>. The source is at <a href={DOCS_REPOSITORY}>{DOCS_REPOSITORY.replace("https://", "")}</a>.</p>
      </Prose>

      <DocsH page={page} id="env" />
      <Prose><p>Put these in <code>.env.local</code> for development, and in your host&apos;s settings for production. <code>.env.example</code> lists the same set.</p></Prose>
      <FactTable head={["Variable", "Needed", "What it does"]} rows={envDocs.map((doc) => [doc.name, doc.need, doc.what])} />
      <Note tone="warning" title="Keep secrets out of the repository">
        <code>.env.local</code> is ignored by Git. Never commit keys, and give each environment its own <code>BETTER_AUTH_SECRET</code>.
      </Note>

      <DocsH page={page} id="database" />
      <Prose>
        <p>The schema lives in <code>src/db/schema.ts</code> and <code>src/db/oauth-schema.ts</code>; migrations are SQL files in <code>drizzle/</code>, managed by drizzle-kit. Apply them before the first start and after every update:</p>
      </Prose>
      <CommandBlock command="pnpm db:migrate" />
      <Prose>
        <p>Migrations use <code>DATABASE_URL_UNPOOLED</code> (the direct connection), and the app uses <code>DATABASE_URL</code>. On Neon, the Vercel integration sets both. drizzle-kit reads <code>.env.local</code> itself. Only the <code>public</code> schema is managed.</p>
      </Prose>

      <DocsH page={page} id="auth" />
      <Prose>
        <p>Sign-in is Better Auth, self-hosted: email links and, optionally, GitHub. There are no passwords. Better Auth is also the OAuth 2.1 server MCP clients connect through, at <code>{"<BETTER_AUTH_URL>"}/api/auth</code>.</p>
        <ul>
          <li>Set <code>BETTER_AUTH_URL</code> to the public origin. OAuth tokens are bound to <code>{"<BETTER_AUTH_URL>"}/api/mcp</code>, so a wrong origin breaks MCP sign-in.</li>
          <li>For GitHub, create an OAuth app with the callback URL <code>{"<BETTER_AUTH_URL>"}/api/auth/callback/github</code>. The GitHub login becomes the preferred username.</li>
          <li>MCP apps register themselves. Apps nobody approves are deleted after {oauthLimits.unapprovedClientHours} hours, and registration pauses while {oauthLimits.maxUnapprovedClients} wait.</li>
        </ul>
      </Prose>

      <DocsH page={page} id="files" />
      <Prose>
        <p>Browsers upload straight to R2 with presigned URLs, and downloads go through an access-checked redirect. Set up:</p>
        <ol>
          <li>Create a bucket.</li>
          <li>Create an R2 API token scoped to that bucket. The S3 access key id is the token id; the secret is the SHA-256 of the token value.</li>
          <li>Add a CORS rule for your origin, because the browser PUTs to the bucket directly:</li>
        </ol>
      </Prose>
      <CodeBlock title="R2 CORS policy" value={corsRule} className="mt-4" />
      <Prose>
        <p>Files are capped at {fileLimits.maxBytes / 1024 / 1024} MB. If the R2 variables are missing, file requests fail with a message that names them; everything else keeps working.</p>
      </Prose>

      <DocsH page={page} id="email" />
      <Prose>
        <p>Every email goes out through Sendir from one identity. Set <code>SENDIR_API_KEY</code> (scoped to that identity) and <code>SENDIR_IDENTITY_ID</code>. In production, sign-in fails without them. In development without them, sign-in links print to the dev server log.</p>
        <p>Invitations, mentions, and report emails share a daily budget below the provider&apos;s cap, so sign-in links always get through. If your Sendir cap differs, change <code>SENDIR_DAILY_RECIPIENTS</code> in <code>src/lib/email/budget-rules.ts</code>. See <Link href={docsHref("limits", "email")}>Email budget</Link>.</p>
      </Prose>

      <DocsH page={page} id="vercel" />
      <Prose>
        <ol>
          <li>Import the repository into Vercel. It detects Next.js and pnpm.</li>
          <li>Add Neon from the Vercel Marketplace, which sets the database variables, and add the rest from the table above.</li>
          <li>Run <code>pnpm db:migrate</code> against the production database, then deploy.</li>
          <li>Point your domain at the project and set <code>BETTER_AUTH_URL</code> to it.</li>
        </ol>
        <p><code>vercel.json</code> schedules two cleanup jobs. Vercel sends <code>CRON_SECRET</code> as a bearer token; requests without it are refused.</p>
      </Prose>
      <FactTable
        head={["Path", "Schedule (UTC)"]}
        rows={cronRows}
        mono={[0, 1]}
      />
      <Prose>
        <p><code>cleanup-files</code> deletes unfinished and unattached uploads and prunes versions past {versionRetention.keep} or {versionRetention.maxAgeMs / 86_400_000} days. <code>cleanup-oauth</code> deletes unapproved MCP apps, expired access tokens, and old refresh tokens. On another host, call both paths on the same schedule with <code>Authorization: Bearer $CRON_SECRET</code>.</p>
      </Prose>

      <DocsH page={page} id="local" />
      <CodeBlock title="Terminal" value={localSteps} className="mt-4" />
      <Prose>
        <p>The app runs on <code>http://localhost:3000</code>. Without Sendir keys, open <code>/api/dev/sign-in</code> to sign in as a development user in one step; it exists only under <code>next dev</code> and is off while Sendir keys are set. Before you push, run <code>pnpm check</code> (typecheck, lint, file length, tests) and <code>pnpm build</code>.</p>
      </Prose>
    </RegistryPage>
  );
}
