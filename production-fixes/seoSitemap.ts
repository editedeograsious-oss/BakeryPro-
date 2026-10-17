import type { MetadataRoute } from "next";
import { getPublicSeoOrigin } from "@/lib/seoSite";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getPublicSeoOrigin();
  if (!origin) return [];
  // Only public, guest-readable pages may be included here.
  // Add legal pages and product URLs only when reviewed and publicly live.
  return [{url: origin + "/shop",changeFrequency:"daily",priority:1}];
}
