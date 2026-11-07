-- Turns every artifact's free-text project label into a project row and links
-- the artifact to it. The project lives in the artifact's home scope
-- (src/lib/projects/rules.ts): the shared team it is shared through when it
-- is not private and the team is not personal, else its author. Labels are
-- normalized like normalizeProjectName (NFC, no control or format
-- characters (\p{Cc} and \p{Cf}), spaces
-- collapsed, trimmed) and matched by lowercase key, so "Billing" and
-- "billing " become one project; the newest artifact's spelling names it.
-- The label column stays (deprecated, no longer read). Additive and safe to
-- rerun: existing projects and links are kept.
WITH "labelled" AS (
  SELECT
    a."id" AS "artifact_id",
    a."user_id" AS "author_id",
    a."updated_at",
    CASE WHEN a."visibility" <> 'private' AND a."team_id" IS NOT NULL AND t."personal" = false THEN NULL ELSE a."user_id" END AS "scope_user_id",
    CASE WHEN a."visibility" <> 'private' AND a."team_id" IS NOT NULL AND t."personal" = false THEN a."team_id" ELSE NULL END AS "scope_team_id",
    btrim(regexp_replace(regexp_replace(normalize(a."project", NFC), '[[:cntrl:]­؀-؅؜۝܏࢐-࢑࣢᠎​-‏‪-‮⁠-⁤⁦-⁯﻿￹-￻\U000110BD\U000110CD\U00013430-\U0001343F\U0001BCA0-\U0001BCA3\U0001D173-\U0001D17A\U000E0001\U000E0020-\U000E007F]', '', 'g'), '\s+', ' ', 'g')) AS "name"
  FROM "artifact" a
  LEFT JOIN "team" t ON t."id" = a."team_id"
  WHERE a."project_id" IS NULL AND btrim(a."project") <> ''
),
"named" AS (
  SELECT *, lower("name") AS "name_key" FROM "labelled" WHERE "name" <> '' AND char_length("name") <= 120
),
"chosen" AS (
  SELECT DISTINCT ON ("scope_user_id", "scope_team_id", "name_key") "scope_user_id", "scope_team_id", "name_key", "name", "author_id"
  FROM "named"
  ORDER BY "scope_user_id", "scope_team_id", "name_key", "updated_at" DESC
)
INSERT INTO "project" ("id", "user_id", "team_id", "name", "name_key", "created_by")
SELECT gen_random_uuid()::text, "scope_user_id", "scope_team_id", "name", "name_key", "author_id" FROM "chosen"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
WITH "labelled" AS (
  SELECT
    a."id" AS "artifact_id",
    CASE WHEN a."visibility" <> 'private' AND a."team_id" IS NOT NULL AND t."personal" = false THEN NULL ELSE a."user_id" END AS "scope_user_id",
    CASE WHEN a."visibility" <> 'private' AND a."team_id" IS NOT NULL AND t."personal" = false THEN a."team_id" ELSE NULL END AS "scope_team_id",
    lower(btrim(regexp_replace(regexp_replace(normalize(a."project", NFC), '[[:cntrl:]­؀-؅؜۝܏࢐-࢑࣢᠎​-‏‪-‮⁠-⁤⁦-⁯﻿￹-￻\U000110BD\U000110CD\U00013430-\U0001343F\U0001BCA0-\U0001BCA3\U0001D173-\U0001D17A\U000E0001\U000E0020-\U000E007F]', '', 'g'), '\s+', ' ', 'g'))) AS "name_key"
  FROM "artifact" a
  LEFT JOIN "team" t ON t."id" = a."team_id"
  WHERE a."project_id" IS NULL AND btrim(a."project") <> ''
)
UPDATE "artifact" AS a
SET "project_id" = p."id"
FROM "labelled" l
JOIN "project" p
  ON p."name_key" = l."name_key"
  AND p."user_id" IS NOT DISTINCT FROM l."scope_user_id"
  AND p."team_id" IS NOT DISTINCT FROM l."scope_team_id"
WHERE a."id" = l."artifact_id" AND a."project_id" IS NULL;
