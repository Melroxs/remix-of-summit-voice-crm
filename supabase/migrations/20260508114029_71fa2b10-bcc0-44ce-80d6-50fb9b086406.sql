CREATE TABLE public.campaign_phone_numbers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  area_code TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  health_score INTEGER NOT NULL DEFAULT 100 CHECK (health_score BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_phone_numbers_campaign ON public.campaign_phone_numbers(campaign_id);
CREATE UNIQUE INDEX uq_campaign_phone_numbers_campaign_phone
  ON public.campaign_phone_numbers(campaign_id, phone_number);

ALTER TABLE public.campaign_phone_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View campaign_phone_numbers"
ON public.campaign_phone_numbers
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = campaign_phone_numbers.campaign_id
      AND is_same_company(c.company_id)
  )
);

CREATE POLICY "Manage campaign_phone_numbers"
ON public.campaign_phone_numbers
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'team_leader'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_phone_numbers.campaign_id
        AND is_same_company(c.company_id)
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'team_leader'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_phone_numbers.campaign_id
        AND is_same_company(c.company_id)
    )
  )
);