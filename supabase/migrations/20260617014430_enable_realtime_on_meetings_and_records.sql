-- Guarded: ALTER PUBLICATION ... ADD TABLE errors when the table is already
-- published, so the bare form cannot be replayed. See the same block in
-- 20260525031642.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['meetings', 'council_records'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;