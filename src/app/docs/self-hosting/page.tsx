import Link from "next/link";

import { CodeSnippet, CommandSnippet } from "@/components/code/code-snippet";
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
pnpm db:migrate                # a database not on localhost: ALLOW_SHARED_MIGRATE=1 pnpm db:migrate
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
          <li><strong>A Google OAuth client</strong>, if you want Google sign-in. Optional.</li>
          <li><strong>Node.js 22.22.1 or later</strong> and <strong>pnpm 10</strong>. CI and production run Node 26, the version in <code>.nvmrc</code>.</li>
        </ul>
        <p>The source is at <a href={DOCS_REPOSITORY}>{DOCS_REPOSITORY.replace("https://", "")}</a>.</p>
      </Prose>

      <DocsH page={page} id="env" />
      <Prose><p>Put these in <code>.env.local</code> for development, and in your host&apos;s settings for production. <code>.env.example</code> lists the same set.</p></Prose>
      <FactTable head={["Variable", "Needed", "What it does"]} rows={envDocs.map((doc) => [doc.name, doc.need, doc.what])} />
      <Note tone="warning" title="Keep secrets out of the repository">
        <code>.env.local</code> is ignored by Git. Never commit keys, and give each environment its own <code>BETTER_AUTH_SECRET</code>.
      </Note>

      <DocsH page={page} id="database" />
      <Prose>
        <p>The schema lives in <code>src/db/schema.ts</code>, <code>src/db/oauth-schema.ts</code>, <code>src/db/views-schema.ts</code>, and <code>src/db/notification-schema.ts</code>; migrations are SQL files in <code>drizzle/</code>, managed by drizzle-kit. On Vercel, every production build applies pending migrations before the new code goes live (see <Link href={docsHref(page, "vercel")}>Deploy on Vercel</Link>). Anywhere else, apply them before the first start and after every update:</p>
      </Prose>
      <CommandSnippet command="pnpm db:migrate" />
      <Prose>
        <p>Migrations use <code>DATABASE_URL_UNPOOLED</code> (the direct connection) when it is set, and <code>DATABASE_URL</code> otherwise; the app uses <code>DATABASE_URL</code>. In <code>.env.local</code>, fill in both or leave <code>DATABASE_URL_UNPOOLED</code> out, as <code>.env.example</code> does. On Neon, the Vercel integration sets both. drizzle-kit reads <code>.env.local</code> itself, and a URL you set for the command wins over it (<code>DATABASE_URL</code> alone serves for both). <code>pnpm db:migrate</code> changes only a database on <code>localhost</code> unless you set <code>ALLOW_SHARED_MIGRATE=1</code> for that run, so a test run never migrates your production database by mistake. Only the <code>public</code> schema is managed.</p>
        <p>The old code keeps serving while a deploy migrates, so migrations stay additive: add columns and tables, backfill, then switch the code. <code>pnpm check</code> rejects drops, renames, type changes, and new required columns without a default.</p>
      </Prose>

      <DocsH page={page} id="auth" />
      <Prose>
        <p>Sign-in is Better Auth, self-hosted: email links and, optionally, GitHub and Google. Nobody can sign up with a password or set one on the web: a password signs in only to an account you gave one with <code>pnpm reviewer:create</code> (<code>scripts/create-reviewer-account.mts</code>), such as a test login for a directory review. Better Auth is also the OAuth 2.1 server MCP clients connect through, at <code>{"<BETTER_AUTH_URL>"}/api/auth</code>.</p>
        <ul>
          <li>Set <code>BETTER_AUTH_URL</code> to the public origin. OAuth tokens are bound to <code>{"<BETTER_AUTH_URL>"}/api/mcp</code>, so a wrong origin breaks MCP sign-in.</li>
          <li>For GitHub, create an OAuth app with the callback URL <code>{"<BETTER_AUTH_URL>"}/api/auth/callback/github</code>. The GitHub login becomes the preferred username.</li>
          <li>For Google, create an OAuth client of type Web application with the authorized redirect URI <code>{"<BETTER_AUTH_URL>"}/api/auth/callback/google</code>, and ask only for the <code>openid</code>, <code>email</code>, and <code>profile</code> scopes. The button shows only when both Google values are set, and never on Vercel preview deploys, because Google accepts only exact redirect URIs. The sign-in pages read the Google values when the app builds, so after you change them, build again; a restart is not enough.</li>
          <li>A GitHub or Google sign-in whose email matches an existing account joins that account only when the provider has verified the email and the account has confirmed it. Google may create or join an account only for an address it hosts: Gmail, or a Google Workspace domain. A Google account on any other address, or with an unverified one, is sent back to use an email link. Google&apos;s tokens are not kept.</li>
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
      <CodeSnippet title="R2 CORS policy" language="json" code={corsRule} className="mt-4" />
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
          <li>Deploy. The production build runs <code>scripts/migrate-on-deploy.mts</code> first: it applies pending migrations over <code>DATABASE_URL_UNPOOLED</code>, one build at a time. If a migration fails, the build fails and the previous deployment keeps serving. Preview and local builds skip this step, so an unmerged migration never reaches your database.</li>
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
      <CodeSnippet title="Terminal" language="bash" code={localSteps} className="mt-4" />
      <Prose>
        <p>The app runs on <code>http://localhost:3000</code>. Without Sendir keys, open <code>/api/dev/sign-in</code> to sign in as a development user in one step; it exists only under <code>next dev</code> and is off while Sendir keys are set. Before you push, run <code>pnpm check</code> (typecheck, lint, file length, tests) and <code>pnpm build</code>.</p>
      </Prose>
    </RegistryPage>
  );
}
