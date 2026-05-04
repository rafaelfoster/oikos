# ICS-URL Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow any family member to subscribe to external ICS-URL calendars (e.g. public Google/Outlook feeds) with per-subscription color, visibility (private/shared), and automatic sync.

**Architecture:** Four-commit sequence — (1) refactor ICS parser into a shared module, (2) DB migrations, (3) backend service + routes, (4) frontend + i18n. Events are stored in `calendar_events` with `external_source = 'ics'`. A new `ics_subscriptions` table holds metadata. RRULE events are pre-expanded into individual DB rows with synthetic UIDs to prevent double-expansion at query time.

**Tech Stack:** Node.js/Express, better-sqlite3 (sync), `node-fetch` (already a dependency), `node:sqlite` for tests. No new npm packages.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `server/services/ics-parser.js` | All ICS parsing + RRULE expansion |
| Modify | `server/services/apple-calendar.js` | Import parseICS from ics-parser.js |
| Modify | `server/db.js` | Migrations v10 + v11 |
| Modify | `server/db-schema-test.js` | Mirror new schema for tests |
| Create | `server/services/ics-subscription.js` | Fetch, sync, CRUD service |
| Modify | `server/routes/calendar.js` | Subscription routes + visibility filter + user_modified |
| Modify | `server/index.js` | Wire ICS sync into runSync() |
| Modify | `public/pages/settings.js` | ICS subscription card UI |
| Modify | `public/pages/calendar.js` | ICS event color + reset link |
| Modify | `public/locales/de.json` | i18n keys |
| Create | `test-ics-parser.js` | Parser unit tests |
| Create | `test-ics-subscription.js` | Subscription DB/service tests |
| Modify | `package.json` | Add test scripts |

---

## Task 1: Extract ICS parser into shared module

**Files:**
- Create: `server/services/ics-parser.js`
- Create: `test-ics-parser.js`
- Modify: `server/services/apple-calendar.js`

> Pure refactor — no logic changes. All existing tests must pass before and after.

- [ ] **Step 1: Create `server/services/ics-parser.js`**

Create the file with the following content. The five functions (`unfoldLines`, `parseICS`, `formatICSDate`, `tzLocalToUTC`, `applyDuration`) are copied verbatim from `apple-calendar.js` lines 113–287 with one addition: a new top-level import of `nextOccurrence` from `./recurrence.js` and the new `expandRRULE` function:

```js
import { nextOccurrence } from './recurrence.js';

function unfoldLines(ics) {
  return ics.replace(/\r?\n[ \t]/g, '');
}

function parseICS(ics) {
  const unfolded = unfoldLines(ics);
  const events   = [];
  const vEventRe = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let match;
  while ((match = vEventRe.exec(unfolded)) !== null) {
    const block = match[1];
    const get   = (prop) => {
      const re = new RegExp(`^${prop}(?:;[^:]*)?:(.*)$`, 'im');
      const m  = re.exec(block);
      return m ? m[1].trim() : null;
    };
    const uid         = get('UID');
    const summary     = get('SUMMARY') || '(kein Titel)';
    const description = get('DESCRIPTION') || null;
    const location    = get('LOCATION')    || null;
    const rrule       = get('RRULE')       ? `RRULE:${get('RRULE')}` : null;
    const parseDTLine = (prop) => {
      const re = new RegExp(`^${prop}((?:;[^:]*)*):(.*)$`, 'im');
      const m = block.match(re);
      if (!m) return { value: null, tzid: null };
      const params  = m[1];
      const value   = m[2].trim();
      const tzMatch = params.match(/;TZID=([^;:]+)/i);
      return { value, tzid: tzMatch ? tzMatch[1].trim() : null };
    };
    const dtStartLine = parseDTLine('DTSTART');
    const dtEndLine   = parseDTLine('DTEND');
    const dtStartRaw  = dtStartLine.value;
    const dtEndRaw    = dtEndLine.value;
    const allDay  = /^DTSTART;VALUE=DATE:/im.test(block);
    const dtstart = dtStartRaw ? formatICSDate(dtStartRaw, allDay, dtStartLine.tzid) : null;
    let   dtend   = dtEndRaw   ? formatICSDate(dtEndRaw,   allDay, dtEndLine.tzid)   : null;
    if (allDay && dtend) {
      const d = new Date(dtend + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      dtend = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    if (!dtend && dtstart) {
      const durMatch = /^DURATION(?:;[^:]*)?:(.*)$/im.exec(block);
      if (durMatch) dtend = applyDuration(dtstart, durMatch[1].trim(), allDay);
    }
    if (!uid || !dtstart) continue;
    events.push({ uid, summary, description, location, dtstart, dtend, rrule, allDay });
  }
  return events;
}

function tzLocalToUTC(localStr, tzid) {
  try {
    const fakeUTC = new Date(localStr + 'Z');
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzid, year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
    }).formatToParts(fakeUTC);
    const get = (type) => {
      const part = parts.find(p => p.type === type);
      const v = part ? part.value : '0';
      return v === '24' ? 0 : parseInt(v, 10);
    };
    const tzDisplayedAsUTC = Date.UTC(
      get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')
    );
    const offsetMs = fakeUTC.getTime() - tzDisplayedAsUTC;
    return new Date(fakeUTC.getTime() + offsetMs).toISOString().replace('.000Z', 'Z');
  } catch { return localStr; }
}

function formatICSDate(val, allDay, tzid) {
  if (allDay || /^\d{8}$/.test(val)) {
    return `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}`;
  }
  const y = val.slice(0, 4), mo = val.slice(4, 6), d = val.slice(6, 8);
  const h = val.slice(9, 11), mi = val.slice(11, 13), s = val.slice(13, 15) || '00';
  if (val.endsWith('Z')) return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
  if (tzid) return tzLocalToUTC(`${y}-${mo}-${d}T${h}:${mi}:${s}`, tzid);
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

function applyDuration(dtstart, dur, allDay) {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(dur);
  if (!m) return null;
  const weeks = parseInt(m[1] || '0', 10), days  = parseInt(m[2] || '0', 10);
  const hours = parseInt(m[3] || '0', 10), mins  = parseInt(m[4] || '0', 10);
  const secs  = parseInt(m[5] || '0', 10);
  const base = new Date(dtstart.includes('T') ? dtstart : dtstart + 'T00:00:00');
  base.setDate(base.getDate() + weeks * 7 + days);
  base.setHours(base.getHours() + hours, base.getMinutes() + mins, base.getSeconds() + secs);
  if (allDay) {
    base.setDate(base.getDate() - 1);
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
  }
  return base.toISOString().replace('.000Z', 'Z');
}

/**
 * Expands a VEVENT with RRULE into individual occurrences within [windowStart, windowEnd].
 * Returns flat event objects with recurrence_rule: null and synthetic UIDs ({uid}__{YYYY-MM-DD}).
 */
function expandRRULE(vevent, windowStart, windowEnd) {
  if (!vevent.rrule) return [];
  const results    = [];
  const startDate  = vevent.dtstart.slice(0, 10);
  const timeSuffix = vevent.allDay ? '' : (vevent.dtstart.slice(10) || '');
  let durationMs = null;
  if (vevent.dtend) {
    const s = new Date(vevent.allDay ? vevent.dtstart + 'T00:00:00Z' : vevent.dtstart);
    const e = new Date(vevent.allDay ? vevent.dtend   + 'T00:00:00Z' : vevent.dtend);
    if (!isNaN(s) && !isNaN(e)) durationMs = e - s;
  }
  let current = startDate, iterations = 0;
  const MAX_ITER = 1500;
  while (current <= windowEnd && iterations < MAX_ITER) {
    iterations++;
    if (current >= windowStart) {
      const occStart = current + timeSuffix;
      let occEnd = null;
      if (durationMs !== null) {
        if (vevent.allDay) {
          const d = new Date(current + 'T00:00:00Z');
          d.setUTCMilliseconds(d.getUTCMilliseconds() + durationMs);
          occEnd = d.toISOString().slice(0, 10);
        } else {
          occEnd = new Date(new Date(occStart).getTime() + durationMs)
            .toISOString().replace('.000Z', 'Z');
        }
      }
      results.push({
        uid: `${vevent.uid}__${current}`, summary: vevent.summary,
        description: vevent.description, location: vevent.location,
        dtstart: occStart, dtend: occEnd, rrule: null, allDay: vevent.allDay,
      });
    }
    const next = nextOccurrence(current, vevent.rrule);
    if (!next || next <= current) break;
    current = next;
  }
  return results;
}

export { unfoldLines, parseICS, formatICSDate, tzLocalToUTC, applyDuration, expandRRULE };
```

