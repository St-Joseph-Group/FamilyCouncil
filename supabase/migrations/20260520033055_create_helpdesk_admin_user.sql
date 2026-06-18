
/*
  # Create Super Admin User

  Creates the helpdesk@stjoseph-group.com user as a Super Admin.

  1. Inserts a confirmed auth user with bcrypt-hashed password
  2. Creates the matching profile with super_admin role
*/

DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_super_admin_role_id uuid;
BEGIN
  -- Get super_admin role id
  SELECT id INTO v_super_admin_role_id FROM roles WHERE name = 'super_admin';

  -- Insert auth user (confirmed, with hashed password for Sjgi@DtO2026)
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    role,
    aud,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'helpdesk@stjoseph-group.com',
    crypt('Sjgi@DtO2026', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Helpdesk Admin"}',
    false,
    now(),
    now(),
    'authenticated',
    'authenticated',
    '',
    '',
    '',
    ''
  );

  -- Create profile with super_admin role
  INSERT INTO profiles (
    id,
    email,
    full_name,
    username,
    role_id,
    is_active,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    'helpdesk@stjoseph-group.com',
    'Helpdesk Admin',
    'helpdesk',
    v_super_admin_role_id,
    true,
    now(),
    now()
  );

END $$;
