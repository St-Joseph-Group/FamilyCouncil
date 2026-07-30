
/*
  # Family Council System - Initial Schema

  ## Overview
  Full schema for the Family Council Business Standard system including:

  1. New Tables
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
    - `notifications` - User notifications with badge counts
    - `navigation_items` - Dynamic navigation registry for role access control
    - `navigation_access` - Which roles can access which nav items

  2. Security
    - RLS is DISABLED on all tables per project requirement
    - A centralized config flag is maintained to re-enable RLS post-completion

  3. Notes
    - All tables use UUID primary keys
    - Timestamps use timestamptz with DEFAULT now()
    - RLS disabled globally until project completion flag is set
*/

-- =============================================
-- ROLES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  display_name text NOT NULL,
  description text DEFAULT '',
  is_system boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE roles DISABLE ROW LEVEL SECURITY;

INSERT INTO roles (name, display_name, description, is_system) VALUES
  ('super_admin', 'Super Admin', 'Full access across all modules and councils', true),
  ('council_admin', 'Council Admin', 'Administrative access within assigned councils', true),
  ('council_member', 'Council Member', 'Standard member access to council resources', true),
  ('guest_viewer', 'Guest/Viewer', 'Read-only access to public council information', true)
ON CONFLICT (name) DO NOTHING;

-- =============================================
-- PERMISSIONS TABLE
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
  ('council_records', 'create', 'Create council records'),
  ('council_records', 'read', 'View council records'),
  ('council_records', 'update', 'Edit council records'),
  ('council_records', 'delete', 'Delete council records'),
  ('meetings', 'create', 'Create meetings'),
  ('meetings', 'read', 'View meetings'),
  ('meetings', 'update', 'Edit meetings'),
  ('meetings', 'delete', 'Delete meetings'),
  ('announcements', 'create', 'Create announcements'),
  ('announcements', 'read', 'View announcements'),
  ('announcements', 'update', 'Edit announcements'),
  ('announcements', 'delete', 'Delete announcements'),
  ('members', 'create', 'Add members'),
  ('members', 'read', 'View members'),
  ('members', 'update', 'Edit members'),
  ('members', 'delete', 'Remove members'),
  ('roles', 'create', 'Create roles'),
  ('roles', 'read', 'View roles'),
  ('roles', 'update', 'Edit roles'),
  ('roles', 'delete', 'Delete roles'),
  ('audit_logs', 'read', 'View audit logs'),
  ('chatbot', 'read', 'View chatbot messages'),
  ('chatbot', 'send', 'Send chatbot messages'),
  ('notifications', 'read', 'View notifications'),
  ('navigation', 'manage', 'Manage navigation access')
ON CONFLICT (module, action) DO NOTHING;

-- =============================================
-- ROLE PERMISSIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(role_id, permission_id)
);

ALTER TABLE role_permissions DISABLE ROW LEVEL SECURITY;

-- Assign all permissions to super_admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

-- Council Admin: CRUD on records, meetings, announcements, members; read roles, read audit, chatbot
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

-- Council Member: read all, create/update own
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'council_member'
AND p.action IN ('read', 'create')
AND p.module IN ('council_records','meetings','announcements','chatbot','notifications')
ON CONFLICT DO NOTHING;

-- Guest: read-only on records, meetings, announcements, notifications
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'guest_viewer'
AND p.action = 'read'
AND p.module IN ('council_records','meetings','announcements','notifications')
ON CONFLICT DO NOTHING;

-- =============================================
-- PROFILES TABLE
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
-- COUNCIL GROUPS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS council_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE council_groups DISABLE ROW LEVEL SECURITY;

-- =============================================
-- COUNCIL MEMBERS TABLE
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
-- COUNCIL RECORDS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS council_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  council_group_id uuid REFERENCES council_groups(id),
  title text NOT NULL,
  content text DEFAULT '',
  record_type text DEFAULT 'general',
  status text DEFAULT 'draft',
  created_by uuid REFERENCES profiles(id),
  updated_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE council_records DISABLE ROW LEVEL SECURITY;

-- =============================================
-- MEETINGS TABLE
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
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE meetings DISABLE ROW LEVEL SECURITY;

-- =============================================
-- MEETING ATTENDEES TABLE
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
-- ANNOUNCEMENTS TABLE
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
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE announcements DISABLE ROW LEVEL SECURITY;

-- =============================================
-- CHAT LOGS TABLE
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
-- CHAT MESSAGES TABLE
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
-- AUDIT LOGS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id),
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
-- NOTIFICATIONS TABLE
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
-- NAVIGATION ITEMS TABLE
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
  ('notifications', 'Notifications', '/notifications', 'Bell', 9)
ON CONFLICT (name) DO NOTHING;

-- =============================================
-- NAVIGATION ACCESS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS navigation_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  nav_item_id uuid NOT NULL REFERENCES navigation_items(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(role_id, nav_item_id)
);

ALTER TABLE navigation_access DISABLE ROW LEVEL SECURITY;

-- Super Admin: access to all navigation items
INSERT INTO navigation_access (role_id, nav_item_id)
SELECT r.id, n.id FROM roles r CROSS JOIN navigation_items n
WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

-- Council Admin: all except roles_permissions
INSERT INTO navigation_access (role_id, nav_item_id)
SELECT r.id, n.id FROM roles r, navigation_items n
WHERE r.name = 'council_admin'
AND n.name != 'roles_permissions'
ON CONFLICT DO NOTHING;

-- Council Member: dashboard, records, meetings, announcements, chatbot, notifications
INSERT INTO navigation_access (role_id, nav_item_id)
SELECT r.id, n.id FROM roles r, navigation_items n
WHERE r.name = 'council_member'
AND n.name IN ('dashboard','council_records','meetings','announcements','chatbot','notifications')
ON CONFLICT DO NOTHING;

-- Guest: dashboard, records, meetings, announcements, notifications
INSERT INTO navigation_access (role_id, nav_item_id)
SELECT r.id, n.id FROM roles r, navigation_items n
WHERE r.name = 'guest_viewer'
AND n.name IN ('dashboard','council_records','meetings','announcements','notifications')
ON CONFLICT DO NOTHING;

-- =============================================
-- SYSTEM CONFIG TABLE (RLS Flag)
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
-- INDEXES
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
