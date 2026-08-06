/*
  # Enable Row Level Security on the remaining tables

  The schema shipped with `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` on 19 tables as a
  documented development convention (see the `system_config.rls_enabled` master switch).
  With RLS off, the public anon key embedded in the frontend bundle grants full read AND
  write on all of them, including `audit_logs` and `system_config`.

  `profiles` was handled in 20260806000000_enable_rls_on_profiles.sql. This migration covers
  the other 18.

  1. Helper functions (all SECURITY DEFINER so policies never re-enter the policies of the
     table they are checking)
    - `is_super_admin(uuid)`
    - `has_permission(uuid, module, action)` - super_admin short-circuits to true
    - `owns_chat_log(uuid, uuid)`
    - `log_failed_login(text, text)` - preserves pre-auth failed-login auditing without
      granting anon INSERT on audit_logs

  2. Security model
    - Reference/config data (roles, permissions, role_permissions, navigation_*, system_config):
      readable by any authenticated user because AuthContext resolves permissions from them;
      writes gated on the `roles` / `navigation` permissions, or super_admin
    - Content (council_*, meetings, meeting_attendees, announcements): reads gated on the
      module's `read` permission, writes on create/update/delete
    - Chat (chat_logs, chat_messages): own conversation via participant_id, or the `chatbot`
      permissions for the admin console
    - Webhooks: config readable by authenticated (FloatingChatbox needs the URL to post to),
      writes super_admin only; interactions insertable by authenticated, readable by admins
    - notifications: strictly own rows
    - audit_logs: append-only for authenticated, readable with `audit_logs.read`, no UPDATE
    - anon gets no policy on any table, so it gets no rows
*/

-- =============================================
-- HELPERS
-- =============================================
CREATE OR REPLACE FUNCTION public.is_super_admin(check_user uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT check_user IS NOT NULL AND EXISTS (
    SELECT 1 FROM profiles p
    JOIN roles r ON r.id = p.role_id
    WHERE p.id = check_user AND r.name = 'super_admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_permission(check_user uuid, check_module text, check_action text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT check_user IS NOT NULL AND (
    public.is_super_admin(check_user)
    OR EXISTS (
      SELECT 1
      FROM profiles p
      JOIN role_permissions rp ON rp.role_id = p.role_id
      JOIN permissions perm ON perm.id = rp.permission_id
      WHERE p.id = check_user
        AND p.is_active
        AND perm.module = check_module
        AND perm.action = check_action
    )
  );
$$;

REVOKE ALL ON FUNCTION public.has_permission(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.owns_chat_log(check_user uuid, log_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT check_user IS NOT NULL AND EXISTS (
    SELECT 1 FROM chat_logs c
    WHERE c.id = log_id AND c.participant_id = check_user::text
  );
$$;

REVOKE ALL ON FUNCTION public.owns_chat_log(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.owns_chat_log(uuid, uuid) TO authenticated;

-- AuthContext.signIn() logs failed logins before a session exists. Rather than granting anon
-- INSERT on audit_logs (which would let anyone forge audit entries), expose exactly this one
-- constrained write.
CREATE OR REPLACE FUNCTION public.log_failed_login(identifier text, reason text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO audit_logs (user_id, action, module, target_id, target_type, details)
  VALUES (NULL, 'login_failed', 'auth', identifier, 'user', jsonb_build_object('reason', reason));
$$;

REVOKE ALL ON FUNCTION public.log_failed_login(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.log_failed_login(text, text) TO anon, authenticated;

-- =============================================
-- 1. ROLES / PERMISSIONS / ROLE_PERMISSIONS
-- AuthContext reads these on every login to resolve the permission set.
-- =============================================
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read roles" ON roles;
CREATE POLICY "Authenticated can read roles"
  ON roles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Role managers can insert roles" ON roles;
CREATE POLICY "Role managers can insert roles"
  ON roles FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'roles', 'create'));

DROP POLICY IF EXISTS "Role managers can update roles" ON roles;
CREATE POLICY "Role managers can update roles"
  ON roles FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'roles', 'update'))
  WITH CHECK (public.has_permission(auth.uid(), 'roles', 'update'));

DROP POLICY IF EXISTS "Role managers can delete roles" ON roles;
CREATE POLICY "Role managers can delete roles"
  ON roles FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'roles', 'delete') AND NOT is_system);

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read permissions" ON permissions;
CREATE POLICY "Authenticated can read permissions"
  ON permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Super admins can write permissions" ON permissions;
CREATE POLICY "Super admins can write permissions"
  ON permissions FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read role_permissions" ON role_permissions;
CREATE POLICY "Authenticated can read role_permissions"
  ON role_permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Role managers can write role_permissions" ON role_permissions;
CREATE POLICY "Role managers can write role_permissions"
  ON role_permissions FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'roles', 'update'))
  WITH CHECK (public.has_permission(auth.uid(), 'roles', 'update'));

-- =============================================
-- 2. COUNCIL GROUPS / MEMBERS
-- =============================================
ALTER TABLE council_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read council_groups" ON council_groups;
CREATE POLICY "Authenticated can read council_groups"
  ON council_groups FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Member managers can write council_groups" ON council_groups;
