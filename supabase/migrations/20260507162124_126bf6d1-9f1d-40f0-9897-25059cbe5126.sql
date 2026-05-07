
-- Number pool for atomic local-presence caller ID reservation
CREATE TABLE IF NOT EXISTS public.number_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  phone_number TEXT UNIQUE NOT NULL,
  area_code TEXT NOT NULL,
  state_code TEXT,
  region TEXT,
  is_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','cooling_down','flagged','retired')),
  call_count_today INTEGER NOT NULL DEFAULT 0,
  call_count_total BIGINT NOT NULL DEFAULT 0,
  daily_limit INTEGER NOT NULL DEFAULT 50,
  last_used_at TIMESTAMPTZ,
  cooldown_until TIMESTAMPTZ,
  spam_score INTEGER NOT NULL DEFAULT 0,
  telnyx_number_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_np_area_health
  ON public.number_pool (area_code, call_count_today, last_used_at NULLS FIRST)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_np_state_health
  ON public.number_pool (state_code, call_count_today, last_used_at NULLS FIRST)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_np_fallback_health
  ON public.number_pool (call_count_today, spam_score, last_used_at NULLS FIRST)
  WHERE status = 'active' AND is_fallback = TRUE;
CREATE INDEX IF NOT EXISTS idx_np_cooldown
  ON public.number_pool (cooldown_until)
  WHERE status = 'cooling_down';

ALTER TABLE public.number_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage number_pool"
  ON public.number_pool FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Same-company view number_pool"
  ON public.number_pool FOR SELECT TO authenticated
  USING (company_id IS NULL OR public.is_same_company(company_id));

CREATE TRIGGER trg_number_pool_updated
  BEFORE UPDATE ON public.number_pool
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Area code -> state lookup
CREATE TABLE IF NOT EXISTS public.area_code_map (
  area_code TEXT PRIMARY KEY,
  state_code TEXT NOT NULL,
  region TEXT
);

ALTER TABLE public.area_code_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read area_code_map"
  ON public.area_code_map FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage area_code_map"
  ON public.area_code_map FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Seed common NANPA area codes (subset; extend as needed)
