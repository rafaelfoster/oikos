# ICS-URL Subscription — Design Spec

**Date:** 2026-04-20  
**Status:** Approved

## Overview

Allow all family members to subscribe to external calendars via ICS-URL (e.g. public Google, Outlook, or any webcal-compatible feed). Events are fetched periodically and stored locally. Users can choose whether a subscription is private or shared with the whole family.

## Requirements

- Any user (not just admins) can add subscriptions
- Per-subscription visibility: **private** (only creator) or **shared** (all family members)
- Custom color per subscription, chosen by the user
- Sync interval: shared with existing `SYNC_INTERVAL_MINUTES` setting
- Manual "Sync now" button per subscription
- Events from subscriptions are editable; user-modified events are not overwritten on re-sync
- Events are deleted when their subscription is deleted

---

## 1. Database

### New table: `ics_subscriptions`

```sql
CREATE TABLE ics_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  url        TEXT    NOT NULL,
  color      TEXT    NOT NULL DEFAULT '#6366f1',
  shared     INTEGER NOT NULL DEFAULT 0,   -- 0 = private, 1 = shared with all
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_sync  TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
```

### Migrations to `calendar_events`

Two new columns added via append-only migration entries:

- `subscription_id INTEGER REFERENCES ics_subscriptions(id) ON DELETE CASCADE` — links event to its subscription
- `user_modified INTEGER NOT NULL DEFAULT 0` — set to 1 when user edits the event; prevents sync from overwriting

The `external_source` CHECK constraint (`'local'`, `'google'`, `'apple'`) must be extended to include `'ics'`. Since SQLite does not support `ALTER COLUMN`, this is done by recreating the table in the migration.

### Visibility filter

The calendar events API filters ICS events as follows:

```sql
WHERE external_source != 'ics'
   OR subscription_id IN (
        SELECT id FROM ics_subscriptions
        WHERE shared = 1 OR created_by = :userId
      )
```

---

## 2. Backend

### New file: `server/services/ics-parser.js`

Extract `parseICS`, `unfoldLines`, `formatICSDate`, `tzLocalToUTC`, `applyDuration` from `apple-calendar.js` into a shared module. Both `apple-calendar.js` and the new `ics-subscription.js` import from here. No logic changes.

### New file: `server/services/ics-subscription.js`

| Export | Description |
|--------|-------------|
| `fetchAndParse(url)` | Normalize `webcal://` → `https://`, HTTP GET the ICS URL, pass response text to `parseICS()` |
| `sync(subscriptionId?)` | Sync one subscription (by id) or all; skip events with `user_modified = 1`; upsert via `external_calendar_id = UID`; update `last_sync` |
| `getAll(userId)` | Return all subscriptions visible to userId (own + shared) |
| `create(userId, { name, url, color, shared })` | Insert new subscription, trigger initial sync |
| `update(userId, id, fields)` | Update name/color/shared; only creator or admin |
| `remove(userId, id)` | Delete subscription + cascade-delete events; only creator or admin |

### New routes: `/api/v1/calendar/subscriptions`

| Method | Path | Action | Auth |
|--------|------|--------|------|
| `GET` | `/` | List visible subscriptions | any user |
| `POST` | `/` | Create subscription | any user |
| `PATCH` | `/:id` | Update name/color/shared | creator or admin |
| `DELETE` | `/:id` | Delete subscription + events | creator or admin |
| `POST` | `/:id/sync` | Manual sync | creator or admin |

All handlers wrapped in `try/catch`. Responses follow `{ data: ... }` / `{ error, code }` convention.

### Sync integration

`server/index.js` `syncAll()` function calls `icsSubscription.sync()` alongside the existing Google/Apple sync calls.

### Setting `user_modified`

When a calendar event with `external_source = 'ics'` is updated via `PATCH /api/v1/calendar/events/:id`, the route sets `user_modified = 1` automatically.

---

## 3. Frontend

### Settings page (`public/pages/settings.js`)

New card "ICS-Abonnements" in the existing "Kalender" tab, below Apple Calendar:

- List of all visible subscriptions: color dot, name, visibility badge, last sync timestamp
- "Abonnement hinzufügen" button reveals an inline form:
  - URL input (required)
  - Name input (required)
  - Color picker (`<input type="color">`)
  - Toggle "Für alle sichtbar" (default: off)
  - Submit / Cancel buttons
- Per-subscription actions: "Jetzt synchronisieren", "Bearbeiten" (inline), "Löschen" (with confirmation)
- Only creator or admin sees edit/delete actions

No new Web Component — rendered inline, consistent with the Apple Calendar form pattern.

### Calendar page (`public/pages/calendar.js`)

- Events with `external_source = 'ics'` use their subscription's color for rendering
- No special UI indicator for `user_modified` status (keeps UX clean)

### i18n

All new strings in `public/locales/de.json` under:
- `settings.ics.*` — subscription list, form labels, actions, status messages
- `calendar.ics.*` — any calendar-side strings (if needed)

`de` is the reference locale; other locales fall back gracefully.

---

## 4. Error Handling

| Scenario | Behavior |
|----------|----------|
| ICS URL unreachable | Log warning, keep existing events, leave `last_sync` unchanged |
| Invalid ICS content | Log warning, skip malformed VEVENTs, continue with valid ones |
| URL returns non-ICS content | Log error, abort sync for this subscription |
| Unauthorized edit/delete | 403 response |
| Duplicate URL | Allowed (user may want same feed with different color/name) |

---

## 5. Out of Scope

- CalDAV authentication (Basic/OAuth) — ICS-URL only (public or pre-authenticated URLs)
- Per-event sync conflict resolution UI
- Subscription import/export