CREATE POLICY "Member managers can write council_groups"
  ON council_groups FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'members', 'update'))
  WITH CHECK (public.has_permission(auth.uid(), 'members', 'update'));

ALTER TABLE council_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read council_members" ON council_members;
CREATE POLICY "Authenticated can read council_members"
  ON council_members FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Member managers can write council_members" ON council_members;
CREATE POLICY "Member managers can write council_members"
  ON council_members FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'members', 'update'))
  WITH CHECK (public.has_permission(auth.uid(), 'members', 'update'));

-- =============================================
-- 3. COUNCIL RECORDS
-- =============================================
ALTER TABLE council_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Readers can read council_records" ON council_records;
CREATE POLICY "Readers can read council_records"
  ON council_records FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'council_records', 'read'));

DROP POLICY IF EXISTS "Creators can insert council_records" ON council_records;
CREATE POLICY "Creators can insert council_records"
  ON council_records FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'council_records', 'create'));

DROP POLICY IF EXISTS "Editors can update council_records" ON council_records;
CREATE POLICY "Editors can update council_records"
  ON council_records FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'council_records', 'update'))
  WITH CHECK (public.has_permission(auth.uid(), 'council_records', 'update'));

DROP POLICY IF EXISTS "Deleters can delete council_records" ON council_records;
CREATE POLICY "Deleters can delete council_records"
  ON council_records FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'council_records', 'delete'));

-- =============================================
-- 4. MEETINGS / ATTENDEES
-- =============================================
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Readers can read meetings" ON meetings;
CREATE POLICY "Readers can read meetings"
  ON meetings FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'meetings', 'read'));

DROP POLICY IF EXISTS "Creators can insert meetings" ON meetings;
CREATE POLICY "Creators can insert meetings"
  ON meetings FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'meetings', 'create'));

DROP POLICY IF EXISTS "Editors can update meetings" ON meetings;
CREATE POLICY "Editors can update meetings"
  ON meetings FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'meetings', 'update'))
  WITH CHECK (public.has_permission(auth.uid(), 'meetings', 'update'));

DROP POLICY IF EXISTS "Deleters can delete meetings" ON meetings;
CREATE POLICY "Deleters can delete meetings"
  ON meetings FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'meetings', 'delete'));

ALTER TABLE meeting_attendees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Readers can read meeting_attendees" ON meeting_attendees;
CREATE POLICY "Readers can read meeting_attendees"
  ON meeting_attendees FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'meetings', 'read'));

DROP POLICY IF EXISTS "Meeting editors can write meeting_attendees" ON meeting_attendees;
CREATE POLICY "Meeting editors can write meeting_attendees"
  ON meeting_attendees FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'meetings', 'update'))
  WITH CHECK (public.has_permission(auth.uid(), 'meetings', 'update'));

-- =============================================
-- 5. ANNOUNCEMENTS
-- =============================================
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Readers can read announcements" ON announcements;
CREATE POLICY "Readers can read announcements"
  ON announcements FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'announcements', 'read'));

DROP POLICY IF EXISTS "Creators can insert announcements" ON announcements;
CREATE POLICY "Creators can insert announcements"
  ON announcements FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'announcements', 'create'));

DROP POLICY IF EXISTS "Editors can update announcements" ON announcements;
CREATE POLICY "Editors can update announcements"
  ON announcements FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'announcements', 'update'))
  WITH CHECK (public.has_permission(auth.uid(), 'announcements', 'update'));

DROP POLICY IF EXISTS "Deleters can delete announcements" ON announcements;
CREATE POLICY "Deleters can delete announcements"
  ON announcements FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'announcements', 'delete'));

-- =============================================
-- 6. CHAT LOGS / MESSAGES
-- FloatingChatbox stores the owner in chat_logs.participant_id (= auth.uid()::text).
-- ChatbotPage is the admin console and needs the chatbot.read permission instead.
-- =============================================
ALTER TABLE chat_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners and chat admins can read chat_logs" ON chat_logs;
CREATE POLICY "Owners and chat admins can read chat_logs"
  ON chat_logs FOR SELECT TO authenticated
  USING (
    participant_id = auth.uid()::text
    OR public.has_permission(auth.uid(), 'chatbot', 'read')
  );

DROP POLICY IF EXISTS "Chat creators can insert chat_logs" ON chat_logs;
CREATE POLICY "Chat creators can insert chat_logs"
  ON chat_logs FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), 'chatbot', 'create')
    AND (participant_id = auth.uid()::text OR public.has_permission(auth.uid(), 'chatbot', 'update'))
  );

DROP POLICY IF EXISTS "Owners and chat admins can update chat_logs" ON chat_logs;
CREATE POLICY "Owners and chat admins can update chat_logs"
  ON chat_logs FOR UPDATE TO authenticated
  USING (
    participant_id = auth.uid()::text
    OR public.has_permission(auth.uid(), 'chatbot', 'update')
  )
  WITH CHECK (
    participant_id = auth.uid()::text
    OR public.has_permission(auth.uid(), 'chatbot', 'update')
  );