- [ ] **Step 2: Update `server/services/apple-calendar.js`**

Remove the function bodies for `unfoldLines`, `parseICS`, `formatICSDate`, `tzLocalToUTC`, and `applyDuration` (the entire block from line 113 to 287). Replace with a single import line at the top of the file (after the existing imports):

```js
import { unfoldLines, parseICS, formatICSDate, tzLocalToUTC, applyDuration } from './ics-parser.js';
```

All other functions (`buildICS`, `escapeICS`, `sync`, `getStatus`, etc.) remain unchanged.

- [ ] **Step 3: Create `test-ics-parser.js`**

```js
import { unfoldLines, parseICS, expandRRULE } from './server/services/ics-parser.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}: ${err.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }

console.log('\n[ICS-Parser-Test]\n');

test('unfoldLines entfaltet Zeilenfortsetzungen', () => {
  const result = unfoldLines('SUMMARY:Hallo\r\n Welt');
  assert(result === 'SUMMARY:Hallo Welt', `got: ${result}`);
});

test('parseICS: einfaches Ganztags-Event', () => {
  const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:test-1@x\r\nSUMMARY:Geburtstag\r\nDTSTART;VALUE=DATE:20260501\r\nDTEND;VALUE=DATE:20260502\r\nEND:VEVENT\r\nEND:VCALENDAR';
  const events = parseICS(ics);
  assert(events.length === 1, `expected 1, got ${events.length}`);
  assert(events[0].uid === 'test-1@x', 'uid');
  assert(events[0].dtstart === '2026-05-01', `dtstart: ${events[0].dtstart}`);
  assert(events[0].dtend   === '2026-05-01', `dtend: ${events[0].dtend}`);
  assert(events[0].allDay  === true, 'allDay');
});

test('parseICS: Event ohne UID wird übersprungen', () => {
  const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Ohne UID\r\nDTSTART:20260601T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR';
  assert(parseICS(ics).length === 0, 'should skip event without UID');
});

test('parseICS: UTC datetime', () => {
  const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:utc@x\r\nSUMMARY:Meeting\r\nDTSTART:20260615T140000Z\r\nDTEND:20260615T150000Z\r\nEND:VEVENT\r\nEND:VCALENDAR';
  const [ev] = parseICS(ics);
  assert(ev.dtstart === '2026-06-15T14:00:00Z', `dtstart: ${ev.dtstart}`);
  assert(ev.allDay  === false, 'allDay');
});

test('expandRRULE: WEEKLY 3-Wochen-Fenster', () => {
  const vevent = {
    uid: 'weekly@x', summary: 'Wöchentlich', description: null, location: null,
    dtstart: '2026-04-13', dtend: '2026-04-13', rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO', allDay: true,
  };
  const occ = expandRRULE(vevent, '2026-04-13', '2026-05-04');
  assert(occ.length >= 3, `expected >=3, got ${occ.length}`);
  assert(occ[0].uid === 'weekly@x__2026-04-13', `uid: ${occ[0].uid}`);
  assert(occ[0].rrule === null, 'expanded events have null rrule');
});

test('expandRRULE: null rrule → leeres Array', () => {
  const v = { uid: 'x', summary: 'x', description: null, location: null,
              dtstart: '2026-04-20', dtend: null, rrule: null, allDay: true };
  assert(expandRRULE(v, '2026-01-01', '2026-12-31').length === 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 4: Add test script to `package.json`**

Add `"test:ics-parser": "node test-ics-parser.js"` to scripts. Append `&& node test-ics-parser.js` to the end of the `"test"` script.

- [ ] **Step 5: Run parser tests**

```bash
cd oikos && node test-ics-parser.js
```

Expected: all `✓`, exit 0.

- [ ] **Step 6: Run full test suite to verify no regression**

```bash
cd oikos && npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add server/services/ics-parser.js server/services/apple-calendar.js test-ics-parser.js package.json
git commit -m "refactor(calendar): extract ICS parser into shared ics-parser.js module"
```

---

## Task 2: Database migrations

**Files:**
- Modify: `server/db.js`
- Modify: `server/db-schema-test.js`
- Create: `test-ics-subscription.js`

- [ ] **Step 1: Append migrations v10 and v11 to `server/db.js`**

Find the `MIGRATIONS` array. After the last entry (v9), append:

```js
  {
    version: 10,
    description: 'ICS-Abonnements Tabelle',
    up: `
      CREATE TABLE IF NOT EXISTS ics_subscriptions (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT    NOT NULL,
        url           TEXT    NOT NULL,
        color         TEXT    NOT NULL DEFAULT '#6366f1',
        shared        INTEGER NOT NULL DEFAULT 0,
        created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
        etag          TEXT,
        last_modified TEXT,
        last_sync     TEXT,
        created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );
    `,
  },
  {
    version: 11,
    description: 'calendar_events: external_source ICS, subscription_id, user_modified',
    up: `
      CREATE TABLE calendar_events_new (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        title                TEXT    NOT NULL,
        description          TEXT,
        start_datetime       TEXT    NOT NULL,
        end_datetime         TEXT,
        all_day              INTEGER NOT NULL DEFAULT 0,
        location             TEXT,
        color                TEXT    NOT NULL DEFAULT '#007AFF',
        assigned_to          INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_by           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        external_calendar_id TEXT,
        external_source      TEXT    NOT NULL DEFAULT 'local'
                                     CHECK(external_source IN ('local', 'google', 'apple', 'ics')),
        recurrence_rule      TEXT,
        subscription_id      INTEGER REFERENCES ics_subscriptions(id) ON DELETE CASCADE,
        user_modified        INTEGER NOT NULL DEFAULT 0,
        created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        updated_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );

      INSERT INTO calendar_events_new
        (id, title, description, start_datetime, end_datetime, all_day, location, color,
         assigned_to, created_by, external_calendar_id, external_source, recurrence_rule,
         subscription_id, user_modified, created_at, updated_at)
      SELECT id, title, description, start_datetime, end_datetime, all_day, location, color,
             assigned_to, created_by, external_calendar_id, external_source, recurrence_rule,
             NULL, 0, created_at, updated_at
      FROM calendar_events;

      DROP TRIGGER IF EXISTS trg_calendar_events_updated_at;
      DROP TABLE calendar_events;
      ALTER TABLE calendar_events_new RENAME TO calendar_events;

      CREATE TRIGGER trg_calendar_events_updated_at
        AFTER UPDATE ON calendar_events FOR EACH ROW
        BEGIN UPDATE calendar_events SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = OLD.id; END;

      CREATE INDEX IF NOT EXISTS idx_calendar_start       ON calendar_events(start_datetime);
      CREATE INDEX IF NOT EXISTS idx_calendar_assigned    ON calendar_events(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_calendar_external_id ON calendar_events(external_calendar_id);
      CREATE INDEX IF NOT EXISTS idx_calendar_sub         ON calendar_events(subscription_id);

      CREATE UNIQUE INDEX idx_calendar_sub_extid
        ON calendar_events (subscription_id, external_calendar_id)
        WHERE subscription_id IS NOT NULL;
    `,
  },
