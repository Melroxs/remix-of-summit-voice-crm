-- AI training materials: per-campaign scripts and objection libraries
-- used by the Training Hub AI to ground roleplay & coaching feedback.

CREATE TYPE public.training_material_type AS ENUM (
  'script',
  'objection',
  'rebuttal',
  'talking_point',
  'qualification_question',
  'closing_line'
);

CREATE TABLE public.ai_training_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  material_type public.training_material_type NOT NULL,
  title TEXT NOT NULL,
  -- For 'objection' rows this is the objection wording.
  -- For 'rebuttal' rows this is the rebuttal text.
  content TEXT NOT NULL DEFAULT '',
  -- Optional: link a rebuttal to its parent objection.
  parent_id UUID REFERENCES public.ai_training_materials(id) ON DELETE CASCADE,
  tags TEXT[] NOT NULL DEFAULT '{}',
  difficulty TEXT,
  scenario TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_training_materials_company ON public.ai_training_materials(company_id);
CREATE INDEX idx_ai_training_materials_campaign ON public.ai_training_materials(campaign_id);
CREATE INDEX idx_ai_training_materials_type ON public.ai_training_materials(material_type);
CREATE INDEX idx_ai_training_materials_parent ON public.ai_training_materials(parent_id);
CREATE INDEX idx_ai_training_materials_scenario ON public.ai_training_materials(scenario);

-- Auto-stamp updated_at
CREATE TRIGGER trg_ai_training_materials_updated_at
BEFORE UPDATE ON public.ai_training_materials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.ai_training_materials ENABLE ROW LEVEL SECURITY;

-- View: anyone in the same company (admins, managers, team_leaders, agents, clients via campaign).
CREATE POLICY "View ai_training_materials"
ON public.ai_training_materials
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.is_same_company(company_id)
);

-- Admins and managers can create/edit/delete training material for their company.
CREATE POLICY "Insert ai_training_materials"
ON public.ai_training_materials
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_same_company(company_id)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR public.has_role(auth.uid(), 'team_leader'::public.app_role)
  )
);

CREATE POLICY "Update ai_training_materials"
ON public.ai_training_materials
FOR UPDATE
TO authenticated
USING (
  public.is_same_company(company_id)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR public.has_role(auth.uid(), 'team_leader'::public.app_role)
  )
);

CREATE POLICY "Delete ai_training_materials"
ON public.ai_training_materials
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.is_same_company(company_id)
    AND public.has_role(auth.uid(), 'manager'::public.app_role)
  )
);