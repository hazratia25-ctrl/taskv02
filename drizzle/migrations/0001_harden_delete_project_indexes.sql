-- Idempotent re-assertion of the atomic owned-project delete + required lookup indexes.
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

REVOKE ALL ON FUNCTION public.delete_owned_project_atomic(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_owned_project_atomic(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_owned_project_atomic(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_owned_project_atomic(text) TO service_role;

CREATE INDEX IF NOT EXISTS project_members_project_id_idx ON public.project_members (project_id);
CREATE INDEX IF NOT EXISTS projects_user_id_idx ON public.projects (user_id);
