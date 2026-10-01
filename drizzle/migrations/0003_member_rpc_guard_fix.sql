CREATE OR REPLACE FUNCTION public.guard_project_member_write()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE real_owner uuid;
BEGIN
  NEW.access := public.normalize_member_access(NEW.access);
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  SELECT user_id INTO real_owner FROM public.projects WHERE id = NEW.project_id LIMIT 1;
  IF real_owner IS NULL OR NEW.owner_id <> real_owner THEN RAISE EXCEPTION 'owner_id must match the project owner'; END IF;
  IF NEW.member_user_id = real_owner THEN RAISE EXCEPTION 'The owner cannot be a member'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.project_id <> OLD.project_id OR NEW.owner_id <> OLD.owner_id OR NEW.member_user_id <> OLD.member_user_id THEN
      RAISE EXCEPTION 'Membership identity columns are immutable';
    END IF;
    -- privileged RPCs below perform their own owner/MANAGE checks and set this tx-local flag
    IF current_setting('app.member_rpc', true) = 'on' THEN RETURN NEW; END IF;
    IF auth.uid() <> real_owner THEN
      IF auth.uid() <> OLD.member_user_id OR OLD.status <> 'PENDING'
         OR NEW.status NOT IN ('ACCEPTED','REJECTED')
         OR NEW.access <> public.normalize_member_access(OLD.access)
         OR NEW.role IS DISTINCT FROM OLD.role
         OR NEW.stage_ids IS DISTINCT FROM OLD.stage_ids THEN
        RAISE EXCEPTION 'Not allowed to change this membership';
      END IF;
    END IF;
  ELSIF auth.uid() <> real_owner AND current_setting('app.member_rpc', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Only the owner or a manager may invite';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.can_manage_project(_project_id text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.projects WHERE id = _project_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.project_members WHERE project_id = _project_id
      AND member_user_id = auth.uid() AND status = 'ACCEPTED'
      AND public.normalize_member_access(access) = 'MANAGE'))
$$;

CREATE OR REPLACE FUNCTION public.set_member_access_atomic(_project_id text, _member_user_id uuid, _access text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE real_owner uuid; next_access text := public.normalize_member_access(_access);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF upper(btrim(coalesce(_access,''))) NOT IN ('VIEW','EDIT','MANAGE') THEN RAISE EXCEPTION 'Invalid access'; END IF;
  SELECT user_id INTO real_owner FROM public.projects WHERE id = _project_id LIMIT 1;
  IF real_owner IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF _member_user_id = real_owner THEN RAISE EXCEPTION 'The owner access cannot be changed'; END IF;
  IF _member_user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot change your own access'; END IF;
  IF NOT public.can_manage_project(_project_id) THEN RAISE EXCEPTION 'Manage access required'; END IF;
  PERFORM set_config('app.member_rpc', 'on', true);
  UPDATE public.project_members SET access = next_access
    WHERE project_id = _project_id AND member_user_id = _member_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
  PERFORM set_config('app.member_rpc', 'off', true);
  RETURN next_access;
END $function$;

CREATE OR REPLACE FUNCTION public.invite_member_atomic(_project_id text, _member_user_id uuid, _role text, _access text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE real_owner uuid; next_access text := public.normalize_member_access(_access);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF upper(btrim(coalesce(_access,''))) NOT IN ('VIEW','EDIT','MANAGE') THEN RAISE EXCEPTION 'Invalid access'; END IF;
  SELECT user_id INTO real_owner FROM public.projects WHERE id = _project_id LIMIT 1;
  IF real_owner IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF _member_user_id = real_owner OR _member_user_id = auth.uid() THEN RAISE EXCEPTION 'Invalid member'; END IF;
  IF NOT public.can_manage_project(_project_id) THEN RAISE EXCEPTION 'Manage access required'; END IF;
  PERFORM set_config('app.member_rpc', 'on', true);
  INSERT INTO public.project_members (project_id, owner_id, member_user_id, role, access, status)
  VALUES (_project_id, real_owner, _member_user_id, left(coalesce(_role,''), 80), next_access, 'PENDING')
  ON CONFLICT (project_id, member_user_id) DO UPDATE
    SET role = EXCLUDED.role, access = EXCLUDED.access,
        status = CASE WHEN public.project_members.status = 'ACCEPTED' THEN 'ACCEPTED' ELSE 'PENDING' END;
  PERFORM set_config('app.member_rpc', 'off', true);
  RETURN next_access;
END $function$;

CREATE OR REPLACE FUNCTION public.remove_member_atomic(_project_id text, _member_user_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE real_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT user_id INTO real_owner FROM public.projects WHERE id = _project_id LIMIT 1;
  IF real_owner IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF _member_user_id = real_owner THEN RAISE EXCEPTION 'The owner cannot be removed'; END IF;
  IF _member_user_id <> auth.uid() AND NOT public.can_manage_project(_project_id) THEN
    RAISE EXCEPTION 'Manage access required';
  END IF;
  DELETE FROM public.project_members WHERE project_id = _project_id AND member_user_id = _member_user_id;
  RETURN FOUND;
END $function$;

REVOKE EXECUTE ON FUNCTION public.can_manage_project(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_member_access_atomic(text, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.invite_member_atomic(text, uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_member_atomic(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_project(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_member_access_atomic(text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.invite_member_atomic(text, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_member_atomic(text, uuid) TO authenticated, service_role;