/*
  # Enable Realtime on Permission-Related Tables

  1. Changes
    - Enables Supabase Realtime (publication) on `role_permissions`, `roles`, and `profiles` tables
    - This allows active sessions to receive permission updates in real-time via WebSocket

  2. Purpose
    - When an admin updates a role's permissions, all logged-in users with that role
      see the changes immediately without refreshing or re-logging in
    - Applies consistently across all modules and permission groups
*/

-- ALTER PUBLICATION ... ADD TABLE errors if the table is already published, which
-- makes a re-run of this file fail rather than no-op. Guarded so the migration
-- set can be replayed, including after a partially failed run.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['role_permissions', 'roles', 'profiles'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
