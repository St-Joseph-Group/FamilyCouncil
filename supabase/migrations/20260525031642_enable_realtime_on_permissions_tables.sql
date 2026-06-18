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

ALTER PUBLICATION supabase_realtime ADD TABLE role_permissions;
ALTER PUBLICATION supabase_realtime ADD TABLE roles;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
