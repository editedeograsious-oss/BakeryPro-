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
  && mkdir -p /app/site/app/api/staff/create \
  && mkdir -p /app/site/app/api/staff/invite \
  && cp /tmp/production-fixes/staff-invite-route.ts /app/site/app/api/staff/invite/route.ts \
  && cp /tmp/production-fixes/staff-create-route.ts /app/site/app/api/staff/create/route.ts \
  && cp /tmp/production-fixes/StaffAdminManager.tsx /app/site/components/admin/StaffAdminManager.tsx \
  && cp /tmp/production-fixes/CashMovementManager.tsx /app/site/components/operations/CashMovementManager.tsx \
  && cp /tmp/production-fixes/cash-movements-page.tsx /app/site/app/cash-movements/page.tsx \
  && cp /tmp/production-fixes/ExpenseCorrectionActions.tsx /app/site/components/finance/ExpenseCorrectionActions.tsx \
  && cp /tmp/production-fixes/SupplierPaymentCorrections.tsx /app/site/components/finance/SupplierPaymentCorrections.tsx \
  && cp /tmp/production-fixes/PurchaseOrderManager.tsx /app/site/components/operations/PurchaseOrderManager.tsx \
  && cp /tmp/production-fixes/PurchaseReceivingPanel.tsx /app/site/components/operations/PurchaseReceivingPanel.tsx \
  && cp /tmp/production-fixes/SupplierAccountsPanel.tsx /app/site/components/operations/SupplierAccountsPanel.tsx \
  && cp /tmp/production-fixes/RuntimeBanner.tsx /app/site/components/RuntimeBanner.tsx \
  && cp /tmp/production-fixes/login-page.tsx /app/site/app/login/page.tsx \
  && cp /tmp/production-fixes/CustomerOrderPaymentCorrections.tsx /app/site/components/finance/CustomerOrderPaymentCorrections.tsx \
  && cp /tmp/production-fixes/CustomerOrderManager.tsx /app/site/components/service/CustomerOrderManager.tsx \
  && cp /tmp/production-fixes/CreditBookManager.tsx /app/site/components/finance/CreditBookManager.tsx \
  && cp /tmp/production-fixes/CreditPaymentCorrections.tsx /app/site/components/finance/CreditPaymentCorrections.tsx \
  && cp /tmp/production-fixes/PayrollManager.tsx /app/site/components/finance/PayrollManager.tsx \
  && cp /tmp/production-fixes/payroll-page.tsx /app/site/app/payroll/page.tsx \
  && cp /tmp/production-fixes/ExpenseManager.tsx /app/site/components/operations/ExpenseManager.tsx \
  && cp /tmp/production-fixes/expenses-page.tsx /app/site/app/expenses/page.tsx \
  && cp /tmp/production-fixes/supplier-accounts-page.tsx /app/site/app/supplier-accounts/page.tsx \
  && cp /tmp/production-fixes/customer-orders-page.tsx /app/site/app/customer-orders/page.tsx \
  && cp /tmp/production-fixes/credit-book-page.tsx /app/site/app/credit-book/page.tsx \
  && cp /tmp/production-fixes/StockCountCorrections.tsx /app/site/components/finance/StockCountCorrections.tsx \
  && cp /tmp/production-fixes/WasteCorrections.tsx /app/site/components/finance/WasteCorrections.tsx \
  && cp /tmp/production-fixes/stock-movements-page.tsx /app/site/app/stock-movements/page.tsx \
  && cp /tmp/production-fixes/waste-page.tsx /app/site/app/waste/page.tsx \
  && cp /tmp/production-fixes/PosTerminal.tsx /app/site/components/core/PosTerminal.tsx \
  && cp /tmp/production-fixes/pos-page.tsx /app/site/app/pos/page.tsx \
  && cp /tmp/production-fixes/FinishedGoodsManager.tsx /app/site/components/operations/FinishedGoodsManager.tsx \
  && cp /tmp/production-fixes/DailyClosingPanel.tsx /app/site/components/core/DailyClosingPanel.tsx \
  && cp /tmp/production-fixes/LiveManagementReport.tsx /app/site/components/reports/LiveManagementReport.tsx \
  && cp /tmp/production-fixes/purchases-page.tsx /app/site/app/purchases/page.tsx \
  && cp /tmp/production-fixes/purchase-orders-page.tsx /app/site/app/purchase-orders/page.tsx \
  && cp /tmp/production-fixes/Sidebar.tsx /app/site/components/Sidebar.tsx \
  && cp /tmp/production-fixes/PublicShop.tsx /app/site/components/public/PublicShop.tsx \
  && cp /tmp/production-fixes/public-home-page.tsx /app/site/app/page.tsx \
  && cp /tmp/production-fixes/public-site-live.ts /app/site/lib/repositories/publicSiteLive.ts \
  && cp /tmp/production-fixes/ProductionManager.tsx /app/site/components/operations/ProductionManager.tsx \
  && cp /tmp/production-fixes/AttendanceManager.tsx /app/site/components/admin/AttendanceManager.tsx \
  && cp /tmp/production-fixes/ScheduleManager.tsx /app/site/components/admin/ScheduleManager.tsx \
  && cp /tmp/production-fixes/BranchManager.tsx /app/site/components/v038/BranchManager.tsx \
  && cp /tmp/production-fixes/PromotionManager.tsx /app/site/components/v038/PromotionManager.tsx \
  && find /app/site/app /app/site/components -type f -name '*.tsx' -exec sed -i 's#/ds-bakery-logo.svg#/ds-bakery-logo.png#g' {} + \
  && node /tmp/production-fixes/clean-mojibake.js /app/site \
  && cp /app/site/public/ds-bakery-logo.png /app/site/app/icon.png \
  && cp /app/site/public/ds-bakery-logo.png /app/site/app/apple-icon.png \
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
