# DS Bakery — Architecture & Launch Audit
Date: 17 October 2026 | Environment: Staging only
Status: **NOT APPROVED for public production cutover**

## Scope and method
Verified connected Railway deployment/build logs, GitHub patch tree, staged Supabase schema/functions/policies, live staging data, and read-only/rollback SQL security tests. A full device/browser accessibility and paid purchase test requires authorized humans and actual assets. Existing Node regression suite has 14 passing tests; it does not simulate a complete browser session.

## What was added to staging
1. Public `/shop`: catalogue, photos, Ugandan shilling prices, add/remove cart, pickup or delivery requests, order reference and completed-order verified review submission.
2. Owner-only `/owner-commerce`: photo upload (JPEG/PNG/WebP up to 5 MB), controlled product publishing and approval/rejection of customer reviews.
3. Supabase bucket `bakery-product-images` for publicly viewable catalog images; only an authenticated active Owner has INSERT/DELETE policies.
4. `products.online_available` flag, default false; only explicitly published active products appear in the public catalogue and may be ordered.
5. RLS-protected `product_reviews` table, one review per product per completed order, with an approved-only public read function.
6. Guarded public order RPC: blocks orders when the bakery's ordering status is disabled, enforces publication status, validates cart and future date, checks delivery setting and no longer overwrites existing customer contact records based only on an unverified phone number.
7. Staging SQL state source saved in `supabase/staging/20261017_customer_commerce_v039.sql`. **This embeds the staging Supabase URL and MUST NOT be applied blindly to Production.**

## Verified results
- Latest relevant Railway deployment: successful, one healthy instance; new routes compiled, TypeScript and npm audit passed; 14 automated regression tests passed.
- 5 existing SQL regression suites (purchases, opening balances, payroll controls, backup guards/evidence) passed with rollback in earlier staging audit.
- Negative-path tests: public cannot invoke Owner product publishing; unpublished products hidden; reviews without completed matching order rejected; empty cart, missing collection date and unpublished product checkout rejected.
- Staging contains a test product with no uploaded image, no published online products, and no customer reviews yet. Real customer checkout, real photo upload, moderation, and staff email notifications remain unverified in a signed-in browser.
- Existing Production database is locked, and no production cutover is authorized.

## Launch blockers (Priority 0)
| Area | Finding | Acceptance before opening public orders |
|---|---|---|
| Catalogue | No approved real product photos, real inventory publishing or verified product prices | Owner upload real photos; publish approved products; verify descriptions, ingredients/allergens, prices |
| Customer checkout | Direct anonymous RPC still lacks dedicated bot protection/rate limiting | Add server-side abuse controls and request limits; exercise intentional fake order cases |
| Delivery | Delivery charges and serviceable zones not quoted in checkout; no address/geocoding verification | Define service zones, fees, cut-off time and delivery quote; tell customers clearly before confirmation |
| Inventory | Public `online_available` flag is a management toggle, not proof of physical stock | Distinguish in-stock goods versus made-to-order; allocate/reserve or offer clear lead-time rules |
| Communication | No verified immediate order confirmation by SMS, WhatsApp or email on new shop route | Implement tested confirmation, status changes and failure fallback without exposing customer information |
| Staff creation | Staging Edge Functions `create-staff-account` and `invite-staff` absent | Deploy secure Owner-only functions and perform actual staff provisioning test |
| Privacy / Legal | No verified privacy, cookie, refund, cancellation or allergy policy pages for public checkout | Obtain business-approved wording and display clearly |
| Payments | Shop is request-only; no payment collection, settlement verification or reconciliation | Clearly state payment options or integrate a licensed payment provider and webhook verification |
| Production release | Production remains intentionally locked and the shop code is staging-only | Back up, review migrations, security-test, get explicit Owner cutover authorization |

## Next high priorities (Priority 1)
- Replace one-photo product field with a multiple-image gallery, accessible captions and thumbnail optimization.
- Implement customer order status page using secure proof of ownership; never allow order-number-only access to private information.
- Add reviews moderation guidelines, reporting and abuse controls; do not invent customer reviews.
- Add custom cake size, flavor, dietary/allergen notice, pickup date, inscriptions, deposit and design approval in one consistent customer flow.
- Add structured business hours and order cutoff, branch assignment, holiday closures and out-of-stock notifications.
- Link finance reports, waste tracking and recipe cost snapshots to confirmed customer-order lines.
- Improve site SEO: custom domain, Search Console, sitemap, robots, LocalBusiness/Product JSON-LD, stable product URLs, responsive/mobile testing.
- Privacy-conscious analytics, accessibility keyboard/screen reader checks, upload compression and performance budgets.

## Engineering & security improvements (Priority 1)
- Migrate from archived ZIP + Docker copy-patches toward a versioned editable Next.js source tree; use deterministic lockfile builds and environment-specific configuration.
- Audit exposed SECURITY DEFINER functions individually: legitimate public ordering/catalog functions must remain callable; staff functions must reauthorize inside the function. Do not revoke functions blindly.
- Enable compromised-password protection when appropriate and confirm the secret/service role key never reaches the client.
- Add repeatable browser E2E tests for actual Owner login/upload/publish, Guest order, fulfillment transitions, completed-order review, role separation, and input validation.
- Use monitored scheduled encrypted backups and prove a restoration to a fresh isolated test project.
- Verify Google Play version uses this cloud-connected app, not the older offline WebView APK source ZIP.

## Final acceptance criteria
- No Production change until Owner formally approves.
- Owner can add real images, publish and unpublish products.
- A customer sees approved real products, requests pickup/delivery, receives an order reference, and staff can fulfill with reliable stock/cost records.
- Only verified completed purchasers can review; only approved reviews are public.
- Anonymous, cashier and manager sessions cannot perform Owner-only changes.
- Automated build/regression passes AND manual mobile/browser E2E passes with no severe findings.
