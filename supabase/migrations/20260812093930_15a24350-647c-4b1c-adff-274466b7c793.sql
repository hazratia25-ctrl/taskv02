CREATE OR REPLACE FUNCTION public.save_owned_project_atomic(_project_id text, _patch jsonb)
RETURNS public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_row public.projects%ROWTYPE;
  result_row public.projects%ROWTYPE;
  incoming_stages jsonb := COALESCE(_patch->'stages', '[]'::jsonb);
  merged_stages jsonb;
  stage_count integer;
  done_count integer;
  next_status text;
  next_completed_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO current_row
  FROM public.projects
  WHERE id = _project_id
  FOR UPDATE;

  IF NOT FOUND OR current_row.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Project not found or access denied';
  END IF;

  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN old_stage.value IS NOT NULL
       AND COALESCE((old_stage.value->>'doneAt')::timestamptz, '-infinity'::timestamptz)
           > COALESCE((new_stage.value->>'doneAt')::timestamptz, '-infinity'::timestamptz)
      THEN jsonb_set(
        jsonb_set(new_stage.value, '{done}', COALESCE(old_stage.value->'done', 'false'::jsonb), true),
        '{doneAt}', COALESCE(old_stage.value->'doneAt', 'null'::jsonb), true
      )
      ELSE new_stage.value
    END
    ORDER BY new_stage.ordinality
  ), '[]'::jsonb)
  INTO merged_stages
  FROM jsonb_array_elements(incoming_stages) WITH ORDINALITY AS new_stage(value, ordinality)
  LEFT JOIN LATERAL (
    SELECT value
    FROM jsonb_array_elements(COALESCE(current_row.stages, '[]'::jsonb)) AS old_item(value)
    WHERE old_item.value->>'id' = new_stage.value->>'id'
    LIMIT 1
  ) AS old_stage ON true;

  SELECT count(*), count(*) FILTER (WHERE COALESCE((value->>'done')::boolean, false))
  INTO stage_count, done_count
  FROM jsonb_array_elements(merged_stages) AS stage(value);

  next_status := COALESCE(_patch->>'status', current_row.status);
  IF stage_count > 0 THEN
    IF done_count = stage_count THEN
      next_status := 'COMPLETED';
    ELSIF done_count > 0 OR current_row.status = 'COMPLETED' THEN
      next_status := 'IN_PROGRESS';
    END IF;
  END IF;

  next_completed_at := CASE
    WHEN next_status = 'COMPLETED' THEN COALESCE(current_row.completed_at, now())
    ELSE NULL
  END;

  UPDATE public.projects
  SET title = COALESCE(_patch->>'title', title),
      description = COALESCE(_patch->>'description', description),
      status = next_status,
      priority = COALESCE(_patch->>'priority', priority),
      category_id = CASE WHEN _patch ? 'categoryId' THEN NULLIF(_patch->>'categoryId', '') ELSE category_id END,
      tag_ids = CASE WHEN _patch ? 'tagIds' THEN ARRAY(SELECT jsonb_array_elements_text(_patch->'tagIds')) ELSE tag_ids END,
      due_date = CASE WHEN _patch ? 'dueDate' THEN NULLIF(_patch->>'dueDate', '')::timestamptz ELSE due_date END,
      members = CASE WHEN _patch ? 'members' THEN _patch->'members' ELSE members END,
      stages = merged_stages,
      completed_at = next_completed_at,
      updated_at = now()
  WHERE id = _project_id
  RETURNING * INTO result_row;

  RETURN result_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_assigned_stage_atomic(_project_id text, _stage_id text)
RETURNS public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_row public.projects%ROWTYPE;
  membership public.project_members%ROWTYPE;
  member_ids text[];
  target_stage jsonb;
  next_stages jsonb;
  stage_count integer;
  done_count integer;
  next_status text;
  result_row public.projects%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO membership
  FROM public.project_members
  WHERE project_id = _project_id
    AND member_user_id = auth.uid()
    AND status = 'ACCEPTED'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Accepted project membership required';
  END IF;

  SELECT * INTO current_row
  FROM public.projects
  WHERE id = _project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  SELECT ARRAY_AGG(value->>'id')
  INTO member_ids
  FROM jsonb_array_elements(COALESCE(current_row.members, '[]'::jsonb)) AS item(value)
  WHERE value->>'userId' = auth.uid()::text;

  SELECT value INTO target_stage
  FROM jsonb_array_elements(COALESCE(current_row.stages, '[]'::jsonb)) AS item(value)
  WHERE value->>'id' = _stage_id
  LIMIT 1;

  IF target_stage IS NULL OR NOT (COALESCE(target_stage->>'assigneeId', '') = ANY(COALESCE(member_ids, ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'Stage is not assigned to this user';
  END IF;

  SELECT jsonb_agg(
    CASE WHEN value->>'id' = _stage_id
      THEN jsonb_set(
        jsonb_set(value, '{done}', to_jsonb(NOT COALESCE((value->>'done')::boolean, false)), true),
        '{doneAt}', to_jsonb(now()::text), true
      )
      ELSE value
    END
    ORDER BY ordinality
  )
  INTO next_stages
  FROM jsonb_array_elements(current_row.stages) WITH ORDINALITY AS item(value, ordinality);

  SELECT count(*), count(*) FILTER (WHERE COALESCE((value->>'done')::boolean, false))
  INTO stage_count, done_count
  FROM jsonb_array_elements(next_stages) AS stage(value);

  next_status := CASE
    WHEN stage_count > 0 AND done_count = stage_count THEN 'COMPLETED'
    WHEN done_count > 0 OR current_row.status = 'COMPLETED' THEN 'IN_PROGRESS'
    ELSE current_row.status
  END;

  UPDATE public.projects
  SET stages = next_stages,
      status = next_status,
      completed_at = CASE WHEN next_status = 'COMPLETED' THEN COALESCE(completed_at, now()) ELSE NULL END,
      updated_at = now()
  WHERE id = _project_id
  RETURNING * INTO result_row;

  RETURN result_row;
END;
$$;

REVOKE ALL ON FUNCTION public.save_owned_project_atomic(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.toggle_assigned_stage_atomic(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_owned_project_atomic(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.toggle_assigned_stage_atomic(text, text) TO authenticated, service_role;