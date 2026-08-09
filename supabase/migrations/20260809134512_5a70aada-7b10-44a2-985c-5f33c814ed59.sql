-- 1) profiles: user_code + username
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_code text,
  ADD COLUMN IF NOT EXISTS username text;

CREATE OR REPLACE FUNCTION public.gen_user_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  candidate text;
  i int;
BEGIN
  LOOP
    candidate := 'TM-';
    FOR i IN 1..5 LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_code = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;

UPDATE public.profiles SET user_code = public.gen_user_code() WHERE user_code IS NULL;

ALTER TABLE public.profiles ALTER COLUMN user_code SET DEFAULT NULL;
ALTER TABLE public.profiles ALTER COLUMN user_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_code_key ON public.profiles (user_code);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key ON public.profiles (lower(username)) WHERE username IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, avatar, user_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.email, ''),
    NEW.raw_user_meta_data->>'avatar_url',
    public.gen_user_code()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 2) project_members
CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage_ids text[] NOT NULL DEFAULT '{}'::text[],
  role text NOT NULL DEFAULT '',
  access text NOT NULL DEFAULT 'VIEW',
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, member_user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT ALL ON public.project_members TO service_role;

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner manages project members"
ON public.project_members FOR ALL TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "member reads own membership"
ON public.project_members FOR SELECT TO authenticated
USING (auth.uid() = member_user_id);

CREATE POLICY "member responds to own invite"
ON public.project_members FOR UPDATE TO authenticated
USING (auth.uid() = member_user_id)
WITH CHECK (auth.uid() = member_user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_project_members_updated_at ON public.project_members;
CREATE TRIGGER update_project_members_updated_at
BEFORE UPDATE ON public.project_members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) membership helper + project read access for accepted members
CREATE OR REPLACE FUNCTION public.is_project_member(_project_id text, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = _project_id
      AND member_user_id = _user_id
      AND status = 'ACCEPTED'
  );
$$;

CREATE POLICY "accepted members read shared projects"
ON public.projects FOR SELECT TO authenticated
USING (public.is_project_member(id, auth.uid()));

-- 4) safe user lookup
CREATE OR REPLACE FUNCTION public.search_app_users(_q text)
RETURNS TABLE (id uuid, name text, username text, user_code text, avatar text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.username, p.user_code, p.avatar
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

REVOKE ALL ON FUNCTION public.search_app_users(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_app_users(text) TO authenticated;