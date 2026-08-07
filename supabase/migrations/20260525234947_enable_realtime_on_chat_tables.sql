/*
  # Enable Realtime on Chat Tables

  1. Changes
    - Enables Supabase Realtime (publication) on `chat_messages` and `chat_logs` tables
    - This allows both Floating Chatbox and Chatbot page to receive messages in real-time

  2. Purpose
    - When a message is sent or deleted in either interface, the other interface
      sees the change immediately without manual refresh
    - Enables true real-time synchronization between all chat modules
*/

-- Guarded: ALTER PUBLICATION ... ADD TABLE errors when the table is already
-- published, so the bare form cannot be replayed. See the same block in
-- 20260525031642.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['chat_messages', 'chat_logs'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
