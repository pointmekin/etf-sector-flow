# Production setup checklist

The code is deployable, but production requires accounts, secrets, DNS, and one
initial data run. Use only the VPS path documented here; Cloud Run is intentionally
not configured.

## Accounts and infrastructure

- [ ] Create a GitHub repository and push `main`.
- [ ] Create a Neon Postgres project and copy its pooled `DATABASE_URL` with SSL.
- [ ] Create a Twelve Data API key on a plan that permits adjusted daily history
      and the intended public use.
- [ ] Confirm State Street and Twelve Data terms permit publishing the derived
      metrics for your audience.
- [ ] Prepare a Linux VPS with Git, Docker Engine, Docker Compose v2, and Caddy
      (or an existing HTTPS reverse proxy). Start with at least 1 vCPU / 1 GB RAM.
- [ ] Create a Vercel project connected to the repository.
- [ ] Choose the public web and API domains and control their DNS records.

## Generate secrets

Generate a long, unique Basic Auth password. The same username/password pair must
be used by the analytics service, Vercel server functions, and GitHub Actions.
Do not prefix any secret with `VITE_`.

## Database

- [ ] Export `DATABASE_URL` locally and run `bun run db:migrate`.
- [ ] Confirm `GET /health` reports `"database": "ok"` after API deployment.

## VPS analytics service

- [ ] Clone the repository to `~/projects/etf-sector-flow` on the VPS.
- [ ] Copy `services/analytics/.env.example` to `services/analytics/.env` and set:
  - `DATABASE_URL`
  - `BASIC_AUTH_USERNAME`
  - `BASIC_AUTH_PASSWORD`
  - `TWELVE_DATA_API_KEY`
  - `APP_ENV=production`
  - `LOG_LEVEL=INFO`
  - `ALLOWED_ORIGINS=https://your-web-domain`
  - `PORT=8000`
- [ ] Run `docker compose up -d --build analytics`.
- [ ] Configure Caddy/Nginx from `deploy/Caddyfile.example`, replace the hostname,
      and point the API DNS record to the VPS.
- [ ] Verify port 8000 is bound only to `127.0.0.1`; expose only HTTPS ports 80/443.

## GitHub repository secrets

Configure these Actions secrets:

- [ ] `ANALYTICS_API_URL` — public HTTPS API base URL, without trailing slash.
- [ ] `JOB_BASIC_AUTH_USERNAME`
- [ ] `JOB_BASIC_AUTH_PASSWORD`
- [ ] `VPS_HOST`
- [ ] `VPS_USERNAME`
- [ ] `VPS_SSH_KEY`
- [ ] `VPS_SSH_KEY_PASSPHRASE` — omit only if the deployment key has none.

The deployment key should be limited to this VPS account. The VPS also needs read
access to the GitHub repository, usually through a separate read-only deploy key.

## Vercel

- [ ] Set the project root to `apps/web` and enable access to source files outside
      the root so the `packages/db` workspace dependency is included.
- [ ] Install with `cd ../.. && bun install --frozen-lockfile`; build with
      `bun run build` from `apps/web`. Vercel detects TanStack Start through Nitro.
- [ ] Set these server-only variables for Preview and Production:
  - `DATABASE_URL`
  - `ANALYTICS_API_URL`
  - `ANALYTICS_BASIC_AUTH_USERNAME`
  - `ANALYTICS_BASIC_AUTH_PASSWORD`
- [ ] Connect the production web domain and deploy `main`.

## First data run and release checks

- [ ] Trigger `POST /api/v1/jobs/daily-refresh` once with Basic Auth. The first run
      is the historical backfill and can take longer than a normal daily refresh.
- [ ] Check `GET /api/v1/jobs/latest`, API logs, and the dashboard source date.
- [ ] Verify all 11 sectors appear, suspected split/quality rows are not scored,
      and SPY adjusted prices cover the desired backtest period.
- [ ] Run a top-three DCA backtest and compare a few periods manually.
- [ ] Smoke-test `/`, `/sectors/XLK`, `/backtest`, `/methodology`, and public API
      routes from mobile and desktop browsers.
- [ ] Run the GitHub daily-refresh workflow manually, then confirm its weekday
      schedule is enabled (15:30 UTC / 22:30 Asia/Bangkok).
- [ ] Confirm `docker inspect` shows the 512 MB limit and Docker log options
      `max-size=10m`, `max-file=3`.
