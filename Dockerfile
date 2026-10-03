FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends unzip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY DS-Bakery-Master-v0.35.zip /tmp/ds-bakery.zip
RUN unzip -q /tmp/ds-bakery.zip -d /app \
  && mv /app/DS-Bakery-Master-v0.35 /app/site \
  && rm /tmp/ds-bakery.zip

WORKDIR /app/site

RUN npm install
RUN npm run build
RUN npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh","-c","npm run start -- -p ${PORT:-3000}"]
