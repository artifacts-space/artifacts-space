-- A custom role is only ever given to someone in the role's own team, and
-- only custom roles are assigned (built-in roles live in team_member.role).
-- The app checks this too (recordMemberRole); this keeps it true for every
-- writer, so a member of one team can never hold another team's role.
CREATE OR REPLACE FUNCTION team_role_assignment_same_team() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM team_member
    JOIN team_role ON team_role.team_id = team_member.team_id
    WHERE team_member.id = NEW.member_id
      AND team_role.id = NEW.role_id
      AND NOT team_role.built_in
  ) THEN
    RAISE EXCEPTION 'A custom role can only be given to someone in its own team.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER team_role_assignment_same_team
  BEFORE INSERT OR UPDATE OF member_id, role_id ON team_role_assignment
  FOR EACH ROW EXECUTE FUNCTION team_role_assignment_same_team();
