# ICS-URL Subscription — Implementation Plan (v2)

**Date:** 2026-04-20
**Status:** Approved
**Supersedes:** ICS_URL_Subscription.md (v1)

## Overview

Allow all family members to subscribe to external calendars via ICS URL (e.g. public Google, Outlook, or any webcal-compatible feed). Events are fetched periodically and stored locally. Users choose whether a subscription is private or shared with the whole family.

## Requirements

- Any user (not just admins) can add subscriptions
- Per-subscription visibility: **private** (only creator) or **shared** (all family members)
- Custom color per subscription, chosen by the user
- Sync interval: shared with existing `SYNC_INTERVAL_MINUTES` setting
- Manual "Sync now" button per subscription
- Events from subscriptions are editable; user-modified events are not overwritten on re-sync but can be reset to upstream
- Events are deleted when their subscription is deleted
- Recurring events (RRULE) are expanded within a rolling window

---

## 1. Database

### 1.1 New table: `ics_subscriptions`

```sql
CREATE TABLE ics_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  url        TEXT    NOT NULL,
  color      TEXT    NOT NULL DEFAULT '#6366f1',
  shared     INTEGER NOT NULL DEFAULT 0,   -- 0 = private, 1 = shared with all
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  etag       TEXT,                         -- HTTP ETag for conditional fetch
  last_modified TEXT,                      -- HTTP Last-Modified for conditional fetch
  last_sync  TEXT,                         -- ISO 8601, always UTC
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
```

**Change from v1:** `ON DELETE SET NULL` instead of `ON DELETE CASCADE` on `created_by`. When a user is deleted, shared subscriptions survive and can be managed by any admin. Orphaned private subscriptions (where `created_by IS NULL AND shared = 0`) are cleaned up by a post-deletion sweep or made visible to admins.

### 1.2 Migrations to `calendar_events`

Two new columns via append-only migration entries:

1. `subscription_id INTEGER REFERENCES ics_subscriptions(id) ON DELETE CASCADE`
2. `user_modified INTEGER NOT NULL DEFAULT 0` — set to `1` on user edit; prevents sync overwrite

**Migration ordering:** The `ics_subscriptions` CREATE TABLE entry must precede the `ALTER TABLE calendar_events ADD COLUMN subscription_id` entry in the migrations array.

### 1.3 The `external_source` CHECK constraint

**Do not recreate the `calendar_events` table.** Table recreation is the highest-risk migration possible — data loss, broken foreign keys, index rebuilds. Instead:

- **Option A (recommended):** Drop the CHECK constraint entirely. Validate `external_source ∈ {'local', 'google', 'apple', 'ics'}` at the application layer (in the route handler and in `ics-subscription.js`). SQLite allows dropping a CHECK via table recreation, but the point is to *avoid* the recreation. If the existing CHECK was added inline in the original CREATE TABLE, it is already baked in. In that case, the CHECK will reject `'ics'` inserts. Verify the actual schema first:
  ```sql
  SELECT sql FROM sqlite_master WHERE name = 'calendar_events';
  ```
  If no CHECK exists → no migration needed, just validate in code.
  If CHECK exists → the table recreation is unavoidable, but must run inside `BEGIN IMMEDIATE` / `COMMIT` with full column + index + FK reconstruction. Document every step.

- **Option B (if CHECK must stay):** Recreate in a transaction. Copy data into temp table, drop original, create with new CHECK, copy back, recreate indexes and FKs, commit. Test with a populated database before merge.

### 1.4 Unique constraint for upsert

Add a unique index scoped to the subscription:

```sql
CREATE UNIQUE INDEX idx_calendar_events_sub_extid
  ON calendar_events (subscription_id, external_calendar_id)
  WHERE subscription_id IS NOT NULL;
```

**Rationale:** ICS UIDs are only unique within a single feed, not globally. Without this scope, Feed B can overwrite Feed A's events if they share a UID. The upsert must use `ON CONFLICT(subscription_id, external_calendar_id)`.

### 1.5 Visibility filter

```sql
WHERE external_source != 'ics'
   OR subscription_id IN (
        SELECT id FROM ics_subscriptions
        WHERE shared = 1
           OR created_by = :userId
      )
```

Unchanged from v1. Events with `external_source = 'ics'` and `subscription_id IS NULL` (should not exist, but defensively) are filtered out.

---

## 2. Backend

### 2.1 New file: `server/services/ics-parser.js`

Extract from `apple-calendar.js` into a shared module:

| Export | Source |
|--------|--------|
| `parseICS(text)` | existing |
| `unfoldLines(text)` | existing |
| `formatICSDate(value)` | existing |
| `tzLocalToUTC(dateStr, tzid)` | existing |
| `applyDuration(start, duration)` | existing |
| `expandRRULE(vevent, windowStart, windowEnd)` | **new** |

