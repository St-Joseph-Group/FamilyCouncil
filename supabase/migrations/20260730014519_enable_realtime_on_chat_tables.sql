/*
  # Enable Realtime on Chat Tables

  1. Changes
    - Enables Supabase Realtime on `chat_messages` and `chat_logs` tables
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'chat_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_logs;
  END IF;
END $$;
