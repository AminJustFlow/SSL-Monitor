# Just Flow SSL Monitor

A production-oriented internal dashboard for monitoring public and optional origin TLS certificates, HTTP availability, history, and email alerts for a small agency portfolio.

## Features and architecture

Next.js App Router renders the authenticated admin UI and server actions. PostgreSQL and Prisma store users, sites, checks, alerts, and job runs. Small independent modules perform native Node TLS inspection, HTTP checks, status calculation, alert evaluation, and email delivery. A dedicated Docker scheduler performs daily checks with bounded concurrency, retries, catch-up after downtime, persistent alert delivery, and overlap protection.

Key features include Argon2 password hashing, signed HttpOnly sessions, CSRF tokens, login throttling, SSRF/DNS protections, approved TLS ports, public and Cloudflare-origin checks, redirect validation, pagination, alert deduplication, structured logs, Docker, PM2, Nginx, cron, and a public non-sensitive health endpoint.

## Local setup

Requirements: Node.js 22+, npm, PostgreSQL 15+ (or Docker).

```bash
cp .env.example .env
# Set DATABASE_URL, a 32+ character SESSION_SECRET, and initial admin values.
npm install
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000`. There is no registration page. To create or update the first administrator, set `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` (12+ characters), and `INITIAL_ADMIN_NAME`, then rerun `npm run db:seed`.

## Environment

