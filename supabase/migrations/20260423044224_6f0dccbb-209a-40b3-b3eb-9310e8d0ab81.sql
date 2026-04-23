
-- 1. Rename client_accounts -> companies (keep alias view for back-compat)
ALTER TABLE public.client_accounts RENAME TO companies;

CREATE OR REPLACE VIEW public.client_accounts
WITH (security_invoker=on) AS
SELECT id, name, created_at FROM public.companies;

-- 2. Default company for backfill
INSERT INTO public.companies (name)
SELECT 'Summit Leads'
WHERE NOT EXISTS (SELECT 1 FROM public.companies);

-- 3. Add company_id to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

UPDATE public.profiles SET company_id = (SELECT id FROM public.companies ORDER BY created_at LIMIT 1)
WHERE company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON public.profiles(company_id);

-- 4. Add company_id to campaigns (mirrors client_account_id where present)
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

UPDATE public.campaigns
  SET company_id = COALESCE(client_account_id, (SELECT id FROM public.companies ORDER BY created_at LIMIT 1))
WHERE company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_company_id ON public.campaigns(company_id);

-- Trigger: keep company_id in sync with client_account_id, and require company_id
CREATE OR REPLACE FUNCTION public.sync_campaign_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.client_account_id IS NOT NULL THEN
    NEW.company_id := NEW.client_account_id;
  END IF;
  IF NEW.company_id IS NULL THEN
    NEW.company_id := (SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_campaign_company ON public.campaigns;
CREATE TRIGGER trg_sync_campaign_company
BEFORE INSERT OR UPDATE ON public.campaigns
FOR EACH ROW EXECUTE FUNCTION public.sync_campaign_company_id();

-- 5. Helper: current user's company
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- 6. Helper: company match (admins always pass)
CREATE OR REPLACE FUNCTION public.is_same_company(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin'::app_role)
    OR _company_id = public.current_company_id();
$$;

-- 7. Auto-assign new users to default company on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_company uuid;
BEGIN
  SELECT id INTO default_company FROM public.companies ORDER BY created_at LIMIT 1;
  INSERT INTO public.profiles (user_id, email, display_name, company_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    default_company
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'agent');
  RETURN NEW;
END;
$$;

-- 8. Update RLS: campaigns
DROP POLICY IF EXISTS "View campaigns" ON public.campaigns;
CREATE POLICY "View campaigns" ON public.campaigns FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    is_same_company(company_id)
    AND (
      has_role(auth.uid(), 'manager'::app_role)
      OR has_role(auth.uid(), 'team_leader'::app_role)
      OR is_agent_on_campaign(auth.uid(), id)
      OR (has_role(auth.uid(), 'client'::app_role) AND client_account_id IN (SELECT get_user_client_account_ids(auth.uid())))
    )
  )
);

DROP POLICY IF EXISTS "Insert campaigns" ON public.campaigns;
CREATE POLICY "Insert campaigns" ON public.campaigns FOR INSERT
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  AND is_same_company(company_id)
);

DROP POLICY IF EXISTS "Update campaigns" ON public.campaigns;
CREATE POLICY "Update campaigns" ON public.campaigns FOR UPDATE
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  AND is_same_company(company_id)
);

-- 9. Helper: contact-in-company check via campaign_contacts
CREATE OR REPLACE FUNCTION public.contact_in_user_company(_contact_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT has_role(auth.uid(), 'admin'::app_role) OR EXISTS (
    SELECT 1 FROM public.campaign_contacts cc
    JOIN public.campaigns c ON c.id = cc.campaign_id
    WHERE cc.contact_id = _contact_id
      AND c.company_id = public.current_company_id()
  );
$$;

-- 10. RLS: contacts
DROP POLICY IF EXISTS "View contacts" ON public.contacts;
CREATE POLICY "View contacts" ON public.contacts FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    contact_in_user_company(id)
    AND (
      has_role(auth.uid(), 'manager'::app_role)
      OR EXISTS (
        SELECT 1 FROM campaign_contacts cc
        JOIN campaign_agents ca ON ca.campaign_id = cc.campaign_id
        WHERE cc.contact_id = contacts.id AND ca.user_id = auth.uid()
      )
      OR (has_role(auth.uid(), 'client'::app_role) AND EXISTS (
        SELECT 1 FROM campaign_contacts cc
        JOIN campaigns c ON c.id = cc.campaign_id
        WHERE cc.contact_id = contacts.id
          AND c.client_account_id IN (SELECT get_user_client_account_ids(auth.uid()))
      ))
    )
  )
);

-- 11. RLS: campaign_contacts
DROP POLICY IF EXISTS "View campaign_contacts" ON public.campaign_contacts;
CREATE POLICY "View campaign_contacts" ON public.campaign_contacts FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_contacts.campaign_id AND is_same_company(c.company_id))
    AND (
      has_role(auth.uid(), 'manager'::app_role)
      OR is_agent_on_campaign(auth.uid(), campaign_id)
    )
  )
);

DROP POLICY IF EXISTS "Insert campaign_contacts" ON public.campaign_contacts;
CREATE POLICY "Insert campaign_contacts" ON public.campaign_contacts FOR INSERT
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  AND EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_contacts.campaign_id AND is_same_company(c.company_id))
);

DROP POLICY IF EXISTS "Update campaign_contacts" ON public.campaign_contacts;
CREATE POLICY "Update campaign_contacts" ON public.campaign_contacts FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_contacts.campaign_id AND is_same_company(c.company_id))
    AND (has_role(auth.uid(), 'manager'::app_role) OR is_agent_on_campaign(auth.uid(), campaign_id))
  )
);

