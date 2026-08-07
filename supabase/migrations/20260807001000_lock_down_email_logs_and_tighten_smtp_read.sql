/*
  # Lock down email_logs (BUG-102) and tighten smtp_settings SELECT

  ## email_logs

  The RLS lockdown in 20260806001000 missed this table alongside smtp_settings.
  It kept the original policies from 20260526052702 / 20260730014541:

      ON email_logs FOR SELECT ... USING (auth.uid() IS NOT NULL)
      ON email_logs FOR INSERT ... WITH CHECK (auth.uid() IS NOT NULL)

  The table holds recipient_email, recipient_name, subject and the full
  body_html of every notification the system has sent. Welcome mail includes the
  member's initial credentials. Any signed-in account, guest_viewer included,
  could enumerate the whole membership and read their notification history.

  Reads are now limited to people who administer mail or review logs. Inserts
  are limited to super_admin, because nothing in the client writes this table
  any more: smtp-service writes the row itself with service_role, which bypasses
  RLS and is unaffected by the policy below.

  ## smtp_settings SELECT

  20260807000000 had to leave members.create / members.update able to read
  smtp_settings, because MembersPage loaded the password into the browser to
  post it to the smtp-service edge function.

  That is no longer true. smtp-service authenticates its caller and loads the
  active config itself, and MembersPage sends no credentials. So the read grant
  collapses to the configuration permission it should always have been, and the
  password stops reaching the browser of anyone who merely manages members.

  Apply this together with the redeployed smtp-service. Applying it while the
  old function is still live would break member notification email, since the
  old client path reads this table.
*/

-- =============================================
-- email_logs
-- =============================================
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'email_logs'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.email_logs', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "email_logs_select"
  ON email_logs FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'smtp_settings', 'read')
    OR public.has_permission(auth.uid(), 'audit_logs', 'read')
  );

-- smtp-service writes these with service_role and bypasses RLS. No client path
-- inserts here, so leave no general grant for one.
CREATE POLICY "email_logs_insert"
  ON email_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Delivery history is evidence. No UPDATE or DELETE policy, so it is
-- append-only for every authenticated role, the same shape as audit_logs.

-- =============================================
-- smtp_settings: drop the member-management read grant
-- =============================================
DROP POLICY IF EXISTS "smtp_settings_select" ON smtp_settings;

CREATE POLICY "smtp_settings_select"
  ON smtp_settings FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'smtp_settings', 'read')
  );
