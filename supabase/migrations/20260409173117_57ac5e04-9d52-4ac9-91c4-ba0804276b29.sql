
-- Fix the trigger: allow agents to update dialer-operational fields
-- Previously agents were blocked from updating attempts, which caused leads to repeat forever
CREATE OR REPLACE FUNCTION public.restrict_campaign_contacts_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Admins and managers can update anything
  IF EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager')) THEN
    RETURN NEW;
  END IF;

  -- Agents: lock down admin-only fields, but ALLOW dialer-operational fields
  -- (dial_status, attempts, last_called_at, next_eligible_at, callback_at are needed for dialing)
  NEW.priority_score := OLD.priority_score;
  NEW.priority_band := OLD.priority_band;
  NEW.score_reason := OLD.score_reason;
  NEW.assigned_agent_id := OLD.assigned_agent_id;
  NEW.campaign_id := OLD.campaign_id;
  NEW.contact_id := OLD.contact_id;
  NEW.id := OLD.id;
  NEW.created_at := OLD.created_at;

  RETURN NEW;
END;
$function$;

-- Function to release stale dialing locks (leads stuck in "dialing" for > 10 minutes)
CREATE OR REPLACE FUNCTION public.release_stale_dialing_locks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  released integer;
BEGIN
  UPDATE campaign_contacts
  SET dial_status = 'pending'
  WHERE dial_status = 'dialing'
    AND last_called_at < now() - interval '10 minutes';
  GET DIAGNOSTICS released = ROW_COUNT;
  RETURN released;
END;
$$;
