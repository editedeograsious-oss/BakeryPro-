import { createClient } from "npm:@supabase/supabase-js@2";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: {"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
  });
}
function getEnvKey(newName: string, legacyName: string) {
  const raw = Deno.env.get(newName);
  if (raw) {
    try { const parsed = JSON.parse(raw); if (parsed?.default) return String(parsed.default); }
    catch { /* Older deployments store a plain key. */ }
    return raw;
  }
  return Deno.env.get(legacyName) ?? "";
}
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({error:"Method not allowed."},405);
  const authorization=req.headers.get("authorization")??"";
  if(!authorization.startsWith("Bearer "))return json({error:"Sign in first."},401);
  const token=authorization.substring(7).trim();
  const url=Deno.env.get("SUPABASE_URL")??"";
  const anon=getEnvKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");
  const secret=getEnvKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!anon||!secret)return json({error:"Staging staff-password service unavailable."},503);

  const userClient=createClient(url,anon,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
  });
  const admin=createClient(url,secret,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
  });
  const {data:{user},error:authError}=await userClient.auth.getUser(token);
  if(authError||!user?.email)return json({error:"Authentication required."},401);

  const {data:profile,error:profileError}=await admin.from("profiles")
    .select("role,active,disabled_at,require_password_reset")
    .eq("id",user.id).maybeSingle();
  if(profileError||!profile||!profile.active||profile.disabled_at){
    return json({error:"Account inactive or unavailable."},403);
  }
  if(profile.role==="owner"||profile.require_password_reset!==true){
    return json({error:"No mandatory first-login password change is pending."},403);
  }

  const body=await req.json().catch(()=>null);
  const currentPassword=typeof body?.current_password==="string"?body.current_password:"";
  const newPassword=typeof body?.new_password==="string"?body.new_password:"";
  if(currentPassword.length<1||newPassword.length<12||newPassword.length>128||currentPassword===newPassword){
    return json({error:"Enter your temporary password and a different new password of 12–128 characters."},400);
  }

  // Verify the actual temporary/current password, not just an access token.
  const {data:verified,error:verifyError}=await userClient.auth.signInWithPassword({
    email:user.email,password:currentPassword
  });
  if(verifyError||verified.user?.id!==user.id){
    return json({error:"The current staff password is incorrect."},403);
  }
  // Only this server-side function has the service-role key. Never expose it to React.
  const {error:passwordError}=await admin.auth.admin.updateUserById(user.id,{password:newPassword});
  if(passwordError)return json({error:"Could not change password. Try again."},503);

  const {error:finishError}=await admin.rpc("ds_complete_first_login",{p_staff_id:user.id});
  if(finishError){
    // Password has changed. Keep pending status so staff cannot access business data.
    return json({error:"Password changed, but activation could not finish. Sign in using the new password and complete activation again."},503);
  }
  return json({ok:true,message:"Password changed. Sign in again using your new password."});
});
