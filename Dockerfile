FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY dsb_v132_slim.zip /tmp/dsb.zip
RUN unzip -q /tmp/dsb.zip -d /app && rm /tmp/dsb.zip
WORKDIR /app/backend
RUN npm install --omit=dev
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm","start"]
