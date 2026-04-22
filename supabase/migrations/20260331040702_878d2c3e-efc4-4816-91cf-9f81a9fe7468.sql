
-- Add DELETE policies for admin role on tables that lack them

CREATE POLICY "Admins can delete contacts"
  ON contacts FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete campaigns"
  ON campaigns FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete campaign_contacts"
  ON campaign_contacts FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete callbacks"
  ON callbacks FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR agent_id = auth.uid());

CREATE POLICY "Admins can delete call_logs"
  ON call_logs FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete appointments"
  ON appointments FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR agent_id = auth.uid());

CREATE POLICY "Admins can delete recordings"
  ON recordings FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete import_errors"
  ON import_errors FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
