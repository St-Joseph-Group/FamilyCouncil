/*
  # Lock down smtp_settings (BUG-101)

  ## Problem

  The RLS lockdown in 20260806001000 covered 18 tables but missed smtp_settings,
  which kept the original policies from 20260526052702 / 20260730014541:

      ON smtp_settings FOR SELECT ... USING (auth.uid() IS NOT NULL)
      ON smtp_settings FOR INSERT ... WITH CHECK (auth.uid() IS NOT NULL)
      ON smtp_settings FOR UPDATE ... USING (auth.uid() IS NOT NULL)
      ON smtp_settings FOR DELETE ... USING (auth.uid() IS NOT NULL)

  `auth.uid() IS NOT NULL` is true for every signed-in account, guest_viewer
  included, and the table stores the SMTP password in a plain text column. So the
  lowest-privilege member could:

    - read the live SMTP password
    - rewrite host/username/password to point every system notification at a mail
      server they control (account-created and password-changed notices flow
      through whatever row is is_active)
    - delete the row and silently break all outbound email

  ## Fix

  Drop every existing policy on the table and replace them with four
  permission-scoped ones. The drop is dynamic rather than by name so that no
  policy from either the 20260526 or the duplicate 20260730 migration can survive
  under a name this file did not anticipate.

  ## Why SELECT is not super_admin only

  MembersPage calls getActiveSmtp() and reads the password into the browser to
  post it to the smtp-service edge function whenever a member is created or
  updated. Restricting SELECT to smtp_settings.read would silently stop those
  notification emails for any admin who manages members but not configuration.
  So members.create / members.update also grant read here.

  That is a deliberate compromise, not the end state: the password still reaches
  the browser for anyone who can manage members. The real fix is for smtp-service
  to load the row itself with service_role and never accept credentials from the
  client, at which point this policy collapses to super_admin plus
  smtp_settings.read. Tracked separately.

  ## Not covered here

  email_logs (BUG-102) has the same permissive policies and is left untouched by
  this migration.
*/

ALTER TABLE smtp_settings ENABLE ROW LEVEL SECURITY;

-- Drop whatever is currently attached, whichever migration created it.
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'smtp_settings'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.smtp_settings', pol.policyname);
  END LOOP;
END $$;

-- Read: configuration managers, plus the member-management paths that send
-- notification email through the active row.
CREATE POLICY "smtp_settings_select"
  ON smtp_settings FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'smtp_settings', 'read')
    OR public.has_permission(auth.uid(), 'members', 'create')
    OR public.has_permission(auth.uid(), 'members', 'update')
  );

CREATE POLICY "smtp_settings_insert"
  ON smtp_settings FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'smtp_settings', 'create')
  );

CREATE POLICY "smtp_settings_update"
  ON smtp_settings FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'smtp_settings', 'update')
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'smtp_settings', 'update')
  );

CREATE POLICY "smtp_settings_delete"
  ON smtp_settings FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'smtp_settings', 'delete')
  );