INSERT INTO public.area_code_map (area_code, state_code, region) VALUES
 ('205','AL','South'),('251','AL','South'),('256','AL','South'),('334','AL','South'),
 ('907','AK','West'),
 ('480','AZ','West'),('520','AZ','West'),('602','AZ','West'),('623','AZ','West'),('928','AZ','West'),
 ('479','AR','South'),('501','AR','South'),('870','AR','South'),
 ('209','CA','West'),('213','CA','West'),('310','CA','West'),('323','CA','West'),('408','CA','West'),
 ('415','CA','West'),('424','CA','West'),('510','CA','West'),('559','CA','West'),('562','CA','West'),
 ('619','CA','West'),('626','CA','West'),('650','CA','West'),('661','CA','West'),('707','CA','West'),
 ('714','CA','West'),('760','CA','West'),('805','CA','West'),('818','CA','West'),('858','CA','West'),
 ('909','CA','West'),('916','CA','West'),('925','CA','West'),('949','CA','West'),('951','CA','West'),
 ('303','CO','West'),('719','CO','West'),('720','CO','West'),('970','CO','West'),
 ('203','CT','Northeast'),('860','CT','Northeast'),
 ('302','DE','Northeast'),
 ('239','FL','South'),('305','FL','South'),('321','FL','South'),('352','FL','South'),('386','FL','South'),
 ('407','FL','South'),('561','FL','South'),('727','FL','South'),('754','FL','South'),('772','FL','South'),
 ('786','FL','South'),('813','FL','South'),('850','FL','South'),('863','FL','South'),('904','FL','South'),
 ('941','FL','South'),('954','FL','South'),
 ('229','GA','South'),('404','GA','South'),('470','GA','South'),('478','GA','South'),('678','GA','South'),
 ('706','GA','South'),('770','GA','South'),('912','GA','South'),
 ('808','HI','West'),
 ('208','ID','West'),
 ('217','IL','Midwest'),('224','IL','Midwest'),('309','IL','Midwest'),('312','IL','Midwest'),('618','IL','Midwest'),
 ('630','IL','Midwest'),('708','IL','Midwest'),('773','IL','Midwest'),('815','IL','Midwest'),('847','IL','Midwest'),
 ('219','IN','Midwest'),('260','IN','Midwest'),('317','IN','Midwest'),('574','IN','Midwest'),('765','IN','Midwest'),('812','IN','Midwest'),
 ('319','IA','Midwest'),('515','IA','Midwest'),('563','IA','Midwest'),('641','IA','Midwest'),('712','IA','Midwest'),
 ('316','KS','Midwest'),('620','KS','Midwest'),('785','KS','Midwest'),('913','KS','Midwest'),
 ('270','KY','South'),('502','KY','South'),('606','KY','South'),('859','KY','South'),
 ('225','LA','South'),('318','LA','South'),('337','LA','South'),('504','LA','South'),('985','LA','South'),
 ('207','ME','Northeast'),
 ('240','MD','South'),('301','MD','South'),('410','MD','South'),('443','MD','South'),
 ('339','MA','Northeast'),('351','MA','Northeast'),('413','MA','Northeast'),('508','MA','Northeast'),('617','MA','Northeast'),('774','MA','Northeast'),('781','MA','Northeast'),('857','MA','Northeast'),('978','MA','Northeast'),
 ('231','MI','Midwest'),('248','MI','Midwest'),('269','MI','Midwest'),('313','MI','Midwest'),('517','MI','Midwest'),('586','MI','Midwest'),('616','MI','Midwest'),('734','MI','Midwest'),('810','MI','Midwest'),('906','MI','Midwest'),('947','MI','Midwest'),('989','MI','Midwest'),
 ('218','MN','Midwest'),('320','MN','Midwest'),('507','MN','Midwest'),('612','MN','Midwest'),('651','MN','Midwest'),('763','MN','Midwest'),('952','MN','Midwest'),
 ('228','MS','South'),('601','MS','South'),('662','MS','South'),('769','MS','South'),
 ('314','MO','Midwest'),('417','MO','Midwest'),('573','MO','Midwest'),('636','MO','Midwest'),('660','MO','Midwest'),('816','MO','Midwest'),
 ('406','MT','West'),
 ('308','NE','Midwest'),('402','NE','Midwest'),('531','NE','Midwest'),
 ('702','NV','West'),('725','NV','West'),('775','NV','West'),
 ('603','NH','Northeast'),
 ('201','NJ','Northeast'),('551','NJ','Northeast'),('609','NJ','Northeast'),('732','NJ','Northeast'),('848','NJ','Northeast'),('856','NJ','Northeast'),('862','NJ','Northeast'),('908','NJ','Northeast'),('973','NJ','Northeast'),
 ('505','NM','West'),('575','NM','West'),
 ('212','NY','Northeast'),('315','NY','Northeast'),('347','NY','Northeast'),('516','NY','Northeast'),('518','NY','Northeast'),('585','NY','Northeast'),('607','NY','Northeast'),('631','NY','Northeast'),('646','NY','Northeast'),('716','NY','Northeast'),('718','NY','Northeast'),('845','NY','Northeast'),('914','NY','Northeast'),('917','NY','Northeast'),('929','NY','Northeast'),
 ('252','NC','South'),('336','NC','South'),('704','NC','South'),('828','NC','South'),('910','NC','South'),('919','NC','South'),('980','NC','South'),('984','NC','South'),
 ('701','ND','Midwest'),
 ('216','OH','Midwest'),('234','OH','Midwest'),('330','OH','Midwest'),('419','OH','Midwest'),('440','OH','Midwest'),('513','OH','Midwest'),('567','OH','Midwest'),('614','OH','Midwest'),('740','OH','Midwest'),('937','OH','Midwest'),
 ('405','OK','South'),('539','OK','South'),('580','OK','South'),('918','OK','South'),
 ('458','OR','West'),('503','OR','West'),('541','OR','West'),('971','OR','West'),
 ('215','PA','Northeast'),('267','PA','Northeast'),('412','PA','Northeast'),('484','PA','Northeast'),('570','PA','Northeast'),('610','PA','Northeast'),('717','PA','Northeast'),('724','PA','Northeast'),('814','PA','Northeast'),('878','PA','Northeast'),
 ('401','RI','Northeast'),
 ('803','SC','South'),('843','SC','South'),('864','SC','South'),
 ('605','SD','Midwest'),
 ('423','TN','South'),('615','TN','South'),('629','TN','South'),('731','TN','South'),('865','TN','South'),('901','TN','South'),('931','TN','South'),
 ('210','TX','South'),('214','TX','South'),('254','TX','South'),('281','TX','South'),('325','TX','South'),('346','TX','South'),('361','TX','South'),('409','TX','South'),('430','TX','South'),('432','TX','South'),('469','TX','South'),('512','TX','South'),('682','TX','South'),('713','TX','South'),('737','TX','South'),('806','TX','South'),('817','TX','South'),('830','TX','South'),('832','TX','South'),('903','TX','South'),('915','TX','South'),('936','TX','South'),('940','TX','South'),('956','TX','South'),('972','TX','South'),('979','TX','South'),
 ('385','UT','West'),('435','UT','West'),('801','UT','West'),
 ('802','VT','Northeast'),
 ('276','VA','South'),('434','VA','South'),('540','VA','South'),('571','VA','South'),('703','VA','South'),('757','VA','South'),('804','VA','South'),
 ('206','WA','West'),('253','WA','West'),('360','WA','West'),('425','WA','West'),('509','WA','West'),
 ('202','DC','South'),
 ('304','WV','South'),('681','WV','South'),
 ('262','WI','Midwest'),('414','WI','Midwest'),('608','WI','Midwest'),('715','WI','Midwest'),('920','WI','Midwest'),
 ('307','WY','West')
