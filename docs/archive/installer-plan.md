# Installer Implementation Plan

## Phase 0 Findings Summary

See [installer-recon.md](installer-recon.md) for full details.

Key finding: **A new `POST /api/v1/auth/setup` endpoint is required** to allow first-admin creation via HTTP when the app runs in Docker. Both installers depend on this.

## Dependency Graph

```
[1] Setup endpoint (server/auth.js)
     ↓
[2a] CLI installer (install.sh)       [2b] Web installer (tools/installer/)
     ↓                                      ↓
[3] .dockerignore update + docs
```

Steps 2a and 2b are independent and can be built in parallel, but both depend on Step 1.

## Deliverables

### 1. Setup Bootstrap Endpoint (blocking — ~1h, complexity: low)

**File**: `server/auth.js` — add new route before the auth guard.

```
POST /api/v1/auth/setup
```

Behavior:
- Query `SELECT COUNT(*) FROM users` — if > 0, return `403 { error: "Setup already completed", code: 403 }`
- Validate input: `username` (3-64 chars, alphanumeric + `._-`), `display_name` (1-128 chars), `password` (min 8 chars)
- Hash password with bcrypt (cost 12), insert user with `role: 'admin'`
- Return `201 { user: { id, username, display_name, avatar_color, role } }`
- Rate-limited (reuse existing `loginLimiter` or a custom one)
- No session/CSRF required (unauthenticated endpoint)
- Mounted at `/api/v1/auth/setup` in `server/index.js` (before the `requireAuth` middleware)

**Test**: Add `test:setup` script. Verify: creates admin when no users exist, returns 403 when users exist, validates input.

### 2a. CLI Installer — `install.sh` (~3h, complexity: medium)

**File**: `install.sh` in repository root.

Wizard steps (7 total):
1. **Prerequisites check**: Docker, docker compose, openssl (or /dev/urandom fallback), curl, jq (optional, graceful fallback)
2. **Basic config**: domain/IP (default: `localhost`), port (default: `3000`), timezone
3. **Security secrets**: SESSION_SECRET + DB_ENCRYPTION_KEY — each with [G]enerate / [M]anual
4. **Weather** (optional): ask if wanted, prompt for API key
5. **Calendar** (optional): Google OAuth / Apple CalDAV, each skippable
6. **Review & launch**: display masked .env, confirm, write `.env`, run `docker compose up -d`, poll `/health` every 2s (120s timeout)
7. **Admin creation**: prompt username, display_name, password (read -s), POST to `/api/v1/auth/setup`

Features:
- Color output (detect tty, ANSI fallback)
- `--env-file <path>` non-interactive mode: skip wizard, use provided .env, run docker + admin creation
- Ctrl+C trap for clean exit
- On docker failure: show `docker compose logs --tail 50`
- Works on Linux + macOS (bash, no bashisms beyond `read -s`)

### 2b. Web Installer — `tools/installer/` (~4h, complexity: high)

**Files**:
- `tools/installer/install-server.js` — zero-dependency Node.js HTTP server
- `tools/installer/install.html` — single-file SPA (inline CSS + JS)
- `tools/installer/README.md`

**Server endpoints** (port 8090):
| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Serve `install.html` |
| GET | `/api/defaults` | Env var catalog with classifications |
| POST | `/api/generate-secret` | `crypto.randomBytes(32).toString('hex')` |
| POST | `/api/save-env` | Write `.env` to project root |
| POST | `/api/start` | `docker compose up -d` |
| GET | `/api/status` | Container health polling |
| POST | `/api/create-admin` | Proxy to Oikos `/api/v1/auth/setup` |

Server features:
- Node.js built-ins only (http, fs, child_process, crypto, path)
- Binds to `127.0.0.1:8090`
- Auto-terminates after successful admin creation (or 30min idle)
- CORS not needed (same origin)

**UI design direction**: Clean, calm, trustworthy. Dark-mode-aware. Progress bar. Subtle step transitions. Google Fonts (loaded at runtime for installer only — installer is temporary, not part of the Docker image).

Steps mirror CLI: config → secrets → integrations → review → docker start → admin creation → success.

### 3. Documentation & Housekeeping (~30min, complexity: low)

- Update `docs/installation.md` to reference both installer paths
- Add `tools/` to `.dockerignore`
- Add `install.sh` to `.dockerignore`

## Commit Sequence

1. `feat(api): add first-run setup endpoint for admin bootstrap`
   - `server/auth.js`: new `/setup` route
   - `server/index.js`: mount before auth guard
   - `test-setup.js` + `package.json` test script
2. `feat(installer): add CLI install script`
   - `install.sh`
3. `feat(installer): add web-based installer server and UI`
   - `tools/installer/install-server.js`
   - `tools/installer/install.html`
   - `tools/installer/README.md`
4. `chore: add installer files to .dockerignore and update docs`
   - `.dockerignore` additions
   - `docs/installation.md` updates

## Decisions (confirmed)

1. **Fonts**: System font stack in web installer. No Google Fonts, no external dependencies.
2. **No Docker-exec fallback**: Installer targets current version with setup endpoint only.
3. **TRUST_PROXY**: Only via `.env`. Don't modify `docker-compose.yml`.
