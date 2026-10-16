import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/runtime";
import type { StaffRole } from "@/lib/permissions";

export async function getCurrentStaff() {
  if (isDemoMode()) {
    return {
      demo: true,
      user: null,
      profile: {
        id: "demo-owner",
        full_name: "Demo Owner",
        role: "owner" as StaffRole,
        active: true,
        session_version: 1,
        disabled_at: null,
      },
    };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile, error } = await supabase.from("profiles")
    .select("id,full_name,role,active,session_version,disabled_at")
    .eq("id", user.id).single();
  if (error || !profile || !profile.active || profile.disabled_at) return null;
  return { demo: false, user, profile };
}

export async function requireStaff(allowedRoles?: StaffRole[]) {
  const staff = await getCurrentStaff();
  // Never bounce an authenticated but unrecognized account between login/dashboard.
  if (!staff) redirect("/access-denied?reason=staff");
  if (allowedRoles && !allowedRoles.includes(staff.profile.role as StaffRole)) {
    redirect("/access-denied?reason=role");
  }
  return staff;
}
