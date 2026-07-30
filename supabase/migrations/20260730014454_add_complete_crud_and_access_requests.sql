/*
  # Complete CRUD Permissions and Access Requests Table

  1. New Permissions - Missing CRUD actions for modules
  2. New Tables - `access_requests` for permission request workflow
  3. Security - RLS enabled on access_requests with ownership policies
*/

-- Add missing CRUD permissions
INSERT INTO permissions (module, action, description) VALUES
  ('dashboard', 'create', 'Create dashboard items'),
  ('dashboard', 'read', 'Read dashboard data'),
  ('dashboard', 'update', 'Update dashboard items'),
  ('dashboard', 'delete', 'Delete dashboard items'),
  ('chatbot', 'create', 'Create chatbot sessions'),
  ('chatbot', 'update', 'Update chatbot messages'),
  ('chatbot', 'delete', 'Delete chatbot messages'),
  ('notifications', 'create', 'Create notifications'),
  ('notifications', 'update', 'Update notifications'),
  ('notifications', 'delete', 'Delete notifications'),
  ('audit_logs', 'create', 'Create audit log entries'),
  ('audit_logs', 'update', 'Update audit log entries'),
  ('audit_logs', 'delete', 'Delete audit log entries')
ON CONFLICT DO NOTHING;

-- Create access_requests table
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

-- Users can create their own access requests
DROP POLICY IF EXISTS "Users can create own access requests" ON access_requests;
CREATE POLICY "Users can create own access requests"
  ON access_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = requested_by);

-- Users can view their own access requests
DROP POLICY IF EXISTS "Users can view own access requests" ON access_requests;
CREATE POLICY "Users can view own access requests"
  ON access_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = requested_by);

-- Admins can view all access requests
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

-- Admins can update access requests (approve/deny)
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

-- Grant new CRUD permissions to super_admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'super_admin'
  AND p.action IN ('create', 'read', 'update', 'delete')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Enable realtime on access_requests for live updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'access_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE access_requests;
  END IF;
END $$;
