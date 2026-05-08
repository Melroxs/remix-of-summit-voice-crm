-- 1) Restrict daily_reports SELECT to managers/admins/team_leaders within the same company
DROP POLICY IF EXISTS "View daily_reports" ON public.daily_reports;

CREATE POLICY "View daily_reports"
ON public.daily_reports
FOR SELECT
TO authenticated
USING (
  is_same_company(company_id)
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'team_leader'::app_role)
  )
);

-- 2) Realtime channel authorization
-- Helper: who can subscribe to a given Realtime topic
CREATE OR REPLACE FUNCTION public.can_subscribe_realtime_topic(_topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RETURN false;
  END IF;

  -- Admins and managers can subscribe to any internal topic
  IF has_role(v_user, 'admin'::app_role) OR has_role(v_user, 'manager'::app_role) THEN
    RETURN true;
  END IF;

  -- technician_appointments:<id> -> only the assigned technician
  IF _topic LIKE 'technician_appointments:%' THEN
    BEGIN
      v_id := substring(_topic from 'technician_appointments:(.*)$')::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    RETURN EXISTS (
      SELECT 1 FROM public.technician_appointments ta
      JOIN public.technicians t ON t.id = ta.technician_id
      WHERE ta.id = v_id AND t.user_id = v_user
    );
  END IF;

  -- technician:<technician_id> topic -> only the technician themselves
  IF _topic LIKE 'technician:%' THEN
    BEGIN
      v_id := substring(_topic from 'technician:(.*)$')::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    RETURN EXISTS (
      SELECT 1 FROM public.technicians t
      WHERE t.id = v_id AND t.user_id = v_user
    );
  END IF;

  -- user:<uid> topic -> only that user
  IF _topic LIKE 'user:%' THEN
    BEGIN
      v_id := substring(_topic from 'user:(.*)$')::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    RETURN v_id = v_user;
  END IF;

  -- Default deny for everything else
  RETURN false;
END;
$$;

-- Lock down realtime.messages so subscriptions require an authorized topic
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users subscribe to allowed topics" ON realtime.messages;

CREATE POLICY "Authenticated users subscribe to allowed topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (public.can_subscribe_realtime_topic(realtime.topic()));