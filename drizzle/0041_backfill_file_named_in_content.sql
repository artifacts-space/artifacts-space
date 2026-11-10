-- Files that a version of their artifact already names in its content (ui or Markdown).
-- New saves and attaches set the flag themselves (src/lib/files/content-files.ts).
UPDATE "artifact_file" AS f
SET "named_in_content" = true
WHERE f."artifact_id" IS NOT NULL
  AND f."named_in_content" = false
  AND EXISTS (
    SELECT 1 FROM "artifact_version" AS v
    WHERE v."artifact_id" = f."artifact_id"
      AND v."kind" IN ('ui', 'markdown')
      AND strpos(lower(v."content"), f."id") > 0
  );
