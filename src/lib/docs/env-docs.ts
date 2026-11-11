/**
 * Environment variables for the Self-hosting page. env-docs.test.ts scans
 * src/ for every environment variable the app reads and fails when one is missing here.
 */
export interface EnvDoc {
  name: string;
  need: "required" | "for files" | "for email" | "optional" | "platform";
  what: string;
}

export const envDocs: readonly EnvDoc[] = [
  { name: "DATABASE_URL", need: "required", what: "Postgres connection string. Neon's pooled URL in production; a localhost URL uses a plain pg pool." },
  { name: "DATABASE_URL_UNPOOLED", need: "optional", what: "Direct (unpooled) connection for migrations. Vercel production builds need it to apply migrations; pnpm db:migrate falls back to DATABASE_URL. In .env.local it comes first for migrations, so fill it in or leave it out (it is commented out in .env.example). A value set for the command wins over .env.local, and DATABASE_URL set alone serves for both." },
  { name: "E2E_LOCAL_DB", need: "optional", what: "Development only. Set to 1, with DATABASE_URL on localhost, to run the end-to-end checks that seed a throwaway database. Otherwise the end-to-end dev server gets no database at all." },
  { name: "ALLOW_SHARED_MIGRATE", need: "optional", what: "Set to 1 for one run to let pnpm db:migrate (or drizzle-kit push) change a database that is not on localhost, such as yours when you migrate by hand. Without it, they stop before they connect. Vercel production builds migrate on their own and never need it." },
  { name: "BETTER_AUTH_SECRET", need: "required", what: "Signs sessions. At least 32 characters: openssl rand -base64 32." },
  { name: "BETTER_AUTH_URL", need: "required", what: "This site's origin, such as https://artifacts.example.com. Every absolute link, the OAuth issuer, and the MCP resource come from it." },
  { name: "GITHUB_CLIENT_ID", need: "optional", what: "GitHub OAuth app. Without both GitHub values, GitHub sign-in is off and email links remain." },
  { name: "GITHUB_CLIENT_SECRET", need: "optional", what: "Secret for the GitHub OAuth app." },
  { name: "GOOGLE_CLIENT_ID", need: "optional", what: "Google OAuth client (Web application) with the redirect URI <BETTER_AUTH_URL>/api/auth/callback/google. Without both Google values, or with a replace-with-… placeholder, Google sign-in is off and its button is hidden. The sign-in pages read them when the app builds, so a change needs a new build, not just a restart." },
  { name: "GOOGLE_CLIENT_SECRET", need: "optional", what: "Secret for the Google OAuth client." },
  { name: "SENDIR_API_KEY", need: "for email", what: "Sendir key scoped to the sending identity. Production cannot send sign-in links without it." },
  { name: "SENDIR_IDENTITY_ID", need: "for email", what: "The Sendir identity whose address sends every email." },
  { name: "SENDIR_URL", need: "optional", what: "Overrides https://sendir.ai." },
  { name: "ABUSE_REPORT_EMAIL", need: "for email", what: "The site operator's address. Every reader report on an artifact is emailed here, and only here. Without it, reports are still stored and shown on the team page, and each one logs a warning." },
  { name: "SLACK_FEEDBACK_WEBHOOK_URL", need: "optional", what: "Slack Incoming Webhook for \"Something's not working\" reports from the account menu. Must start with https://hooks.slack.com/. Keep it secret. Without a valid one, the dialog says feedback is not available." },
  { name: "R2_ACCOUNT_ID", need: "for files", what: "Cloudflare account id for R2." },
  { name: "R2_BUCKET", need: "for files", what: "The bucket that holds uploads." },
  { name: "R2_ACCESS_KEY_ID", need: "for files", what: "S3 access key: the id of an API token scoped to the bucket." },
  { name: "R2_SECRET_ACCESS_KEY", need: "for files", what: "S3 secret: the SHA-256 of that token." },
  { name: "R2_ENDPOINT", need: "optional", what: "Another S3-compatible endpoint, such as http://localhost:9000 for a local store in end-to-end tests. https, or http on localhost only. Leave it unset in production." },
  { name: "CRON_SECRET", need: "required", what: "At least 16 characters. Vercel Cron sends it as a bearer token to /api/cron/*." },
  { name: "VAPID_PUBLIC_KEY", need: "optional", what: "Browser notifications (Web Push). Generate a pair with node scripts/generate-vapid-keys.mts. Without all three VAPID values, the browser option is hidden and in-app notifications still work." },
  { name: "VAPID_PRIVATE_KEY", need: "optional", what: "The private half of the VAPID pair. Keep it secret; changing it ends every browser's subscription." },
  { name: "VAPID_SUBJECT", need: "optional", what: "A contact for push services: mailto:you@example.com or an https:// URL." },
  { name: "STORAGE_QUOTA_CONTENT_BYTES", need: "optional", what: "Artifact content quota per account, in bytes. Default 100 MB." },
  { name: "STORAGE_QUOTA_FILE_BYTES", need: "optional", what: "File quota per account, in bytes. Default 1 GB." },
  { name: "VERCEL_PROJECT_PRODUCTION_URL", need: "platform", what: "Set by Vercel. The site origin when BETTER_AUTH_URL is unset." },
  { name: "VERCEL_ENV", need: "platform", what: "Set by Vercel. Production and preview share one email budget; anything else counts its own. Problem reports name it with the commit. Google sign-in is off on preview, whose URLs are not registered with Google." },
  { name: "VERCEL_GIT_COMMIT_SHA", need: "platform", what: "Set by Vercel. Problem reports name the deploy by its short commit." },
  { name: "NODE_ENV", need: "platform", what: "Set by Next.js. Development turns on the dev sign-in route and prints sign-in links instead of sending them." },
];
