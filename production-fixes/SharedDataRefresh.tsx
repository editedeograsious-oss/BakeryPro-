"use client";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type StaffRole = "owner" | "manager" | "cashier" | "baker" | "storekeeper";

// Realtime carries only safe module+revision metadata. Actual data is always
// re-read via its existing authenticated / RLS-protected server-side queries.
const routeModules: Record<string, readonly string[]> = {
  "/dashboard": ["sales", "orders", "inventory", "purchases", "production", "finance", "catalog", "staff"],
  "/reports": ["sales", "orders", "inventory", "purchases", "production", "finance"],
  "/pos": ["sales", "inventory", "catalog", "orders"],
  "/products": ["catalog", "inventory"],
  "/inventory": ["inventory", "catalog", "purchases", "production"],
  "/finished-goods": ["inventory", "production", "sales", "orders"],
  "/stock-management": ["inventory", "production", "catalog", "purchases"],
  "/stock-movements": ["inventory", "purchases", "production", "sales"],
  "/customer-orders": ["orders", "inventory", "sales", "production"],
  "/customers": ["orders", "sales", "finance"],
  "/production": ["production", "inventory", "orders", "catalog"],
  "/baker-tasks": ["production", "orders", "staff"],
  "/waste": ["production", "inventory"],
  "/purchases": ["purchases", "inventory", "finance"],
  "/purchase-orders": ["purchases", "inventory", "finance"],
  "/supplier-accounts": ["purchases", "finance"],
  "/credit-book": ["finance", "sales", "orders"],
  "/expenses": ["finance"],
  "/payroll": ["finance", "staff"],
  "/finance": ["finance", "sales", "orders", "purchases"],
  "/daily-closing": ["sales", "finance", "purchases", "inventory"],
  "/cash-movements": ["finance", "sales"],
  "/shifts": ["sales", "staff"],
  "/staff": ["staff"],
  "/permission-overrides": ["staff"],
  "/attendance": ["staff"],
  "/staff-schedule": ["staff"],
  "/recycle-bin": ["sales", "catalog", "orders", "inventory", "purchases", "production", "finance"],
};

export default function SharedDataRefresh({ role }: { role: StaffRole }) {
  const pathname = usePathname();
  const router = useRouter();
  const lastRefresh = useRef(0);
  useEffect(() => {
    if (!pathname) return;
    const client = createClient();
    const wanted = routeModules[pathname];
    let active = true;
    let dirty = false;
    let timer = 0;

    function flush() {
      if (!active || !dirty) return;
      if (document.visibilityState !== "visible") return;
      const focused = document.activeElement as HTMLElement | null;
      if (focused?.closest("input,textarea,select,[contenteditable='true']")) return;
      const delay = 1700 - (Date.now() - lastRefresh.current);
      if (delay > 0) {
        timer = window.setTimeout(flush, delay);
        return;
      }
      dirty = false;
      lastRefresh.current = Date.now();
      router.refresh();
    }
    function schedule(delay = 800) {
      dirty = true;
      if (timer !== 0) window.clearTimeout(timer);
      timer = window.setTimeout(flush, delay);
    }
    function wake() {
      if (document.visibilityState === "visible") schedule(0);
    }
    function regainFocus() {
      if (dirty) schedule(100);
    }
    function handleModule(module: string) {
      if (wanted && !wanted.includes(module)) return;
      // Client-owned lists such as the POS can fetch their current data without
      // waiting for a React Server Component re-render.
      window.dispatchEvent(new CustomEvent("ds-bakery:shared-change", { detail: { module } }));
      schedule();
    }

    const channel = client.channel("ds-module-sync-" + role + "-" + pathname)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "ds_sync_revision" },
        (payload) => handleModule(String((payload.new as { module?: string }).module ?? "")))
      .subscribe((status) => {
        // A reconnect can miss a change event: always read a fresh snapshot.
        if (status === "SUBSCRIBED") schedule(0);
      });

    const periodic = window.setInterval(() => schedule(0), 45000);
    document.addEventListener("visibilitychange", wake);
    document.addEventListener("focusout", regainFocus);
    window.addEventListener("online", wake);
    return () => {
      active = false;
      if (timer !== 0) window.clearTimeout(timer);
      window.clearInterval(periodic);
      document.removeEventListener("visibilitychange", wake);
      document.removeEventListener("focusout", regainFocus);
      window.removeEventListener("online", wake);
      void client.removeChannel(channel);
    };
  }, [pathname, role, router]);
  return null;
}
