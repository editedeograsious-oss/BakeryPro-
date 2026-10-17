'use client';

import { useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { staffHomePath } from "@/lib/staffHome";

function signInError(error: { code?: string; status?: number; name?: string }) {
  if (error.code === "invalid_credentials") {
    return process.env.NEXT_PUBLIC_DEPLOYMENT_ENV === "staging"
      ? "These credentials are not recognized by the STAGING login. Staging accounts are separate from Production. Ask the CEO to create this email under Staging → Staff & Roles, or reset the Staging password."
      : "The sign-in service did not accept these credentials. Use your DS Bakery staff email and password.";
  }
  if (error.code === "email_not_confirmed") {
    return "Confirm your staff email before signing in. Open the confirmation email sent to your inbox.";
  }
  if (error.status === 429 || error.code === "over_request_rate_limit") {
    return "Too many sign-in attempts. Wait a few minutes before trying again.";
  }
  if (error.name === "AuthRetryableFetchError" || !error.status) {
    return "Could not connect to the sign-in service. Check your connection and try again.";
  }
  if (error.status >= 500) {
    return "The sign-in service is temporarily unavailable. Try again shortly.";
  }
  return "The sign-in service could not complete this request. Contact the bakery administrator if this continues.";
}

export default function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);
  const [role, setRole] = useState("owner");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const liveMode = useMemo(() => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY), []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || resetBusy) return;
    setMessage("");
    if (!liveMode) {
      localStorage.setItem("dsb-demo-role", role);
      router.push("/dashboard");
      return;
    }

    // Read the submitted form so browser/password-manager autofill does not
    // depend on React change events. Preserve the password exactly as entered.
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get("email") ?? "").trim();
    const password = String(fields.get("password") ?? "");
    if (!email || !password) {
      setMessage("Enter your staff email and password before signing in.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(signInError(error));
        return;
      }
      if (!data.session) {
        setMessage("Sign-in did not create a session. Try again or contact the bakery administrator.");
        return;
      }
      // Ask the live staging profile for the staff member's active role. The
      // destination page independently enforces permissions on the server.
      const {data:staffProfile,error:profileError}=await supabase.from("profiles")
        .select("role,active,disabled_at").eq("id",data.user.id).maybeSingle();
      const defaultHome=(!profileError && staffProfile?.active && !staffProfile.disabled_at)
        ?staffHomePath(staffProfile.role):"/dashboard";
      const requested = params.get("next");
      let destination = defaultHome;
      if (requested?.startsWith("/")) {
        const next = new URL(requested, window.location.origin);
        if (next.origin === window.location.origin && !["/login","/access-denied"].includes(next.pathname)) {
          // Never send staff lacking Owner Dashboard access there just
          // because middleware carried an outdated redirect.
          destination=next.pathname==="/dashboard" && defaultHome!=="/dashboard"
            ? defaultHome
            : `${next.pathname}${next.search}${next.hash}`;
        }
      }
      // Reload with freshly saved auth cookies; never reuse the CEO session.
      window.location.assign(destination);
    } catch {
      setMessage("Could not complete sign-in. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function forgotPassword() {
    if (!liveMode) {
      setMessage("Password reset is available when connected to Supabase Auth.");
      return;
    }
    if (!formRef.current) return;
    const email = String(new FormData(formRef.current).get("email") ?? "").trim();
    if (!email) {
      setMessage("Enter your staff email first, then select Forgot Password.");
      return;
    }
    setResetBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      setMessage("If this email belongs to a staff account, a password reset link has been sent. Open the newest email from DS Bakery.");
    } catch {
      setMessage("Could not send the password reset email. Try again shortly.");
    } finally {
      setResetBusy(false);
    }
  }

  return <div className="auth-wrap">
    <form ref={formRef} className="auth-card" onSubmit={submit}>
      <div className="brand" style={{ marginBottom: 22 }}><img src="/ds-bakery-logo.svg" alt="DS Bakery" /><div><strong>DS Bakery</strong><small>Secure Staff Login</small></div></div>
      {process.env.NEXT_PUBLIC_DEPLOYMENT_ENV === "staging" && <p role="note" style={{margin:"0 0 18px",padding:10,border:"1px solid #d2a24a",borderRadius:8,fontSize:13}}><strong>STAGING TEST LOGIN.</strong> Staff accounts here are separate from Production. The CEO must create the staff email in this environment before it can sign in.</p>}
      <div className="field"><label htmlFor="staff-email">Email</label><input id="staff-email" name="email" type="email" autoComplete="username" required={liveMode} /></div>
      <div className="field"><label htmlFor="staff-password">Password</label><input id="staff-password" name="password" type="password" autoComplete="current-password" required={liveMode} /></div>
      {!liveMode && <div className="field"><label>Preview role</label><select value={role} onChange={event => setRole(event.target.value)}><option value="owner">CEO / Owner</option><option value="manager">General Manager</option><option value="cashier">Sales Team</option><option value="baker">Head Baker</option><option value="storekeeper">Stock Manager</option></select></div>}
      {message && <p role="status" aria-live="polite" style={{ color: "var(--brown)", fontSize: 12, lineHeight: 1.5 }}>{message}</p>}
      <button type="submit" disabled={loading || resetBusy} className="btn primary" style={{ width: "100%" }}>{loading ? "Signing in…" : liveMode ? "Sign In" : "Enter Demo System"}</button>
      {liveMode && <button type="button" className="btn secondary" disabled={resetBusy || loading} style={{ width: "100%", marginTop: 8 }} onClick={forgotPassword}>{resetBusy ? "Sending reset email…" : "Forgot Password"}</button>}
      <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{liveMode ? "Sign in with your active DS Bakery staff account." : "Cloud credentials are not configured, so this is running in demo-login mode."}</p>
    </form>
  </div>;
}
