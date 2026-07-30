/*
  # Remove Dashboard CRUD Permissions

  1. Changes
    - Removes Create, Read, Update, Delete permissions for the 'dashboard' module
    - Dashboard is not table-based, so CRUD permissions do not apply
    - The 'dashboard.navigate' permission is preserved
*/

-- Remove role_permissions for dashboard CRUD
DELETE FROM role_permissions
WHERE permission_id IN (
  SELECT id FROM permissions
  WHERE module = 'dashboard' AND action IN ('create', 'read', 'update', 'delete')
);

-- Remove the dashboard CRUD permissions themselves
DELETE FROM permissions
WHERE module = 'dashboard' AND action IN ('create', 'read', 'update', 'delete');