```

- [ ] **Step 2: Update `server/db-schema-test.js`**

Add entries for keys `10` and `11` to the `MIGRATIONS_SQL` object at the bottom:

```js
  10: `
    CREATE TABLE IF NOT EXISTS ics_subscriptions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      url           TEXT    NOT NULL,
      color         TEXT    NOT NULL DEFAULT '#6366f1',
      shared        INTEGER NOT NULL DEFAULT 0,
      created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      etag          TEXT,
      last_modified TEXT,
      last_sync     TEXT,
      created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
  `,
  11: `
    CREATE TABLE calendar_events (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      title                TEXT    NOT NULL,
      description          TEXT,
      start_datetime       TEXT    NOT NULL,
      end_datetime         TEXT,
      all_day              INTEGER NOT NULL DEFAULT 0,
      location             TEXT,
      color                TEXT    NOT NULL DEFAULT '#007AFF',
      assigned_to          INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      external_calendar_id TEXT,
      external_source      TEXT    NOT NULL DEFAULT 'local'
                                   CHECK(external_source IN ('local', 'google', 'apple', 'ics')),
      recurrence_rule      TEXT,
      subscription_id      INTEGER REFERENCES ics_subscriptions(id) ON DELETE CASCADE,
      user_modified        INTEGER NOT NULL DEFAULT 0,
      created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      updated_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
    CREATE UNIQUE INDEX idx_calendar_sub_extid
      ON calendar_events (subscription_id, external_calendar_id)
      WHERE subscription_id IS NOT NULL;
  `,
```

- [ ] **Step 3: Create `test-ics-subscription.js`**

```js
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS_SQL } from './server/db-schema-test.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}: ${err.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON;');

// Minimal users table (migrations_sql[10] and [11] reference users)
db.exec(`CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL, avatar_color TEXT NOT NULL DEFAULT '#007AFF',
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);`);
db.exec(MIGRATIONS_SQL[10]);
db.exec(MIGRATIONS_SQL[11]);

const uid1 = db.prepare(`INSERT INTO users (username,display_name,password_hash,role) VALUES ('admin','Admin','x','admin')`).run().lastInsertRowid;
const uid2 = db.prepare(`INSERT INTO users (username,display_name,password_hash) VALUES ('maria','Maria','x')`).run().lastInsertRowid;

console.log('\n[ICS-Subscription-Test] DB-Schema\n');

let subId;

test('Abonnement anlegen', () => {
  subId = db.prepare(`INSERT INTO ics_subscriptions (name,url,color,shared,created_by) VALUES ('Feiertage','https://x.com/de.ics','#FF3B30',0,?)`).run(uid1).lastInsertRowid;
  assert(subId > 0);
});

test('Geteiltes Abonnement anlegen', () => {
  const id = db.prepare(`INSERT INTO ics_subscriptions (name,url,color,shared,created_by) VALUES ('Schulferien','https://x.com/school.ics','#34C759',1,?)`).run(uid2).lastInsertRowid;
  assert(id > 0);
});

test('ICS-Event einfügen (external_source=ics)', () => {
  const id = db.prepare(`INSERT INTO calendar_events (title,start_datetime,all_day,external_source,external_calendar_id,subscription_id,created_by) VALUES ('Neujahr','2026-01-01',1,'ics','neujahr@test',?,?)`).run(subId, uid1).lastInsertRowid;
  assert(id > 0);
});

test('Doppelte UID in gleicher Subscription verletzt UNIQUE', () => {
  let threw = false;
  try { db.prepare(`INSERT INTO calendar_events (title,start_datetime,all_day,external_source,external_calendar_id,subscription_id,created_by) VALUES ('Dup','2026-01-01',1,'ics','neujahr@test',?,?)`).run(subId, uid1); }
  catch { threw = true; }
  assert(threw, 'UNIQUE should fire');
});

test('Gleiche UID in anderer Subscription erlaubt', () => {
  const sub2 = db.prepare(`INSERT INTO ics_subscriptions (name,url,color,created_by) VALUES ('Sub2','https://b.com/b.ics','#000',?)`).run(uid1).lastInsertRowid;
  const id = db.prepare(`INSERT INTO calendar_events (title,start_datetime,all_day,external_source,external_calendar_id,subscription_id,created_by) VALUES ('Neujahr2','2026-01-01',1,'ics','neujahr@test',?,?)`).run(sub2, uid1).lastInsertRowid;
  assert(id > 0);
});

