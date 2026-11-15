/**
 * Stops `pnpm test:db` when no test database is named. Without
 * TEST_DATABASE_URL every database test skips itself, and the run would end
 * green having checked nothing.
 */
if (!process.env.TEST_DATABASE_URL?.trim()) {
  console.error(
    "pnpm test:db needs TEST_DATABASE_URL: a throwaway Postgres on this machine with the migrations applied (see Testing in AGENTS.md).",
  );
  process.exit(1);
}
