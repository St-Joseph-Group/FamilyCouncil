/*
  # Family Council Business Standard System - Full Schema Migration

  ## Overview
  Complete database schema for the Family Council system. This single migration
  creates all tables, indexes, functions, permissions, roles, navigation, and
  realtime subscriptions from scratch.

  ## Tables Created
    - `roles` - System roles (Super Admin, Council Admin, Council Member, Guest/Viewer)
    - `permissions` - Granular permission definitions per module
    - `role_permissions` - Junction table mapping roles to permissions
    - `profiles` - Extended user profiles linked to auth.users
    - `council_groups` - Family council groups
    - `council_members` - Members belonging to council groups
    - `council_records` - Official council records/documents
    - `meetings` - Council meetings
    - `meeting_attendees` - Meeting attendance tracking
    - `announcements` - Council announcements
    - `chat_logs` - Chatbot interaction logs (n8n/FB Messenger)
    - `chat_messages` - Individual chat messages
    - `audit_logs` - System-wide audit trail
    - `notifications` - User notifications
    - `navigation_items` - Dynamic navigation registry
    - `navigation_access` - Role-based navigation access
    - `system_config` - System configuration flags
    - `webhook_configs` - Webhook endpoint configurations
    - `webhook_interactions` - Webhook request/response logs
    - `access_requests` - Permission access request workflow
    - `smtp_settings` - SMTP server configuration
    - `email_logs` - Email send history
    - `system_version` - App version tracking for update notifications

  ## Security
    - Most tables have RLS DISABLED (project convention during development)
    - `access_requests`, `smtp_settings`, `email_logs`, `system_version` have RLS ENABLED with policies
    - Centralized `system_config.rls_enabled` flag to re-enable RLS globally post-completion

  ## Realtime
    - Enabled on: role_permissions, roles, profiles, chat_messages, chat_logs,
      access_requests, meetings, council_records, system_version

  ## Functions
    - `get_auth_user_id_by_email(text)` - Returns auth user UUID for a given email

  ## Notes
    - All tables use UUID primary keys
    - Timestamps use timestamptz with DEFAULT now()
    - Foreign keys use ON DELETE CASCADE or ON DELETE SET NULL as appropriate
*/


-- =============================================
-- 1. ROLES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  display_name text NOT NULL,
  description text DEFAULT '',
  is_system boolean DEFAULT false,
  is_full_pledge boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE roles DISABLE ROW LEVEL SECURITY;

INSERT INTO roles (name, display_name, description, is_system, is_full_pledge) VALUES
  ('super_admin', 'Super Admin', 'Full access across all modules and councils', true, true),
  ('council_admin', 'Council Admin', 'Administrative access within assigned councils', true, false),
  ('council_member', 'Council Member', 'Standard member access to council resources', true, false),
  ('guest_viewer', 'Guest/Viewer', 'Read-only access to public council information', true, false)
ON CONFLICT (name) DO NOTHING;


-- =============================================
-- 2. PERMISSIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  action text NOT NULL,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE(module, action)
);

ALTER TABLE permissions DISABLE ROW LEVEL SECURITY;

