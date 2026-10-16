import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/auth";
import { can, type Permission, type StaffRole } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export async function requirePermission(permission: Permission, allowedRoles?: StaffRole[]) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/access-denied?reason=staff");
  const role = staff.profile.role as StaffRole;
  if (allowedRoles && !allowedRoles.includes(role)) redirect("/access-denied?reason=role");
  if (staff.demo) {
    if (!can(role, permission)) redirect("/access-denied?reason=permission");
    return staff;
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_has_permission", { p_permission_key: permission });
  if (error || !data) redirect("/access-denied?reason=permission");
  return staff;
}

export async function hasPermission(permission: Permission) {
  const staff = await getCurrentStaff();
  if (!staff) return false;
  const role = staff.profile.role as StaffRole;
  if (staff.demo) return can(role, permission);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_has_permission", { p_permission_key: permission });
  return !error && Boolean(data);
}
