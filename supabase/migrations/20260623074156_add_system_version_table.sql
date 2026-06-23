CREATE TABLE IF NOT EXISTS system_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  published_at timestamptz DEFAULT now(),
  notes text DEFAULT ''
);

ALTER TABLE system_version DISABLE ROW LEVEL SECURITY;

INSERT INTO system_version (version, notes) VALUES ('1.0.0', 'Initial release');

ALTER PUBLICATION supabase_realtime ADD TABLE system_version;