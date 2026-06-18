/*
  # Add Navigation Permissions for Page-Level Access Control

  1. New Permissions
    - Adds 'navigate' action permissions for each page in the system
    - These control whether a page is visible in the side panel for a given role
    - Pages: dashboard, council_records, meetings, chatbot, notifications,
      announcements, members, audit_logs, roles, chatbot_setup

  2. Notes
    - Existing CRUD permissions remain unchanged
    - Super Admin retains full access regardless of permissions
    - The old 'navigation.manage' permission is kept for backwards compatibility
*/

INSERT INTO permissions (module, action, description) VALUES
  ('dashboard', 'navigate', 'Access to Dashboard page')
ON CONFLICT DO NOTHING;

INSERT INTO permissions (module, action, description) VALUES
  ('council_records', 'navigate', 'Access to Council Records page')
ON CONFLICT DO NOTHING;

INSERT INTO permissions (module, action, description) VALUES
  ('meetings', 'navigate', 'Access to Meetings page')
ON CONFLICT DO NOTHING;

INSERT INTO permissions (module, action, description) VALUES
  ('chatbot', 'navigate', 'Access to Chatbot page')
ON CONFLICT DO NOTHING;

INSERT INTO permissions (module, action, description) VALUES
  ('notifications', 'navigate', 'Access to Notifications page')
ON CONFLICT DO NOTHING;

INSERT INTO permissions (module, action, description) VALUES
  ('announcements', 'navigate', 'Access to Announcements page')
ON CONFLICT DO NOTHING;

INSERT INTO permissions (module, action, description) VALUES
  ('members', 'navigate', 'Access to Members management page')
ON CONFLICT DO NOTHING;

INSERT INTO permissions (module, action, description) VALUES
  ('audit_logs', 'navigate', 'Access to Audit Logs page')
ON CONFLICT DO NOTHING;

INSERT INTO permissions (module, action, description) VALUES
  ('roles', 'navigate', 'Access to Roles & Permissions page')
ON CONFLICT DO NOTHING;

INSERT INTO permissions (module, action, description) VALUES
  ('chatbot_setup', 'navigate', 'Access to Chatbot Setup configuration page')
ON CONFLICT DO NOTHING;

-- Grant all navigation permissions to super_admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'super_admin'
  AND p.action = 'navigate'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
