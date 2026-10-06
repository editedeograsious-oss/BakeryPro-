import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ROLES = new Set(["manager","cashier","baker","storekeeper"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function getEnvKey(newName: string, legacyName: string) {
  const raw = Deno.env.get(newName);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.default) return String(parsed.default);
    } catch {}
  }
  return Deno.env.get(legacyName) ?? "";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Authentication required." }, 401);

  const token = authHeader.slice(7).trim();
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const publicKey = getEnvKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const adminKey = getEnvKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !publicKey || !adminKey) {
    return json({ error: "Staff account service is not configured." }, 503);
  }

  const userClient = createClient(url, publicKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const admin = createClient(url, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  const actor = authData?.user;
  if (authError || !actor) return json({ error: "Authentication required." }, 401);

  const { data: owner } = await admin
    .from("profiles")
    .select("role,active,disabled_at")
    .eq("id", actor.id)
    .single();

  if (!owner || owner.role !== "owner" || owner.active !== true || owner.disabled_at) {
    return json({ error: "Owner authorization required." }, 403);
  }

  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const fullName = String(body?.full_name ?? "").trim();
  const role = String(body?.role ?? "").trim();
  const initialPassword = String(body?.initial_password ?? "");

  if (!email || !fullName || !ALLOWED_ROLES.has(role)) {
    return json({ error: "Valid email, name and role are required." }, 400);
  }
  if (initialPassword.length < 10) {
    return json({ error: "Initial password must be at least 10 characters." }, 400);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: initialPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { ds_bakery_role: role },
  });

  if (createError || !created.user) {
    return json({ error: createError?.message ?? "Could not create staff account." }, 400);
  }

  const { data: branch } = await admin
    .from("branches")
    .select("id")
    .eq("is_default", true)
    .eq("active", true)
    .maybeSingle();

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    full_name: fullName,
    role,
    active: true,
    branch_id: branch?.id ?? null,
    require_password_reset: false,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: "Staff profile could not be created." }, 500);
  }

  await admin.from("audit_logs").insert({
    actor_id: actor.id,
    action: "create_staff_account",
    entity: "profile",
    entity_id: created.user.id,
    after_data: {
      email,
      full_name: fullName,
      role,
      branch_id: branch?.id ?? null,
    },
  });

  return json({ ok: true, user_id: created.user.id }, 201);
});