test('user_modified Default ist 0', () => {
  const ev = db.prepare(`SELECT user_modified FROM calendar_events WHERE subscription_id = ?`).get(subId);
  assert(ev.user_modified === 0);
});

test('user_modified auf 1 setzen', () => {
  db.prepare(`UPDATE calendar_events SET user_modified = 1 WHERE subscription_id = ?`).run(subId);
  assert(db.prepare(`SELECT user_modified FROM calendar_events WHERE subscription_id = ?`).get(subId).user_modified === 1);
});

test('Sichtbarkeitsfilter: privates Abo unsichtbar für anderen User', () => {
  const rows = db.prepare(`
    SELECT e.id FROM calendar_events e
    JOIN ics_subscriptions s ON s.id = e.subscription_id
    WHERE e.external_source = 'ics' AND (s.shared = 1 OR s.created_by = ?)
  `).all(uid2);
  // uid2 sieht nur geteilte Events (Schulferien hat kein Event yet), nicht Feiertage (privat von uid1)
  const ids = rows.map(r => r.id);
  assert(!ids.includes(1), 'privates Abo nicht sichtbar für uid2');
});

test('Cascade delete: Subscription löschen entfernt Events', () => {
  const tmp = db.prepare(`INSERT INTO ics_subscriptions (name,url,color,created_by) VALUES ('Tmp','https://t.com/t.ics','#999',?)`).run(uid1).lastInsertRowid;
  db.prepare(`INSERT INTO calendar_events (title,start_datetime,all_day,external_source,external_calendar_id,subscription_id,created_by) VALUES ('TmpEv','2026-06-01',1,'ics','tmp@test',?,?)`).run(tmp, uid1);
  db.prepare(`DELETE FROM ics_subscriptions WHERE id = ?`).run(tmp);
  assert(db.prepare(`SELECT count(*) as c FROM calendar_events WHERE subscription_id = ?`).get(tmp).c === 0, 'cascade failed');
});

