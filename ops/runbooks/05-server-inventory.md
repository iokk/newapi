# 05 — Server inventory (no secrets)

Host: `154.19.43.98`, Debian 13, kernel 6.12, 315 GB disk (51 GB used), 24 GB RAM,
no swap. Reached through Termark (see `01-access.md`).

## Application stack: `/opt/xseek-new-api`

| Path | What it is | Permissions |
| ---- | ---------- | ----------- |
| `compose.yaml` | Compose file for this stack | 600, root |
| `.env` | Secrets for this stack. **Do not print.** | 600, root |
| `compose.yaml.bak-20261104-161155` | Compose file before the 2026-11-04 edit | 600 |
| `.env.bak-rotate-20261024070120` | Copy of `.env` from an earlier secret rotation. Treat as sensitive; its contents were not reviewed. | 600 |
| `backup.sh` | Local dump and config archive | 700 |
| `backups/` | Local dumps (7-day retention) and config archives | 700 |
| `ops/` | Offsite backup scripts, age public key | 700 |
| `postgres/` | PostgreSQL 15 data directory (bind mount) | 700 |
| `redis/` | Redis data (cache, not business data) | owned by uid 999 |
| `data/` | Mounted at `/data` in the app container. Empty today. | 700 |
| `logs/` | Mounted at `/app/logs`. Application logs, 94 MB. | 755 |
| `image-manifest.json` | Record of the image that was deployed | 644 |

## Containers in this stack

| Container | Image | Port on host | Notes |
| --------- | ----- | ------------ | ----- |
| `xseek-new-api` | `calciumion/new-api:v1.0.0-rc.44` | `${BIND_ADDRESS}:3000` (`BIND_ADDRESS=0.0.0.0` in `.env`) | The application. Healthcheck on `/api/status`. |
| `xseek-new-api-postgres` | `postgres:15-alpine` | none | Database `newapi`, user `newapi` |
| `xseek-new-api-redis` | `redis:8-alpine` | none | Password-protected |

Important: `BIND_ADDRESS` is `0.0.0.0` in `.env`, so the app port is reachable from
the internet directly on port 3000, bypassing any reverse proxy. Confirm with the
operator whether this is intended; if the reverse proxy in front (1Panel OpenResty)
is the only intended entry point, change it to `127.0.0.1` in a maintenance window.

`TRUSTED_PROXIES=192.168.64.1` is set. Check this matches the proxy's address
before any change to networking.

Other environment settings to know about (values in `.env` and `compose.yaml`):

- `SESSION_COOKIE_SECURE=false`. Should be `true` once HTTPS is verified end to end.
- `DEFAULT_LANGUAGE=zh-CN`, `TZ=Asia/Shanghai`.
- `SQL_MAX_OPEN_CONNS=50`, `SQL_MAX_IDLE_CONNS=10`.
- Secrets used: `SESSION_SECRET`, `CRYPTO_SECRET`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`.
  In the upstream source, `CRYPTO_SECRET` is used for HMAC signing (auth cache integrity,
  task artifact links). We read the code; we have **not** verified how channel keys are
  stored in the database (plaintext or encrypted). Verify before relying on either answer,
  because it decides whether `CRYPTO_SECRET` can be rotated safely.

## Database facts (as of 2026-11-04)

- Tables: at least 29 in `public` (the full list was not counted), including `channels`,
  `users`, `tokens`, `logs`, `options`, `redemptions`, `subscription_orders`. Payment
  settings are stored as rows in `options`.
- Counts: users 12, channels 21, tokens 18, total quota 1755822390.
- `options` holds `ServerAddress = https://ai.bozzii.com`, `SystemName = Bozzii AI`,
  `Logo` (external URL), `Footer`, `About`, `Notice`, and `HomePageContent` (full HTML
  of the landing page, not yet switched to the URL mode).
- Payment: `payment_setting.compliance_confirmed = true`; no third-party payment
  gateway is configured.

## Other projects on this host (do not touch)

`jumpcli`, `meteroid`, `skillhub`, `tulite-next`, `partspo` (WordPress + MariaDB),
`temu-app`, `gpt-image-panel`, `nezha-dashboard`, `uptime-kuma`, `1Panel-openresty`,
`x-ui` (cron restarts it daily at 02:00 and runs a per-minute script).

## Cron (root crontab)

| Schedule | Command | Owner |
| -------- | ------- | ----- |
| `* * * * *` | `/usr/local/x-ui/goxui.sh` | x-ui |
| `0 2 * * *` | `systemctl restart x-ui` | x-ui |
| `20 3 * * *` | `jumpcli` production backup, log to `/var/log/jumpcli-backup.log` | jumpcli |
| `47 3 * * *` | `ops/backup-offsite.sh`, log to `/var/log/xseek-offsite-backup.log` | this stack |

Previous crontab saved at `/root/crontab.before-xseek-offsite`.

## Installed tools added for this stack

- `age` 1.2.1 and `rclone` 1.60.1 from the Debian repository.
- Config for rclone: `/root/.config/rclone/rclone.conf` (600), remote name `r2`.

## Known risks

- The `.env` and `.env.bak-rotate-*` files hold secrets in plaintext on the host.
  Anyone with root on the host can read them. This is the same trust level as the
  database itself, so keep root access limited.
- The app port is bound to `0.0.0.0` (see above).
- No log rotation is configured for `/var/log/xseek-offsite-backup.log`. It grows by one
  line per day, which is negligible, but add `logrotate` if it ever matters.