All entries are documented in `.env.example`. Required values are `DATABASE_URL` and a 32+ character `SESSION_SECRET`. Seed additionally requires `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD`. SMTP requires `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, and optional credentials. Operational controls include `MONITOR_CONCURRENCY`, timeouts, `ALLOWED_TLS_PORTS`, timezone, retention, recipients, and thresholds.

Private/loopback/link-local/metadata destinations are blocked. `ALLOW_PRIVATE_ORIGIN_HOSTS=true` relaxes this only for explicitly configured origin checks; public URLs remain restricted. Use it only for a trusted internal origin. DNS is checked before every TLS request and every HTTP redirect.

## Database and monitoring

```bash
npm run db:migrate
npm run db:seed
npm run monitor:all
npm run monitor:website -- --id WEBSITE_ID
```

The all-sites command fails nonzero only for job-level failures. Per-site failures produce a partial/failed run record without aborting other sites. A PostgreSQL advisory lock prevents overlap.

Docker Compose starts the `scheduler` service automatically. By default it runs at 07:00 in `MONITORING_TIMEZONE`, catches up when restarted later the same day, and retries partial or failed runs after 15 and 60 minutes. `DAILY_MONITORING_ENABLED=false` disables daily checks while preserving the scheduler heartbeat and alert delivery queue. The cron sample is retained only for legacy non-Docker deployments.

History retention is configured but should be enforced by an operations cleanup command or database maintenance policy in this MVP.

## SMTP

Set Resend or SMTP variables and use Settings → Send test notification. Passwords remain environment-only and are neither returned nor logged. Failed deliveries are persisted and retried after 5 minutes, 30 minutes, 2 hours, and 6 hours. Threshold alerts are sent once per certificate and threshold; unresolved expired, invalid, or unavailable states may remind once per day. A later expiration paired with a new fingerprint produces a renewal-confirmed alert.

## Cloudflare certificates

A normal check of a Cloudflare-proxied domain sees Cloudflare's managed edge certificate—not necessarily the origin server certificate. To inspect the actionable origin certificate, enable origin checking, set the origin IP/hostname as **Origin connection host**, and the public website hostname as **Origin SNI hostname**. The checker connects to the former while sending the latter as SNI. It trusts both public certificate authorities and the official Cloudflare Origin CA RSA/ECC roots while continuing to validate the hostname and validity period.

Public/edge and origin results are stored as independent `CertificateCheck` rows. Each row preserves the certificate's exact UTC `validFrom` and `expiresAt` timestamps, full-days-remaining using floor rounding, exact remaining milliseconds, resolved peer IP, TCP destination and port, SNI hostname, hostname validation, chain authorization, and fingerprint. The details page never substitutes one certificate for the other and clearly marks an unconfigured or unchecked origin.

For an origin behind a proxy/CDN, configure:

- **Connection type**: Cloudflare or another CDN.
- **Enable origin certificate monitoring**.
- **Origin connection host or IP**: the real origin destination; this is never guessed from public DNS.
- **Origin TLS port**: normally 443 and restricted by `ALLOWED_TLS_PORTS`.
- **Origin SNI hostname**: normally the public hostname.

Use **Test origin connection** before saving. It performs a real TLS handshake to the origin destination using the separate SNI hostname and reports the returned certificate without changing DNS or Cloudflare settings. Private origin ranges remain blocked unless `ALLOW_PRIVATE_ORIGIN_HOSTS=true` is intentionally set. Different edge and origin expirations are informational and expected. For proxied sites, expiry warnings and renewal confirmation use the origin; the edge still alerts if it becomes invalid, unavailable, or expired.

After upgrading an existing installation, apply the additive backward-compatible migration before restarting:

```bash
npm run db:migrate
npm run build
sudo systemctl restart ssl-monitor
```

## Tests and quality

```bash
npm test
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... npm run test:e2e
```

The end-to-end suite requires a migrated, seeded test database and skips safely without credentials. External TLS, HTTP, and SMTP should be mocked or pointed at controlled test services in CI.

## Docker deployment

```bash
cp .env.example .env
# Edit secrets and set POSTGRES_PASSWORD.
docker compose build
docker compose up -d db
docker compose run --rm app npx prisma migrate deploy
docker compose run --rm app npx tsx prisma/seed.ts
docker compose up -d
curl http://localhost:3000/api/health
docker compose ps scheduler
```

Back up with `docker compose exec -T db pg_dump -U sslmonitor -Fc sslmonitor > sslmonitor.dump`. Restore into an empty database with `pg_restore -U sslmonitor -d sslmonitor --clean --if-exists sslmonitor.dump`.

For upgrades, back up, pull/copy the new release, build, run `prisma migrate deploy`, and restart. For rollback, retain the previous image/source release and database backup; restore the backup if a migration is incompatible, then start the prior image.

## Lightsail and EC2

Provision Ubuntu, attach a static IP, allow inbound 22/80/443, install Docker and the Compose plugin, clone/copy the project to `/opt/ssl-monitor`, create `.env`, then use the Docker commands above. On EC2, use an appropriately scoped security group and an encrypted EBS volume; on Lightsail, use its firewall and snapshot schedule. Keep PostgreSQL private. Configure DNS, install Nginx using `docker/nginx.conf`, then use Certbot (`certbot --nginx -d your-host`) for dashboard HTTPS. Schedule database dumps and Lightsail snapshots or EBS snapshots.

For non-Docker operation, install Node/PostgreSQL, run install/build/migrations/seed, then `npx pm2 start ecosystem.config.cjs && npx pm2 save && npx pm2 startup`.

## Troubleshooting

- Health 503: verify `DATABASE_URL`, PostgreSQL readiness, and migrations.
- Login failure: rerun seed; wait 15 minutes after five failed attempts.
- TLS `BLOCKED_OR_DNS`: confirm DNS and SSRF policy; do not weaken public checks.
- Origin unavailable: allow monitor traffic at the origin or disable direct origin checking.
- No mail: verify Settings reports SMTP configured and inspect structured logs without exposing credentials.
- Scheduler is stale: inspect `docker compose logs scheduler`, verify migrations and database connectivity, then check `/api/health` for heartbeat and run freshness.
- Failed email deliveries: confirm the provider configuration and default recipients; the dashboard reports alerts that exhausted all five attempts.

## Security and limitations

Deploy only behind HTTPS, rotate session/SMTP/database credentials, restrict the admin network where possible, monitor logs, and keep dependencies patched. The in-process login limiter is per application instance; multi-instance deployments should replace it with Redis or a database limiter. Manual checks currently complete in the server action, so aggressive timeouts are important. Alert events are deduplicated permanently per certificate fingerprint and event. History retention requires an external cleanup policy. DNS rebinding risk is reduced by validation, but Node's underlying connection can resolve again; high-assurance deployments should use an egress firewall or a pinned-address HTTP agent. The app does not automate certificate renewal.

build process

cd /opt/ssl-monitor
git pull

npm ci
npm run db:seed
npm test
npm run typecheck
npm run build
sudo systemctl restart ssl-monitor
