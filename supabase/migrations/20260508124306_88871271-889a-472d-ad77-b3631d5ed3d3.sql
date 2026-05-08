-- Fix campaign_scripts: scope manager management to same company via campaign
DROP POLICY IF EXISTS "Admins and managers can manage scripts" ON public.campaign_scripts;

CREATE POLICY "Admins and managers can manage scripts"
ON public.campaign_scripts
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_scripts.campaign_id
        AND is_same_company(c.company_id)
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_scripts.campaign_id
        AND is_same_company(c.company_id)
    )
  )
);

-- Fix dnc_entries: restrict View to authenticated users only
DROP POLICY IF EXISTS "View dnc" ON public.dnc_entries;

CREATE POLICY "View dnc"
ON public.dnc_entries
FOR SELECT
TO authenticated
USING (
  (company_id IS NULL) OR is_same_company(company_id)
);

-- Fix lead_qualifications: enforce company scoping on insert
DROP POLICY IF EXISTS "Insert lead_qualifications" ON public.lead_qualifications;

CREATE POLICY "Insert lead_qualifications"
ON public.lead_qualifications
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (auth.uid() = agent_id OR has_role(auth.uid(), 'manager'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = lead_qualifications.contact_id
        AND is_same_company(c.company_id)
    )
    AND (
      campaign_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.campaigns cmp
        WHERE cmp.id = lead_qualifications.campaign_id
          AND is_same_company(cmp.company_id)
      )
    )
  )
);