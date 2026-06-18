import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import nodemailer from "npm:nodemailer@6.9.12";

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

interface SendEmailRequest {
  action: "send";
  smtp: SmtpConfig;
  to_email: string;
  to_name: string;
  subject: string;
  body_html: string;
}

interface TestConnectionRequest {
  action: "test";
  smtp: SmtpConfig;
}

type RequestBody = SendEmailRequest | TestConnectionRequest;

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

async function testConnection(smtp: SmtpConfig): Promise<{ success: boolean; message: string }> {
  try {
    const transporter = createTransport(smtp);
    await transporter.verify();

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
  bodyHtml: string
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
    const body: RequestBody = await req.json();

    if (body.action === "test") {
      const result = await testConnection(body.smtp);
      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "send") {
      const { smtp, to_email, to_name, subject, body_html } = body;
      const result = await sendEmail(smtp, to_email, to_name, subject, body_html);
      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: false, message: "Invalid action. Use 'test' or 'send'." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
