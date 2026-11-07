-- 0015 added artifact.comments with the default 'signed_in', which is how
-- comments worked before the setting existed: anyone signed in who can read
-- the artifact. Private and team artifacts can only be read by their author
-- and their team, so for them 'team' allows exactly the same people. Storing
-- 'team' means a later change to link or public in the same team keeps
-- comments to the team instead of opening them to every signed-in reader.
-- Link and public artifacts keep 'signed_in'. Nothing changes for anyone today.
UPDATE "artifact" SET "comments" = 'team' WHERE "visibility" IN ('private', 'team') AND "comments" = 'signed_in';
