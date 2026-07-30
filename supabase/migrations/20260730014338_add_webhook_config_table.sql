
/*
  # Add Webhook Config Table

  1. New Tables
    - `webhook_configs` - Stores n8n and other webhook endpoint configurations

  2. Security
    - RLS DISABLED per project requirement

  3. Seed Data
    - Default n8n FB Messenger webhook entry
*/

CREATE TABLE IF NOT EXISTS webhook_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  is_active boolean DEFAULT true,
  last_tested_at timestamptz,
  last_status text DEFAULT 'unknown',
  last_status_message text DEFAULT '',
  headers jsonb DEFAULT '{}',
  created_by uuid REFERENCES profiles(id),
  updated_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE webhook_configs DISABLE ROW LEVEL SECURITY;

INSERT INTO webhook_configs (name, url, is_active, last_status) VALUES
  ('n8n Facebook Messenger', 'https://sjgi-n8n-anc3fugma9epbfd2.eastasia-01.azurewebsites.net/webhook/fb-messenger', true, 'unknown')
ON CONFLICT DO NOTHING;

-- Register the new config nav items
INSERT INTO navigation_items (name, label, path, icon, sort_order) VALUES
  ('configuration', 'Configuration', '/config', 'Settings2', 10),
  ('config_announcements', 'Announcements', '/config/announcements', 'Megaphone', 11),
  ('config_members', 'Members', '/config/members', 'Users', 12),
  ('config_audit', 'Audit Logs', '/config/audit', 'ClipboardList', 13),
  ('config_roles', 'Roles & Permissions', '/config/roles', 'Shield', 14),
  ('config_chatbot', 'Chatbot Setup', '/config/chatbot', 'Webhook', 15)
ON CONFLICT (name) DO NOTHING;

-- Grant super_admin access to all new nav items
INSERT INTO navigation_access (role_id, nav_item_id)
SELECT r.id, n.id FROM roles r CROSS JOIN navigation_items n
WHERE r.name = 'super_admin'
AND n.name IN ('configuration','config_announcements','config_members','config_audit','config_roles','config_chatbot')
ON CONFLICT DO NOTHING;

-- Grant council_admin access to config sub-items (not roles)
INSERT INTO navigation_access (role_id, nav_item_id)
SELECT r.id, n.id FROM roles r, navigation_items n
WHERE r.name = 'council_admin'
AND n.name IN ('configuration','config_announcements','config_members','config_audit')
ON CONFLICT DO NOTHING;
