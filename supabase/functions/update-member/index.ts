import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface UpdateMemberRequest {
  user_id: string;
  email: string;
  full_name: string;
  role_id: string | null;
  is_active: boolean;
  // omitted or empty means "keep the current password"
  password?: string;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return json({ success: false, message: "Unauthorized" }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Authorise: the caller needs members.update, or super_admin.
    // service_role bypasses RLS, so these reads are reliable.
    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role_id, is_active, role:roles(name)")
      .eq("id", caller.id)
      .maybeSingle();

    if (!callerProfile || !callerProfile.is_active) {
      return json({ success: false, message: "Your account is not active." }, 403);
    }

    const callerRoleName = (callerProfile as { role?: { name?: string } }).role?.name;
    const callerIsSuperAdmin = callerRoleName === "super_admin";

    if (!callerIsSuperAdmin) {
      const { data: perm } = await adminClient
        .from("role_permissions")
        .select("permission:permissions!inner(module, action)")
        .eq("role_id", callerProfile.role_id)
        .eq("permissions.module", "members")
        .eq("permissions.action", "update")
        .maybeSingle();

      if (!perm) {
        return json({ success: false, message: "You do not have permission to update members." }, 403);
      }
    }

    const body: UpdateMemberRequest = await req.json();
    const { user_id, email, full_name, role_id, is_active, password } = body;

    if (!user_id || !email || !full_name) {
      return json({ success: false, message: "user_id, email and full_name are required." }, 400);
    }

    if (password && password.length < 8) {
      return json({ success: false, message: "Password must be at least 8 characters." }, 400);
    }

    // Only a super admin may edit a super admin, mirroring the client-side guard
    // so the rule cannot be bypassed by calling this function directly.
    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("email, role:roles(name)")
      .eq("id", user_id)
      .maybeSingle();

    if (!targetProfile) {
      return json({ success: false, message: "Member not found." }, 404);
    }

    const targetIsSuperAdmin = (targetProfile as { role?: { name?: string } }).role?.name === "super_admin";
    if (targetIsSuperAdmin && !callerIsSuperAdmin) {
      return json({ success: false, message: "You do not have permission to edit a Super Admin." }, 403);
    }

    // Nobody but a super admin may promote someone to super admin.
    if (role_id && !callerIsSuperAdmin) {
      const { data: targetRole } = await adminClient
        .from("roles")
        .select("name")
        .eq("id", role_id)
        .maybeSingle();
      if (targetRole?.name === "super_admin") {
        return json({ success: false, message: "You do not have permission to assign the Super Admin role." }, 403);
      }
    }

    // The whole point of this function: email and password live in auth.users,
    // which the browser client cannot touch. Updating profiles alone silently
    // discards a password change.
    const authUpdate: { email?: string; password?: string } = {};
    if (email !== targetProfile.email) authUpdate.email = email;
    if (password) authUpdate.password = password;

    if (Object.keys(authUpdate).length > 0) {
      const { error: authError } = await adminClient.auth.admin.updateUserById(user_id, {
        ...authUpdate,
        // keep the account usable immediately after an email change
        ...(authUpdate.email ? { email_confirm: true } : {}),
      });

      if (authError) {
        return json({ success: false, message: authError.message }, 400);
      }
    }

    const { error: profileError } = await adminClient
      .from("profiles")
      .update({
        full_name,
        email,
        role_id: role_id || null,
        is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user_id);

    if (profileError) {
      return json({ success: false, message: profileError.message }, 400);
    }

    return json({ success: true, password_changed: !!password, email_changed: !!authUpdate.email }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ success: false, message }, 500);
  }
});
