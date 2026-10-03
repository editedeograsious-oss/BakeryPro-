FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends unzip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY DS-Bakery-Master-v0.36.zip /tmp/ds-bakery.zip
RUN unzip -q /tmp/ds-bakery.zip -d /app \
  && mv /app/DS-Bakery-Master-v0.36 /app/site \
  && rm /tmp/ds-bakery.zip

WORKDIR /app/site

# Staging-only public browser configuration.
# No service-role key or database password is embedded here.
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
