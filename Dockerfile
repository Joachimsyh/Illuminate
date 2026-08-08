# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# --- Install dependencies ---
FROM base AS deps
# docker compose build --build-arg SSL_NO_VERIFY=1  (for SSL-intercepting networks)
ARG SSL_NO_VERIFY=0
RUN if [ "$SSL_NO_VERIFY" = "1" ]; then npm config set strict-ssl false; fi
COPY package.json package-lock.json ./
COPY prisma ./prisma
# Docker/production uses Postgres schema
RUN cp prisma/schema.postgres.prisma prisma/schema.prisma
RUN if [ "$SSL_NO_VERIFY" = "1" ]; then export NODE_TLS_REJECT_UNAUTHORIZED=0; fi; \
    npm ci || npm install

# --- Build Next.js (standalone) ---
FROM base AS builder
ARG SSL_NO_VERIFY=0
RUN if [ "$SSL_NO_VERIFY" = "1" ]; then npm config set strict-ssl false; fi
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN cp prisma/schema.postgres.prisma prisma/schema.prisma
ENV NODE_ENV=production
ARG DATABASE_URL="postgresql://luma:luma@db:5432/luma_autoapply?schema=public"
ENV DATABASE_URL=$DATABASE_URL
RUN if [ "$SSL_NO_VERIFY" = "1" ]; then export NODE_TLS_REJECT_UNAUTHORIZED=0; fi; \
    ./node_modules/.bin/prisma generate
RUN if [ "$SSL_NO_VERIFY" = "1" ]; then export NODE_TLS_REJECT_UNAUTHORIZED=0; fi; \
    ./node_modules/.bin/next build

# --- Production image ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN cp prisma/schema.postgres.prisma prisma/schema.prisma
COPY scripts ./scripts
COPY src ./src
COPY tsconfig.json ./
COPY public ./public

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/node_modules ./node_modules

RUN mkdir -p /app/.next/cache \
  && chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["node", "scripts/docker-entrypoint.js"]
CMD ["node", "server.js"]