-- 12. RLS: call_logs
DROP POLICY IF EXISTS "View call_logs" ON public.call_logs;
CREATE POLICY "View call_logs" ON public.call_logs FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (campaign_id IS NULL OR EXISTS (SELECT 1 FROM campaigns c WHERE c.id = call_logs.campaign_id AND is_same_company(c.company_id)))
    AND (
      has_role(auth.uid(), 'manager'::app_role)
      OR agent_id = auth.uid()
      OR (has_role(auth.uid(), 'team_leader'::app_role) AND (campaign_id IS NULL OR is_agent_on_campaign(auth.uid(), campaign_id)))
      OR (has_role(auth.uid(), 'client'::app_role) AND campaign_id IN (
        SELECT c.id FROM campaigns c WHERE c.client_account_id IN (SELECT get_user_client_account_ids(auth.uid()))
      ))
    )
  )
);

-- 13. RLS: appointments
DROP POLICY IF EXISTS "View appointments" ON public.appointments;
CREATE POLICY "View appointments" ON public.appointments FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (campaign_id IS NULL OR EXISTS (SELECT 1 FROM campaigns c WHERE c.id = appointments.campaign_id AND is_same_company(c.company_id)))
    AND (
      has_role(auth.uid(), 'manager'::app_role)
      OR agent_id = auth.uid()
      OR (has_role(auth.uid(), 'client'::app_role) AND campaign_id IN (
        SELECT c.id FROM campaigns c WHERE c.client_account_id IN (SELECT get_user_client_account_ids(auth.uid()))
      ))
    )
  )
);

-- 14. RLS: callbacks
DROP POLICY IF EXISTS "View callbacks" ON public.callbacks;
CREATE POLICY "View callbacks" ON public.callbacks FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (campaign_id IS NULL OR EXISTS (SELECT 1 FROM campaigns c WHERE c.id = callbacks.campaign_id AND is_same_company(c.company_id)))
    AND (has_role(auth.uid(), 'manager'::app_role) OR agent_id = auth.uid())
  )
);

-- 15. RLS: recordings (scope via call_logs.campaign_id)
DROP POLICY IF EXISTS "View recordings" ON public.recordings;
CREATE POLICY "View recordings" ON public.recordings FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM call_logs cl
    LEFT JOIN campaigns c ON c.id = cl.campaign_id
    WHERE cl.id = recordings.call_log_id
      AND (cl.campaign_id IS NULL OR is_same_company(c.company_id))
      AND (
        has_role(auth.uid(), 'manager'::app_role)
        OR has_role(auth.uid(), 'team_leader'::app_role)
        OR cl.agent_id = auth.uid()
      )
  )
);

-- 16. RLS: qa_scores
DROP POLICY IF EXISTS "View qa_scores" ON public.qa_scores;
CREATE POLICY "View qa_scores" ON public.qa_scores FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (campaign_id IS NULL OR EXISTS (SELECT 1 FROM campaigns c WHERE c.id = qa_scores.campaign_id AND is_same_company(c.company_id)))
    AND (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'team_leader'::app_role) OR agent_id = auth.uid())
  )
);

-- 17. RLS: agent_feedback
DROP POLICY IF EXISTS "View agent_feedback" ON public.agent_feedback;
CREATE POLICY "View agent_feedback" ON public.agent_feedback FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (campaign_id IS NULL OR EXISTS (SELECT 1 FROM campaigns c WHERE c.id = agent_feedback.campaign_id AND is_same_company(c.company_id)))
    AND (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'team_leader'::app_role) OR agent_id = auth.uid())
  )
);

-- 18. RLS: training_simulations (agent-scoped, also restrict cross-company viewers)
DROP POLICY IF EXISTS "View training simulations" ON public.training_simulations;
CREATE POLICY "View training simulations" ON public.training_simulations FOR SELECT
USING (
  auth.uid() = agent_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'team_leader'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = training_simulations.agent_id AND p.company_id = current_company_id())
  )
);

-- 19. RLS: campaign_phone_numbers + campaign_scripts (already campaign-scoped, add company filter)
DROP POLICY IF EXISTS "Agents on campaign can view phone numbers" ON public.campaign_phone_numbers;
CREATE POLICY "Agents on campaign can view phone numbers" ON public.campaign_phone_numbers FOR SELECT
USING (
  is_agent_on_campaign(auth.uid(), campaign_id)
  AND EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_phone_numbers.campaign_id AND is_same_company(c.company_id))
);

DROP POLICY IF EXISTS "Agents on campaign can view scripts" ON public.campaign_scripts;
CREATE POLICY "Agents on campaign can view scripts" ON public.campaign_scripts FOR SELECT
USING (
  is_agent_on_campaign(auth.uid(), campaign_id)
  AND EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_scripts.campaign_id AND is_same_company(c.company_id))
);

-- 20. RLS: import_jobs (scope via campaign_id when set)
DROP POLICY IF EXISTS "Scoped view import_jobs" ON public.import_jobs;
CREATE POLICY "Scoped view import_jobs" ON public.import_jobs FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR auth.uid() = uploaded_by
  OR (
    has_role(auth.uid(), 'manager'::app_role)
    AND (campaign_id IS NULL OR EXISTS (SELECT 1 FROM campaigns c WHERE c.id = import_jobs.campaign_id AND is_same_company(c.company_id)))
  )
);
