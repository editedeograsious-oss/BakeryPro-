import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ROLES = new Set(["manager","cashier","baker","storekeeper"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function defaultKey(envName: string, legacyName: string) {
  const raw = Deno.env.get(envName);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.default) return parsed.default as string;
    } catch {}
  }
  return Deno.env.get(legacyName) ?? "";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Authentication required." }, 401);
  }

  const token = authHeader.slice(7).trim();
  if (!token) return json({ error: "Authentication required." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const publishableKey = defaultKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secretKey = defaultKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !publishableKey || !secretKey) {
    return json({ error: "Staff invitation service is not fully configured." }, 503);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  const actor = userData?.user;
  if (userError || !actor) {
    return json({ error: "Authentication required." }, 401);
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role,active,disabled_at")
    .eq("id", actor.id)
    .single();

  if (
    profileError ||
    !profile ||
    profile.role !== "owner" ||
    profile.active !== true ||
    profile.disabled_at
  ) {
    return json({ error: "Owner authorization required." }, 403);
  }

  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const fullName = String(body?.full_name ?? "").trim();
  const role = String(body?.role ?? "").trim();
  const redirectTo = String(body?.redirect_to ?? "").trim();

  if (
    !email ||
    email.length > 254 ||
    !fullName ||
    fullName.length > 120 ||
    !ALLOWED_ROLES.has(role)
  ) {
    return json({ error: "Valid email, name and staff role are required." }, 400);
  }

  let safeRedirect: string | undefined;
  if (redirectTo) {
    try {
      const u = new URL(redirectTo);
      if (
        u.protocol === "https:" &&
        u.hostname.endsWith(".up.railway.app") &&
        u.pathname === "/auth/callback"
      ) {
        safeRedirect = u.toString();
      }
    } catch {}
  }

  const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, role },
    ...(safeRedirect ? { redirectTo: safeRedirect } : {}),
  });

  if (inviteError || !invite.user) {
    return json({ error: inviteError?.message ?? "Could not create invitation." }, 400);
  }

  const { data: defaultBranch } = await admin
    .from("branches")
    .select("id")
    .eq("is_default", true)
    .eq("active", true)
    .maybeSingle();

  const { error: staffProfileError } = await admin
    .from("profiles")
    .upsert({
      id: invite.user.id,
      full_name: fullName,
      role,
      active: true,
      disabled_at: null,
      disabled_by: null,
      branch_id: defaultBranch?.id ?? null,
    });

  if (staffProfileError) {
    await admin.auth.admin.deleteUser(invite.user.id).catch(() => {});
    return json(
      { error: "The invitation could not be completed. No staff access was granted." },
      500,
    );
  }

  await admin.from("audit_logs").insert({
    actor_id: actor.id,
    action: "invite_staff",
    entity: "profile",
    entity_id: invite.user.id,
    after_data: {
      email,
      full_name: fullName,
      role,
      branch_id: defaultBranch?.id ?? null,
    },
  });

  return json({ ok: true, user_id: invite.user.id });
});