Both `apple-calendar.js` and `ics-subscription.js` import from here. The refactoring of existing functions must be a **separate commit** with no logic changes, tested independently before the ICS subscription code is added.

**RRULE expansion:** `expandRRULE` generates occurrences within a rolling window (default: 6 months past → 12 months future). Supports `FREQ` (DAILY, WEEKLY, MONTHLY, YEARLY), `COUNT`, `UNTIL`, `INTERVAL`, `BYDAY`. `EXDATE` entries exclude specific occurrences. Each expanded occurrence gets a synthetic `external_calendar_id` of `{UID}__{ISO-date}` for stable upsert identity. Unsupported RRULE features (BYSETPOS, BYMONTHDAY with negative values, etc.) log a warning and fall back to non-expansion.

### 2.2 New file: `server/services/ics-subscription.js`

| Export | Description |
|--------|-------------|
| `fetchAndParse(url, etag?, lastModified?)` | Validate + fetch + parse (see §2.3) |
| `sync(subscriptionId?)` | Sync one or all subscriptions (see §2.4) |
| `getAll(userId)` | Return all subscriptions visible to userId (own + shared) |
| `create(userId, { name, url, color, shared })` | Validate, insert, trigger initial sync. Return subscription + sync result (success or error message) |
| `update(userId, id, fields)` | Update name/color/shared; only creator or admin |
| `remove(userId, id)` | Delete subscription (events cascade); only creator or admin |

### 2.3 `fetchAndParse` — security hardening

