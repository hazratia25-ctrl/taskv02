-- unique, case-insensitive usernames
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_key
  ON public.profiles (lower(username)) WHERE username IS NOT NULL AND username <> '';

-- richer user search for invitations
DROP FUNCTION IF EXISTS public.search_app_users(text);
CREATE OR REPLACE FUNCTION public.search_app_users(_q text)
RETURNS TABLE(id uuid, name text, username text, user_code text, avatar text, role text, phone text, extension text, email text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.name, p.username, p.user_code, p.avatar, p.role, p.phone, p.extension, p.email
  FROM public.profiles p
  WHERE _q IS NOT NULL
    AND length(btrim(_q)) >= 3
    AND p.id <> auth.uid()
    AND (
      upper(btrim(_q)) = upper(p.user_code)
      OR lower(btrim(_q)) = lower(p.username)
      OR lower(btrim(_q)) = lower(p.email)
    )
  LIMIT 5;
$$;

-- is a username free?
CREATE OR REPLACE FUNCTION public.username_available(_username text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT length(btrim(coalesce(_username, ''))) >= 3
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE lower(p.username) = lower(btrim(_username))
         AND p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
     );
$$;

-- resolve the login email for a username (needed to sign in with a username)
CREATE OR REPLACE FUNCTION public.email_for_username(_username text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.email
  FROM public.profiles p
  WHERE lower(p.username) = lower(btrim(coalesce(_username, '')))
    AND coalesce(p.email, '') <> ''
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.username_available(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_for_username(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_app_users(text) TO authenticated;

-- carry a chosen username through sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, avatar, user_code, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.email, ''),
    NEW.raw_user_meta_data->>'avatar_url',
    public.gen_user_code(),
    NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'username', '')), '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;