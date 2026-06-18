/*
  # Add Webhook Interactions Log Table

  1. New Tables
    - `webhook_interactions` - Logs every webhook request/response for audit and debugging
      - `id` (uuid, primary key)
      - `webhook_config_id` (uuid, FK to webhook_configs) - which webhook was called
      - `session_id` (text) - chat session ID if applicable
      - `direction` (text) - 'outbound' (system to n8n) or 'inbound' (n8n reply)
      - `request_payload` (jsonb) - what was sent to the webhook
      - `response_status` (integer) - HTTP status code received
      - `response_body` (text) - raw response body
      - `latency_ms` (integer) - round-trip time in milliseconds
      - `success` (boolean) - whether the request succeeded
      - `error_message` (text) - error message if failed
      - `triggered_by` (uuid) - user who triggered the interaction
      - `created_at` (timestamptz) - when the interaction occurred

  2. Indexes
    - Index on webhook_config_id for filtering by webhook
    - Index on session_id for session-level audit
    - Index on created_at for chronological queries

  3. Security
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
