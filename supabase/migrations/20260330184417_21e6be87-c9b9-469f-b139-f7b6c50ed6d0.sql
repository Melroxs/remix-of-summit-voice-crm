
-- Make info@summitleadsltd.com an admin
INSERT INTO public.user_roles (user_id, role) VALUES ('6ea9c23e-d938-4122-8f9d-042011ef866e', 'admin') ON CONFLICT (user_id, role) DO NOTHING;
