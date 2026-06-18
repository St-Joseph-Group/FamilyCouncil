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

ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_logs;