test('external_source CHECK blockiert ungültige Werte', () => {
  let threw = false;
  try { db.prepare(`INSERT INTO calendar_events (title,start_datetime,external_source,created_by) VALUES ('Bad','2026-01-01','invalid',?)`).run(uid1); }
  catch { threw = true; }
  assert(threw, 'CHECK should reject invalid external_source');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 4: Add test scripts to `package.json`**

Add `"test:ics-sub": "node --experimental-sqlite test-ics-subscription.js"` to scripts. Append `&& node --experimental-sqlite test-ics-subscription.js` to the `"test"` script.

- [ ] **Step 5: Run subscription DB tests**

```bash
cd oikos && node --experimental-sqlite test-ics-subscription.js
```

Expected: all `✓`, exit 0.

- [ ] **Step 6: Run full test suite**

```bash
cd oikos && npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add server/db.js server/db-schema-test.js test-ics-subscription.js package.json
git commit -m "feat(calendar): add ics_subscriptions table and calendar_events columns (migrations v10-v11)"
```

---

## Task 3: ICS subscription service

**Files:**
- Create: `server/services/ics-subscription.js`

- [ ] **Step 1: Create `server/services/ics-subscription.js`**

```js
import dns from 'node:dns/promises';
import fetch from 'node-fetch';
import { createLogger } from '../logger.js';
import * as db from '../db.js';
import { parseICS, expandRRULE } from './ics-parser.js';

const log = createLogger('ICS');

const SYNC_WINDOW_PAST_MONTHS   = 6;
const SYNC_WINDOW_FUTURE_MONTHS = 12;
const MAX_RESPONSE_BYTES        = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS          = 15_000;

const PRIVATE_RANGES = [
  /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^169\.254\./, /^::1$/, /^fc/i, /^fe[89ab]/i,
];

const syncingNow = new Set();

function normalizeUrl(raw) {
  const url = new URL(raw.replace(/^webcal:\/\//i, 'https://'));
  if (url.protocol !== 'https:') throw new Error('Nur https:// und webcal:// URLs sind erlaubt.');
  return url.href;
}

async function checkSSRF(urlStr) {
  const hostname = new URL(urlStr).hostname;
  const v4 = await dns.resolve4(hostname).catch(() => []);
  const v6 = await dns.resolve6(hostname).catch(() => []);
  for (const addr of [...v4, ...v6]) {
    if (PRIVATE_RANGES.some((re) => re.test(addr))) {
      throw new Error(`URL löst auf eine private IP-Adresse auf: ${addr}`);
    }
  }
}

async function fetchAndParse(urlRaw, etag, lastModified) {
  const url = normalizeUrl(urlRaw);
  await checkSSRF(url);

  const headers = {};
  if (etag)         headers['If-None-Match']     = etag;
  if (lastModified) headers['If-Modified-Since'] = lastModified;

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { headers, signal: controller.signal });
  } finally { clearTimeout(timer); }

  if (res.status === 304) return { notModified: true };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const cl = parseInt(res.headers.get('content-length') || '0', 10);
  if (cl > MAX_RESPONSE_BYTES) throw new Error('ICS-Datei überschreitet 10 MB Limit.');

  let body = '', received = 0;
  for await (const chunk of res.body) {
    received += chunk.length;
    if (received > MAX_RESPONSE_BYTES) throw new Error('ICS-Datei überschreitet 10 MB Limit.');
    body += chunk.toString();
  }

  return {
    events:          parseICS(body),
    newEtag:         res.headers.get('etag') || null,
    newLastModified: res.headers.get('last-modified') || null,
    notModified:     false,
  };
}

function syncWindow() {
  const now = new Date();
  const past = new Date(now); past.setMonth(past.getMonth() - SYNC_WINDOW_PAST_MONTHS);
  const future = new Date(now); future.setMonth(future.getMonth() + SYNC_WINDOW_FUTURE_MONTHS);
  return { windowStart: past.toISOString().slice(0, 10), windowEnd: future.toISOString().slice(0, 10) };
}

async function syncOne(sub) {
  if (syncingNow.has(sub.id)) {
    log.info(`Abonnement ${sub.id} wird bereits synchronisiert - übersprungen.`);
    return;
  }
  syncingNow.add(sub.id);
  try {
    let result;
    try { result = await fetchAndParse(sub.url, sub.etag, sub.last_modified); }
    catch (err) {
      log.warn(`Abonnement ${sub.id} (${sub.name}): Fetch fehlgeschlagen - ${err.message}`);
      return;
    }

    if (result.notModified) {
      db.get().prepare(`UPDATE ics_subscriptions SET last_sync = ? WHERE id = ?`)
        .run(new Date().toISOString(), sub.id);
      return;
    }

    const { events, newEtag, newLastModified } = result;
    const { windowStart, windowEnd } = syncWindow();
    const owner    = db.get().prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get();
    const createdBy = sub.created_by ?? owner?.id;
    if (!createdBy) { log.warn('Kein User gefunden.'); return; }

    const flatEvents = [];
    for (const ev of events) {
      if (ev.rrule) {
        flatEvents.push(...expandRRULE(ev, windowStart, windowEnd));
      } else if (ev.dtstart >= windowStart && ev.dtstart <= windowEnd) {
        flatEvents.push(ev);
      }
    }

    const seenUids = new Set(flatEvents.map((e) => e.uid));

    const upsert = db.get().prepare(`
      INSERT INTO calendar_events
        (title, description, start_datetime, end_datetime, all_day, location,
         color, external_calendar_id, external_source, subscription_id, recurrence_rule, user_modified, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ics', ?, ?, 0, ?)
      ON CONFLICT(subscription_id, external_calendar_id) DO UPDATE SET
        title          = excluded.title,
        description    = excluded.description,
        start_datetime = excluded.start_datetime,
        end_datetime   = excluded.end_datetime,
        all_day        = excluded.all_day,
        location       = excluded.location
      WHERE user_modified = 0
    `);

    const deleteStale = db.get().prepare(`
      DELETE FROM calendar_events
      WHERE subscription_id = ?
        AND external_calendar_id NOT IN (SELECT value FROM json_each(?))
        AND user_modified = 0
    `);

    db.get().transaction(() => {
      for (const ev of flatEvents) {
        try {
          upsert.run(ev.summary, ev.description, ev.dtstart, ev.dtend,
            ev.allDay ? 1 : 0, ev.location, sub.color, ev.uid, sub.id, ev.rrule, createdBy);
        } catch (err) { log.error(`Upsert UID ${ev.uid}: ${err.message}`); }
      }
      deleteStale.run(sub.id, JSON.stringify([...seenUids]));
      db.get().prepare(`UPDATE ics_subscriptions SET last_sync = ?, etag = ?, last_modified = ? WHERE id = ?`)
        .run(new Date().toISOString(), newEtag, newLastModified, sub.id);
    })();

    log.info(`Abonnement ${sub.id} (${sub.name}): ${flatEvents.length} Events synchronisiert.`);
  } finally { syncingNow.delete(sub.id); }
}

async function sync(subscriptionId) {
  const subs = subscriptionId
    ? db.get().prepare('SELECT * FROM ics_subscriptions WHERE id = ?').all(subscriptionId)
    : db.get().prepare('SELECT * FROM ics_subscriptions').all();
  for (const sub of subs) await syncOne(sub);
}

function getAll(userId) {
  return db.get().prepare(`
    SELECT * FROM ics_subscriptions WHERE shared = 1 OR created_by = ? ORDER BY name ASC
  `).all(userId);
}

async function create(userId, { name, url, color, shared }) {
  const normalizedUrl = normalizeUrl(url);
  await checkSSRF(normalizedUrl);
  const subId = db.get().prepare(
    `INSERT INTO ics_subscriptions (name,url,color,shared,created_by) VALUES (?,?,?,?,?)`
  ).run(name, normalizedUrl, color, shared ? 1 : 0, userId).lastInsertRowid;
  const newSub = db.get().prepare('SELECT * FROM ics_subscriptions WHERE id = ?').get(subId);
  let syncError = null;
  try { await syncOne(newSub); } catch (err) { syncError = err.message; }
  return { sub: newSub, syncError };
}

function update(userId, subId, fields, isAdmin) {
  const sub = db.get().prepare('SELECT * FROM ics_subscriptions WHERE id = ?').get(subId);
  if (!sub) return null;
  if (!isAdmin && sub.created_by !== userId) throw new Error('Nicht autorisiert.');
  const name   = fields.name   !== undefined ? fields.name   : sub.name;
  const color  = fields.color  !== undefined ? fields.color  : sub.color;
  const shared = fields.shared !== undefined ? (fields.shared ? 1 : 0) : sub.shared;
  db.get().prepare(`UPDATE ics_subscriptions SET name = ?, color = ?, shared = ? WHERE id = ?`)
    .run(name, color, shared, subId);
  return db.get().prepare('SELECT * FROM ics_subscriptions WHERE id = ?').get(subId);
}

function remove(userId, subId, isAdmin) {
  const sub = db.get().prepare('SELECT * FROM ics_subscriptions WHERE id = ?').get(subId);
  if (!sub) return false;
  if (!isAdmin && sub.created_by !== userId) throw new Error('Nicht autorisiert.');
  db.get().prepare('DELETE FROM ics_subscriptions WHERE id = ?').run(subId);
  return true;
}

export { sync, getAll, create, update, remove, fetchAndParse };
```

- [ ] **Step 2: Run full test suite**

```bash
cd oikos && npm test
```

Expected: all tests pass.

---

## Task 4: Routes + sync integration

**Files:**
- Modify: `server/routes/calendar.js`
- Modify: `server/index.js`

- [ ] **Step 1: Add import to `server/routes/calendar.js`**

At the top of the file, after the existing imports, add:

```js
import * as icsSubscription from '../services/ics-subscription.js';
```

- [ ] **Step 2: Update `VALID_SOURCES` in `calendar.js`**

Change line 21 from:
```js
const VALID_SOURCES = ['local', 'google', 'apple'];
```
to:
```js
const VALID_SOURCES = ['local', 'google', 'apple', 'ics'];
```

- [ ] **Step 3: Add ICS visibility filter to GET `/` in `calendar.js`**

Inside the `router.get('/', ...)` handler, locate the `let sql = \`...\`` block. After the last `params.push(...)` call and before `sql += ' ORDER BY ...'`, add:

```js
    const userId = req.session.userId;
    sql += ` AND (
      e.external_source != 'ics'
      OR e.subscription_id IN (
        SELECT id FROM ics_subscriptions WHERE shared = 1 OR created_by = ${parseInt(userId, 10)}
      )
    )`;
```

Apply the same filter to the `/upcoming` route's SQL query.

- [ ] **Step 4: Add `user_modified = 1` on ICS event edit**

Find the existing `PATCH /:id` route handler. After the main UPDATE statement runs and before `res.json(...)`, add:

```js
    const updated = db.get().prepare('SELECT external_source FROM calendar_events WHERE id = ?').get(eventId);
    if (updated?.external_source === 'ics') {
      db.get().prepare('UPDATE calendar_events SET user_modified = 1 WHERE id = ?').run(eventId);
    }
```

- [ ] **Step 5: Add reset endpoint — before the `export default router` line**

```js
router.patch('/:id/reset', (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    const event   = db.get().prepare(`
      SELECT e.*, s.created_by AS sub_owner
      FROM calendar_events e
      LEFT JOIN ics_subscriptions s ON s.id = e.subscription_id
      WHERE e.id = ?
    `).get(eventId);
    if (!event) return res.status(404).json({ error: 'Nicht gefunden.', code: 404 });
    if (event.external_source !== 'ics')
      return res.status(400).json({ error: 'Nur ICS-Events können zurückgesetzt werden.', code: 400 });
    const isAdmin  = req.session.userRole === 'admin';
    const canReset = isAdmin || event.created_by === req.session.userId || event.sub_owner === req.session.userId;
    if (!canReset) return res.status(403).json({ error: 'Nicht autorisiert.', code: 403 });
    db.get().prepare('UPDATE calendar_events SET user_modified = 0 WHERE id = ?').run(eventId);
    res.json({ data: { reset: true } });
  } catch (err) {
    log.error('', err);
    res.status(500).json({ error: 'Interner Fehler', code: 500 });
  }
});
```

- [ ] **Step 6: Add subscription CRUD routes — before `export default router`**

```js
router.get('/subscriptions', (req, res) => {
  try {
    res.json({ data: icsSubscription.getAll(req.session.userId) });
  } catch (err) { log.error('', err); res.status(500).json({ error: 'Interner Fehler', code: 500 }); }
});

router.post('/subscriptions', async (req, res) => {
  try {
    const { name: nameRaw, url: urlRaw, color: colorRaw, shared } = req.body;
    const nameRes  = str(nameRaw, 'name', { max: 100 });
    const colorRes = color(colorRaw, 'color');
    const errors   = collectErrors([nameRes, colorRes]);
    if (!urlRaw) errors.push('url ist erforderlich.');
    else {
      try { new URL(urlRaw.replace(/^webcal:\/\//i, 'https://')); }
      catch { errors.push('url ist keine gültige URL.'); }
      if (!/^(https?|webcal):\/\//i.test(urlRaw)) errors.push('Nur https:// und webcal:// erlaubt.');
    }
    if (errors.length) return res.status(400).json({ error: errors.join(' '), code: 400 });
    const result = await icsSubscription.create(req.session.userId, {
      name: nameRes.value, url: urlRaw, color: colorRes.value || '#6366f1', shared: !!shared,
    });
    res.status(201).json({ data: result.sub, syncError: result.syncError });
  } catch (err) {
    log.error('', err);
    const code = err.message.includes('private IP') ? 400 : 500;
    res.status(code).json({ error: err.message, code });
  }
});

router.patch('/subscriptions/:id', (req, res) => {
  try {
    const subId   = parseInt(req.params.id, 10);
    const isAdmin = req.session.userRole === 'admin';
    const errors  = [];
    if (req.body.name  !== undefined) { const r = str(req.body.name, 'name', { max: 100 }); if (r.error) errors.push(r.error); }
    if (req.body.color !== undefined) { const r = color(req.body.color, 'color'); if (r.error) errors.push(r.error); }
    if (errors.length) return res.status(400).json({ error: errors.join(' '), code: 400 });
    const updated = icsSubscription.update(req.session.userId, subId, req.body, isAdmin);
    if (!updated) return res.status(404).json({ error: 'Nicht gefunden.', code: 404 });
    res.json({ data: updated });
  } catch (err) {
    log.error('', err);
    if (err.message === 'Nicht autorisiert.') return res.status(403).json({ error: err.message, code: 403 });
    res.status(500).json({ error: 'Interner Fehler', code: 500 });
  }
});

router.delete('/subscriptions/:id', (req, res) => {
  try {
    const subId   = parseInt(req.params.id, 10);
    const isAdmin = req.session.userRole === 'admin';
    const ok      = icsSubscription.remove(req.session.userId, subId, isAdmin);
    if (!ok) return res.status(404).json({ error: 'Nicht gefunden.', code: 404 });
    res.json({ ok: true });
  } catch (err) {
    log.error('', err);
    if (err.message === 'Nicht autorisiert.') return res.status(403).json({ error: err.message, code: 403 });
    res.status(500).json({ error: 'Interner Fehler', code: 500 });
  }
});

router.post('/subscriptions/:id/sync', async (req, res) => {
  try {
    const subId   = parseInt(req.params.id, 10);
    const isAdmin = req.session.userRole === 'admin';
    const sub     = db.get().prepare('SELECT * FROM ics_subscriptions WHERE id = ?').get(subId);
    if (!sub) return res.status(404).json({ error: 'Nicht gefunden.', code: 404 });
    if (!isAdmin && sub.created_by !== req.session.userId)
      return res.status(403).json({ error: 'Nicht autorisiert.', code: 403 });
    await icsSubscription.sync(subId);
    const row = db.get().prepare('SELECT last_sync FROM ics_subscriptions WHERE id = ?').get(subId);
    res.json({ ok: true, lastSync: row.last_sync });
  } catch (err) {
    log.error('', err);
    res.status(500).json({ error: err.message, code: 500 });
  }
});
```

**Important:** These subscription routes must be registered BEFORE the `/:id` route to avoid Express matching `subscriptions` as an `:id` parameter. Place them above the `router.get('/:id', ...)` handler.

- [ ] **Step 7: Wire ICS sync into `server/index.js`**

Add import after existing service imports:
```js
import * as icsSubscription from './services/ics-subscription.js';
```

In `runSync()`, after the Apple Calendar block, add:
```js
  icsSubscription.sync().catch((e) => logSync.error('ICS Fehler:', e.message));
```

- [ ] **Step 8: Run full test suite**

```bash
cd oikos && npm test
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add server/services/ics-subscription.js server/routes/calendar.js server/index.js
git commit -m "feat(calendar): add ICS subscription service, routes, and sync integration"
```

---

## Task 5: i18n keys

**Files:**
- Modify: `public/locales/de.json`

- [ ] **Step 1: Add keys to the `"settings"` object**

Open `public/locales/de.json`. Inside the `"settings"` object, add an `"ics"` sub-object:

```json
"ics": {
  "title": "ICS-Abonnements",
  "noSubscriptions": "Noch keine Abonnements.",
  "add": "Abonnement hinzufügen",
  "cancel": "Abbrechen",
  "save": "Speichern",
  "syncNow": "Jetzt synchronisieren",
  "syncing": "Synchronisiert...",
  "edit": "Bearbeiten",
  "delete": "Löschen",
  "confirmDelete": "Abonnement und alle zugehörigen Events löschen?",
  "badgePrivate": "Privat",
  "badgeShared": "Geteilt",
  "lastSync": "Zuletzt synchronisiert:",
  "neverSynced": "Noch nicht synchronisiert",
  "syncError": "Erster Sync fehlgeschlagen:",
  "form": {
    "urlLabel": "ICS-URL",
    "urlPlaceholder": "https://... oder webcal://...",
    "nameLabel": "Name",
    "namePlaceholder": "z.B. Feiertage Deutschland",
    "colorLabel": "Farbe",
    "sharedLabel": "Für alle Familienmitglieder sichtbar"
  }
}
```

- [ ] **Step 2: Add key to the `"calendar"` object**

```json
"icsReset": "Auf Original zurücksetzen"
```

- [ ] **Step 3: Validate JSON**

```bash
cd oikos && node -e "JSON.parse(require('fs').readFileSync('public/locales/de.json','utf8')); console.log('JSON valid')"
```

Expected: `JSON valid`

---

## Task 6: Settings page UI

**Files:**
- Modify: `public/pages/settings.js`

- [ ] **Step 1: Add subscriptions to the data fetch in `render()`**

Find the `Promise.allSettled([...])` call (around line 63). Add `api.get('/calendar/subscriptions')` as the last entry. After the `allSettled` destructuring, add:

```js
let icsSubscriptions = [];
// Change the destructuring to capture the 6th result:
const [usersRes, gStatus, aStatus, prefsRes, catsRes, icsRes] = await Promise.allSettled([...]);
if (icsRes.status === 'fulfilled') icsSubscriptions = icsRes.value.data ?? [];
```

- [ ] **Step 2: Update `bindEvents()` signature**

Change the function signature from `bindEvents(container, user, categories)` to `bindEvents(container, user, categories, icsSubscriptions)`.

Update the call at the end of `render()` to `bindEvents(container, user, categories, icsSubscriptions)`.

- [ ] **Step 3: Add the ICS card to the calendar tab HTML in the template string**

Locate the closing `</section>` of the calendar sync section (after the Apple Calendar card). Before that closing tag, add:

```html
<!-- ICS Abonnements -->
<div class="settings-card" id="ics-section">
  <h3 class="settings-card__title">${t('settings.ics.title')}</h3>
  <ul class="ics-subscription-list" id="ics-list"></ul>
  <button class="btn btn--secondary settings-add-btn" id="ics-add-btn">${t('settings.ics.add')}</button>
  <div class="settings-card settings-card--hidden" id="ics-add-form-card">
    <form id="ics-add-form" class="settings-form settings-form--compact">
      <div class="form-group">
        <label class="form-label" for="ics-url">${t('settings.ics.form.urlLabel')}</label>
        <input class="form-input" type="url" id="ics-url" placeholder="${t('settings.ics.form.urlPlaceholder')}" required />
      </div>
      <div class="form-group">
        <label class="form-label" for="ics-name">${t('settings.ics.form.nameLabel')}</label>
        <input class="form-input" type="text" id="ics-name" placeholder="${t('settings.ics.form.namePlaceholder')}" required maxlength="100" />
      </div>
      <div class="form-group">
        <label class="form-label" for="ics-color">${t('settings.ics.form.colorLabel')}</label>
        <input class="form-input form-input--color" type="color" id="ics-color" value="#6366f1" />
      </div>
      <div class="form-group">
        <label class="form-label">
          <input type="checkbox" id="ics-shared" />
          ${t('settings.ics.form.sharedLabel')}
        </label>
      </div>
      <div id="ics-add-error" class="form-error" hidden></div>
      <div class="settings-form-actions">
        <button type="submit" class="btn btn--primary" id="ics-add-submit">${t('settings.ics.save')}</button>
        <button type="button" class="btn btn--secondary" id="ics-add-cancel">${t('settings.ics.cancel')}</button>
      </div>
    </form>
  </div>
</div>
```

- [ ] **Step 4: Add `renderIcsList()` helper before `bindEvents()`**

```js
function renderIcsList(container, subs, currentUserId, isAdmin) {
  const list = container.querySelector('#ics-list');
  if (!list) return;
  list.replaceChildren();

  if (!subs.length) {
    const li = document.createElement('li');
    li.className = 'ics-subscription-list__empty';
    li.textContent = t('settings.ics.noSubscriptions');
    list.appendChild(li);
    return;
  }

  for (const sub of subs) {
    const li = document.createElement('li');
    li.className = 'ics-subscription-list__item';
    li.dataset.id = sub.id;

    const dot = document.createElement('span');
    dot.className = 'ics-subscription-list__dot';
    dot.style.background = sub.color;

    const info = document.createElement('div');
    info.className = 'ics-subscription-list__info';

    const name = document.createElement('span');
    name.className = 'ics-subscription-list__name';
    name.textContent = sub.name;

    const badge = document.createElement('span');
    badge.className = `ics-subscription-list__badge${sub.shared ? ' ics-subscription-list__badge--shared' : ''}`;
    badge.textContent = sub.shared ? t('settings.ics.badgeShared') : t('settings.ics.badgePrivate');

    const meta = document.createElement('span');
    meta.className = 'ics-subscription-list__meta';
    meta.textContent = sub.last_sync
      ? `${t('settings.ics.lastSync')} ${formatDate(sub.last_sync)}`
      : t('settings.ics.neverSynced');

    info.appendChild(name);
    info.appendChild(badge);
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'ics-subscription-list__actions';

    if (isAdmin || sub.created_by === currentUserId) {
      const syncBtn = document.createElement('button');
      syncBtn.className = 'btn btn--secondary btn--sm ics-sync-btn';
      syncBtn.dataset.id = sub.id;
      syncBtn.textContent = t('settings.ics.syncNow');
      actions.appendChild(syncBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn--danger-outline btn--sm ics-delete-btn';
      delBtn.dataset.id = sub.id;
      delBtn.textContent = t('settings.ics.delete');
      actions.appendChild(delBtn);
    }

    li.appendChild(dot);
    li.appendChild(info);
    li.appendChild(actions);
    list.appendChild(li);
  }
}
```

Note: `formatDate` must be imported from `i18n.js`. Check the existing imports at the top of `settings.js` and add `formatDate` if not already present.

- [ ] **Step 5: Add ICS event bindings at the end of `bindEvents()`**

Append to the `bindEvents` function body:

```js
  // ---- ICS Subscriptions ----
  let icsSubs = [...icsSubscriptions];
  renderIcsList(container, icsSubs, user.id, user.role === 'admin');

  function rebindIcsList() {
    container.querySelectorAll('.ics-sync-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id, 10);
        const origText = btn.textContent;
        btn.disabled = true;
        btn.textContent = t('settings.ics.syncing');
        try {
          await api.post(`/calendar/subscriptions/${id}/sync`);
          const fresh = await api.get('/calendar/subscriptions');
          icsSubs = fresh.data ?? [];
          renderIcsList(container, icsSubs, user.id, user.role === 'admin');
          rebindIcsList();
        } catch { /* non-critical */ } finally {
          if (btn.isConnected) { btn.disabled = false; btn.textContent = origText; }
        }
      });
    });

    container.querySelectorAll('.ics-delete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm(t('settings.ics.confirmDelete'))) return;
        const id = parseInt(btn.dataset.id, 10);
        try {
          await api.delete(`/calendar/subscriptions/${id}`);
          icsSubs = icsSubs.filter((s) => s.id !== id);
          renderIcsList(container, icsSubs, user.id, user.role === 'admin');
          rebindIcsList();
        } catch { /* non-critical */ }
      });
    });
  }

  rebindIcsList();

  const icsAddBtn      = container.querySelector('#ics-add-btn');
  const icsAddFormCard = container.querySelector('#ics-add-form-card');
  const icsAddCancel   = container.querySelector('#ics-add-cancel');
  const icsAddForm     = container.querySelector('#ics-add-form');
  const icsAddError    = container.querySelector('#ics-add-error');

  if (icsAddBtn) {
    icsAddBtn.addEventListener('click', () => {
      icsAddFormCard.classList.toggle('settings-card--hidden');
    });
  }

  if (icsAddCancel) {
    icsAddCancel.addEventListener('click', () => {
      icsAddFormCard.classList.add('settings-card--hidden');
      icsAddForm.reset();
      icsAddError.hidden = true;
    });
  }

  if (icsAddForm) {
    icsAddForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = container.querySelector('#ics-add-submit');
      submitBtn.disabled = true;
      icsAddError.hidden = true;
      const url    = container.querySelector('#ics-url').value.trim();
      const name   = container.querySelector('#ics-name').value.trim();
      const color  = container.querySelector('#ics-color').value;
      const shared = container.querySelector('#ics-shared').checked;
      try {
        const res = await api.post('/calendar/subscriptions', { url, name, color, shared });
        icsSubs.push(res.data);
        renderIcsList(container, icsSubs, user.id, user.role === 'admin');
        rebindIcsList();
        icsAddFormCard.classList.add('settings-card--hidden');
        icsAddForm.reset();
        if (res.syncError) {
          icsAddError.textContent = `${t('settings.ics.syncError')} ${res.syncError}`;
          icsAddError.hidden = false;
        }
      } catch (err) {
        icsAddError.textContent = err.message;
        icsAddError.hidden = false;
      } finally {
        submitBtn.disabled = false;
      }
    });
  }
```

- [ ] **Step 6: Test in the browser**

```bash
cd oikos && npm run dev
```

Open http://localhost:3000, log in, navigate to Settings → Kalender. Verify:
- "ICS-Abonnements" card appears below Apple Calendar
- Clicking "Abonnement hinzufügen" shows the inline form
- Submitting a valid public ICS URL (e.g. `https://www.thunderbird.net/media/caldata/holidays_de.ics`) creates the subscription
- The new subscription appears in the list with name, color dot, badge, and last sync time
- "Löschen" removes the subscription after confirmation
- "Jetzt synchronisieren" updates the last sync time

---

## Task 7: Calendar page — ICS event color + reset link

**Files:**
- Modify: `public/pages/calendar.js`

- [ ] **Step 1: Load subscriptions alongside events**

In `calendar.js`, find where events are fetched (likely a call to `api.get('/calendar?...')`). Replace with a parallel fetch:

```js
const [eventsRes, subsRes] = await Promise.all([
  api.get(`/calendar?from=${from}&to=${to}`),
  api.get('/calendar/subscriptions'),
]);
const events        = eventsRes.data ?? [];
const subscriptions = subsRes.data   ?? [];
const subMap        = Object.fromEntries(subscriptions.map((s) => [s.id, s]));
```

Keep `subMap` accessible in the scope where events are rendered.

- [ ] **Step 2: Apply subscription color when rendering events**

Wherever an event's color is used to set a background or border, replace `event.color` with:

```js
const displayColor = (event.external_source === 'ics' && subMap[event.subscription_id])
  ? subMap[event.subscription_id].color
  : event.color;
```

Use `displayColor` for the style property.

- [ ] **Step 3: Add reset link in event detail panel**

In the event detail display code, after rendering the event information, add:

```js
if (event.external_source === 'ics' && event.user_modified) {
  const resetLink = document.createElement('a');
  resetLink.href = '#';
  resetLink.className = 'ics-reset-link';
  resetLink.textContent = t('calendar.icsReset');
  resetLink.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/calendar/${event.id}/reset`);
      resetLink.remove();
    } catch { /* non-critical */ }
  });
  detailPanel.appendChild(resetLink);
}
```

Replace `detailPanel` with the actual DOM reference in `calendar.js` for the event detail area.

- [ ] **Step 4: Test in the browser**

With `npm run dev` running:
1. Add an ICS subscription in Settings → Kalender (use a public holiday feed)
2. Navigate to the Calendar page
3. Verify ICS events appear in the subscription's chosen color
4. Open an ICS event, edit and save it
5. Verify the "Auf Original zurücksetzen" link appears in the detail view
6. Click the link — verify it disappears (indicating `user_modified` was reset)

- [ ] **Step 5: Run full test suite**

```bash
cd oikos && npm test
```

Expected: all tests pass.

- [ ] **Step 6: Final commit**

```bash
git add public/pages/settings.js public/pages/calendar.js public/locales/de.json
git commit -m "feat(calendar): ICS subscription UI, event color rendering, and reset link"
```

---

## Spec Coverage Check

| Spec Requirement | Task |
|---|---|
| Any user can add subscriptions | Task 4: POST /subscriptions — no admin check |
| Private/shared visibility toggle | Tasks 5+6: `shared` field + visibility filter |
| Custom color per subscription | Tasks 3+7: color stored, applied to events |
| Sync interval = SYNC_INTERVAL_MINUTES | Task 4: ICS sync in runSync() |
| Manual "Sync now" button | Tasks 4+6: POST /:id/sync + button UI |
| User-modified events not overwritten | Task 3: `WHERE user_modified = 0` in upsert |
| Reset to upstream | Tasks 4+7: PATCH /:id/reset + reset link |
| Events deleted with subscription | Task 2: ON DELETE CASCADE |
| RRULE expansion in rolling window | Task 1: expandRRULE() |
| webcal:// normalization | Task 3: normalizeUrl() |
| SSRF protection | Task 3: checkSSRF() |
| 15s timeout + 10MB limit | Task 3: fetchAndParse() |
| ETag/Last-Modified conditional fetch | Task 3: headers + 304 handling |
| Stale event cleanup | Task 3: deleteStale in syncOne() |
| In-memory mutex | Task 3: syncingNow Set |
| Settings UI card (DOM API) | Task 6: renderIcsList() with createElement |
| i18n keys | Task 5 |
| DB migrations v10-v11 | Task 2 |
| Unique index per subscription+UID | Task 2 |
| ON DELETE SET NULL on created_by | Task 2 |