1. **Scheme whitelist:** Only `https://` and `webcal://` (normalized to `https://`). Reject `http://`, `file://`, `ftp://`, `data://`.
2. **DNS rebinding / SSRF protection:** After URL parsing, resolve the hostname. Reject if the resolved IP falls in private ranges: `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`, `fc00::/7`, `fe80::/10`. Use `dns.resolve4` / `dns.resolve6` before passing to `fetch`.
3. **Timeout:** 15 seconds per request (`AbortController` + `setTimeout`).
4. **Response size limit:** Abort if `Content-Length > 10 MB` or if streamed body exceeds 10 MB.
5. **Content-Type hint check:** Warn (but don't block) if response Content-Type is not `text/calendar`. Some servers serve ICS as `text/plain`.
6. **Conditional fetch:** Send `If-None-Match: {etag}` and `If-Modified-Since: {lastModified}` headers. On `304 Not Modified`, skip parsing entirely and return early. On `200`, store new `etag` and `last-modified` response headers back to `ics_subscriptions`.

### 2.4 `sync` — operational details

1. Wrap the entire sync for one subscription in `BEGIN IMMEDIATE` / `COMMIT`. This turns N individual upserts into a single disk write.
2. **Per-subscription mutex:** Maintain an in-memory `Set<subscriptionId>` of currently-syncing subscriptions. If a sync is already running for a given subscription (e.g. manual sync while periodic sync is active), skip it and return early. The Set is process-local — sufficient for single-process Oikos.
3. **Upsert logic:** `INSERT ... ON CONFLICT(subscription_id, external_calendar_id) DO UPDATE SET ... WHERE user_modified = 0`. Events where `user_modified = 1` are untouched in a single statement — no per-row branching needed.
4. **Stale event cleanup:** After upsert, delete events belonging to this subscription whose `external_calendar_id` is not in the current feed's UID set AND whose `user_modified = 0`. User-modified events whose upstream counterpart disappeared are kept (the user explicitly edited them).
5. On fetch error: log warning, leave existing events and `last_sync` unchanged, continue to next subscription.

### 2.5 New routes: `/api/v1/calendar/subscriptions`

| Method | Path | Action | Auth |
|--------|------|--------|------|
| `GET` | `/` | List visible subscriptions | any user |
| `POST` | `/` | Create subscription | any user |
| `PATCH` | `/:id` | Update name/color/shared | creator or admin |
| `DELETE` | `/:id` | Delete subscription + events | creator or admin |
| `POST` | `/:id/sync` | Manual sync now | creator or admin |

All handlers in `try/catch`. Responses follow `{ data: ... }` / `{ error, code }`.

**Input validation on POST/PATCH:**
- `url`: required, must parse as valid URL, scheme must be `https` or `webcal`
- `name`: required, non-empty, max 100 chars
- `color`: required on POST, must match `/^#[0-9a-fA-F]{6}$/`
- `shared`: boolean-coercible integer (0 or 1)

### 2.6 Setting `user_modified`

When `PATCH /api/v1/calendar/events/:id` updates an event with `external_source = 'ics'`, the handler sets `user_modified = 1` automatically.

**New:** `PATCH /api/v1/calendar/events/:id/reset` sets `user_modified = 0` on an ICS event. The next sync cycle will overwrite it with upstream data. Returns `{ data: { reset: true } }`. Only the event creator, subscription creator, or admin can call this.

### 2.7 Sync integration

`server/index.js` `syncAll()` calls `icsSubscription.sync()` alongside existing Google/Apple sync. ICS sync runs last (lowest priority — Google/Apple are authenticated and more critical).

### 2.8 Orphan cleanup

After a user is deleted (`ON DELETE SET NULL` on `created_by`), run a sweep:

```sql
DELETE FROM ics_subscriptions WHERE created_by IS NULL AND shared = 0;
```

This removes private subscriptions that no one can see or manage. Shared orphans remain visible and editable by admins.

---

## 3. Frontend

### 3.1 Settings page (`public/pages/settings.js`)

New card **"ICS-Abonnements"** in the existing "Kalender" tab, below Apple Calendar:

- List of visible subscriptions: color dot, name, visibility badge (`Privat` / `Geteilt`), last sync timestamp (via `formatDate()` + `formatTime()`), sync error indicator if last sync failed
- **"Abonnement hinzufügen"** button reveals inline form:
  - URL input (required, `type="url"`)
  - Name input (required)
  - Color picker (`<input type="color">`)
  - Toggle "Für alle sichtbar" (default: off)
  - Submit / Cancel buttons
- Per-subscription actions: "Jetzt synchronisieren" (shows spinner during sync), "Bearbeiten" (inline), "Löschen" (confirmation via existing confirm pattern)
- Only creator or admin sees edit/delete/sync actions
- Initial sync error on create: show inline warning with error message, subscription is still created

Rendered inline — no new Web Component. Consistent with Apple Calendar form pattern in the same tab.

### 3.2 Calendar page (`public/pages/calendar.js`)

- Events with `external_source = 'ics'` render with their subscription's color
- No special UI indicator for `user_modified` — keeps UX clean
- Event detail view for `user_modified = 1` events shows a subtle "Auf Original zurücksetzen" link that calls `PATCH .../reset`

### 3.3 i18n

All new strings in `public/locales/de.json`:

- `settings.ics.title` — "ICS-Abonnements"
- `settings.ics.add` — "Abonnement hinzufügen"
- `settings.ics.form.*` — URL, Name, Color, Shared toggle labels
- `settings.ics.actions.*` — Sync, Edit, Delete labels
- `settings.ics.status.*` — last sync, sync error, syncing states
- `settings.ics.confirm_delete` — deletion confirmation
- `settings.ics.badges.*` — "Privat", "Geteilt"
- `calendar.ics.reset` — "Auf Original zurücksetzen"

`de` is the reference locale. Other locales fall back gracefully via `t()`.

---

## 4. Error Handling

| Scenario | Behavior |
|----------|----------|
| ICS URL unreachable / timeout | Log warning, keep existing events, leave `last_sync` unchanged |
| 304 Not Modified | Skip parse, update `last_sync` timestamp only |
| Invalid ICS content | Log warning, skip malformed VEVENTs, continue with valid ones |
| URL returns non-ICS content (no `BEGIN:VCALENDAR`) | Log error, abort sync for this subscription |
| Response > 10 MB | Abort fetch, log error |
| SSRF attempt (private IP) | Reject with 400: "URL resolves to a private address" |
| Unsupported URL scheme | Reject with 400: "Only https and webcal URLs are supported" |
| RRULE with unsupported features | Log warning per event, fall back to single occurrence |
| Unauthorized edit/delete | 403 response |
| Duplicate URL across subscriptions | Allowed (user may want same feed with different color/name) |
| Initial sync fails on create | Subscription created, error message returned in response body |
| Concurrent sync on same subscription | Second sync skipped (in-memory mutex) |

---

## 5. Commit Strategy

| # | Scope | Description |
|---|-------|-------------|
| 1 | `refactor(calendar)` | Extract ICS parser from `apple-calendar.js` into `server/services/ics-parser.js`. No logic changes. Existing Apple Calendar tests must still pass. |
| 2 | `feat(calendar)` | Add `ics_subscriptions` table, `calendar_events` columns, unique index. Add RRULE expansion to parser. Migrations in correct order. |
| 3 | `feat(calendar)` | Add `ics-subscription.js` service, routes, sync integration, security hardening. Backend tests. |
| 4 | `feat(calendar)` | Frontend: settings card, calendar color rendering, reset flow, i18n keys. |

---

## 6. Out of Scope

- CalDAV authentication (Basic/OAuth) — ICS-URL only (public or pre-authenticated URLs)
- Per-event sync conflict resolution UI (beyond the reset button)
- Subscription import/export
- VTIMEZONE definitions beyond offset-based conversion (use system timezone as fallback)
- RRULE features beyond FREQ/COUNT/UNTIL/INTERVAL/BYDAY/EXDATE
