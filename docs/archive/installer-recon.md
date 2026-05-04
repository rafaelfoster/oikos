# Installer Reconnaissance

## 1. Environment Variables (from `.env.example`)

### Auto-generatable (openssl rand -hex 32)
| Variable | Purpose |
|---|---|
| `SESSION_SECRET` | Express session signing key |
| `DB_ENCRYPTION_KEY` | SQLCipher encryption key |

### Has sensible defaults
| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3000` | |
| `NODE_ENV` | `production` | Hardcoded in docker-compose.yml |
| `DB_PATH` | `/data/oikos.db` | Hardcoded in docker-compose.yml |
| `SESSION_SECURE` | `true` | Set to `false` in docker-compose when no reverse proxy |
| `OPENWEATHER_CITY` | `Berlin` | |
| `OPENWEATHER_UNITS` | `metric` | |
| `OPENWEATHER_LANG` | `de` | |
| `APPLE_CALDAV_URL` | `https://caldav.icloud.com` | |
| `SYNC_INTERVAL_MINUTES` | `15` | |
| `RATE_LIMIT_WINDOW_MS` | `60000` | |
| `RATE_LIMIT_MAX_ATTEMPTS` | `5` | |
| `RATE_LIMIT_BLOCK_DURATION_MS` | `900000` | |

### User-provided (optional integrations)
| Variable | Integration |
|---|---|
| `OPENWEATHER_API_KEY` | Weather widget |
| `GOOGLE_CLIENT_ID` | Google Calendar sync |
| `GOOGLE_CLIENT_SECRET` | Google Calendar sync |
| `GOOGLE_REDIRECT_URI` | Google Calendar sync |
| `APPLE_USERNAME` | Apple CalDAV sync |
| `APPLE_APP_SPECIFIC_PASSWORD` | Apple CalDAV sync |

### Docker-compose overrides
These are set in `docker-compose.yml` `environment:` section and override `.env`:
- `NODE_ENV=production`
- `DB_PATH=/data/oikos.db`
- `SESSION_SECURE=false` (default, commented advice to remove for reverse proxy)

## 2. Docker Setup

- **Service name**: `oikos`
- **Image**: `ghcr.io/ulsklyc/oikos:latest` (or local build)
- **Port**: `0.0.0.0:3000:3000`
- **Volume**: `oikos_data:/data` (named volume)
- **Env file**: `.env`
- **Restart policy**: `unless-stopped`
- **Health check**: `GET http://localhost:3000/health` — interval 30s, timeout 10s, 3 retries, 10s start period

## 3. Health Check Endpoint

```
GET /health → { status: "ok", timestamp: "2025-..." }
```

Returns HTTP 200 when the app is running and the DB is initialized. Excluded from rate limiting.

## 4. Admin Creation — Current Mechanisms

### a) `setup.js` (CLI)
- Interactive Node.js script, run via `npm run setup` (`node --import dotenv/config setup.js`)
- Directly accesses the SQLite DB via `server/db.js`
- Prompts: username, display_name, password (with confirmation)
- Checks if admin already exists, asks to confirm if so
- **Limitation**: Requires direct filesystem access to the DB — does NOT work when the app runs in Docker (DB is inside container volume at `/data/oikos.db`)

### b) `POST /api/v1/auth/users` (API)
- Creates a new user
- **Requires**: Active admin session + CSRF token
- Fields: `{ username, display_name, password, avatar_color?, role? }`
- **Limitation**: Unusable for first-time setup (chicken-and-egg: need admin to create admin)

### c) `scripts/seed-demo.js`
- Demo data seeding script — creates users directly via DB
- Not a setup mechanism, but shows the user schema

## 5. Gap Analysis — What's Missing

**A bootstrap API endpoint is needed.** Neither existing mechanism allows creating the first admin user when the app runs in Docker without shell access.

**Proposed solution**: Add `POST /api/v1/auth/setup` endpoint:
- Only succeeds when the `users` table has zero rows
- No authentication required (it IS the authentication bootstrap)
- Accepts: `{ username, display_name, password }`
- Returns: `{ user: { id, username, display_name, role: 'admin' } }`
- After the first user exists, returns 403 ("Setup already completed")
- Rate-limited to prevent abuse during the brief window

## 6. Existing Files to Be Aware Of

- `.dockerignore` already excludes `docs/`, `scripts/`, `test-*.js`, `.env*`
- `tools/` is NOT in `.dockerignore` yet — needs to be added
- `docs/installation.md` exists — should be updated to reference the new installers
- `docs/install.html` exists — appears to be a landing page, not an installer