ON CONFLICT (area_code) DO NOTHING;

-- Atomic reserve RPC
CREATE OR REPLACE FUNCTION public.fn_get_and_reserve_caller_id(lead_phone TEXT)
RETURNS TABLE (phone_number TEXT, match_type TEXT, number_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_area_code TEXT;
  v_state_code TEXT;
  v_selected_id UUID;
  v_match_type TEXT;
  v_phone TEXT;
BEGIN
  v_area_code := SUBSTRING(REGEXP_REPLACE(lead_phone, '[^0-9]', '', 'g') FROM 2 FOR 3);
  IF LENGTH(v_area_code) <> 3 THEN
    RAISE EXCEPTION 'INVALID_LEAD_PHONE' USING ERRCODE = 'P0001';
  END IF;

  SELECT state_code INTO v_state_code FROM public.area_code_map WHERE area_code = v_area_code;

  -- Priority 1: exact area code
  SELECT id INTO v_selected_id
    FROM public.number_pool
    WHERE status = 'active'
      AND area_code = v_area_code
      AND call_count_today < daily_limit
      AND (cooldown_until IS NULL OR cooldown_until < NOW())
    ORDER BY call_count_today ASC, last_used_at ASC NULLS FIRST
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
  IF v_selected_id IS NOT NULL THEN v_match_type := 'local_exact'; END IF;

  -- Priority 2: same state
  IF v_selected_id IS NULL AND v_state_code IS NOT NULL THEN
    SELECT id INTO v_selected_id
      FROM public.number_pool
      WHERE status = 'active'
        AND state_code = v_state_code
        AND call_count_today < daily_limit
        AND (cooldown_until IS NULL OR cooldown_until < NOW())
      ORDER BY call_count_today ASC, spam_score ASC, last_used_at ASC NULLS FIRST
      LIMIT 1
      FOR UPDATE SKIP LOCKED;
    IF v_selected_id IS NOT NULL THEN v_match_type := 'state_match'; END IF;
  END IF;

  -- Priority 3: fallback
  IF v_selected_id IS NULL THEN
    SELECT id INTO v_selected_id
      FROM public.number_pool
      WHERE status = 'active'
        AND is_fallback = TRUE
        AND call_count_today < daily_limit
        AND (cooldown_until IS NULL OR cooldown_until < NOW())
      ORDER BY call_count_today ASC, spam_score ASC, last_used_at ASC NULLS FIRST
      LIMIT 1
      FOR UPDATE SKIP LOCKED;
    IF v_selected_id IS NOT NULL THEN v_match_type := 'fallback'; END IF;
  END IF;

  IF v_selected_id IS NULL THEN
    RAISE EXCEPTION 'POOL_EXHAUSTED' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.number_pool
    SET call_count_today = call_count_today + 1,
        call_count_total = call_count_total + 1,
        last_used_at = NOW(),
        updated_at = NOW(),
        status = CASE WHEN call_count_today + 1 >= daily_limit THEN 'cooling_down' ELSE status END,
        cooldown_until = CASE WHEN call_count_today + 1 >= daily_limit THEN NOW() + INTERVAL '24 hours' ELSE cooldown_until END
    WHERE id = v_selected_id
    RETURNING number_pool.phone_number INTO v_phone;

  RETURN QUERY SELECT v_phone, v_match_type, v_selected_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_get_and_reserve_caller_id(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_get_and_reserve_caller_id(TEXT) TO authenticated;

-- Compensating release (if dial fails)
CREATE OR REPLACE FUNCTION public.fn_release_caller_id(_number_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.number_pool
    SET call_count_today = GREATEST(0, call_count_today - 1),
        call_count_total = GREATEST(0, call_count_total - 1),
        updated_at = NOW()
    WHERE id = _number_id;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_release_caller_id(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_release_caller_id(UUID) TO authenticated;

-- Daily reset
CREATE OR REPLACE FUNCTION public.fn_reset_number_pool_daily()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.number_pool
    SET call_count_today = 0,
        status = CASE WHEN status = 'cooling_down' THEN 'active' ELSE status END,
        cooldown_until = NULL,
        updated_at = NOW()
    WHERE call_count_today > 0 OR status = 'cooling_down';
END;
$$;
REVOKE ALL ON FUNCTION public.fn_reset_number_pool_daily() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_reset_number_pool_daily() TO authenticated;
