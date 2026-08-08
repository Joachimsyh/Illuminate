# Luma AutoApply

Hackathon MVP that **auto-applies you to public Luma events** without a paid Luma API key.

- LinkedIn OAuth (or instant **Demo Login**)
- Scrapes `https://lu.ma/<event-id>` with Cheerio (`__NEXT_DATA__` + form fields + CSRF)
- Server-side `POST /api/apply` fills + submits registration
- Animated Next.js 14 UI (Framer Motion)
- Prisma + **PostgreSQL** for users, OAuth tokens, application history
- Optional agent worker that auto-applies hourly
- **Docker / Compose** production deploy

## Quick start (local)

```bash
# 1) Start Postgres
docker compose up -d db
# or: npm run db:up

# 2) App
cp .env.example .env   # if needed
npm install
npx prisma db push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → **Enter demo dashboard**.

> Prefer SQLite offline? Copy `prisma/schema.sqlite.prisma` over `prisma/schema.prisma`, set `DATABASE_URL="file:./dev.db"`, then `npx prisma db push`.

## Docker (recommended deploy)

```bash
cp .env.docker.example .env.docker
# edit NEXTAUTH_SECRET (and LinkedIn keys if you have them)

# If builds fail with SSL / certificate errors (corporate proxy / AV):
#   set SSL_NO_VERIFY=1 in .env.docker  (Windows: $env:SSL_NO_VERIFY="1")

docker compose up --build -d
# or: npm run docker:up
```

- App: [http://localhost:3000](http://localhost:3000)
- Health: [http://localhost:3000/api/health](http://localhost:3000/api/health)
- Logs: `npm run docker:logs`
- Stop: `npm run docker:down`

### With background agent

```bash
docker compose --profile agent up --build -d
# or: npm run docker:agent
```

### Compose services

| Service | Description |
|---------|-------------|
| `db` | Postgres 16 |
| `web` | Next.js standalone (`output: "standalone"`) |
| `agent` | Hourly auto-apply worker (profile `agent`) |

On boot the container runs `prisma db push`, then starts the app.

### Useful Docker commands

```bash
docker compose ps
docker compose logs -f web
docker compose exec web node -e "console.log('ok')"
docker compose build --no-cache web
```

## LinkedIn OAuth (optional)

1. Create an app at [LinkedIn Developers](https://www.linkedin.com/developers/apps)
2. Add redirect URL: `http://localhost:3000/api/auth/callback/linkedin` (and your prod URL)
3. Request **Sign In with LinkedIn using OpenID Connect**
4. Set in `.env` / `.env.docker`:

```env
LINKEDIN_CLIENT_ID=your_client_id
LINKEDIN_CLIENT_SECRET=your_client_secret
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=long-random-string
DEMO_MODE=false
```

## How auto-apply works

1. `GET https://lu.ma/<event-id>` (server-side)
2. Parse `#__NEXT_DATA__` + HTML form inputs with Cheerio
3. Extract title, datetime, registration questions, CSRF, submit endpoint
4. Map user profile → form answers
5. `POST` to Luma register endpoint with CSRF header
6. Persist result in Postgres and notify in the UI

> **Hackathon note:** Live Luma registration often needs a Luma browser session cookie. When upstream returns 401/403, `LUMA_DEMO_SUBMIT=true` (default) records a successful **demo** application so the MVP is demoable end-to-end.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js |
| `npm run build` / `npm start` | Production (non-Docker) |
| `npm run db:up` | Start Postgres only |
| `npm run setup` | `prisma db push` |
| `npm run agent` | Agent loop |
| `npm run docker:up` | Build & run full stack |
| `npm run docker:agent` | Full stack + agent |
| `npm run docker:logs` | Tail web logs |
| `npm run docker:down` | Stop stack |

## Project structure

