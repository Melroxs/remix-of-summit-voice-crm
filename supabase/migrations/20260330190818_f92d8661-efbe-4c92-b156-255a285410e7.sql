
-- Tighten contacts: admins see all, agents see contacts in their campaigns
DROP POLICY IF EXISTS "Authenticated can view contacts" ON public.contacts;
CREATE POLICY "View contacts" ON public.contacts FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin') 
  OR has_role(auth.uid(), 'manager')
  OR EXISTS (
    SELECT 1 FROM campaign_contacts cc
    JOIN campaign_agents ca ON ca.campaign_id = cc.campaign_id
    WHERE cc.contact_id = contacts.id AND ca.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Authenticated can insert contacts" ON public.contacts;
CREATE POLICY "Insert contacts" ON public.contacts FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Authenticated can update contacts" ON public.contacts;
CREATE POLICY "Update contacts" ON public.contacts FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'manager')
  OR EXISTS (
    SELECT 1 FROM campaign_contacts cc
    JOIN campaign_agents ca ON ca.campaign_id = cc.campaign_id
    WHERE cc.contact_id = contacts.id AND ca.user_id = auth.uid()
  )
);

-- Tighten campaigns: admins/managers full, agents only assigned campaigns, clients only their account campaigns
DROP POLICY IF EXISTS "Authenticated can view campaigns" ON public.campaigns;
CREATE POLICY "View campaigns" ON public.campaigns FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'manager')
  OR is_agent_on_campaign(auth.uid(), id)
  OR (has_role(auth.uid(), 'client') AND client_account_id IN (SELECT get_user_client_account_ids(auth.uid())))
);

DROP POLICY IF EXISTS "Authenticated can insert campaigns" ON public.campaigns;
CREATE POLICY "Insert campaigns" ON public.campaigns FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Authenticated can update campaigns" ON public.campaigns;
CREATE POLICY "Update campaigns" ON public.campaigns FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

-- Tighten campaign_contacts: admins full, agents only their campaigns
DROP POLICY IF EXISTS "Authenticated can view campaign_contacts" ON public.campaign_contacts;
CREATE POLICY "View campaign_contacts" ON public.campaign_contacts FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'manager')
  OR is_agent_on_campaign(auth.uid(), campaign_id)
);

DROP POLICY IF EXISTS "Authenticated can insert campaign_contacts" ON public.campaign_contacts;
CREATE POLICY "Insert campaign_contacts" ON public.campaign_contacts FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Authenticated can update campaign_contacts" ON public.campaign_contacts;
CREATE POLICY "Update campaign_contacts" ON public.campaign_contacts FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'manager')
  OR is_agent_on_campaign(auth.uid(), campaign_id)
);

-- Tighten call_logs: admins see all, agents see only own
DROP POLICY IF EXISTS "Authenticated can view call_logs" ON public.call_logs;
CREATE POLICY "View call_logs" ON public.call_logs FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'manager')
  OR agent_id = auth.uid()
  OR (has_role(auth.uid(), 'client') AND campaign_id IN (
    SELECT c.id FROM campaigns c WHERE c.client_account_id IN (SELECT get_user_client_account_ids(auth.uid()))
  ))
);

-- Allow agents to update their own call_logs (for disposition saving)
CREATE POLICY "Agents can update own call_logs" ON public.call_logs FOR UPDATE TO authenticated
USING (agent_id = auth.uid() OR has_role(auth.uid(), 'admin'));

-- Tighten recordings: admins see all, agents see own call recordings
DROP POLICY IF EXISTS "Authenticated can view recordings" ON public.recordings;
CREATE POLICY "View recordings" ON public.recordings FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'manager')
  OR EXISTS (
    SELECT 1 FROM call_logs cl WHERE cl.id = recordings.call_log_id AND cl.agent_id = auth.uid()
  )
);

-- Tighten callbacks: agents see only own
DROP POLICY IF EXISTS "Authenticated can view callbacks" ON public.callbacks;
CREATE POLICY "View callbacks" ON public.callbacks FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'manager')
  OR agent_id = auth.uid()
);

-- Tighten appointments: agents see only own
DROP POLICY IF EXISTS "Authenticated can view appointments" ON public.appointments;
CREATE POLICY "View appointments" ON public.appointments FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'manager')
  OR agent_id = auth.uid()
  OR (has_role(auth.uid(), 'client') AND campaign_id IN (
    SELECT c.id FROM campaigns c WHERE c.client_account_id IN (SELECT get_user_client_account_ids(auth.uid()))
  ))
);
