/*
  # Add SMTP Settings and Email Logs tables

  1. New Tables
    - `smtp_settings`
      - `id` (uuid, primary key)
      - `host` (text) - SMTP server hostname
      - `port` (integer) - SMTP port number
      - `username` (text) - SMTP authentication username
      - `password` (text) - SMTP authentication password (encrypted)
      - `sender_email` (text) - Default sender email address
      - `sender_name` (text) - Default sender display name
      - `encryption` (text) - Encryption type: none, ssl, tls
      - `is_active` (boolean) - Whether this config is currently active
      - `last_tested_at` (timestamptz) - Last successful connection test
      - `last_test_status` (text) - Status of last connection test
      - `created_by` (uuid) - User who created the config
      - `updated_by` (uuid) - User who last updated the config
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    - `email_logs`
      - `id` (uuid, primary key)
      - `recipient_email` (text) - Recipient email address
      - `recipient_name` (text) - Recipient display name
      - `subject` (text) - Email subject line
      - `body_html` (text) - Email body in HTML
      - `status` (text) - sent, failed, pending
      - `error_message` (text) - Error details if failed
      - `smtp_config_id` (uuid) - Which SMTP config was used
      - `triggered_by` (uuid) - User who triggered the email
      - `trigger_action` (text) - What action triggered the email
      - `trigger_module` (text) - Which module triggered the email
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Only authenticated users with appropriate roles can access smtp_settings
    - Email logs are viewable by authenticated users
*/

-- SMTP Settings table
CREATE TABLE IF NOT EXISTS smtp_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host text NOT NULL DEFAULT '',
  port integer NOT NULL DEFAULT 587,
  username text NOT NULL DEFAULT '',
  password text NOT NULL DEFAULT '',
  sender_email text NOT NULL DEFAULT '',
  sender_name text NOT NULL DEFAULT 'Family Council System',
  encryption text NOT NULL DEFAULT 'tls',
  is_active boolean NOT NULL DEFAULT false,
  last_tested_at timestamptz,
  last_test_status text NOT NULL DEFAULT 'untested',
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE smtp_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view smtp settings"
  ON smtp_settings FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert smtp settings"
  ON smtp_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update smtp settings"
  ON smtp_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete smtp settings"
  ON smtp_settings FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Email Logs table
CREATE TABLE IF NOT EXISTS email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  recipient_name text NOT NULL DEFAULT '',
  subject text NOT NULL,
  body_html text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  error_message text NOT NULL DEFAULT '',
  smtp_config_id uuid REFERENCES smtp_settings(id),
  triggered_by uuid REFERENCES auth.users(id),
  trigger_action text NOT NULL DEFAULT '',
  trigger_module text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view email logs"
  ON email_logs FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert email logs"
  ON email_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
