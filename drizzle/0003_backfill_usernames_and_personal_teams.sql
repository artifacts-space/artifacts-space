-- Give every existing user a username from their email's local part, made
-- unique, and a personal team whose slug is that username. Safe to re-run:
-- it only touches users without a username or without a personal team.
-- Backfilled names are not confirmed, so each person keeps or changes theirs
-- once on their next visit.
WITH bases AS (
	SELECT
		u.id,
		CASE
			WHEN length(b.base) < 2 THEN 'user'
			WHEN b.base IN ('admin', 'api', 'app', 'artifact', 'artifacts', 'invitations', 'link', 'me', 'mine', 'new', 'private', 'public', 'root', 'settings', 'share', 'sign-in', 'sign-up', 'support', 'system', 'team', 'teams', 'www') THEN b.base || '-user'
			ELSE b.base
		END AS base
	FROM "user" u
	CROSS JOIN LATERAL (
		SELECT trim(both '-' from left(trim(both '-' from regexp_replace(lower(split_part(u.email, '@', 1)), '[^a-z0-9]+', '-', 'g')), 32)) AS base
	) b
	WHERE u.username IS NULL
),
ranked AS (
	SELECT id, base, row_number() OVER (PARTITION BY base ORDER BY id) AS rn FROM bases
)
UPDATE "user" u
SET username = CASE WHEN r.rn = 1 THEN r.base ELSE r.base || '-' || r.rn END
FROM ranked r
WHERE u.id = r.id;
--> statement-breakpoint
INSERT INTO "team" ("id", "name", "slug", "created_at", "personal", "team_sharing_needs_approval", "created_by")
SELECT gen_random_uuid()::text, coalesce(nullif(trim(u.name), ''), u.username), u.username, now(), true, false, u.id
FROM "user" u
WHERE u.username IS NOT NULL
	AND NOT EXISTS (SELECT 1 FROM "team" t WHERE t.personal AND t.created_by = u.id);
--> statement-breakpoint
INSERT INTO "team_member" ("id", "team_id", "user_id", "role", "created_at")
SELECT gen_random_uuid()::text, t.id, t.created_by, 'owner', now()
FROM "team" t
WHERE t.personal
	AND t.created_by IS NOT NULL
	AND NOT EXISTS (SELECT 1 FROM "team_member" m WHERE m.team_id = t.id AND m.user_id = t.created_by);