INSERT INTO permissions (module, action, description) VALUES
  -- Council Records
  ('council_records', 'create', 'Create council records'),
  ('council_records', 'read', 'View council records'),
  ('council_records', 'update', 'Edit council records'),
  ('council_records', 'delete', 'Delete council records'),
  ('council_records', 'navigate', 'Access to Council Records page'),
  -- Meetings
  ('meetings', 'create', 'Create meetings'),
  ('meetings', 'read', 'View meetings'),
  ('meetings', 'update', 'Edit meetings'),
  ('meetings', 'delete', 'Delete meetings'),
  ('meetings', 'navigate', 'Access to Meetings page'),
  -- Announcements
  ('announcements', 'create', 'Create announcements'),
  ('announcements', 'read', 'View announcements'),
  ('announcements', 'update', 'Edit announcements'),
  ('announcements', 'delete', 'Delete announcements'),
  ('announcements', 'navigate', 'Access to Announcements page'),
  -- Members
  ('members', 'create', 'Add members'),
  ('members', 'read', 'View members'),
  ('members', 'update', 'Edit members'),
  ('members', 'delete', 'Remove members'),
  ('members', 'navigate', 'Access to Members management page'),
  -- Roles
  ('roles', 'create', 'Create roles'),
  ('roles', 'read', 'View roles'),
  ('roles', 'update', 'Edit roles'),
  ('roles', 'delete', 'Delete roles'),
  ('roles', 'navigate', 'Access to Roles & Permissions page'),
  -- Audit Logs
  ('audit_logs', 'read', 'View audit logs'),
  ('audit_logs', 'create', 'Create audit log entries'),
  ('audit_logs', 'update', 'Update audit log entries'),
  ('audit_logs', 'delete', 'Delete audit log entries'),
  ('audit_logs', 'navigate', 'Access to Audit Logs page'),
  -- Chatbot
  ('chatbot', 'read', 'View chatbot messages'),
  ('chatbot', 'send', 'Send chatbot messages'),
  ('chatbot', 'create', 'Create chatbot sessions'),
  ('chatbot', 'update', 'Update chatbot messages'),
  ('chatbot', 'delete', 'Delete chatbot messages'),
  ('chatbot', 'navigate', 'Access to Chatbot page'),
  -- Notifications
  ('notifications', 'read', 'View notifications'),
  ('notifications', 'create', 'Create notifications'),
  ('notifications', 'update', 'Update notifications'),
  ('notifications', 'delete', 'Delete notifications'),
  ('notifications', 'navigate', 'Access to Notifications page'),
  -- Navigation
  ('navigation', 'manage', 'Manage navigation access'),
  -- Dashboard
  ('dashboard', 'navigate', 'Access to Dashboard page'),
  -- Chatbot Setup
  ('chatbot_setup', 'navigate', 'Access to Chatbot Setup configuration page'),
  -- SMTP Settings
  ('smtp_settings', 'navigate', 'Can view SMTP Settings in navigation'),
  ('smtp_settings', 'read', 'Can view SMTP configuration'),
  ('smtp_settings', 'create', 'Can create SMTP configuration'),
  ('smtp_settings', 'update', 'Can update SMTP configuration'),
  ('smtp_settings', 'delete', 'Can delete SMTP configuration')
ON CONFLICT (module, action) DO NOTHING;


-- =============================================
-- 3. ROLE PERMISSIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(role_id, permission_id)
);

ALTER TABLE role_permissions DISABLE ROW LEVEL SECURITY;

-- Super Admin: ALL permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

-- Council Admin: CRUD on records, meetings, announcements, members, chatbot, notifications + read roles + read audit
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'council_admin'
AND p.module IN ('council_records','meetings','announcements','members','chatbot','notifications')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'council_admin'
AND p.module = 'roles' AND p.action = 'read'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'council_admin'
AND p.module = 'audit_logs' AND p.action = 'read'
ON CONFLICT DO NOTHING;

-- Council Member: read + create on records, meetings, announcements, chatbot, notifications
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'council_member'
AND p.action IN ('read', 'create')
AND p.module IN ('council_records','meetings','announcements','chatbot','notifications')
ON CONFLICT DO NOTHING;

-- Guest/Viewer: read-only on records, meetings, announcements, notifications
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'guest_viewer'
AND p.action = 'read'
AND p.module IN ('council_records','meetings','announcements','notifications')
ON CONFLICT DO NOTHING;


-- =============================================
-- 4. PROFILES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE,
  full_name text DEFAULT '',
  email text NOT NULL,
  avatar_url text DEFAULT '',
  role_id uuid REFERENCES roles(id),
  is_active boolean DEFAULT true,
  last_login timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;


-- =============================================
-- 5. COUNCIL GROUPS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS council_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE council_groups DISABLE ROW LEVEL SECURITY;


-- =============================================
-- 6. COUNCIL MEMBERS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS council_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  council_group_id uuid NOT NULL REFERENCES council_groups(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  council_role text DEFAULT 'member',
  joined_at timestamptz DEFAULT now(),
  UNIQUE(council_group_id, profile_id)
);

ALTER TABLE council_members DISABLE ROW LEVEL SECURITY;


-- =============================================
-- 7. COUNCIL RECORDS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS council_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  council_group_id uuid REFERENCES council_groups(id),
  title text NOT NULL,
  content text DEFAULT '',
  record_type text DEFAULT 'general',
  status text DEFAULT 'draft',
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE council_records DISABLE ROW LEVEL SECURITY;


