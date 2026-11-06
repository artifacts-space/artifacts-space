-- Link and public artifacts get their current content as the approved
-- version, so readers outside the team keep seeing it once edits need
-- approval. Safe to re-run: only artifacts without an approved version change.
WITH inserted AS (
	INSERT INTO "artifact_version" ("id", "artifact_id", "title", "summary", "content", "kind", "language", "project", "source", "metadata", "created_by", "created_at")
	SELECT gen_random_uuid()::text, a."id", a."title", a."summary", a."content", a."kind", a."language", a."project", a."source", a."metadata", a."user_id", a."updated_at"
	FROM "artifact" a
	WHERE a."visibility" IN ('link', 'public') AND a."approved_version_id" IS NULL
	RETURNING "id", "artifact_id"
)
UPDATE "artifact" a
SET "approved_version_id" = inserted."id"
FROM inserted
WHERE a."id" = inserted."artifact_id";
