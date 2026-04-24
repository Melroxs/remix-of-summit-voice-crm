-- Fix 1: Restrict dnc_entries INSERT to authenticated users with a valid company_id
DROP POLICY IF EXISTS "Insert dnc" ON public.dnc_entries;
CREATE POLICY "Insert dnc"
ON public.dnc_entries
FOR INSERT
TO authenticated
WITH CHECK (
  company_id IS NOT NULL
  AND is_same_company(company_id)
);

-- Fix 2: Restrict lead_qualifications SELECT to authenticated users with same-company check
DROP POLICY IF EXISTS "View lead_qualifications" ON public.lead_qualifications;
DROP POLICY IF EXISTS "Select lead_qualifications" ON public.lead_qualifications;
CREATE POLICY "View lead_qualifications"
ON public.lead_qualifications
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (company_id IS NOT NULL AND is_same_company(company_id))
  OR (auth.uid() IS NOT NULL AND agent_id = auth.uid())
);

-- Fix 3: Scope profiles SELECT for managers/team_leaders to their own company
DROP POLICY IF EXISTS "View profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles viewable" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;

CREATE POLICY "Users view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers and team leaders view same-company profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'team_leader'::app_role))
  AND company_id IS NOT NULL
  AND company_id = current_company_id()
);