
-- 1. Tighten call_logs INSERT to require campaign assignment
DROP POLICY "Agents can create call_logs" ON public.call_logs;
CREATE POLICY "Agents can create call_logs" ON public.call_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = agent_id
    AND (campaign_id IS NULL OR is_agent_on_campaign(auth.uid(), campaign_id))
  );

-- 2. Tighten appointments INSERT to require campaign assignment
DROP POLICY "Agents can insert appointments" ON public.appointments;
CREATE POLICY "Agents can insert appointments" ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = agent_id
    AND (campaign_id IS NULL OR is_agent_on_campaign(auth.uid(), campaign_id))
  );

-- 3. Tighten callbacks INSERT to require campaign assignment (defense-in-depth)
DROP POLICY "Agents can insert callbacks" ON public.callbacks;
CREATE POLICY "Agents can insert callbacks" ON public.callbacks
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = agent_id
    AND (campaign_id IS NULL OR is_agent_on_campaign(auth.uid(), campaign_id))
  );
