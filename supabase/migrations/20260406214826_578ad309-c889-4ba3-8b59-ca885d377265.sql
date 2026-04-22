
CREATE OR REPLACE FUNCTION public.restrict_campaign_contacts_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Admins and managers can update anything
  IF EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager')) THEN
    RETURN NEW;
  END IF;

  -- Agents: lock down sensitive fields to OLD values
  NEW.priority_score := OLD.priority_score;
  NEW.priority_band := OLD.priority_band;
  NEW.score_reason := OLD.score_reason;
  NEW.assigned_agent_id := OLD.assigned_agent_id;
  NEW.attempts := OLD.attempts;
  NEW.campaign_id := OLD.campaign_id;
  NEW.contact_id := OLD.contact_id;
  NEW.id := OLD.id;
  NEW.created_at := OLD.created_at;

  RETURN NEW;
END;
$$;

CREATE TRIGGER restrict_campaign_contacts_update
  BEFORE UPDATE ON public.campaign_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.restrict_campaign_contacts_update();
