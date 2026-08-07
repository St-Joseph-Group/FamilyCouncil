import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.12";

/*
 * This function used to accept an `smtp` object straight from the request body
 * and connect to whatever host it named, with no authentication of any kind.
 * The function URL and the anon key both ship in the browser bundle, so anyone
 * could POST here and send arbitrary mail through any server they supplied.
 *
 * Now:
 *   - every request must carry a real user access token, not the anon key
 *   - `send` ignores client-supplied credentials entirely and loads the active
 *     row itself with service_role, so the password never reaches the browser
 *   - `test` still takes a config from the body, because the settings page has
 *     to test values the admin has typed but not saved. It is gated on
 *     smtp_settings.update and can only send to its own sender address.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  sender_email: string;
  sender_name: string;
  encryption: string;
}

interface StoredSmtpConfig extends SmtpConfig {
  id: string;
}

interface SendEmailRequest {
  action: "send";
  to_email: string;
  to_name: string;
  subject: string;
  body_html: string;
  trigger_action?: string;
  trigger_module?: string;
}

interface TestConnectionRequest {
  action: "test";
  smtp: SmtpConfig;
}

type RequestBody = SendEmailRequest | TestConnectionRequest;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function createTransport(smtp: SmtpConfig) {
  const secure = smtp.encryption === "ssl" || smtp.port === 465;

  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure,
    auth: {
      user: smtp.username,
      pass: smtp.password,
    },
    tls: {
      rejectUnauthorized: false,
      minVersion: "TLSv1.2",
    },
    connectionTimeout: 30000,
    greetingTimeout: 20000,
    socketTimeout: 30000,
  });
}

function formatErrorMessage(err: unknown, smtp: SmtpConfig): string {
  const raw = err instanceof Error ? err.message : "Unknown connection error";
  const isOffice365 = smtp.host.toLowerCase().includes("office365") ||
    smtp.host.toLowerCase().includes("outlook") ||
    smtp.host.toLowerCase().includes("microsoft");

  if (raw.includes("5.7.139") || raw.includes("5.7.3") || raw.includes("Authentication unsuccessful")) {
    if (isOffice365) {
      return `Office 365 rejected the login. To fix this:\n1. Go to Microsoft 365 Admin Center > Users > Active Users\n2. Select the mailbox user "${smtp.username}"\n3. Go to Mail tab > Manage email apps\n4. Enable "Authenticated SMTP"\n5. Wait 15-30 minutes for changes to propagate\n6. If using MFA, generate an App Password at https://mysignins.microsoft.com/security-info`;
    }
    return raw;
  }

  if (raw.includes("ECONNREFUSED") || raw.includes("ENOTFOUND")) {
    return `Cannot reach SMTP server at ${smtp.host}:${smtp.port}. Please verify the host and port are correct.`;
  }

  if (raw.includes("ETIMEDOUT") || raw.includes("timed out")) {
    return `Connection timed out reaching ${smtp.host}:${smtp.port}. The server may be blocking connections from this IP or the port may be wrong.`;
  }

  if (raw.includes("self signed") || raw.includes("certificate")) {
    return `TLS/SSL certificate issue with ${smtp.host}. The server's certificate could not be verified.`;
  }

  return raw;
}

/** service_role read, so RLS cannot make a missing grant look like a missing row. */
async function hasPermission(
  admin: SupabaseClient,
  roleId: string | null,
  module: string,
  action: string,
): Promise<boolean> {
  if (!roleId) return false;
  const { data } = await admin
    .from("role_permissions")
    .select("permission:permissions!inner(module, action)")
    .eq("role_id", roleId)
    .eq("permissions.module", module)
    .eq("permissions.action", action)
    .maybeSingle();
  return !!data;
}

