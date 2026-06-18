/*
  # Fix foreign key constraints on profiles table for member deletion

  1. Changes
    - Alter foreign keys on `audit_logs`, `council_groups`, `council_records`,
      `meetings`, `announcements`, and `webhook_configs` that reference `profiles(id)`
    - Change from default RESTRICT behavior to ON DELETE SET NULL
    - This allows members to be deleted while preserving historical records

  2. Affected Tables
    - `audit_logs.user_id` -> ON DELETE SET NULL
    - `council_groups.created_by` -> ON DELETE SET NULL
    - `council_records.created_by` -> ON DELETE SET NULL
    - `council_records.updated_by` -> ON DELETE SET NULL
    - `meetings.created_by` -> ON DELETE SET NULL
    - `announcements.created_by` -> ON DELETE SET NULL
    - `webhook_configs.created_by` -> ON DELETE SET NULL
    - `webhook_configs.updated_by` -> ON DELETE SET NULL

  3. Important Notes
    - All affected columns are already nullable
    - Historical records are preserved with NULL user references
    - No data is lost in this migration
*/

-- audit_logs.user_id
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- council_groups.created_by
ALTER TABLE council_groups DROP CONSTRAINT IF EXISTS council_groups_created_by_fkey;
ALTER TABLE council_groups ADD CONSTRAINT council_groups_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- council_records.created_by
ALTER TABLE council_records DROP CONSTRAINT IF EXISTS council_records_created_by_fkey;
ALTER TABLE council_records ADD CONSTRAINT council_records_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- council_records.updated_by
ALTER TABLE council_records DROP CONSTRAINT IF EXISTS council_records_updated_by_fkey;
ALTER TABLE council_records ADD CONSTRAINT council_records_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- meetings.created_by
ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_created_by_fkey;
ALTER TABLE meetings ADD CONSTRAINT meetings_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- announcements.created_by
ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_created_by_fkey;
ALTER TABLE announcements ADD CONSTRAINT announcements_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- webhook_configs.created_by
ALTER TABLE webhook_configs DROP CONSTRAINT IF EXISTS webhook_configs_created_by_fkey;
ALTER TABLE webhook_configs ADD CONSTRAINT webhook_configs_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- webhook_configs.updated_by
ALTER TABLE webhook_configs DROP CONSTRAINT IF EXISTS webhook_configs_updated_by_fkey;
ALTER TABLE webhook_configs ADD CONSTRAINT webhook_configs_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;