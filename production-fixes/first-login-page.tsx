import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {staffHomePath} from "@/lib/staffHome";
import FirstLoginForm from "@/components/admin/FirstLoginForm";
export const dynamic="force-dynamic";
export default async function FirstLoginPage(){
 const sb=await createClient();
 const {data:{user}}=await sb.auth.getUser();
 if(!user)redirect("/login");
 const {data:profile,error}=await sb.from("profiles")
  .select("role,active,disabled_at,require_password_reset").eq("id",user.id).maybeSingle();
 if(error||!profile||!profile.active||profile.disabled_at)redirect("/access-denied?reason=staff");
 if(!profile.require_password_reset)redirect(staffHomePath(profile.role));
 return <FirstLoginForm/>;
}