-- =============================================
-- 8. MEETINGS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  council_group_id uuid REFERENCES council_groups(id),
  title text NOT NULL,
  description text DEFAULT '',
  meeting_date timestamptz NOT NULL,
  location text DEFAULT '',
  status text DEFAULT 'scheduled',
  notes text DEFAULT '',
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE meetings DISABLE ROW LEVEL SECURITY;


-- =============================================
-- 9. MEETING ATTENDEES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS meeting_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text DEFAULT 'invited',
  UNIQUE(meeting_id, profile_id)
);

ALTER TABLE meeting_attendees DISABLE ROW LEVEL SECURITY;


-- =============================================
-- 10. ANNOUNCEMENTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  council_group_id uuid REFERENCES council_groups(id),
  title text NOT NULL,
  content text DEFAULT '',
  priority text DEFAULT 'normal',
  is_published boolean DEFAULT false,
  publish_at timestamptz,
  expires_at timestamptz,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE announcements DISABLE ROW LEVEL SECURITY;


-- =============================================
-- 11. CHAT LOGS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS chat_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  platform text DEFAULT 'messenger',
  participant_name text DEFAULT '',
  participant_id text DEFAULT '',
  status text DEFAULT 'active',
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE chat_logs DISABLE ROW LEVEL SECURITY;


-- =============================================
-- 12. CHAT MESSAGES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_log_id uuid REFERENCES chat_logs(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('user','bot','admin')),
  sender_id text DEFAULT '',
  message_type text DEFAULT 'text',
  content text NOT NULL,
  attachment_url text DEFAULT '',
  attachment_type text DEFAULT '',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE chat_messages DISABLE ROW LEVEL SECURITY;


-- =============================================
-- 13. AUDIT LOGS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  module text NOT NULL,
  target_id text DEFAULT '',
  target_type text DEFAULT '',
  details jsonb DEFAULT '{}',
  ip_address text DEFAULT '',
  user_agent text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;


-- =============================================
-- 14. NOTIFICATIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text DEFAULT '',
  type text DEFAULT 'info',
  is_read boolean DEFAULT false,
  related_module text DEFAULT '',
  related_id text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;


-- =============================================
-- 15. NAVIGATION ITEMS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS navigation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  label text NOT NULL,
  path text NOT NULL,
  icon text DEFAULT '',
  parent_id uuid REFERENCES navigation_items(id),
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE navigation_items DISABLE ROW LEVEL SECURITY;

INSERT INTO navigation_items (name, label, path, icon, sort_order) VALUES
  ('dashboard', 'Dashboard', '/dashboard', 'LayoutDashboard', 1),
  ('council_records', 'Council Records', '/records', 'FileText', 2),
  ('meetings', 'Meetings', '/meetings', 'Calendar', 3),
  ('announcements', 'Announcements', '/announcements', 'Megaphone', 4),
  ('members', 'Members', '/members', 'Users', 5),
  ('chatbot', 'Chatbot', '/chatbot', 'MessageCircle', 6),
  ('audit_logs', 'Audit Logs', '/audit', 'ClipboardList', 7),
  ('roles_permissions', 'Roles & Permissions', '/roles', 'Shield', 8),
  ('notifications', 'Notifications', '/notifications', 'Bell', 9),
  ('configuration', 'Configuration', '/config', 'Settings2', 10),
  ('config_announcements', 'Announcements', '/config/announcements', 'Megaphone', 11),
  ('config_members', 'Members', '/config/members', 'Users', 12),
  ('config_audit', 'Audit Logs', '/config/audit', 'ClipboardList', 13),
  ('config_roles', 'Roles & Permissions', '/config/roles', 'Shield', 14),
  ('config_chatbot', 'Chatbot Setup', '/config/chatbot', 'Webhook', 15)
ON CONFLICT (name) DO NOTHING;


-- =============================================
-- 16. NAVIGATION ACCESS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS navigation_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  nav_item_id uuid NOT NULL REFERENCES navigation_items(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(role_id, nav_item_id)
);

ALTER TABLE navigation_access DISABLE ROW LEVEL SECURITY;

-- Super Admin: access to ALL navigation items
INSERT INTO navigation_access (role_id, nav_item_id)
SELECT r.id, n.id FROM roles r CROSS JOIN navigation_items n
WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

-- Council Admin: all except roles_permissions, config_roles
INSERT INTO navigation_access (role_id, nav_item_id)
SELECT r.id, n.id FROM roles r, navigation_items n
WHERE r.name = 'council_admin'
AND n.name NOT IN ('roles_permissions', 'config_roles')
ON CONFLICT DO NOTHING;

