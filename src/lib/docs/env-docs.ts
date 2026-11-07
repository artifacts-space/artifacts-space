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
  { name: "DATABASE_URL_UNPOOLED", need: "optional", what: "Direct (unpooled) connection for migrations. Falls back to DATABASE_URL." },
  { name: "BETTER_AUTH_SECRET", need: "required", what: "Signs sessions. At least 32 characters: openssl rand -base64 32." },
  { name: "BETTER_AUTH_URL", need: "required", what: "This site's origin, such as https://artifacts.example.com. Every absolute link, the OAuth issuer, and the MCP resource come from it." },
  { name: "GITHUB_CLIENT_ID", need: "optional", what: "GitHub OAuth app. Without both GitHub values, GitHub sign-in is off and email links remain." },
  { name: "GITHUB_CLIENT_SECRET", need: "optional", what: "Secret for the GitHub OAuth app." },
  { name: "SENDIR_API_KEY", need: "for email", what: "Sendir key scoped to the sending identity. Production cannot send sign-in links without it." },
  { name: "SENDIR_IDENTITY_ID", need: "for email", what: "The Sendir identity whose address sends every email." },
  { name: "SENDIR_URL", need: "optional", what: "Overrides https://sendir.ai." },
  { name: "R2_ACCOUNT_ID", need: "for files", what: "Cloudflare account id for R2." },
  { name: "R2_BUCKET", need: "for files", what: "The bucket that holds uploads." },
  { name: "R2_ACCESS_KEY_ID", need: "for files", what: "S3 access key: the id of an API token scoped to the bucket." },
  { name: "R2_SECRET_ACCESS_KEY", need: "for files", what: "S3 secret: the SHA-256 of that token." },
  { name: "CRON_SECRET", need: "required", what: "At least 16 characters. Vercel Cron sends it as a bearer token to /api/cron/*." },
  { name: "STORAGE_QUOTA_CONTENT_BYTES", need: "optional", what: "Artifact content quota per account, in bytes. Default 100 MB." },
  { name: "STORAGE_QUOTA_FILE_BYTES", need: "optional", what: "File quota per account, in bytes. Default 1 GB." },
  { name: "VERCEL_PROJECT_PRODUCTION_URL", need: "platform", what: "Set by Vercel. The site origin when BETTER_AUTH_URL is unset." },
  { name: "VERCEL_ENV", need: "platform", what: "Set by Vercel. Production and preview share one email budget; anything else counts its own." },
  { name: "NODE_ENV", need: "platform", what: "Set by Next.js. Development turns on the dev sign-in route and prints sign-in links instead of sending them." },
];
