import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/*
 * This function used to take a `url` straight from the request body and POST to
 * it, returning the response body to the caller, with five retries and a
 * timeout of up to two minutes. The only gate was the platform's verify_jwt,
 * which the anon key satisfies, and the anon key ships in the browser bundle
 * served to anyone who loads the login page.
 *
 * That made it a server-side request forgery proxy with a public key: arbitrary
 * outbound POST to any address, response returned to the caller, traffic
 * originating from Supabase infrastructure. Confirmed by sending an
 * unauthenticated request (401) and then the same request with the shipped anon
 * key, which returned a DNS error for the attacker-chosen host, proving the
 * fetch was attempted.
 *
 * The caller now names a webhook by id and the URL is read from
 * webhook_configs with service_role, so the destination can only ever be one an
 * administrator configured. The token must belong to a real active user; the
 * anon key resolves to no user and is rejected.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function attemptFetch(
  url: string,
  payload: unknown,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing authorization" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // getUser() must be given the token explicitly. Called with no argument it
    // looks for a stored session, which an edge function never has, so it
    // returned no user for a perfectly valid caller and answered 401.
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return json({ error: "Missing authorization" }, 401);
    }

    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // The anon key is a valid JWT but resolves to no user, which is what
    // rejects it here.
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser(token);
    if (callerError || !caller) {
      return json({ error: "Unauthorized" }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("is_active")
      .eq("id", caller.id)
      .maybeSingle();

    if (!callerProfile || !callerProfile.is_active) {
      return json({ error: "Your account is not active." }, 403);
    }

    const { webhook_id, payload, timeout } = await req.json();

    if (!webhook_id || typeof webhook_id !== "string") {
      return json({ error: "Missing or invalid 'webhook_id' field" }, 400);
    }

    // The destination comes from the database, never from the caller. This is
    // the whole fix: a caller can only reach a configured webhook.
    const { data: webhook, error: webhookError } = await adminClient
      .from("webhook_configs")
      .select("id, url")
      .eq("id", webhook_id)
      .maybeSingle();

    if (webhookError) {
      return json({ error: `Could not load webhook: ${webhookError.message}` }, 500);
    }
    if (!webhook || !webhook.url) {
      return json({ error: "No such webhook is configured" }, 404);
    }

    const url = webhook.url as string;
    const timeoutMs = typeof timeout === "number" ? Math.min(timeout, 120000) : 30000;
    const maxRetries = 5;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const start = Date.now();
        const response = await attemptFetch(url, payload, timeoutMs);
        const latencyMs = Date.now() - start;
        const body = await response.text();

        return json({
          status: response.status,
          statusText: response.statusText,
          body,
          latencyMs,
          attempt: attempt + 1,
        }, 200);
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries - 1) {
          const backoff = Math.min(1000 * Math.pow(2, attempt), 8000);
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }

    const isAbort = lastError instanceof DOMException && (lastError as DOMException).name === "AbortError";
    const message = isAbort
      ? "Request timed out after multiple retries"
      : lastError instanceof Error
        ? lastError.message
        : "Unknown error";

    return json({ error: message, retries: maxRetries }, 502);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