async function testConnection(smtp: SmtpConfig): Promise<{ success: boolean; message: string }> {
  try {
    const transporter = createTransport(smtp);
    await transporter.verify();

    // Deliberately only ever to its own sender address, so an authorised admin
    // cannot turn the test action into a way to mail a third party.
    await transporter.sendMail({
      from: `"${smtp.sender_name}" <${smtp.sender_email}>`,
      to: smtp.sender_email,
      subject: "SMTP Connection Test - Family Council System",
      text: "This is a test email to verify SMTP configuration. If you received this, your SMTP settings are working correctly.",
      html: "<html><body><p>This is a test email to verify SMTP configuration.</p><p>If you received this, your SMTP settings are working correctly.</p></body></html>",
    });

    return { success: true, message: "Connection successful. Test email sent to sender address." };
  } catch (err) {
    return { success: false, message: formatErrorMessage(err, smtp) };
  }
}

async function sendEmail(
  smtp: SmtpConfig,
  toEmail: string,
  toName: string,
  subject: string,
  bodyHtml: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const transporter = createTransport(smtp);

    await transporter.sendMail({
      from: `"${smtp.sender_name}" <${smtp.sender_email}>`,
      to: toName ? `"${toName}" <${toEmail}>` : toEmail,
      subject,
      html: bodyHtml,
    });

    return { success: true, message: "Email sent successfully" };
  } catch (err) {
    return { success: false, message: formatErrorMessage(err, smtp) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ success: false, message: "Missing authorization" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Rejects the anon key: it carries no user, so this comes back null.
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return json({ success: false, message: "Unauthorized" }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role_id, is_active, role:roles(name)")
      .eq("id", caller.id)
      .maybeSingle();

    if (!callerProfile || !callerProfile.is_active) {
      return json({ success: false, message: "Your account is not active." }, 403);
    }

    const callerIsSuperAdmin =
      (callerProfile as { role?: { name?: string } }).role?.name === "super_admin";
    const roleId = (callerProfile as { role_id: string | null }).role_id;

    const body: RequestBody = await req.json();

    if (body.action === "test") {
      const allowed = callerIsSuperAdmin ||
        await hasPermission(adminClient, roleId, "smtp_settings", "update");
      if (!allowed) {
        return json({ success: false, message: "You do not have permission to test SMTP settings." }, 403);
      }

      if (!body.smtp?.host || !body.smtp?.sender_email) {
        return json({ success: false, message: "host and sender_email are required." }, 400);
      }

      const result = await testConnection(body.smtp);
      return json(result, result.success ? 200 : 400);
    }

    if (body.action === "send") {
      // Whoever can create or update a member can trigger the notifications
      // those actions send. Nothing else reaches this branch today.
      const allowed = callerIsSuperAdmin ||
        await hasPermission(adminClient, roleId, "members", "create") ||
        await hasPermission(adminClient, roleId, "members", "update");
      if (!allowed) {
        return json({ success: false, message: "You do not have permission to send email." }, 403);
      }

      const { to_email, to_name, subject, body_html, trigger_action, trigger_module } = body;
      if (!to_email || !subject) {
        return json({ success: false, message: "to_email and subject are required." }, 400);
      }

      // Credentials come from the database, never from the caller.
      const { data: stored, error: storedError } = await adminClient
        .from("smtp_settings")
        .select("id, host, port, username, password, sender_email, sender_name, encryption")
        .eq("is_active", true)
        .order("created_at")
        .limit(1)
        .maybeSingle();

      if (storedError) {
        return json({ success: false, message: `Could not load SMTP settings: ${storedError.message}` }, 500);
      }
      if (!stored) {
        return json({ success: false, message: "No active SMTP configuration.", not_configured: true }, 409);
      }

      const smtp = stored as StoredSmtpConfig;
      const result = await sendEmail(smtp, to_email, to_name || "", subject, body_html || "");

      // Written here rather than by the caller: the browser no longer knows
      // which config was used, and service_role makes the write reliable.
      await adminClient.from("email_logs").insert({
        recipient_email: to_email,
        recipient_name: to_name || "",
        subject,
        body_html: body_html || "",
        status: result.success ? "sent" : "failed",
        error_message: result.success ? "" : result.message,
        smtp_config_id: smtp.id,
        triggered_by: caller.id,
        trigger_action: trigger_action || "",
        trigger_module: trigger_module || "",
      });

      return json(result, result.success ? 200 : 400);
    }

    return json({ success: false, message: "Invalid action. Use 'test' or 'send'." }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ success: false, message }, 500);
  }
});
