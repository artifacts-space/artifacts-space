-- Existing artifacts were last saved by their author. Existing versions were
-- saved once, at creation, so saved_at = created_at, and their size feeds the
-- storage quota. It runs once, right after 0013 adds the columns.
UPDATE "artifact" SET "updated_by" = "user_id" WHERE "updated_by" IS NULL;
--> statement-breakpoint
UPDATE "artifact_version" SET "saved_at" = "created_at" WHERE "saved_at" > "created_at";
--> statement-breakpoint
UPDATE "artifact_version"
SET "bytes" = octet_length("content") + octet_length("metadata"::text)
WHERE "bytes" = 0;
