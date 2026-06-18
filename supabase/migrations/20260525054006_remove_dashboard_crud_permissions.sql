/*
  # Remove Dashboard CRUD Permissions

  1. Changes
    - Removes Create, Read, Update, Delete permissions for the 'dashboard' module
    - Dashboard is not table-based, so CRUD permissions do not apply to it
    - The 'dashboard.navigate' permission is preserved for navigation access control

  2. Cleanup
    - Removes associated role_permissions entries first (foreign key)
    - Then removes the permission records themselves
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
