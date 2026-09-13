CREATE OR REPLACE FUNCTION public.delete_owned_project_atomic(_project_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  PERFORM 1
  FROM public.projects
  WHERE id = _project_id
    AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found or access denied';
  END IF;

  DELETE FROM public.project_members
  WHERE project_id = _project_id
    AND owner_id = auth.uid();

  DELETE FROM public.projects
  WHERE id = _project_id
    AND user_id = auth.uid();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_owned_project_atomic(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_owned_project_atomic(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_owned_task_atomic(_task_id text, _patch jsonb)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_row public.tasks%ROWTYPE;
  result_row public.tasks%ROWTYPE;
  next_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO current_row
  FROM public.tasks
  WHERE id = _task_id
    AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found or access denied';
  END IF;

  next_status := COALESCE(_patch->>'status', current_row.status);

  UPDATE public.tasks
  SET title = COALESCE(_patch->>'title', title),
      description = COALESCE(_patch->>'description', description),
      status = next_status,
      priority = COALESCE(_patch->>'priority', priority),
      category_id = CASE WHEN _patch ? 'categoryId' THEN NULLIF(_patch->>'categoryId', '') ELSE category_id END,
      tag_ids = CASE WHEN _patch ? 'tagIds' THEN ARRAY(SELECT jsonb_array_elements_text(_patch->'tagIds')) ELSE tag_ids END,
      due_date = CASE WHEN _patch ? 'dueDate' THEN NULLIF(_patch->>'dueDate', '')::timestamptz ELSE due_date END,
      completed_at = CASE
        WHEN next_status = 'COMPLETED' THEN COALESCE(completed_at, now())
        ELSE NULL
      END,
      updated_at = now()
  WHERE id = _task_id
    AND user_id = auth.uid()
  RETURNING * INTO result_row;

  RETURN result_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_owned_task_atomic(_task_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  DELETE FROM public.tasks
  WHERE id = _task_id
    AND user_id = auth.uid();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count <> 1 THEN
    RAISE EXCEPTION 'Task not found or access denied';
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.save_owned_task_atomic(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_owned_task_atomic(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_owned_task_atomic(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_owned_task_atomic(text) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS projects_user_updated_idx ON public.projects (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS project_members_member_status_idx ON public.project_members (member_user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS project_members_owner_project_idx ON public.project_members (owner_id, project_id);
CREATE INDEX IF NOT EXISTS tasks_user_updated_idx ON public.tasks (user_id, updated_at DESC);