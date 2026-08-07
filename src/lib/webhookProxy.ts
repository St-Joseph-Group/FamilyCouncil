import { supabase } from './supabase';

const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-proxy`;

/**
 * Call a configured webhook through the proxy edge function.
 *
 * Sends the webhook's id, not its URL. The function looks the URL up itself with
 * service_role, so a caller can only ever reach a destination an administrator
 * configured. Passing the URL from the browser is what made the proxy usable as
 * a server-side request forgery relay by anyone holding the anon key, which
 * ships in this bundle.
 *
 * Sends the signed-in user's access token rather than the anon key, because the
 * function now rejects a token that resolves to no user.
 *
 * Returns the raw Response so callers keep their own status and body handling.
 * Throws when there is no session, which every call site already treats as a
 * failed webhook call.
 */
export interface ActiveWebhookSummary {
  id: string;
  name: string;
}

/**
 * Resolve the active webhook's id and name.
 *
 * Prefers the get_active_webhook rpc, which returns only these two columns so
 * the endpoint URL and its headers (which carry the integration's token) never
 * reach the browser.
 *
 * Falls back to reading the table when the rpc is absent. The frontend and the
 * database deploy separately, so a build can reach users before its migration
 * is applied; without this the chat surfaces break in that window. The fallback
 * stops working the moment 20260807002000 lands, which is the point.
 */
export async function fetchActiveWebhook(): Promise<{
  webhook: ActiveWebhookSummary | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('get_active_webhook');

  if (!error) {
    const row = Array.isArray(data) ? data[0] : data;
    return { webhook: (row as ActiveWebhookSummary) || null, error: null };
  }

  // PGRST202: the function is not in the schema cache, i.e. not migrated yet.
  const notMigrated = error.code === 'PGRST202' || /schema cache/i.test(error.message);
  if (!notMigrated) {
    return { webhook: null, error: error.message };
  }

  const legacy = await supabase
    .from('webhook_configs')
    .select('id, name')
    .eq('is_active', true)
    .order('created_at')
    .limit(1)
    .maybeSingle();

  if (legacy.error) {
    return { webhook: null, error: legacy.error.message };
  }
  return { webhook: (legacy.data as ActiveWebhookSummary) || null, error: null };
}

export async function postToWebhookProxy(
  webhookId: string,
  payload: unknown,
  timeoutMs: number,
  abortMs: number,
): Promise<Response> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  if (!accessToken) {
    throw new Error('Not signed in, cannot reach the webhook.');
  }

  return fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ webhook_id: webhookId, payload, timeout: timeoutMs }),
    signal: AbortSignal.timeout(abortMs),
  });
}
