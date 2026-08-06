/*
  # Enable Row Level Security on profiles

  The `profiles` table shipped with `ALTER TABLE profiles DISABLE ROW LEVEL SECURITY`,
  so anyone holding the public anon key (it is embedded in the frontend bundle) could
  read and write every member record without authenticating.

  1. Helper functions
    - `is_profile_admin(check_user uuid)` - SECURITY DEFINER so profile policies can test
      admin status without re-entering the profiles policies (which would recurse)
    - `get_email_by_username(lookup_username text)` - lets the login screen resolve a
      username to an email pre-authentication without exposing the profiles table to anon

  2. Security
    - RLS enabled on `profiles`
    - SELECT: any authenticated user (member directory, created_by joins, dashboard counts)
    - INSERT: only a row whose id matches the caller
    - UPDATE: own row, or any row for admins
    - DELETE: admins only
    - anon gets no policy at all, so it gets no rows
    - A BEFORE UPDATE trigger blocks non-admins from changing `role_id` or `is_active`
      on their own row, which RLS alone cannot express (it is row-level, not column-level)
*/

-- =============================================
-- HELPER: admin check (SECURITY DEFINER avoids recursive policy evaluation)
-- =============================================
CREATE OR REPLACE FUNCTION public.is_profile_admin(check_user uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN check_user IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM profiles p
      JOIN roles r ON r.id = p.role_id
      WHERE p.id = check_user AND r.name = 'super_admin'
    )
    OR EXISTS (
      SELECT 1
      FROM profiles p
      JOIN role_permissions rp ON rp.role_id = p.role_id
      JOIN permissions perm ON perm.id = rp.permission_id
      WHERE p.id = check_user
        AND perm.module = 'members'
        AND perm.action IN ('update', 'delete')
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.is_profile_admin(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_profile_admin(uuid) TO authenticated;

-- =============================================
-- HELPER: username -> email lookup for the login screen
-- Replaces the anon SELECT on profiles that signIn() previously relied on.
-- Returns only the email for an exact username match, nothing else.
-- =============================================
CREATE OR REPLACE FUNCTION public.get_email_by_username(lookup_username text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT email FROM profiles WHERE username = lookup_username LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_email_by_username(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_email_by_username(text) TO anon, authenticated;

-- =============================================
-- ENABLE RLS
-- =============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON profiles;

-- Every signed-in member can read the directory: MembersPage lists all profiles,
-- DashboardPage counts them, and audit/record views join created_by -> profiles.
CREATE POLICY "Authenticated users can view profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- App.tsx ensureProfile() self-provisions a row on first login.
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ProfilePage edits, and the last_login stamp in AuthContext.
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- MembersPage role assignment and activate/deactivate.
CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (public.is_profile_admin(auth.uid()))
  WITH CHECK (public.is_profile_admin(auth.uid()));

CREATE POLICY "Admins can delete profiles"
  ON profiles FOR DELETE
  TO authenticated
  USING (public.is_profile_admin(auth.uid()));

-- =============================================
-- COLUMN GUARD: stop self-service privilege escalation
-- Without this, "Users can update own profile" would let any member set their own
-- role_id to super_admin or flip their own is_active back on.
-- =============================================
CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role / edge functions (create-member) bypass RLS and have no auth.uid()
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF (NEW.role_id IS DISTINCT FROM OLD.role_id
      OR NEW.is_active IS DISTINCT FROM OLD.is_active)
     AND NOT public.is_profile_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can change role_id or is_active';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_privileged_columns ON profiles;
CREATE TRIGGER profiles_guard_privileged_columns
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_guard_privileged_columns();
