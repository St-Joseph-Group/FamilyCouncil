
/*
  # Create Super Admin User

  Creates the helpdesk@stjoseph-group.com user as a Super Admin.

  1. Inserts a confirmed auth user with bcrypt-hashed password
  2. Creates the matching profile with super_admin role

  ## The password is supplied at run time, not stored here

  This file used to hardcode the cleartext password in the crypt() call and
  repeat it in a comment. The bcrypt hash in the database was never the problem;
  the cleartext in the repository was, and it was readable by anyone with repo
  access from the moment it was committed.

  Set it before running:

      SET app.helpdesk_admin_password = 'a-password-you-choose';

  Removing it here does not remove it from git history. The account that was
  provisioned with the old value has to be rotated separately.

  ## Re-runnable

  Skips cleanly if the user already exists, so replaying the migration set
  against a database that has been seeded does not fail on the email unique
  constraint.
*/

DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_super_admin_role_id uuid;
  v_password text := current_setting('app.helpdesk_admin_password', true);
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'helpdesk@stjoseph-group.com') THEN
    RAISE NOTICE 'helpdesk@stjoseph-group.com already exists, skipping';
    RETURN;
  END IF;

  IF v_password IS NULL OR length(v_password) < 12 THEN
    RAISE EXCEPTION 'Set app.helpdesk_admin_password to at least 12 characters before running this migration';
  END IF;

  -- Get super_admin role id
  SELECT id INTO v_super_admin_role_id FROM roles WHERE name = 'super_admin';

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
    crypt(v_password, gen_salt('bf')),
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
