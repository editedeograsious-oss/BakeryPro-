import Link from "next/link";
import { deploymentEnvironment, isDemoMode } from "@/lib/runtime";

export default function RuntimeBanner() {
  const demo = isDemoMode();
  const env=deploymentEnvironment();

  const text = demo
    ? "DEMO MODE — pages may show sample data until Supabase is configured."
    : env==="staging"
      ? "STAGING — connected to the DS Bakery staging database. Test data may be visible."
      : "PRODUCTION — connected to DS Bakery data. Check System status for live-operation readiness.";

  const background = demo ? "#fff4d7" : env==="staging" ? "#e8f1ff" : "#e6f4ea";
  const color = demo ? "#7c5d13" : env==="staging" ? "#28588e" : "#245f3b";

  return (
    <div
      style={{
        padding: "9px 14px",
        borderBottom: "1px solid var(--line)",
        background,
        color,
        fontSize: 12,
        fontWeight: 800,
        display: "flex",
        justifyContent: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      <span>{text}</span>
      <Link href="/system-status" style={{ textDecoration: "underline" }}>
        System status
      </Link>
    </div>
  );
}
