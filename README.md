# Kestrel Forge — Digital Products Store & Portfolio Platformm

A full-stack digital products marketplace,  indie game hub, Android APK & Windows desktop software download center, and developer portfolio built with **React**, **TypeScript**, **Tailwind CSS**, **Express / Cloudflare Workers**, and **SQLite / Cloudflare D1**, integrated directly with the **GitHub Releases REST API** and **GitHub Actions**.

---

## Key Features

- **Digital Products Storefront**: Showcases Video Games, Android Applications (APK), Windows Desktop Software (EXE, MSI, ZIP), Web Applications, and Developer Tools.
- **GitHub Releases Integration**: Fetches release tags, release notes, publication dates, asset download URLs, file formats, and file sizes from `api.github.com` with TTL caching (`GITHUB_CACHE_TTL_MINUTES`), extension/pattern asset filtering, cold-start snapshot fallback (`data/releases-snapshot.json`), HMAC-SHA256 webhook sync (`POST /api/webhooks/github`), and manual admin refresh.
- **Dual Management Modes (Git Config + Admin Dashboard)**:
  - **Version-Controlled Config (`products.config.json`)**: Products synced from git config are marked `managed_by = 'config'`.
  - **Admin Dashboard (`/admin`)**: Products created or edited in the dashboard are marked `managed_by = 'dashboard'`. Reconciling config (`POST /api/admin/reconcile-config` or `scripts/sync-d1-from-config.ts`) inserts new config entries and updates `config`-owned items while preserving `dashboard`-owned edits.
- **Complete Catalog & Global Search**: Multi-criteria filtering by category, platform, operating system, product type (`downloadable`, `web`, `hybrid`), featured status, sorting (`newest`, `alpha`, `popular`, `updated`), pagination, and `⌘K` instant search modal.
- **Dedicated Product Detail Pages (`/product/:slug`)**: Full-screen screenshot lightbox viewer (RTL-aware), version selector across GitHub releases, system requirements, version history, share/copy link, external download confirmation modal, live web app launcher, and "Report a Problem" bug submissions.
- **Authenticated Admin Dashboard (`/admin`)**:
  - Server-side `bcryptjs` + signed `HttpOnly` JWT cookie authentication (`POST /api/auth/login`), login/message rate limiting, and in-dashboard password rotation (`POST /api/admin/change-password`).
  - Product CRUD manager with English & Arabic fields, publish visibility toggle, GitHub release asset filter rules, direct download asset editors, and image uploads (`POST /api/admin/upload`).
  - Live analytics dashboard distinguishing verified direct downloads (`direct_file`), external GitHub Release clicks (`github_release_click`), and Web App launches (`web_app_launch`) with breakdowns by product, platform, version, and file format—without collecting personal visitor data.
- **Bilingual English & Arabic (RTL)** + **Dark-First / Light Theme** + **Dynamic SEO** (`<title>`, meta, OpenGraph, Twitter Cards, canonical links, Schema.org JSON-LD, `/sitemap.xml`, and `/robots.txt`).

---

## Sample vs Production Mode

Initial seeding loads 6 demonstration products marked `isSampleDemo: true` (`managed_by = 'config'`):
- `stargazer-echoes-of-orion` points to `https://github.com/godotengine/godot` so you can verify live GitHub Releases API hydration immediately.
- Other demo entries use placeholder `https://github.com/kestrel-forge/*` URLs and serve sample manifest files via `/api/downloads/package/*` until replaced with your own repositories or compiled binaries in `/admin` or `products.config.json`.

---

## Architecture & Deployment Targets

### 1. Local / Node.js Runtime
- **Frontend**: React 19 + React Router + Vite + Tailwind CSS v4 (`@custom-variant dark`) + Motion + Lucide Icons.
- **Backend**: Express (`server.ts`, `server/routes.ts`, `server/auth.ts`, `server/github.ts`) + `better-sqlite3` (`data/marketplace.db`).

### 2. Cloudflare Workers + D1 + R2 Production Target
Production Cloudflare files are included at the repository root:
- `wrangler.toml`: Configures Worker entry (`worker/index.ts`), static SPA `ASSETS` (`./dist`), D1 binding (`DB`), and R2 bucket (`BUCKET`) for `/uploads/*`.
- `migrations/0001_init.sql`: Initial Cloudflare D1 SQLite schema and categories seed.
- `migrations/0002_seed_products.sql`: Idempotent initial product seed.
- `worker/index.ts`: Edge Worker API with full parity across public routes, GitHub Releases sync, raw-body HMAC webhook verification, PBKDF2/bcrypt-compatible JWT admin auth, analytics, and R2 image uploads.

#### Exact Cloudflare Deployment Steps

1. **Create D1 Database & R2 Bucket**:
   ```bash
   npx wrangler d1 create kestrel-forge-db
   npx wrangler r2 bucket create kestrel-forge-assets
   ```
2. **Update `wrangler.toml`**:
   Replace `database_id = "00000000-0000-0000-0000-000000000000"` with the real UUID printed by `wrangler d1 create`, and update `[vars] APP_URL` to your production domain.
3. **Configure Worker Secrets**:
   ```bash
   npx wrangler secret put JWT_SECRET
   npx wrangler secret put ADMIN_EMAIL
   # Generate bcrypt or SHA-256 hash:
   # node -e "console.log(require('bcryptjs').hashSync('YOUR_STRONG_PASSWORD', 10))"
   npx wrangler secret put ADMIN_PASSWORD_HASH
   npx wrangler secret put GITHUB_TOKEN
   npx wrangler secret put GITHUB_WEBHOOK_SECRET
   ```
4. **Apply D1 Migrations & Build/Deploy**:
   ```bash
   npm run build
   npx wrangler d1 migrations apply kestrel-forge-db --remote
   npx tsx scripts/sync-d1-from-config.ts
   npx wrangler d1 execute kestrel-forge-db --remote --file=data/d1-sync.sql
   npx wrangler deploy
   ```

---

## GitHub Actions Workflows & Required Secrets

| Workflow | Trigger | Purpose |
| :--- | :--- | :--- |
| `.github/workflows/ci.yml` | Push / PR to `main` | Runs `npm run lint`, `npx tsx scripts/validate-products.ts`, and `npm run build` |
| `.github/workflows/validate-products.yml` | Changes to `products.config.json` or assets | Validates JSON schema, unique IDs/slugs, URLs, and verifies referenced local images exist on disk |
| `.github/workflows/sync-releases.yml` | Every 6 hours (`cron`) or `workflow_dispatch` | Runs `scripts/sync-releases.ts` and commits `data/releases-snapshot.json` only when changed |
| `.github/workflows/deploy.yml` | Push to `main` or `workflow_dispatch` | Runs checks, builds `dist/`, applies D1 migrations + `d1-sync.sql`, and deploys via `cloudflare/wrangler-action@v3` |

### Required GitHub Repository Secrets
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare Account ID
- `CLOUDFLARE_API_TOKEN`: Cloudflare API Token with Workers Scripts, Workers R2 Storage, and D1 Edit permissions
- `GITHUB_TOKEN`: Automatically provided by GitHub Actions (used by `sync-releases.yml`)

---

## Local Development

```bash
npm install
npm run dev
```

Runs on `http://localhost:3000`.