-- Council Member: dashboard, records, meetings, announcements, chatbot, notifications
INSERT INTO navigation_access (role_id, nav_item_id)
SELECT r.id, n.id FROM roles r, navigation_items n
WHERE r.name = 'council_member'
AND n.name IN ('dashboard','council_records','meetings','announcements','chatbot','notifications')
ON CONFLICT DO NOTHING;

-- Guest/Viewer: dashboard, records, meetings, announcements, notifications
INSERT INTO navigation_access (role_id, nav_item_id)
SELECT r.id, n.id FROM roles r, navigation_items n
WHERE r.name = 'guest_viewer'
AND n.name IN ('dashboard','council_records','meetings','announcements','notifications')
ON CONFLICT DO NOTHING;


-- =============================================
-- 17. SYSTEM CONFIG TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS system_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE system_config DISABLE ROW LEVEL SECURITY;

INSERT INTO system_config (key, value, description) VALUES
  ('rls_enabled', 'false', 'Master switch: set to true to enable Row Level Security across all tables when project is finalized'),
  ('app_version', '1.0.0', 'Current application version'),
  ('maintenance_mode', 'false', 'Enable maintenance mode')
ON CONFLICT (key) DO NOTHING;


-- =============================================
-- 18. WEBHOOK CONFIGS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS webhook_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  is_active boolean DEFAULT true,
  last_tested_at timestamptz,
  last_status text DEFAULT 'unknown',
  last_status_message text DEFAULT '',
  headers jsonb DEFAULT '{}',
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE webhook_configs DISABLE ROW LEVEL SECURITY;

INSERT INTO webhook_configs (name, url, is_active, last_status) VALUES
  ('n8n Facebook Messenger', 'https://sjgi-n8n-anc3fugma9epbfd2.eastasia-01.azurewebsites.net/webhook/fb-messenger', true, 'unknown')
ON CONFLICT DO NOTHING;


-- =============================================
-- 19. WEBHOOK INTERACTIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS webhook_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_config_id uuid REFERENCES webhook_configs(id) ON DELETE SET NULL,
  session_id text DEFAULT '',
  direction text NOT NULL DEFAULT 'outbound',
  request_payload jsonb DEFAULT '{}',
  response_status integer DEFAULT 0,
  response_body text DEFAULT '',
  latency_ms integer DEFAULT 0,
  success boolean DEFAULT false,
  error_message text DEFAULT '',
  triggered_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE webhook_interactions DISABLE ROW LEVEL SECURITY;


-- =============================================
-- 20. ACCESS REQUESTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL,
  action text NOT NULL,
  justification text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create own access requests" ON access_requests;
CREATE POLICY "Users can create own access requests"
  ON access_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = requested_by);

DROP POLICY IF EXISTS "Users can view own access requests" ON access_requests;
CREATE POLICY "Users can view own access requests"
  ON access_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = requested_by);

DROP POLICY IF EXISTS "Admins can view all access requests" ON access_requests;
CREATE POLICY "Admins can view all access requests"
  ON access_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN role_permissions rp ON rp.role_id = p.role_id
      JOIN permissions perm ON perm.id = rp.permission_id
      WHERE p.id = auth.uid()
        AND perm.module = 'roles'
        AND perm.action = 'read'
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON r.id = p.role_id
      WHERE p.id = auth.uid() AND r.name = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update access requests" ON access_requests;
CREATE POLICY "Admins can update access requests"
  ON access_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN role_permissions rp ON rp.role_id = p.role_id
      JOIN permissions perm ON perm.id = rp.permission_id
      WHERE p.id = auth.uid()
        AND perm.module = 'roles'
        AND perm.action = 'update'
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON r.id = p.role_id
      WHERE p.id = auth.uid() AND r.name = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN role_permissions rp ON rp.role_id = p.role_id
      JOIN permissions perm ON perm.id = rp.permission_id
      WHERE p.id = auth.uid()
        AND perm.module = 'roles'
        AND perm.action = 'update'
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON r.id = p.role_id
      WHERE p.id = auth.uid() AND r.name = 'super_admin'
    )
  );


