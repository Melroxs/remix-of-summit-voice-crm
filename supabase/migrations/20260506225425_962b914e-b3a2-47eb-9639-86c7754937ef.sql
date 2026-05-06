DELETE FROM public.user_roles WHERE user_id = '3d2a1f75-3913-4773-9a6b-e87d939cf820';
INSERT INTO public.user_roles (user_id, role) VALUES ('3d2a1f75-3913-4773-9a6b-e87d939cf820', 'admin');
UPDATE public.profiles SET display_name = 'JP Systems' WHERE user_id = '3d2a1f75-3913-4773-9a6b-e87d939cf820';