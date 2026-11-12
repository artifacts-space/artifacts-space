/**
 * Fills a connector directory reviewer's account with the demo data the
 * directory's written test cases need, and puts it back to that starting
 * state between takes. Run by the owner only, for accounts made with
 * scripts/create-reviewer-account.mts.
 *
 *   DATABASE_URL=<database> node scripts/seed-reviewer-demo.mts \
 *     --email <reviewer>@artifacts.space --commenter-email <other reviewer>@artifacts.space [--reset]
 *
 * What it seeds, through the app's own services (artifact create and save,
 * projects, sharing, comments, notification settings):
 * - the three sample artifacts reviewer:create makes, when missing;
 * - "Launch timeline" in the project Launch;
 * - "Onboarding notes", "Onboarding checklist", and "Onboarding guide",
 *   created in that order (the services stamp every save with the database
 *   clock, so they are milliseconds apart and the guide is the newest);
 * - "Release checklist", whose one unchecked step is the database migration;
 * - "Q4 roadmap" with three versions (a create and two web editing sessions);
 * - "API spec", shared by link with comments open to anyone signed in (the
 *   product applies that at once for an artifact in the author's personal
 *   team), and one comment from the other reviewer account that mentions
 *   this one, so it waits unread in this account's inbox;
 * - notification settings with every email and browser notification off
 *   (in-app on), saved before the comment, so the mention never emails.
 *
 * --reset first removes the account's state: every artifact it or an agent
 * it added wrote (with their versions, comments and replies, mentions,
 * notifications, sharing requests, views, and files), its own projects, and
 * every inbox entry and notification left for it. That covers everything the
 * test prompts create or change. It keeps the account, its login, sessions,
 * connected apps and tokens, its teams, and comments it wrote on other
 * people's artifacts (such as its comment on the other reviewer's API spec).
 * Without --reset, an account that already holds demo data is left as it is.
 *
 * The services write one by one, as in the product, so a run is not one
 * transaction; if one stops part way, run it again with --reset. A run counts
 * toward the account's own limits like any other use (120 new artifacts an
 * hour, so about eleven resets an hour); a run stopped by a limit says so,
 * and --reset finishes it once the hour has passed. Neither
 * account's email or push is reachable from a run: the commenter's mention
 * is the only notification, the reviewer's settings turn its email and push
 * off first, and this process also drops the Sendir and push keys from its
 * environment before it loads the app.
 *
 * It prints one line of counts on stderr and nothing on stdout. Only the
 * database URL set for this run is used, never `.env.local`; a database that
 * is not on this machine also needs ALLOW_SHARED_REVIEWER_ACCOUNT=1 for that
 * one run.
 */
import { fileURLToPath } from "node:url";

import { reviewerDatabase, reviewerEmailProblem } from "./create-reviewer-account-rules.mts";
import { describeError, redact, secretsFrom } from "./migrate-on-deploy.mts";
import { parseSeedArgs, seedReport, seedUsage, type SeedRequest } from "./seed-reviewer-demo-rules.mts";

type Env = Readonly<Record<string, string | undefined>>;

/** Variables that would let the app send email or push. A run never needs them. */
const senderVariables = ["SENDIR_API_KEY", "SENDIR_IDENTITY_ID", "SENDIR_URL", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const;

/** The app's notices for work outside a request (no cache to revalidate) say nothing about the run. */
function quietOutsideRequestNotices() {
  const warn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("[versions] Cache tag not revalidated")) return;
    warn(...args);
  };
  // Keep stdout empty: anything the app prints as info goes to stderr.
  console.info = (...args: unknown[]) => { console.error(...args); };
}

/** Points the app at this run's database, with nothing to send email or push with. */
function prepareAppEnvironment(databaseUrl: string) {
  process.env.DATABASE_URL = databaseUrl;
  for (const name of senderVariables) Reflect.deleteProperty(process.env, name);
}

/** The refusal or failure line for an error, never with a URL or secret in it. */
async function failureLine(error: unknown, env: Env): Promise<string> {
  const [{ ReviewerDemoRefusal }, { UserFacingError }] = await Promise.all([import("./seed-reviewer-demo-data.mts"), import("../src/lib/user-facing-error.ts")]);
  if (error instanceof ReviewerDemoRefusal || error instanceof UserFacingError) return error.message;
  return `Failed: ${redact(describeError(error), secretsFrom(env))}`;
}

/** Runs the seed with the app loaded, waits for the work it scheduled, and closes the database. */
async function seedWithApp(request: SeedRequest) {
  const { registerAppModuleHooks, settleAfterTasks } = await import("./app-module-hooks.mts");
  registerAppModuleHooks();
  const { closeDatabase, seedReviewerDemo } = await import("./seed-reviewer-demo-data.mts");
  try {
    return await seedReviewerDemo(request);
  } finally {
    await settleAfterTasks();
    await closeDatabase();
  }
}

/**
 * The command: checks the arguments and the database, then seeds. Returns the
 * exit code: 0 done, 1 refused or failed, 2 bad arguments or database.
 */
export async function runSeed(argv: readonly string[], env: Env): Promise<number> {
  const args = parseSeedArgs(argv);
  if (!args.ok) {
    console.error(`${args.error}\n\n${seedUsage}`);
    return 2;
  }
  const database = reviewerDatabase(env);
  if (!database.ok) {
    console.error(database.error);
    return 2;
  }
  const { request } = args;
  const emailProblem = reviewerEmailProblem(request.email, database) ?? reviewerEmailProblem(request.commenterEmail, database);
  if (emailProblem) {
    console.error(`${emailProblem}\n\n${seedUsage}`);
    return 2;
  }
  prepareAppEnvironment(database.url);
  quietOutsideRequestNotices();
  try {
    const outcome = await seedWithApp(request);
    console.error(seedReport(outcome.counts, outcome.alreadySeeded));
    return 0;
  } catch (error) {
    console.error(await failureLine(error, env));
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await runSeed(process.argv.slice(2), process.env);
}
