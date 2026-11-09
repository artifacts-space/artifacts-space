-- Backfill: every existing team gets the built-in roles with today's rules
-- (src/lib/teams/capability-rules.ts, defaultRoleCapabilities), so nothing
-- anyone can do changes. One statement: capabilities are seeded only for the
-- role rows this statement creates, so running it again never puts back a
-- grant a team removed. A test checks that these rows equal the defaults.
WITH "created" AS (
  INSERT INTO "team_role" ("id", "team_id", "key", "name", "built_in")
  SELECT gen_random_uuid()::text, "team"."id", "roles"."key", "roles"."name", true
  FROM "team"
  CROSS JOIN (VALUES ('owner', 'Owner'), ('admin', 'Admin'), ('member', 'Member'), ('agent', 'Agent')) AS "roles" ("key", "name")
  ON CONFLICT ("team_id", "key") DO NOTHING
  RETURNING "id", "key"
)
INSERT INTO "team_role_capability" ("role_id", "capability")
SELECT "created"."id", "defaults"."capability"
FROM "created"
JOIN (VALUES
  ('owner', 'share.team'),
  ('owner', 'share.link'),
  ('owner', 'share.public'),
  ('owner', 'approve.sharing'),
  ('owner', 'approve.edits'),
  ('owner', 'members.invite'),
  ('owner', 'members.remove'),
  ('owner', 'members.roles'),
  ('owner', 'agents.manage'),
  ('owner', 'themes.manage'),
  ('owner', 'analytics.view'),
  ('owner', 'artifacts.withdraw'),
  ('owner', 'reports.handle'),
  ('owner', 'settings.team'),
  ('admin', 'share.team'),
  ('admin', 'share.link'),
  ('admin', 'share.public'),
  ('admin', 'approve.sharing'),
  ('admin', 'approve.edits'),
  ('admin', 'members.invite'),
  ('admin', 'members.remove'),
  ('admin', 'members.roles'),
  ('admin', 'agents.manage'),
  ('admin', 'themes.manage'),
  ('admin', 'analytics.view'),
  ('admin', 'artifacts.withdraw'),
  ('admin', 'reports.handle'),
  ('member', 'analytics.view'),
  ('agent', 'analytics.view')
) AS "defaults" ("key", "capability") ON "defaults"."key" = "created"."key"
ON CONFLICT DO NOTHING;
