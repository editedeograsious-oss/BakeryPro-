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

# Staging build fixes for strict TypeScript checks.
RUN node -e "const fs=require('fs'); const p='app/page.tsx'; let s=fs.readFileSync(p,'utf8'); const old='const categories=[...new Set(catalog.map((p:any)=>p.category_name||\"Bakery Menu\"))];'; const neu='const categories:string[]=Array.from(new Set<string>((catalog as any[]).map((p:any)=>String(p.category_name||\"Bakery Menu\"))));'; if(!s.includes(old)) throw new Error('Expected category line not found'); fs.writeFileSync(p,s.replace(old,neu));"

RUN node -e "const fs=require('fs'); const p='lib/supabase/server.ts'; let s=fs.readFileSync(p,'utf8'); const old='setAll(cookiesToSet) {'; const neu='setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {'; if(!s.includes(old)) throw new Error('Expected setAll signature not found'); fs.writeFileSync(p,s.replace(old,neu));"

RUN node -e "const fs=require('fs'); const p='middleware.ts'; let s=fs.readFileSync(p,'utf8'); const old='setAll(cookiesToSet) {'; const neu='setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {'; if(!s.includes(old)) throw new Error('Expected middleware setAll signature not found'); fs.writeFileSync(p,s.replace(old,neu));"

RUN node -e "const fs=require('fs'); const p='package.json'; const j=JSON.parse(fs.readFileSync(p,'utf8')); j.overrides={...(j.overrides||{}),postcss:'8.5.28'}; fs.writeFileSync(p,JSON.stringify(j,null,2)+'\\n');"

RUN npm install
RUN npm audit --audit-level=moderate
RUN npm run build
RUN npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh","-c","npm run start -- -p ${PORT:-3000}"]
