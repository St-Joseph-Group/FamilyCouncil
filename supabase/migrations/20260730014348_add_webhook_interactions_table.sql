/*
  # Add Webhook Interactions Log Table

  1. New Tables
    - `webhook_interactions` - Logs every webhook request/response for audit and debugging

  2. Security
    - RLS disabled per project convention
*/

CREATE TABLE IF NOT EXISTS webhook_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_config_id uuid REFERENCES webhook_configs(id) ON DELETE SET NULL,
  session_id text DEFAULT '',
  direction text NOT NULL DEFAULT 'outbound',
  request_payload jsonb DEFAULT '{}',
  response_status integer DEFAULT 0,
  response_body text DEFAULT '',
  latency_ms integer DEFAULT 0,
  success boolean DEFAULT false,
  error_message text DEFAULT '',
  triggered_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE webhook_interactions DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_webhook_interactions_config_id ON webhook_interactions(webhook_config_id);
CREATE INDEX IF NOT EXISTS idx_webhook_interactions_session_id ON webhook_interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_webhook_interactions_created_at ON webhook_interactions(created_at DESC);
