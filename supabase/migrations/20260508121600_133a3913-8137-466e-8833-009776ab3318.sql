
CREATE OR REPLACE FUNCTION public.validate_call_attempt_link()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Require campaign linkage unless this is an explicit manual/ad-hoc dial
  IF NEW.campaign_id IS NULL AND COALESCE(NEW.call_source, 'queue') NOT IN ('manual', 'manual_dial', 'ad_hoc') THEN
    RAISE EXCEPTION 'call_attempts.campaign_id is required (call_source=%)', COALESCE(NEW.call_source, 'queue')
      USING ERRCODE = '23514';
  END IF;

  -- Require a Telnyx linkage so the row can be matched to webhook events
  IF NEW.telnyx_call_id IS NULL
     AND NEW.telnyx_call_control_id IS NULL
     AND NEW.telnyx_call_session_id IS NULL THEN
    RAISE EXCEPTION 'call_attempts must include telnyx_call_id, telnyx_call_control_id, or telnyx_call_session_id'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_call_attempt_link ON public.call_attempts;
CREATE TRIGGER trg_validate_call_attempt_link
BEFORE INSERT ON public.call_attempts
FOR EACH ROW EXECUTE FUNCTION public.validate_call_attempt_link();
