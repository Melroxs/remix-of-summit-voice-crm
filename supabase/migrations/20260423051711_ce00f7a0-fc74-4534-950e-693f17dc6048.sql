-- Audit event stream for high-signal product actions (separate from admin_audit_log which is admin-only).
CREATE TABLE IF NOT EXISTS public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id UUID,
  actor_role TEXT,
  company_id UUID,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON public.audit_events(actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_company ON public.audit_events(company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON public.audit_events(entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_type ON public.audit_events(event_type, occurred_at DESC);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can insert their own events (we always set actor_id = auth.uid()).
CREATE POLICY "Insert own audit events"
  ON public.audit_events
  FOR INSERT
  TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- Only admins/managers can read the audit stream; managers scoped to their company.
CREATE POLICY "Admins view all audit events"
  ON public.audit_events
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers view company audit events"
  ON public.audit_events
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND company_id IS NOT NULL
    AND is_same_company(company_id)
  );

-- No updates / deletes (immutable log)
-- (Implicit by absence of policies)

-- Convenience: helper RPC so client/server can write events without leaking actor metadata.
CREATE OR REPLACE FUNCTION public.log_audit_event(
  _event_type TEXT,
  _entity_type TEXT DEFAULT NULL,
  _entity_id UUID DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
  _company UUID;
  _role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'log_audit_event requires authentication';
  END IF;

  SELECT company_id INTO _company FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  SELECT role::text INTO _role FROM public.user_roles
    WHERE user_id = auth.uid()
    ORDER BY CASE role::text
      WHEN 'admin' THEN 1
      WHEN 'manager' THEN 2
      WHEN 'team_leader' THEN 3
      WHEN 'agent' THEN 4
      WHEN 'client' THEN 5
      ELSE 9 END
    LIMIT 1;

  INSERT INTO public.audit_events (actor_id, actor_role, company_id, event_type, entity_type, entity_id, metadata)
  VALUES (auth.uid(), _role, _company, _event_type, _entity_type, _entity_id, COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit_event(TEXT, TEXT, UUID, JSONB) TO authenticated;