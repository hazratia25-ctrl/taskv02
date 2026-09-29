CREATE INDEX IF NOT EXISTS project_members_project_member_idx ON public.project_members(project_id, member_user_id);

CREATE OR REPLACE FUNCTION public.normalize_member_access(_a text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE upper(btrim(coalesce(_a,'')))
    WHEN 'MANAGE' THEN 'MANAGE' WHEN 'ADMIN' THEN 'MANAGE' WHEN 'MANAGER' THEN 'MANAGE'
    WHEN 'EDIT' THEN 'EDIT' WHEN 'EDITOR' THEN 'EDIT' WHEN 'WRITE' THEN 'EDIT'
    ELSE 'VIEW' END
$$;

-- blocks privilege escalation on direct table writes, whatever policy allowed the row
CREATE OR REPLACE FUNCTION public.guard_project_member_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  real_owner uuid;
BEGIN
  NEW.access := public.normalize_member_access(NEW.access);
  IF auth.uid() IS NULL THEN RETURN NEW; END IF; -- service_role / maintenance
  SELECT user_id INTO real_owner FROM public.projects WHERE id = NEW.project_id LIMIT 1;
  IF real_owner IS NULL OR NEW.owner_id <> real_owner THEN
    RAISE EXCEPTION 'owner_id must match the project owner';
  END IF;
  IF NEW.member_user_id = real_owner THEN
    RAISE EXCEPTION 'The owner cannot be a member';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.project_id <> OLD.project_id OR NEW.owner_id <> OLD.owner_id OR NEW.member_user_id <> OLD.member_user_id THEN
      RAISE EXCEPTION 'Membership identity columns are immutable';
    END IF;
    IF auth.uid() <> real_owner THEN
      -- a non-owner writing directly may only answer their own pending invite
      IF auth.uid() <> OLD.member_user_id OR OLD.status <> 'PENDING'
         OR NEW.status NOT IN ('ACCEPTED','REJECTED')
         OR NEW.access <> public.normalize_member_access(OLD.access)
         OR NEW.role IS DISTINCT FROM OLD.role
         OR NEW.stage_ids IS DISTINCT FROM OLD.stage_ids THEN
        RAISE EXCEPTION 'Not allowed to change this membership';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_project_member_write ON public.project_members;
CREATE TRIGGER guard_project_member_write BEFORE INSERT OR UPDATE ON public.project_members
FOR EACH ROW EXECUTE FUNCTION public.guard_project_member_write();

-- owner or accepted MANAGE member changes a member's access; never self, never the owner
CREATE OR REPLACE FUNCTION public.set_member_access_atomic(_project_id text, _member_user_id uuid, _access text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  real_owner uuid;
  caller_access text;
  next_access text := public.normalize_member_access(_access);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF upper(btrim(coalesce(_access,''))) NOT IN ('VIEW','EDIT','MANAGE') THEN RAISE EXCEPTION 'Invalid access'; END IF;
  SELECT user_id INTO real_owner FROM public.projects WHERE id = _project_id LIMIT 1;
  IF real_owner IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF _member_user_id = real_owner THEN RAISE EXCEPTION 'The owner access cannot be changed'; END IF;
  IF auth.uid() <> real_owner THEN
    IF _member_user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot change your own access'; END IF;
    SELECT public.normalize_member_access(access) INTO caller_access FROM public.project_members
      WHERE project_id = _project_id AND member_user_id = auth.uid() AND status = 'ACCEPTED';
    IF caller_access IS DISTINCT FROM 'MANAGE' THEN RAISE EXCEPTION 'Manage access required'; END IF;
  END IF;
  -- trigger runs as owner-context check; bypass by updating as definer with auth.uid() owner-check done above
  PERFORM set_config('request.jwt.claim.sub', '', true);
  UPDATE public.project_members SET access = next_access
    WHERE project_id = _project_id AND member_user_id = _member_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
  RETURN next_access;
END $$;

REVOKE EXECUTE ON FUNCTION public.set_member_access_atomic(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_access_atomic(text, uuid, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_project_member_write() FROM PUBLIC, anon, authenticated;