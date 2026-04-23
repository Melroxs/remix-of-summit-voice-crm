
CREATE TABLE public.training_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  scenario text NOT NULL,
  difficulty text NOT NULL DEFAULT 'medium',
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  score integer,
  feedback text,
  status text NOT NULL DEFAULT 'in_progress',
  duration_seconds integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

ALTER TABLE public.training_simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents can insert own simulations"
  ON public.training_simulations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = agent_id);

CREATE POLICY "Agents can update own simulations"
  ON public.training_simulations FOR UPDATE TO authenticated
  USING (auth.uid() = agent_id);

CREATE POLICY "View training simulations"
  ON public.training_simulations FOR SELECT TO authenticated
  USING (
    auth.uid() = agent_id
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'team_leader'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Admins can delete simulations"
  ON public.training_simulations FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_training_simulations_agent ON public.training_simulations(agent_id, created_at DESC);
