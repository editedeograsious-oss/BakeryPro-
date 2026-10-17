# DS Bakery – Google Search and Mobile Store Publication Roadmap
*Prepared 17 October 2026 – staging-only readiness. No store listing has been submitted.*

## Public site and Google Search

**Blocker**: the customer shop was previously marked `noindex` and the Railway staging address has produced NXDOMAIN on a customer's mobile phone. A verified, functioning public HTTPS domain is needed before requesting indexing.

Staging now includes guarded Next.js `robots.ts`, `sitemap.ts`, and production-conditional shop metadata. Staging never becomes indexable; the sitemap only lists `/shop` once `NEXT_PUBLIC_DEPLOYMENT_ENV=production` and `PUBLIC_SITE_URL=https://<approved-public-host>/` are configured. Staff/admin routes are excluded, and DB authentication/RLS remains mandatory. Never promote production or change its lock without explicit approval.

Owner launch steps:
1. Select, purchase and connect a DS Bakery-owned domain. Verify DNS and HTTPS from multiple networks. Set `PUBLIC_SITE_URL` only after verification.
2. Approve and publish a working public customer website, products with descriptive names, images, accurate address and contact details, and genuine privacy/terms/contact pages.
3. Verify ownership of the exact domain in Google Search Console. Submit `https://<domain>/sitemap.xml` and request inspection/indexing of `https://<domain>/shop`.
4. Complete or claim the genuine DS Bakery Google Business Profile if eligible, with correct business hours/location and no invented ratings.
5. Monitor crawl, indexing, Core Web Vitals and mobile performance; indexing is not instant or guaranteed.

## Google Play and Apple App Store readiness

| Area | Current evidence | Release blocker |
|---|---|---|
| Android code | GitHub includes `BakeryPro_Android_APK_Project.zip` (~30 KB) | Need verify build source, Android package, signing, produce release .aab, test account/login |
| iOS code | No iOS project identified in the staging repository tree | Need a real iOS build, native-compatible features, Apple signing and TestFlight |
| Public support site | Customer shop exists but staging domain failed DNS from user phone | Need independently reachable production site and public support/privacy URLs |
| Account deletion | Customer sign-up exists; deletion flow is not verified in inspected customer account component | Implement and test in-app deletion and external web request flow before publication |
| Store accounts | Developer account ownership is unknown | Authorized adult/legal organization account holders must complete required identity and agreements |
| App listings | Not submitted | App name/icon, category, screenshots, app privacy/data safety, terms/contact, age rating and review demo account |
| Quality | Existing staging automated tests passed before this change | Build and perform real-device Android+iPhone tests, network failures, checkout and sign-in review |

Google Play fee: US$25 one-time. New **personal** accounts generally need 12 opted-in closed testers for 14 consecutive days before production application. Apple's Developer Program is US$99/year (local taxes/fees vary). Follow store policies for eligibility and verification; do not borrow identity or bypass age restrictions.

## Proposed store listing draft (to review)

**App name:** DS Bakery

**Short description:** Discover cakes and fresh baked treats from DS Bakery in Entebbe.

**Long description:** Browse DS Bakery's cakes and bakery products, explore available designs and prices, and request orders for pickup or delivery where offered. Create a customer account to manage your orders. Online payment features should only be advertised once implemented and verified.

**Suggested store screenshot subjects:** Shop home, cakes catalog, item detail, cart/order request, customer order history, notifications (only if delivered inside app). Use screenshots captured from the *working application*, not fabricated UI.

**Privacy and safety:** Draft and verify real data-handling, order history retention, account deletion and contact process before publishing public statements. Never list private employee screens in the consumer storefront.

## Suggested technical direction

Maintain **one shared secure Supabase backend** and customer-facing public shop for both mobile operating systems; package with a cross-platform native-compatible framework when its feasibility and app-store review requirements are confirmed. Keep CEO/staff administration separate from public customer app screens. Do not submit a minimal website wrapper as a substitute for a genuine iOS app.
