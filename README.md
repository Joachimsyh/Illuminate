# Illuminate

Hackathon MVP that helps you find and apply to public Luma events.

- LinkedIn OAuth or email/password auth
- Scrapes public `luma.com` city/topic pages into PostgreSQL
- Server-side apply when Luma allows it; **browser assist** (Playwright) autofills and lets you solve Cloudflare captcha
- Next.js 14 UI + optional agent worker
- **PostgreSQL via `pg`** (no Prisma)

## Quick start (local)

```bash
# 1) Start Postgres + apply schema
npm run setup
# or: npm run db:up && npm run db:schema

# 2) Env
cp .env.example .env
# DATABASE_URL=postgresql://luma:luma@127.0.0.1:5434/luma_autoapply

# 3) App
npm install
npm run playwright:install   # Chromium for browser-assisted apply
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> Port **5434** avoids clashes with a local Windows Postgres that often binds 5432/5433.

## Docker

```bash
cp .env.docker.example .env.docker
docker compose up --build -d
```

On boot the container waits for Postgres, applies `sql/schema.sql`, then starts the app.
