
-- Fix 1: Restrict profiles SELECT to own profile + admins/managers
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
CREATE POLICY "Profile visibility" ON profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

-- Fix 2: Add auth.uid() guards to SECURITY DEFINER helper functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN auth.uid() = _user_id
      OR EXISTS(SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    THEN EXISTS(SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = _role)
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_client_account_ids(_user_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN auth.uid() = _user_id
      OR EXISTS(SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    THEN client_account_id
    ELSE NULL
  END
  FROM client_users
  WHERE user_id = _user_id
    AND (auth.uid() = _user_id OR EXISTS(SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));
$$;

CREATE OR REPLACE FUNCTION public.is_agent_on_campaign(_user_id uuid, _campaign_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN auth.uid() = _user_id
      OR EXISTS(SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    THEN EXISTS(SELECT 1 FROM campaign_agents WHERE user_id = _user_id AND campaign_id = _campaign_id)
    ELSE false
  END;
$$;
