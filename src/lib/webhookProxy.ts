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
