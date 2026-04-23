-- Recreate the trigger that auto-creates profile + agent role on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill any auth users missing a profile
DO $$
DECLARE
  u RECORD;
  default_company uuid;
BEGIN
  SELECT id INTO default_company FROM public.companies ORDER BY created_at LIMIT 1;
  FOR u IN
    SELECT au.id, au.email, au.raw_user_meta_data
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.user_id = au.id
    WHERE p.user_id IS NULL
  LOOP
    INSERT INTO public.profiles (user_id, email, display_name, company_id)
    VALUES (
      u.id,
      u.email,
      COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1)),
      default_company
    );
    INSERT INTO public.user_roles (user_id, role)
    VALUES (u.id, 'agent')
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;