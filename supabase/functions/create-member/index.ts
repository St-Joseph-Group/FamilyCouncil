import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CreateMemberRequest {
  email: string;
  password: string;
  full_name: string;
  role_id: string | null;
  is_active: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, message: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(
        JSON.stringify({ success: false, message: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Authorise: being signed in is not enough. Without this, any authenticated
    // user could call this endpoint directly and create an account with any
    // role_id, super_admin included.
    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role_id, is_active, role:roles(name)")
      .eq("id", caller.id)
      .maybeSingle();

    if (!callerProfile || !callerProfile.is_active) {
      return new Response(
        JSON.stringify({ success: false, message: "Your account is not active." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerRoleName = (callerProfile as { role?: { name?: string } }).role?.name;
    const callerIsSuperAdmin = callerRoleName === "super_admin";

    if (!callerIsSuperAdmin) {
      const { data: perm } = await adminClient
        .from("role_permissions")
        .select("permission:permissions!inner(module, action)")
        .eq("role_id", callerProfile.role_id)
        .eq("permissions.module", "members")
        .eq("permissions.action", "create")
        .maybeSingle();

      if (!perm) {
        return new Response(
          JSON.stringify({ success: false, message: "You do not have permission to create members." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const body: CreateMemberRequest = await req.json();
    const { email, password, full_name, role_id, is_active } = body;

    if (!email || !password || password.length < 8) {
      return new Response(
        JSON.stringify({ success: false, message: "Email and password (min 8 chars) are required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only a super admin may mint another super admin.
    if (role_id && !callerIsSuperAdmin) {
      const { data: targetRole } = await adminClient
        .from("roles")
        .select("name")
        .eq("id", role_id)
        .maybeSingle();

      if (targetRole?.name === "super_admin") {
        return new Response(
          JSON.stringify({ success: false, message: "You do not have permission to assign the Super Admin role." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile) {
      return new Response(
        JSON.stringify({ success: false, message: "A member with this email already exists." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: authUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      if (createError.message?.includes("already been registered") || createError.message?.includes("already exists")) {
        const { data: existingAuthUser } = await adminClient.auth.admin.listUsers();
        const found = existingAuthUser?.users?.find((u) => u.email === email);
        if (found) {
          // This branch exists to repair an auth user that has no profile row.
          // If a profile already exists it must not be overwritten: the upsert
          // would reset that member's role and active flag, which is a way to
          // demote an existing admin through the create endpoint.
          const { data: orphanCheck } = await adminClient
            .from("profiles")
            .select("id")
            .eq("id", found.id)
            .maybeSingle();

          if (orphanCheck) {
            return new Response(
              JSON.stringify({ success: false, message: "A member with this email already exists." }),
              { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          await adminClient.from("profiles").upsert({
            id: found.id,
            email,
            full_name,
            role_id: role_id || null,
            is_active,
          });

          return new Response(
            JSON.stringify({ success: true, user_id: found.id }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      return new Response(
        JSON.stringify({ success: false, message: createError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newUserId = authUser.user.id;

    await adminClient.from("profiles").upsert({
      id: newUserId,
      email,
      full_name,
      role_id: role_id || null,
      is_active,
    });

    return new Response(
      JSON.stringify({ success: true, user_id: newUserId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
