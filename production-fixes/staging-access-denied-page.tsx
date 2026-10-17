"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AccessDenied() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function switchAccount() {
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      window.location.replace("/login");
    } catch {
      setMessage("Could not sign out. Close this tab, reopen DS Bakery, or try again.");
      setBusy(false);
    }
  }
  return <main className="auth-wrap">
    <section className="auth-card" style={{maxWidth:520}}>
      <h1 style={{fontFamily:"Georgia,serif",color:"var(--brown)"}}>Account access needs attention</h1>
      <p>{denied==="permission"
        ?"Your login succeeded, but your staff role does not permit the page you attempted to open."
        :denied==="role"?"Your account cannot open this staff-only page."
        :"Your session is connected, but an active DS Bakery staff profile could not be verified."}</p>
      <p>CEO/Owner, Sales Team, Bakers and Stock Managers have different workspaces. You do not need the CEO password to use your assigned role.</p>
      <p>You can go to My Account and use the sidebar for pages your role is allowed to open. If your assigned role appears incorrect, ask the CEO to review Staff & Roles.</p>
      <Link href="/my-account" className="btn secondary" style={{display:"block",textAlign:"center",marginBottom:12}}>Open my account and staff menu</Link>
      <button className="btn primary" type="button" onClick={switchAccount} disabled={busy} style={{width:"100%"}}>
        {busy ? "Signing out…" : "Sign out and use another account"}
      </button>
      {message && <p role="status" style={{color:"var(--brown)"}}>{message}</p>}
    </section>
  </main>;
}
