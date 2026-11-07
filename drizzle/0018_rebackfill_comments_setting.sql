-- Code deployed before 0015 kept writing rows with that migration's default,
-- 'signed_in', until the new code went live. 0016's rule applies to them too:
-- private and team artifacts can only be read by their author and team, so
-- 'team' allows exactly the same people. Link and public rows keep their value.
UPDATE "artifact" SET "comments" = 'team' WHERE "visibility" IN ('private', 'team') AND "comments" = 'signed_in';
