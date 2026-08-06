/*
  # Atomic role permission updates + self-lockout guard

  RolesPermissionsPage saved permissions by deleting every row for a role and
  re-inserting the checked ones as two separate statements. Once RLS landed,
  an admin editing their OWN role wiped the `roles.update` grant that authorises
  them, so the DELETE succeeded and the follow-up INSERT was rejected with 42501.
  The role was left with zero permissions and could not be repaired from the UI.

  1. New function
    - `set_role_permissions(target_role_id uuid, permission_ids uuid[])`
      - authorises ONCE, before mutating, so revoking your own rights mid-save
        cannot strand the write half-applied
      - delete + insert run in one statement pair inside a single function call,
        so a rejected insert rolls the delete back instead of leaving 0 rows
      - refuses to strip `roles.update` or `roles.navigate` from the caller's own
        role, which is what makes the state unrecoverable

  2. Repair
    - Restores the documented council_admin grants, but ONLY if the role
      currently has zero permissions — i.e. exactly the state this bug produces.
      A role with any permissions at all is left untouched.
*/

CREATE OR REPLACE FUNCTION public.set_role_permissions(
  target_role_id uuid,
  permission_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_role_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Authorise up front. Evaluating this after the DELETE is precisely the bug.
  IF NOT public.has_permission(v_caller, 'roles', 'update') THEN
    RAISE EXCEPTION 'You do not have permission to update role permissions';
  END IF;

  SELECT role_id INTO v_caller_role_id FROM profiles WHERE id = v_caller;

  -- Editing your own role must not remove the grants that let you edit roles,
  -- otherwise the change is irreversible from the UI. Super admins bypass the
  -- permission table entirely, so they cannot lock themselves out this way.
  IF target_role_id = v_caller_role_id AND NOT public.is_super_admin(v_caller) THEN
    IF NOT EXISTS (
      SELECT 1 FROM permissions
      WHERE id = ANY(permission_ids) AND module = 'roles' AND action = 'update'
    ) THEN
      RAISE EXCEPTION 'You cannot remove the Roles > Update permission from your own role';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM permissions
      WHERE id = ANY(permission_ids) AND module = 'roles' AND action = 'navigate'
    ) THEN
      RAISE EXCEPTION 'You cannot remove the Roles & Permissions page from your own role';
    END IF;
  END IF;

  DELETE FROM role_permissions WHERE role_id = target_role_id;

  -- Join against permissions so unknown ids are rejected rather than inserted.
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT target_role_id, p.id
  FROM unnest(permission_ids) AS supplied(id)
  JOIN permissions p ON p.id = supplied.id
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.set_role_permissions(uuid, uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.set_role_permissions(uuid, uuid[]) TO authenticated;

-- =============================================
-- REPAIR: restore council_admin only if it was emptied by this bug
-- =============================================
DO $$
DECLARE
  v_role_id uuid;
  v_count integer;
BEGIN
  SELECT id INTO v_role_id FROM roles WHERE name = 'council_admin';
  IF v_role_id IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_count FROM role_permissions WHERE role_id = v_role_id;
  IF v_count > 0 THEN
    RETURN;  -- role still has grants; leave whatever is configured alone
  END IF;

  -- Full CRUD + navigate on the operational modules
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT v_role_id, p.id
  FROM permissions p
  WHERE p.module IN ('council_records','meetings','announcements','members','chatbot','notifications')
  ON CONFLICT DO NOTHING;

  -- Roles page: read + navigate + update, so the page is reachable and usable
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT v_role_id, p.id
  FROM permissions p
  WHERE p.module = 'roles' AND p.action IN ('read', 'navigate', 'update')
  ON CONFLICT DO NOTHING;

  -- Audit logs: read only, as in the original seed
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT v_role_id, p.id
  FROM permissions p
  WHERE p.module = 'audit_logs' AND p.action = 'read'
  ON CONFLICT DO NOTHING;
END $$;
