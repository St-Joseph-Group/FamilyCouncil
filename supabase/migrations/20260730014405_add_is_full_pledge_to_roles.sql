/*
  # Add Full-Pledge Flag to Roles

  1. Modified Tables
    - `roles` - Adds `is_full_pledge` boolean column

  2. Notes
    - Existing roles default to false
    - super_admin is set to true as it has full access
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'roles' AND column_name = 'is_full_pledge'
  ) THEN
    ALTER TABLE roles ADD COLUMN is_full_pledge boolean DEFAULT false;
  END IF;
END $$;

UPDATE roles SET is_full_pledge = true WHERE name = 'super_admin';
