REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gen_user_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_project_member(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_project_member(text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.search_app_users(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_app_users(text) TO authenticated;