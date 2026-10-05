FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends unzip ca-certificates coreutils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY DS-Bakery-Master-v0.37.zip /tmp/ds-bakery.zip
COPY staging-v038/ /tmp/staging-v038/
RUN unzip -q /tmp/ds-bakery.zip -d /app \
  && mv /app/DS-Bakery-Master-v0.37 /app/site \
  && cat /tmp/staging-v038/part-*.b64 | tr -d '\n\r' | base64 -d > /tmp/v038-patch.zip \
  && test "$(sha256sum /tmp/v038-patch.zip | awk '{print $1}')" = "7571746afe8691782e113ceebaa02f9292da9e8a75cfa26106bffdcce137016a" \
  && unzip -qo /tmp/v038-patch.zip -d /app/site \
  && rm -rf /tmp/ds-bakery.zip /tmp/v038-patch.zip /tmp/staging-v038

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
