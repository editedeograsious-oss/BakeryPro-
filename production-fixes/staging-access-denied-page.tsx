"use client";

import { useState } from "react";
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
      <p>Your session is connected, but this page could not verify your DS Bakery staff access.</p>
      <p>Use the CEO/Owner account for Stock Management. If you are using a different staff account, only the pages authorized for your role will open.</p>
      <p>Switch accounts to sign in again. If this keeps happening using your CEO account, the bakery administrator should check the Supabase staff profile and permissions.</p>
      <button className="btn primary" type="button" onClick={switchAccount} disabled={busy} style={{width:"100%"}}>
        {busy ? "Signing out…" : "Sign out and use another account"}
      </button>
      {message && <p role="status" style={{color:"var(--brown)"}}>{message}</p>}
    </section>
  </main>;
}
