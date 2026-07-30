/*
  # Add function to get auth user ID by email

  1. New Functions
    - `get_auth_user_id_by_email(lookup_email text)` - Returns auth user UUID for a given email
*/

CREATE OR REPLACE FUNCTION get_auth_user_id_by_email(lookup_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id FROM auth.users WHERE email = lookup_email LIMIT 1;
$$;
