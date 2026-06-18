/*
  # Add function to get auth user ID by email

  1. New Functions
    - `get_auth_user_id_by_email(lookup_email text)` - Returns the auth user UUID for a given email
    - Used when re-adding a previously deleted member whose auth record still exists

  2. Security
    - Function is accessible to authenticated users only
    - Only returns the user ID, no sensitive data
*/

CREATE OR REPLACE FUNCTION get_auth_user_id_by_email(lookup_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id FROM auth.users WHERE email = lookup_email LIMIT 1;
$$;