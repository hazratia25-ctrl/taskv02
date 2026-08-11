CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  wanted text := nullif(lower(btrim(NEW.raw_user_meta_data->>'username')), '');
BEGIN
  IF wanted IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles WHERE lower(username) = wanted
  ) THEN
    wanted := NULL;
  END IF;

  INSERT INTO public.profiles (id, name, email, avatar, user_code, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.email, ''),
    NEW.raw_user_meta_data->>'avatar_url',
    public.gen_user_code(),
    wanted
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;