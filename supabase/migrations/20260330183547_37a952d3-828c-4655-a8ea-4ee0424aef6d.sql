
-- Add 'client' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'client';

-- Create client_accounts table
CREATE TABLE public.client_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_accounts ENABLE ROW LEVEL SECURITY;

-- Create client_users junction table
CREATE TABLE public.client_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, client_account_id)
);
ALTER TABLE public.client_users ENABLE ROW LEVEL SECURITY;

-- Create campaign_agents junction table (agent → campaign assignment)
CREATE TABLE public.campaign_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, campaign_id)
);
ALTER TABLE public.campaign_agents ENABLE ROW LEVEL SECURITY;

-- Add is_active to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- RLS: client_accounts
CREATE POLICY "Admins can manage client_accounts"
  ON public.client_accounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Clients can view own client_accounts"
  ON public.client_accounts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_users cu
      WHERE cu.client_account_id = client_accounts.id
      AND cu.user_id = auth.uid()
    )
  );

-- RLS: client_users
CREATE POLICY "Admins can manage client_users"
  ON public.client_users FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own client_users"
  ON public.client_users FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- RLS: campaign_agents
CREATE POLICY "Admins can manage campaign_agents"
  ON public.campaign_agents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Agents can view own campaign_agents"
  ON public.campaign_agents FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Create helper function: check if agent is assigned to campaign
CREATE OR REPLACE FUNCTION public.is_agent_on_campaign(_user_id uuid, _campaign_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.campaign_agents
    WHERE user_id = _user_id AND campaign_id = _campaign_id
  )
$$;

-- Create helper function: get client_account_ids for a user
CREATE OR REPLACE FUNCTION public.get_user_client_account_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT client_account_id FROM public.client_users WHERE user_id = _user_id
$$;

-- Link campaigns to client_accounts
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS client_account_id uuid REFERENCES public.client_accounts(id);