-- =============================================
-- 21. SMTP SETTINGS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS smtp_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host text NOT NULL DEFAULT '',
  port integer NOT NULL DEFAULT 587,
  username text NOT NULL DEFAULT '',
  password text NOT NULL DEFAULT '',
  sender_email text NOT NULL DEFAULT '',
  sender_name text NOT NULL DEFAULT 'Family Council System',
  encryption text NOT NULL DEFAULT 'tls',
  is_active boolean NOT NULL DEFAULT false,
  last_tested_at timestamptz,
  last_test_status text NOT NULL DEFAULT 'untested',
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE smtp_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view smtp settings" ON smtp_settings;
CREATE POLICY "Authenticated users can view smtp settings"
  ON smtp_settings FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can insert smtp settings" ON smtp_settings;
CREATE POLICY "Authenticated users can insert smtp settings"
  ON smtp_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can update smtp settings" ON smtp_settings;
CREATE POLICY "Authenticated users can update smtp settings"
  ON smtp_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can delete smtp settings" ON smtp_settings;
CREATE POLICY "Authenticated users can delete smtp settings"
  ON smtp_settings FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);


-- =============================================
-- 22. EMAIL LOGS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  recipient_name text NOT NULL DEFAULT '',
  subject text NOT NULL,
  body_html text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  error_message text NOT NULL DEFAULT '',
  smtp_config_id uuid REFERENCES smtp_settings(id),
  triggered_by uuid REFERENCES auth.users(id),
  trigger_action text NOT NULL DEFAULT '',
  trigger_module text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view email logs" ON email_logs;
CREATE POLICY "Authenticated users can view email logs"
  ON email_logs FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can insert email logs" ON email_logs;
CREATE POLICY "Authenticated users can insert email logs"
  ON email_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);


-- =============================================
-- 23. SYSTEM VERSION TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS system_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  published_at timestamptz DEFAULT now(),
  notes text DEFAULT ''
);

ALTER TABLE system_version ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_select_system_version" ON system_version;
CREATE POLICY "allow_select_system_version" ON system_version
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "allow_select_system_version_anon" ON system_version;
CREATE POLICY "allow_select_system_version_anon" ON system_version
  FOR SELECT TO anon USING (true);

ALTER TABLE system_version REPLICA IDENTITY FULL;

INSERT INTO system_version (version, notes)
SELECT '1.0.0', 'Initial release'
WHERE NOT EXISTS (SELECT 1 FROM system_version WHERE version = '1.0.0');


-- =============================================
-- 24. INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON profiles(role_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_log_id ON chat_messages(chat_log_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_council_records_group_id ON council_records(council_group_id);
CREATE INDEX IF NOT EXISTS idx_meetings_group_id ON meetings(council_group_id);
CREATE INDEX IF NOT EXISTS idx_announcements_group_id ON announcements(council_group_id);
CREATE INDEX IF NOT EXISTS idx_webhook_interactions_config_id ON webhook_interactions(webhook_config_id);
CREATE INDEX IF NOT EXISTS idx_webhook_interactions_session_id ON webhook_interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_webhook_interactions_created_at ON webhook_interactions(created_at DESC);


-- =============================================
-- 25. REALTIME PUBLICATIONS
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'role_permissions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE role_permissions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'roles') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE roles;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'profiles') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'chat_logs') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_logs;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'access_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE access_requests;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'meetings') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE meetings;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'council_records') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE council_records;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'system_version') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE system_version;
  END IF;
END $$;


-- =============================================
-- 26. FUNCTIONS
-- =============================================
CREATE OR REPLACE FUNCTION get_auth_user_id_by_email(lookup_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id FROM auth.users WHERE email = lookup_email LIMIT 1;
$$;


-- =============================================
-- 27. SEED: SUPER ADMIN USER
-- =============================================
DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_super_admin_role_id uuid;
BEGIN
  -- Only create if the user doesn't already exist
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'helpdesk@stjoseph-group.com') THEN
    SELECT id INTO v_super_admin_role_id FROM roles WHERE name = 'super_admin';

    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin,
      created_at, updated_at, role, aud,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'helpdesk@stjoseph-group.com',
      crypt('Sjgi@DtO2026', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Helpdesk Admin"}',
      false, now(), now(),
      'authenticated', 'authenticated',
      '', '', '', ''
    );

    INSERT INTO profiles (id, email, full_name, username, role_id, is_active, created_at, updated_at)
    VALUES (v_user_id, 'helpdesk@stjoseph-group.com', 'Helpdesk Admin', 'helpdesk', v_super_admin_role_id, true, now(), now());
  END IF;
END $$;
