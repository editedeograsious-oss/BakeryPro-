"use client";
import {useState} from "react";
import {createClient} from "@/lib/supabase/client";
export default function FirstLoginForm(){
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(busy)return;
  const form=e.currentTarget;
  const fields=new FormData(form);
  const current_password=String(fields.get("current_password")??"");
  const new_password=String(fields.get("new_password")??"");
  const confirm=String(fields.get("confirm_password")??"");
  if(new_password.length<12||new_password.length>128){setMessage("Choose a password containing 12 to 128 characters.");return;}
  if(new_password!==confirm){setMessage("The new password and confirmation do not match.");return;}
  if(new_password===current_password){setMessage("Your new password must differ from the temporary password.");return;}
  setBusy(true);setMessage("");
  try {
   const sb=createClient();
   const {data:{session},error}=await sb.auth.getSession();
   if(error||!session)throw new Error("Your session has expired. Sign in again.");
   const res=await fetch("/api/staff/complete-first-login",{
    method:"POST",
    headers:{"content-type":"application/json","authorization":"Bearer "+session.access_token},
    body:JSON.stringify({current_password,new_password}),cache:"no-store"
   });
   const data=await res.json().catch(()=>({}));
   if(!res.ok||data.ok!==true)throw new Error(data.error??"Could not change password.");
   form.reset();
   // Remove the temporary authenticated session and require a fresh sign-in.
   await sb.auth.signOut();
   window.location.replace("/login?password_changed=1");
  }catch(error){form.reset();setMessage(error instanceof Error?error.message:"Could not change password.");setBusy(false);}
 }
 return <main className="auth-wrap"><form className="auth-card" onSubmit={submit}>
 <h1>Set your personal staff password</h1>
 <p>You are using an initial password. Business records stay locked until you replace it.</p>
 <div className="field"><label htmlFor="oldpw">Temporary / current password</label>
 <input id="oldpw" name="current_password" type="password" autoComplete="current-password" required/></div>
 <div className="field"><label htmlFor="newpw">New password (12–128 characters)</label>
 <input id="newpw" name="new_password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required/></div>
 <div className="field"><label htmlFor="confirmpw">Repeat new password</label>
 <input id="confirmpw" name="confirm_password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required/></div>
 {message&&<p role="alert">{message}</p>}
 <button className="btn primary" disabled={busy} type="submit">{busy?"Changing password…":"Change password and activate account"}</button>
 </form></main>;
}