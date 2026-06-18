/*
  # Add SMTP Settings navigation permission

  1. Changes
    - Add `smtp_settings` module navigation permission so roles can be granted access
    - Add CRUD permissions for smtp_settings module

  2. Notes
    - This allows the SMTP Settings page to be gated by the same permission system as other pages
*/

INSERT INTO permissions (module, action, description)
VALUES
  ('smtp_settings', 'navigate', 'Can view SMTP Settings in navigation'),
  ('smtp_settings', 'read', 'Can view SMTP configuration'),
  ('smtp_settings', 'create', 'Can create SMTP configuration'),
  ('smtp_settings', 'update', 'Can update SMTP configuration'),
  ('smtp_settings', 'delete', 'Can delete SMTP configuration')
ON CONFLICT DO NOTHING;
