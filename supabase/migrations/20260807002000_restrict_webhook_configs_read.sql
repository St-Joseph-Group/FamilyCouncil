/*
  # Stop every signed-in user from reading webhook credentials (BUG-202)

  20260806001000 enabled RLS on webhook_configs but left reads wide open:

      ON webhook_configs FOR SELECT TO authenticated USING (true)

  Writes were already super_admin only, so this is disclosure rather than
  tampering. The table holds `url` and a `headers` jsonb documented as "optional
  custom headers", which is where a webhook's bearer token or signing secret
  lives. Every authenticated account, guest_viewer included, could read both.

  ## Why a function rather than a narrower policy

  The chat surfaces only need the active webhook's id and display name: the id
  to call webhook-proxy, the name to show which integration is connected. They
  never need the URL or the headers.

  A row-scoped policy cannot express that. Restricting reads to is_active rows
  would still hand out the URL and headers of the one row that actually holds
  live credentials. Column-level GRANTs cannot express it either, because the
  admin who edits the URL and the member who is merely chatting are both
  `authenticated`.

  So the table itself becomes admin-only, and everyone else goes through a
  SECURITY DEFINER function that returns nothing but id and name.

  webhook-proxy reads the table with service_role and bypasses RLS, so it is
  unaffected.
*/

ALTER TABLE webhook_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read webhook_configs" ON webhook_configs;
DROP POLICY IF EXISTS "webhook_configs_select" ON webhook_configs;

CREATE POLICY "webhook_configs_select"
  ON webhook_configs FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'chatbot_setup', 'read')
  );

-- Returns only what a chat surface needs. No url, no headers.
CREATE OR REPLACE FUNCTION public.get_active_webhook()
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT w.id, w.name
  FROM webhook_configs w
  WHERE w.is_active
    AND auth.uid() IS NOT NULL
  ORDER BY w.created_at
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_active_webhook() FROM public;
GRANT EXECUTE ON FUNCTION public.get_active_webhook() TO authenticated;
