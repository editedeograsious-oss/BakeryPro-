// Search crawlers must never index a staging environment or a Railway
// preview hostname. Only a reviewed public HTTPS domain in production can
// switch public shop indexing on.
export function getPublicSeoOrigin(): string | null {
  if (process.env.NEXT_PUBLIC_DEPLOYMENT_ENV !== "production") return null;
  const configured = process.env.PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured) return null;
  try {
    const url = new URL(configured);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash ||
        !host.includes(".") || host.includes("staging") ||
        host.endsWith(".railway.app") || host.endsWith(".localhost") ||
        host.endsWith(".test") || host.endsWith(".example") ||
        host==="example.com") return null;
    return url.origin;
  } catch {
    return null;
  }
}
