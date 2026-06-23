-- Realtime requires RLS enabled with a SELECT policy to deliver events
ALTER TABLE system_version ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_select_system_version" ON system_version
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "allow_select_system_version_anon" ON system_version
  FOR SELECT TO anon USING (true);
