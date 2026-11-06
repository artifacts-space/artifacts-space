-- "unlisted" artifacts become "link" artifacts. Their author's personal team
-- is the approving team, as for any personal link share. Safe to re-run.
UPDATE "artifact" a
SET visibility = 'link', team_id = t.id
FROM "team" t
WHERE a.visibility = 'unlisted'
	AND t.personal
	AND t.created_by = a.user_id;
--> statement-breakpoint
-- Any unlisted artifact whose author has no personal team still moves to link.
UPDATE "artifact" SET visibility = 'link' WHERE visibility = 'unlisted';
