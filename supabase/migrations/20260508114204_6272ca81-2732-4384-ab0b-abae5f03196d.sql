CREATE TABLE public.dialer_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  destination_number TEXT NOT NULL,
  selected_number TEXT NOT NULL,
  selection_reason TEXT NOT NULL CHECK (selection_reason IN ('local_match','fallback')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dialer_logs_campaign ON public.dialer_logs(campaign_id);
CREATE INDEX idx_dialer_logs_created_at ON public.dialer_logs(created_at DESC);

ALTER TABLE public.dialer_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and managers view dialer_logs"
ON public.dialer_logs
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);