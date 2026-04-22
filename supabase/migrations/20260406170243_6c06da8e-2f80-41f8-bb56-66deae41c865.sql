
-- Fix: agents can only UPDATE contacts linked to their campaigns
DROP POLICY IF EXISTS "Update contacts" ON public.contacts;
CREATE POLICY "Update contacts" ON public.contacts FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR (has_role(auth.uid(), 'agent'::app_role) AND EXISTS (
    SELECT 1 FROM campaign_contacts cc
    JOIN campaign_agents ca ON ca.campaign_id = cc.campaign_id
    WHERE cc.contact_id = contacts.id AND ca.user_id = auth.uid()
  ))
);

-- Fix: agents can only INSERT contacts if they're assigned to at least one campaign
DROP POLICY IF EXISTS "Insert contacts" ON public.contacts;
CREATE POLICY "Insert contacts" ON public.contacts FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR (has_role(auth.uid(), 'agent'::app_role) AND EXISTS (
    SELECT 1 FROM campaign_agents WHERE user_id = auth.uid()
  ))
);
