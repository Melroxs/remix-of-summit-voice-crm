
-- 1. Split telephony config into public + private
ALTER TABLE public.telephony_providers ADD COLUMN IF NOT EXISTS public_config jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.telephony_providers ADD COLUMN IF NOT EXISTS private_config jsonb DEFAULT '{}'::jsonb;

-- Migrate existing config to private_config
UPDATE public.telephony_providers SET private_config = COALESCE(config, '{}'::jsonb) WHERE private_config = '{}'::jsonb AND config IS NOT NULL AND config != '{}'::jsonb;

-- 2. Fix contacts DELETE policy: agents only delete their campaign contacts
DROP POLICY IF EXISTS "Delete contacts" ON public.contacts;
CREATE POLICY "Delete contacts" ON public.contacts FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'agent'::app_role)
    AND EXISTS (
      SELECT 1 FROM campaign_contacts cc
      JOIN campaign_agents ca ON ca.campaign_id = cc.campaign_id
      WHERE cc.contact_id = contacts.id AND ca.user_id = auth.uid()
    )
  )
);

-- 3. Fix contacts SELECT: add client visibility for their campaign contacts
DROP POLICY IF EXISTS "View contacts" ON public.contacts;
CREATE POLICY "View contacts" ON public.contacts FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR EXISTS (
    SELECT 1 FROM campaign_contacts cc
    JOIN campaign_agents ca ON ca.campaign_id = cc.campaign_id
    WHERE cc.contact_id = contacts.id AND ca.user_id = auth.uid()
  )
  OR (
    has_role(auth.uid(), 'client'::app_role)
    AND EXISTS (
      SELECT 1 FROM campaign_contacts cc
      JOIN campaigns c ON c.id = cc.campaign_id
      WHERE cc.contact_id = contacts.id
      AND c.client_account_id IN (SELECT get_user_client_account_ids(auth.uid()))
    )
  )
);

-- 4. Fix profile UPDATE: admin can update any profile, agent restricted to own non-sensitive fields
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated
USING (
  (auth.uid() = user_id AND is_active = true)
  OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  (auth.uid() = user_id AND is_active = true)
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 5. Trigger to prevent agents from editing restricted profile fields
CREATE OR REPLACE FUNCTION public.enforce_profile_update_restrictions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins can change anything
  IF EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN
    RETURN NEW;
  END IF;
  
  -- Non-admins cannot change these fields
  IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    RAISE EXCEPTION 'Only admins can change is_active';
  END IF;
  IF OLD.deactivated_at IS DISTINCT FROM NEW.deactivated_at THEN
    RAISE EXCEPTION 'Only admins can change deactivated_at';
  END IF;
  IF OLD.deactivated_by IS DISTINCT FROM NEW.deactivated_by THEN
    RAISE EXCEPTION 'Only admins can change deactivated_by';
  END IF;
  IF OLD.email IS DISTINCT FROM NEW.email THEN
    RAISE EXCEPTION 'Only admins can change email';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_profile_restrictions ON public.profiles;
CREATE TRIGGER enforce_profile_restrictions
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_profile_update_restrictions();

-- 6. Create client_contact_view (excludes sensitive fields)
CREATE OR REPLACE VIEW public.client_contact_view AS
SELECT
  c.id, c.first_name, c.last_name, c.phone_e164, c.phone_raw,
  c.address, c.city, c.state, c.zip_code, c.county,
  c.lead_status, c.title, c.owner_renter, c.timezone,
  c.created_at, c.updated_at
FROM public.contacts c;

-- 7. Audit trigger for telephony provider changes
CREATE OR REPLACE FUNCTION public.audit_telephony_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_audit_log (admin_id, action, details)
  VALUES (
    auth.uid(),
    TG_OP || '_telephony_provider',
    jsonb_build_object('provider_id', COALESCE(NEW.id, OLD.id), 'provider_name', COALESCE(NEW.name, OLD.name))
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_telephony_changes ON public.telephony_providers;
CREATE TRIGGER audit_telephony_changes
AFTER INSERT OR UPDATE OR DELETE ON public.telephony_providers
FOR EACH ROW
EXECUTE FUNCTION public.audit_telephony_changes();
