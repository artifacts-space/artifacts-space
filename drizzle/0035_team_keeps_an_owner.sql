-- A team always keeps at least one owner, on every path: our server actions,
-- Better Auth's routes, and the old code during a deploy. Changes to a team's
-- owners take a lock on the team row first, so two owners demoting or
-- removing each other at the same moment wait for one another, and the second
-- is refused. Deleting the whole team, or the person's account, is allowed.
CREATE OR REPLACE FUNCTION team_keeps_an_owner() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT ('owner' = ANY (string_to_array(OLD.role, ','))) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.team_id = OLD.team_id AND 'owner' = ANY (string_to_array(NEW.role, ',')) THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM team WHERE team.id = OLD.team_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    -- The team itself is being deleted.
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM "user" WHERE "user".id = OLD.user_id) THEN
    -- The person's account is being deleted.
    RETURN OLD;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM team_member
    WHERE team_member.team_id = OLD.team_id
      AND team_member.id <> OLD.id
      AND 'owner' = ANY (string_to_array(team_member.role, ','))
  ) THEN
    RAISE EXCEPTION 'A team always keeps at least one owner.' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER team_member_keeps_an_owner
  BEFORE UPDATE OF role, team_id OR DELETE ON team_member
  FOR EACH ROW EXECUTE FUNCTION team_keeps_an_owner();
