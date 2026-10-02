CREATE OR REPLACE FUNCTION public.save_shared_project_content(_project_id text, _patch jsonb)
 RETURNS public.projects LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE cur public.projects%ROWTYPE; res public.projects%ROWTYPE; acc text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO cur FROM public.projects WHERE id = _project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found or access denied'; END IF;
  IF cur.user_id <> auth.uid() THEN
    SELECT public.normalize_member_access(access) INTO acc FROM public.project_members
      WHERE project_id = _project_id AND member_user_id = auth.uid() AND status = 'ACCEPTED';
    IF acc IS NULL OR acc NOT IN ('EDIT','MANAGE') THEN RAISE EXCEPTION 'Edit access required'; END IF;
  END IF;
  -- content only: owner (user_id), members, stages and status are never touched here
  UPDATE public.projects SET
    title = COALESCE(NULLIF(left(_patch->>'title', 300), ''), title),
    description = COALESCE(_patch->>'description', description),
    priority = CASE WHEN _patch->>'priority' IN ('LOW','MEDIUM','HIGH','URGENT') THEN _patch->>'priority' ELSE priority END,
    due_date = CASE WHEN _patch ? 'dueDate' THEN NULLIF(_patch->>'dueDate', '')::timestamptz ELSE due_date END,
    updated_at = now()
  WHERE id = _project_id RETURNING * INTO res;
  RETURN res;
END $function$;

CREATE OR REPLACE FUNCTION public.set_member_details_atomic(_project_id text, _member_user_id uuid, _role text, _stage_ids text[])
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE real_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT user_id INTO real_owner FROM public.projects WHERE id = _project_id LIMIT 1;
  IF real_owner IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF _member_user_id = real_owner THEN RAISE EXCEPTION 'The owner cannot be changed'; END IF;
  IF _member_user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot change your own membership'; END IF;
  IF NOT public.can_manage_project(_project_id) THEN RAISE EXCEPTION 'Manage access required'; END IF;
  PERFORM set_config('app.member_rpc', 'on', true);
  UPDATE public.project_members SET
    role = COALESCE(left(_role, 80), role),
    stage_ids = COALESCE(_stage_ids, stage_ids)
  WHERE project_id = _project_id AND member_user_id = _member_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
  PERFORM set_config('app.member_rpc', 'off', true);
  RETURN true;
END $function$;

REVOKE EXECUTE ON FUNCTION public.save_shared_project_content(text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_member_details_atomic(text, uuid, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_shared_project_content(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_member_details_atomic(text, uuid, text, text[]) TO authenticated, service_role;