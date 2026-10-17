import type { MetadataRoute } from "next";
import { getPublicSeoOrigin } from "@/lib/seoSite";

export default function robots(): MetadataRoute.Robots {
  const origin = getPublicSeoOrigin();
  if (!origin) {
    // Never index the staging domain. Private app data is additionally
    // protected by sign-in and database-level authorization.
    return { rules: [{userAgent:"*",disallow:"/"}] };
  }
  return {
    rules: [{
      userAgent: "*",
      allow: ["/shop"],
      disallow: [
        "/api/","/auth/","/login","/dashboard","/pos","/activity-log",
        "/payroll","/expenses","/cash-movements","/staff","/inventory",
        "/purchases","/purchase-orders","/supplier-accounts","/credit-book",
        "/production","/owner-commerce","/notifications","/customer-orders",
        "/stock-management","/shop/account","/first-login","/access-denied"
      ]
    }],
    sitemap: origin + "/sitemap.xml"
  };
}