```
Dockerfile                 # multi-stage Next standalone + Prisma
docker-compose.yml         # db + web (+ agent profile)
.env.docker.example
fly.toml / railway.toml    # optional PaaS configs
.github/workflows/docker.yml
scripts/docker-entrypoint.js
src/
  app/
    login/ dashboard/ events/
    api/ apply/ events/ agent/ health/
  lib/  auth.ts  luma-scraper.ts  auto-apply.ts  agent.ts
prisma/schema.prisma       # PostgreSQL
prisma/schema.sqlite.prisma
```

## API

### `GET /api/health`

Liveness + DB check for Docker / Fly / Railway.

### `POST /api/apply`

```json
{ "eventId": "monad-blitz", "answers": { "company": "Acme" } }
```

### `GET /api/events?q=ai` · `GET /api/events/:id` · `POST /api/agent`

See source under `src/app/api/`.

## Deploy targets

### Docker Compose (VPS / laptop)

```bash
cp .env.docker.example .env.docker
# set strong NEXTAUTH_SECRET + public NEXTAUTH_URL
docker compose up --build -d
```

Put a reverse proxy (Caddy / Nginx) in front for TLS.

### Fly.io

```bash
fly launch --no-deploy
fly postgres create
fly secrets set NEXTAUTH_SECRET=... NEXTAUTH_URL=https://YOUR_APP.fly.dev DATABASE_URL=...
fly deploy
```

### Railway

1. New project → deploy from repo (uses `railway.toml` + Dockerfile)
2. Add Postgres plugin → `DATABASE_URL` is injected
3. Set `NEXTAUTH_URL`, `NEXTAUTH_SECRET`

### Vercel

Works for the web app with a hosted Postgres (`DATABASE_URL`). Set env vars in the dashboard. Run the **agent** separately (`npm run agent` on a worker / cron) — Vercel serverless is not ideal for the long-lived agent loop.

## Security

- Never stores LinkedIn passwords — OAuth tokens only
- Scraping and form submit run **server-side only**
- CSRF tokens from the Luma page are forwarded on submit
- Middleware protects `/dashboard` and `/events`
- Change `NEXTAUTH_SECRET` before any public deploy

## Hackathon demo path

1. `docker compose up --build` **or** `npm run db:up && npm run dev`
2. Demo login → Dashboard
3. Events → **Monad Blitz Hackathon**
4. **Apply Automatically**
5. Toggle **Agent mode** → **Run agent now**

## LinkedIn Scraper (Bright Data)

A small helper script for scraping LinkedIn profiles using Bright Data lives at `scripts/linkedin_scrape.sh` on the `scraper` branch. It wraps a Bright Data Datasets API call and prints the JSON response to stdout.

Usage:

```bash
# set your Bright Data API key in the environment
export BRIGHTDATA_API_KEY="your_api_key"

# Provide a JSON file shaped like:
# {"input":[{"url":"https://www.linkedin.com/in/username/"}], "limit_per_input":10}
./scripts/linkedin_scrape.sh urls.json

# Or pass comma-separated LinkedIn profile URLs directly:
./scripts/linkedin_scrape.sh "https://www.linkedin.com/in/elad-moshe-05a90413/,https://www.linkedin.com/in/jonathan-myrvik-3baa01109"
```

Notes:
- Keep your Bright Data API key secret; never commit it to source control.
- The script posts to Bright Data dataset id `gd_l1viktl72bvl7bjuj0` and sets `limit_per_input` to `10` by default.
- The command prints results to stdout; redirect to a file to save, e.g. `./scripts/linkedin_scrape.sh urls.json > output.json`.

### Keep original posts only

Bright Data returns a mixed `activity` feed (called `posts` in older exports), including likes, comments, shares, and
reposts. Filter a saved response before consuming it as authored posts:

```bash
python3 scripts/filter_reposts.py linkedin_output.json linkedin_posts_only.json
```

The filter retains activity marked `Posted by …` (and entries with no interaction marker) and removes activity marked
liked, commented, shared, reposted, or reshared. It accepts both a normal JSON array and consecutive JSON objects
produced by some shell redirects.

