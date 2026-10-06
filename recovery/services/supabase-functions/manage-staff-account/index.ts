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
    return json({ error: "Staff management service is not configured." }, 503);
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
  const action = String(body?.action ?? "").trim();
  const staffId = String(body?.staff_id ?? "").trim();
  const reason = String(body?.reason ?? "").trim();

  if (!staffId) return json({ error: "Staff account is required." }, 400);
  if (staffId === actor.id) return json({ error: "The active Owner account is protected." }, 400);

  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id,full_name,role,active,session_version")
    .eq("id", staffId)
    .single();

  if (targetError || !target) return json({ error: "Staff profile not found." }, 404);
  if (target.role === "owner") return json({ error: "CEO / Owner accounts are protected." }, 403);

  if (action === "update") {
    const fullName = String(body?.full_name ?? "").trim();
    const role = String(body?.role ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();

    if (!fullName || fullName.length > 120 || !ALLOWED_ROLES.has(role)) {
      return json({ error: "Valid staff name and role are required." }, 400);
    }

    let previousEmail = "";
    if (email) {
      const { data: existingAuth, error: existingAuthError } = await admin.auth.admin.getUserById(staffId);
      if (existingAuthError || !existingAuth?.user) return json({ error: "Could not load the staff login." }, 400);
      previousEmail = existingAuth.user.email ?? "";
      const { error: emailError } = await admin.auth.admin.updateUserById(staffId, {
        email,
        user_metadata: { ...(existingAuth.user.user_metadata ?? {}), full_name: fullName },
      });
      if (emailError) return json({ error: emailError.message }, 400);
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update({
        full_name: fullName,
        role,
        session_version: Number(target.session_version ?? 1) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", staffId);

    if (profileError) {
      if (email && previousEmail) {
        await admin.auth.admin.updateUserById(staffId, { email: previousEmail }).catch(() => {});
      }
      return json({ error: "Could not update staff profile." }, 500);
    }

    if (!email) {
      const { data: existingAuth } = await admin.auth.admin.getUserById(staffId);
      if (existingAuth?.user) {
        await admin.auth.admin.updateUserById(staffId, {
          user_metadata: { ...(existingAuth.user.user_metadata ?? {}), full_name: fullName },
        }).catch(() => {});
      }
    }

    await admin.from("audit_logs").insert({
      actor_id: actor.id,
      action: "edit_staff_account",
      entity: "profile",
      entity_id: staffId,
      before_data: {
        full_name: target.full_name,
        role: target.role,
      },
      after_data: {
        full_name: fullName,
        role,
        email_changed: Boolean(email),
        reason: reason || "Owner staff edit",
      },
    });

    return json({ ok: true, message: "Staff account updated." });
  }

  if (action === "remove") {
    if (!reason) return json({ error: "Removal reason is required." }, 400);
    if (!target.active) return json({ error: "Staff account is already removed." }, 400);

    const { error: removeError } = await admin
      .from("profiles")
      .update({
        active: false,
        disabled_at: new Date().toISOString(),
        disabled_by: actor.id,
        session_version: Number(target.session_version ?? 1) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", staffId);

    if (removeError) return json({ error: "Could not remove staff account." }, 500);

    await admin.from("audit_logs").insert({
      actor_id: actor.id,
      action: "remove_staff_account",
      entity: "profile",
      entity_id: staffId,
      before_data: { active: true, role: target.role, full_name: target.full_name },
      after_data: { active: false, reason },
    });

    return json({ ok: true, message: "Staff account removed. Login access has been revoked." });
  }

  if (action === "restore") {
    if (!reason) return json({ error: "Restore reason is required." }, 400);
    if (target.active) return json({ error: "Staff account is already active." }, 400);

    const { error: restoreError } = await admin
      .from("profiles")
      .update({
        active: true,
        disabled_at: null,
        disabled_by: null,
        session_version: Number(target.session_version ?? 1) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", staffId);

    if (restoreError) return json({ error: "Could not restore staff account." }, 500);

    await admin.from("audit_logs").insert({
      actor_id: actor.id,
      action: "restore_staff_account",
      entity: "profile",
      entity_id: staffId,
      before_data: { active: false, role: target.role, full_name: target.full_name },
      after_data: { active: true, reason },
    });

    return json({ ok: true, message: "Staff account restored." });
  }

  return json({ error: "Unknown staff action." }, 400);
});