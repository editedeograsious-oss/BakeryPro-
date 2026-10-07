FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends unzip ca-certificates coreutils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY DS-Bakery-Master-v0.37.zip /tmp/ds-bakery.zip
COPY staging-v038/ /tmp/staging-v038/
COPY production-fixes/ /tmp/production-fixes/
RUN unzip -q /tmp/ds-bakery.zip -d /app \
  && mv /app/DS-Bakery-Master-v0.37 /app/site \
  && cat /tmp/staging-v038/part-*.b64 | tr -d '\n\r' | base64 -d > /tmp/v038-patch.zip \
  && test "$(sha256sum /tmp/v038-patch.zip | awk '{print $1}')" = "7571746afe8691782e113ceebaa02f9292da9e8a75cfa26106bffdcce137016a" \
  && unzip -qo /tmp/v038-patch.zip -d /app/site \
  && cp /tmp/production-fixes/launchReadiness.ts /app/site/lib/integration/launchReadiness.ts \
  && cp /tmp/production-fixes/dashboard-page.tsx /app/site/app/dashboard/page.tsx \
  && cp /tmp/production-fixes/system-status-page.tsx /app/site/app/system-status/page.tsx \
  && cp /tmp/production-fixes/LaunchValidationPanel.tsx /app/site/components/validation/LaunchValidationPanel.tsx \
  && cp /tmp/production-fixes/PurchaseOrderManager.tsx /app/site/components/operations/PurchaseOrderManager.tsx \
  && cp /tmp/production-fixes/PurchaseReceivingPanel.tsx /app/site/components/operations/PurchaseReceivingPanel.tsx \
  && cp /tmp/production-fixes/purchases-page.tsx /app/site/app/purchases/page.tsx \
  && cp /tmp/production-fixes/SupplierAccountsPanel.tsx /app/site/components/operations/SupplierAccountsPanel.tsx \
  && cp /tmp/production-fixes/SupplierPaymentCorrections.tsx /app/site/components/finance/SupplierPaymentCorrections.tsx \
  && cp /tmp/production-fixes/supplier-accounts-page.tsx /app/site/app/supplier-accounts/page.tsx \
  && cp /tmp/production-fixes/PayrollManager.tsx /app/site/components/finance/PayrollManager.tsx \
  && cp /tmp/production-fixes/payroll-page.tsx /app/site/app/payroll/page.tsx \
  && cp /tmp/production-fixes/ExpenseManager.tsx /app/site/components/operations/ExpenseManager.tsx \
  && cp /tmp/production-fixes/ExpenseCorrectionActions.tsx /app/site/components/finance/ExpenseCorrectionActions.tsx \
  && cp /tmp/production-fixes/expenses-page.tsx /app/site/app/expenses/page.tsx \
  && cp /tmp/production-fixes/RuntimeBanner.tsx /app/site/components/RuntimeBanner.tsx \
  && cp /tmp/production-fixes/login-page.tsx /app/site/app/login/page.tsx \
  && cp /tmp/production-fixes/GoLiveSetupManager.tsx /app/site/components/validation/GoLiveSetupManager.tsx \
  && cp /tmp/production-fixes/validate_project.mjs /app/site/scripts/validate_project.mjs \
  && mkdir -p /app/site/app/api/staff/create /app/site/app/api/staff/invite \
  && cp /tmp/production-fixes/staff-invite-route.ts /app/site/app/api/staff/invite/route.ts \
  && cp /tmp/production-fixes/staff-create-route.ts /app/site/app/api/staff/create/route.ts \
  && cp /tmp/production-fixes/staging-StaffAdminManager.tsx /app/site/components/admin/StaffAdminManager.tsx \
  && mkdir -p /app/site/app/opening-balances \
  && cp /tmp/production-fixes/OpeningBalancesManager.tsx /app/site/components/validation/OpeningBalancesManager.tsx \
  && cp /tmp/production-fixes/opening-balances-page.tsx /app/site/app/opening-balances/page.tsx \
  && cp /tmp/production-fixes/CustomerManager.tsx /app/site/components/service/CustomerManager.tsx \
  && cp /tmp/production-fixes/customers-page.tsx /app/site/app/customers/page.tsx \
  && cp /tmp/production-fixes/InventoryManager.tsx /app/site/components/core/InventoryManager.tsx \
  && cp /tmp/production-fixes/inventory-page.tsx /app/site/app/inventory/page.tsx \
  && cp /tmp/production-fixes/Sidebar.tsx /app/site/components/Sidebar.tsx \
  && cp /tmp/production-fixes/CreditBookManager.tsx /app/site/components/finance/CreditBookManager.tsx \
  && cp /tmp/production-fixes/CreditPaymentCorrections.tsx /app/site/components/finance/CreditPaymentCorrections.tsx \
  && cp /tmp/production-fixes/credit-book-page.tsx /app/site/app/credit-book/page.tsx \
  && rm -rf /tmp/ds-bakery.zip /tmp/v038-patch.zip /tmp/staging-v038 /tmp/production-fixes

WORKDIR /app/site

ARG NEXT_PUBLIC_SUPABASE_URL=https://kymadepeuqhcsjwbrgqq.supabase.co
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_EqTViHCuhpqCvWxCHN8FGQ_lDcXrY6O
ARG NEXT_PUBLIC_DEPLOYMENT_ENV=staging
ARG NEXT_PUBLIC_DEMO_MODE=false

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_DEPLOYMENT_ENV=$NEXT_PUBLIC_DEPLOYMENT_ENV
ENV NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE

RUN npm install
RUN npm audit --audit-level=moderate
RUN npm run build
RUN npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh","-c","npm run start -- -p ${PORT:-3000}"]
