-- When content first named each file attached before named_in_content_at existed: the earliest
-- kept ui or Markdown version of its artifact that names it. New saves and attaches set it
-- themselves (src/lib/files/content-files.ts); until this runs, these files act as plain attachments.
-- The deploy applies pending migrations in one transaction. These limits fail the deploy, and
-- leave the old deployment serving, instead of holding locks while reads queue behind them.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
SET LOCAL statement_timeout = '120s';--> statement-breakpoint
UPDATE "artifact_file" AS f
SET "named_in_content_at" = named."first_named_at"
FROM (
  SELECT f2."id", min(v."saved_at") AS "first_named_at"
  FROM "artifact_file" AS f2
  JOIN "artifact_version" AS v ON v."artifact_id" = f2."artifact_id"
  WHERE f2."artifact_id" IS NOT NULL
    AND f2."named_in_content_at" IS NULL
    AND v."kind" IN ('ui', 'markdown')
    AND strpos(lower(v."content"), f2."id") > 0
  GROUP BY f2."id"
) AS named
WHERE f."id" = named."id"
  AND f."named_in_content_at" IS NULL;
