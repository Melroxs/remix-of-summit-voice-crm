
-- Trigger to restrict agent feedback updates to only the acknowledged column
CREATE OR REPLACE FUNCTION public.restrict_agent_feedback_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins and team leaders can update anything
  IF EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'team_leader')) THEN
    RETURN NEW;
  END IF;

  -- Agents can only change the acknowledged field
  IF auth.uid() = OLD.agent_id THEN
    NEW.message := OLD.message;
    NEW.feedback_type := OLD.feedback_type;
    NEW.feedback_by := OLD.feedback_by;
    NEW.call_log_id := OLD.call_log_id;
    NEW.campaign_id := OLD.campaign_id;
    NEW.agent_id := OLD.agent_id;
    NEW.created_at := OLD.created_at;
    NEW.id := OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_restrict_agent_feedback_update
BEFORE UPDATE ON public.agent_feedback
FOR EACH ROW
EXECUTE FUNCTION public.restrict_agent_feedback_update();
