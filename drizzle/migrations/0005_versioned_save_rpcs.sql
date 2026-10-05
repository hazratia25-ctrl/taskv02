-- Stage 4: optimistic concurrency using existing updated_at columns. Additive only.
CREATE OR REPLACE FUNCTION public.save_owned_task_versioned(_task_id text, _patch jsonb, _expected_updated_at timestamptz)
 RETURNS public.tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE cur_ts timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF _expected_updated_at IS NULL THEN RAISE EXCEPTION 'Expected version required'; END IF;
  SELECT updated_at INTO cur_ts FROM public.tasks WHERE id = _task_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found or access denied'; END IF;
  IF cur_ts IS DISTINCT FROM _expected_updated_at THEN
    RAISE EXCEPTION 'STALE_UPDATE' USING ERRCODE = '40001';
  END IF;
  RETURN public.save_owned_task_atomic(_task_id, _patch);
END $function$;

CREATE OR REPLACE FUNCTION public.save_owned_project_versioned(_project_id text, _patch jsonb, _expected_updated_at timestamptz)
 RETURNS public.projects LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE cur_ts timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF _expected_updated_at IS NULL THEN RAISE EXCEPTION 'Expected version required'; END IF;
  SELECT updated_at INTO cur_ts FROM public.projects WHERE id = _project_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found or access denied'; END IF;
  IF cur_ts IS DISTINCT FROM _expected_updated_at THEN
    RAISE EXCEPTION 'STALE_UPDATE' USING ERRCODE = '40001';
  END IF;
  RETURN public.save_owned_project_atomic(_project_id, _patch);
END $function$;

CREATE OR REPLACE FUNCTION public.save_shared_project_content_versioned(_project_id text, _patch jsonb, _expected_updated_at timestamptz)
 RETURNS public.projects LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE cur public.projects%ROWTYPE; acc text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF _expected_updated_at IS NULL THEN RAISE EXCEPTION 'Expected version required'; END IF;
  SELECT * INTO cur FROM public.projects WHERE id = _project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found or access denied'; END IF;
  IF cur.user_id <> auth.uid() THEN
    SELECT public.normalize_member_access(access) INTO acc FROM public.project_members
      WHERE project_id = _project_id AND member_user_id = auth.uid() AND status = 'ACCEPTED';
    IF acc IS NULL OR acc NOT IN ('EDIT','MANAGE') THEN RAISE EXCEPTION 'Edit access required'; END IF;
  END IF;
  IF cur.updated_at IS DISTINCT FROM _expected_updated_at THEN
    RAISE EXCEPTION 'STALE_UPDATE' USING ERRCODE = '40001';
  END IF;
  RETURN public.save_shared_project_content(_project_id, _patch);
END $function$;

REVOKE EXECUTE ON FUNCTION public.save_owned_task_versioned(text, jsonb, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_owned_project_versioned(text, jsonb, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_shared_project_content_versioned(text, jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_owned_task_versioned(text, jsonb, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_owned_project_versioned(text, jsonb, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_shared_project_content_versioned(text, jsonb, timestamptz) TO authenticated, service_role;