DROP POLICY IF EXISTS "Owners and chat admins can delete chat_logs" ON chat_logs;
CREATE POLICY "Owners and chat admins can delete chat_logs"
  ON chat_logs FOR DELETE TO authenticated
  USING (
    participant_id = auth.uid()::text
    OR public.has_permission(auth.uid(), 'chatbot', 'delete')
  );

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners and chat admins can read chat_messages" ON chat_messages;
CREATE POLICY "Owners and chat admins can read chat_messages"
  ON chat_messages FOR SELECT TO authenticated
  USING (
    public.owns_chat_log(auth.uid(), chat_log_id)
    OR public.has_permission(auth.uid(), 'chatbot', 'read')
  );

DROP POLICY IF EXISTS "Owners and chat admins can insert chat_messages" ON chat_messages;
CREATE POLICY "Owners and chat admins can insert chat_messages"
  ON chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    public.owns_chat_log(auth.uid(), chat_log_id)
    OR public.has_permission(auth.uid(), 'chatbot', 'send')
  );

DROP POLICY IF EXISTS "Owners and chat admins can delete chat_messages" ON chat_messages;
CREATE POLICY "Owners and chat admins can delete chat_messages"
  ON chat_messages FOR DELETE TO authenticated
  USING (
    public.owns_chat_log(auth.uid(), chat_log_id)
    OR public.has_permission(auth.uid(), 'chatbot', 'delete')
  );

-- =============================================
-- 7. AUDIT LOGS (append-only)
-- =============================================
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Audit readers can read audit_logs" ON audit_logs;
CREATE POLICY "Audit readers can read audit_logs"
  ON audit_logs FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'audit_logs', 'read'));

-- Any signed-in user generates audit entries as a side effect of normal actions,
-- but only ever attributed to themselves (or NULL for system events).
DROP POLICY IF EXISTS "Authenticated can append audit_logs" ON audit_logs;
CREATE POLICY "Authenticated can append audit_logs"
  ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Deliberately no UPDATE policy: audit entries are immutable.
DROP POLICY IF EXISTS "Audit deleters can delete audit_logs" ON audit_logs;
CREATE POLICY "Audit deleters can delete audit_logs"
  ON audit_logs FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'audit_logs', 'delete'));

-- =============================================
-- 8. NOTIFICATIONS (own rows only)
-- =============================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notifications" ON notifications;
CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users and senders can insert notifications" ON notifications;
CREATE POLICY "Users and senders can insert notifications"
  ON notifications FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.has_permission(auth.uid(), 'notifications', 'create')
  );

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- =============================================
-- 9. NAVIGATION ITEMS / ACCESS
-- Sidebar rendering reads both on every page load.
-- =============================================
ALTER TABLE navigation_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read navigation_items" ON navigation_items;
CREATE POLICY "Authenticated can read navigation_items"
  ON navigation_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Navigation managers can write navigation_items" ON navigation_items;
CREATE POLICY "Navigation managers can write navigation_items"
  ON navigation_items FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'navigation', 'manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'navigation', 'manage'));

ALTER TABLE navigation_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read navigation_access" ON navigation_access;
CREATE POLICY "Authenticated can read navigation_access"
  ON navigation_access FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Navigation managers can write navigation_access" ON navigation_access;
CREATE POLICY "Navigation managers can write navigation_access"
  ON navigation_access FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'navigation', 'manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'navigation', 'manage'));

-- =============================================
-- 10. SYSTEM CONFIG
-- =============================================
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read system_config" ON system_config;
CREATE POLICY "Authenticated can read system_config"
  ON system_config FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Super admins can write system_config" ON system_config;
CREATE POLICY "Super admins can write system_config"
  ON system_config FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

UPDATE system_config SET value = 'true', updated_at = now() WHERE key = 'rls_enabled';

-- =============================================
-- 11. WEBHOOK CONFIGS / INTERACTIONS
-- FloatingChatbox needs the active webhook URL, so config stays readable to authenticated.
-- =============================================
ALTER TABLE webhook_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read webhook_configs" ON webhook_configs;
CREATE POLICY "Authenticated can read webhook_configs"
  ON webhook_configs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Super admins can write webhook_configs" ON webhook_configs;
CREATE POLICY "Super admins can write webhook_configs"
  ON webhook_configs FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

ALTER TABLE webhook_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Chat admins can read webhook_interactions" ON webhook_interactions;
CREATE POLICY "Chat admins can read webhook_interactions"
  ON webhook_interactions FOR SELECT TO authenticated
  USING (
    triggered_by = auth.uid()
    OR public.has_permission(auth.uid(), 'chatbot', 'read')
  );

DROP POLICY IF EXISTS "Authenticated can log webhook_interactions" ON webhook_interactions;
CREATE POLICY "Authenticated can log webhook_interactions"
  ON webhook_interactions FOR INSERT TO authenticated
  WITH CHECK (triggered_by IS NULL OR triggered_by = auth.uid());

DROP POLICY IF EXISTS "Super admins can delete webhook_interactions" ON webhook_interactions;
CREATE POLICY "Super admins can delete webhook_interactions"
  ON webhook_interactions FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));
