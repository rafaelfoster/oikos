# CardDAV Contacts Sync Design

**Issue:** #10 – CardDAV provider for Contacts  
**Date:** 2026-05-04  
**Status:** Approved

## Overview

Enable multi-account CardDAV synchronization for the Contacts module, allowing family members to sync their phone contacts into Oikos. This implements inbound-only sync (CardDAV → Oikos) with smart merging, multiple values per contact (phones, emails, addresses), and per-account addressbook selection.

## Requirements Summary

Based on Issue #10 and design discussion:

1. **Multi-Account Support** – Connect multiple CardDAV servers simultaneously (iCloud, Nextcloud, company servers)
2. **Addressbook Selection** – Checkbox-based enable/disable per addressbook (like CalDAV calendar selection)
3. **Inbound-Only Sync** – CardDAV → Oikos; no outbound sync (read-only from server perspective)
4. **Smart Merge** – Match by email/phone; update existing contacts instead of creating duplicates
5. **Editable with Merge** – Synced contacts are editable in Oikos; manual changes preserved (only NULL fields filled on sync)
6. **Hybrid Sync** – Auto-sync via cron + manual "Sync Now" button
7. **Visual Source Marking** – Icon/badge shows which account synced each contact
8. **Keep on Delete** – When account/addressbook deleted, contacts remain (lose CardDAV link, become manual contacts)
9. **Settings Integration** – New "Contacts Sync" section in Settings → Calendar tab
10. **Full Field Support** – Extended schema for all iOS/Android contact fields (organization, job title, birthday, website, photo, nickname)
11. **Multiple Values** – Separate tables for phones/emails/addresses with labels (mobile, work, home)

## Architecture

### Components

- **Service:** `server/services/cardav-sync.js` – Account management, addressbook discovery, contact sync
- **API Routes:** `server/routes/contacts.js` extended + new `/cardav/*` endpoints
- **DB Tables:** 6 new/extended tables (Migration 30)
- **UI:** Settings → Calendar tab extended with "Contacts Sync" section
- **Library:** `tsdav` (already present as optionalDependency)

### Data Flow

```
CardDAV Server → tsdav → cardav-sync.js → Smart Merge → contacts + contact_phones/emails/addresses
                                              ↓
                                    UI (Settings, Contacts List)
```

## Database Schema (Migration 30)

### New Table: `cardav_accounts`

```sql
CREATE TABLE cardav_accounts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,              -- User-defined label ("iCloud", "Nextcloud")
  cardav_url TEXT NOT NULL,              -- CardDAV server base URL
  username   TEXT NOT NULL,              -- CardDAV username
  password   TEXT NOT NULL,              -- Encrypted if DB_ENCRYPTION_KEY set
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  last_sync  TEXT,                       -- ISO 8601, nullable
  UNIQUE(cardav_url, username)
);
```

### New Table: `cardav_addressbook_selection`

```sql
CREATE TABLE cardav_addressbook_selection (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id      INTEGER NOT NULL,      -- FK → cardav_accounts
  addressbook_url TEXT NOT NULL,         -- CardDAV addressbook URL
  addressbook_name TEXT NOT NULL,        -- Display name from provider
  enabled         INTEGER NOT NULL DEFAULT 1,  -- 0 = disabled, 1 = enabled
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE(account_id, addressbook_url),
  FOREIGN KEY(account_id) REFERENCES cardav_accounts(id) ON DELETE CASCADE
);
```

### Extended Table: `contacts`

```sql
ALTER TABLE contacts ADD COLUMN organization TEXT;      -- Company/Organization
ALTER TABLE contacts ADD COLUMN job_title TEXT;         -- Job title
ALTER TABLE contacts ADD COLUMN birthday TEXT;          -- ISO 8601 date (YYYY-MM-DD)
ALTER TABLE contacts ADD COLUMN website TEXT;           -- URL
ALTER TABLE contacts ADD COLUMN photo TEXT;             -- Base64 data URL
ALTER TABLE contacts ADD COLUMN nickname TEXT;
ALTER TABLE contacts ADD COLUMN cardav_account_id INTEGER;  -- FK → cardav_accounts, nullable
ALTER TABLE contacts ADD COLUMN cardav_uid TEXT;        -- vCard UID from server, nullable
ALTER TABLE contacts ADD COLUMN cardav_addressbook_url TEXT; -- Source addressbook, nullable

-- Indices for Smart Merge
CREATE INDEX idx_contacts_cardav_uid ON contacts(cardav_uid);
CREATE INDEX idx_contacts_email ON contacts(email);
```

**Note:** Existing `phone`, `email`, `address` columns remain for backward compatibility and as fallback for primary values.

### New Table: `contact_phones`

```sql
CREATE TABLE contact_phones (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL,
  label      TEXT,                       -- 'mobile', 'work', 'home', 'other', 'iphone', 'main', 'fax'
  value      TEXT NOT NULL,              -- Phone number
  is_primary INTEGER NOT NULL DEFAULT 0, -- 1 = primary number
  FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);
CREATE INDEX idx_contact_phones_contact ON contact_phones(contact_id);
CREATE INDEX idx_contact_phones_value ON contact_phones(value);
```

### New Table: `contact_emails`

```sql
CREATE TABLE contact_emails (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL,
  label      TEXT,                       -- 'work', 'home', 'other', 'icloud'
  value      TEXT NOT NULL,              -- Email address
  is_primary INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);
CREATE INDEX idx_contact_emails_contact ON contact_emails(contact_id);
CREATE INDEX idx_contact_emails_value ON contact_emails(value);
```

### New Table: `contact_addresses`

```sql
CREATE TABLE contact_addresses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id  INTEGER NOT NULL,
  label       TEXT,                      -- 'home', 'work', 'other'
  street      TEXT,
  city        TEXT,
  state       TEXT,
  postal_code TEXT,
  country     TEXT,
  is_primary  INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);
CREATE INDEX idx_contact_addresses_contact ON contact_addresses(contact_id);
```

### Design Decisions

- **`cardav_uid`** stores vCard UID from server for re-sync identification
- **`cardav_account_id`** is NULL for manual contacts, set for synced contacts
- **Account deletion:** Sets `cardav_account_id = NULL` (contacts remain as manual contacts)
- **`is_primary`** flag marks primary phone/email/address for UI display and tel:/mailto: links
- **Backward compatibility:** Existing `phone`, `email`, `address` columns remain; synced contacts also populate these with primary values

## Sync Service (`server/services/cardav-sync.js`)

### Structure

```javascript
// Account Management
addAccount(name, cardavUrl, username, password)
  → Test connection via tsdav
  → Store encrypted password
  → Insert into cardav_accounts
  → Discover and insert addressbooks
  → Return { account, addressbooks }

deleteAccount(accountId)
  → SET cardav_account_id = NULL for all contacts (keep contacts)
  → DELETE from cardav_accounts (CASCADE deletes addressbook_selection)

testConnection(cardavUrl, username, password)
  → Use tsdav.createDAVClient() to connect
  → Fetch addressbooks to verify
  → Return { ok: true, addressbooks } or throw error

getAllAccounts()
  → SELECT * FROM cardav_accounts

// Addressbook Discovery
discoverAddressbooks(accountId)
  → Fetch addressbooks from server via tsdav
  → UPSERT into cardav_addressbook_selection
  → Return list with enabled status

// Contact Sync
syncAccount(accountId)
  → Get all enabled addressbooks for account
  → For each: syncAddressbook(accountId, addressbookUrl)
  → Update last_sync timestamp
  → Return { synced: count, errors: count }

syncAddressbook(accountId, addressbookUrl)
  → Fetch all vCards from addressbook via tsdav
  → For each vCard: parseAndMergeContact(vCardText, accountId, addressbookUrl)

parseAndMergeContact(vCardText, accountId, addressbookUrl)
  → Parse vCard fields (see Field Mapping below)
  → Apply Smart Merge Logic
  → Insert/Update contacts + contact_phones/emails/addresses
```

### Smart Merge Logic

```
1. Extract UID from vCard

2. Check: EXISTS contact WHERE cardav_uid = UID?
   → YES: 
      - UPDATE existing contact (only NULL fields are filled)
      - Preserve manual changes in non-NULL fields
      - UPDATE cardav_account_id, cardav_addressbook_url
   → NO: 
      Check: EXISTS contact WHERE email IN vCard.emails OR phone IN vCard.phones?
      → YES: 
         - UPDATE existing contact (fill NULL fields)
         - SET cardav_uid, cardav_account_id (establish link)
      → NO: 
         - INSERT new contact with all vCard fields
         - SET cardav_uid, cardav_account_id

3. Update contact_phones/emails/addresses:
   - DELETE existing entries for this contact WHERE is_primary = 0
   - INSERT new entries from vCard
   - Keep entries WHERE is_primary = 1 (manually marked)
   - If no primary exists, mark first entry as primary
```

### Field Mapping (vCard → Oikos)

| vCard Property | Oikos Field(s) | Notes |
|----------------|----------------|-------|
| `FN` | `name` | Formatted name |
| `N` | `name` | Fallback if FN missing |
| `TEL` | `contact_phones` | Multiple entries with labels |
| `EMAIL` | `contact_emails` | Multiple entries with labels |
| `ADR` | `contact_addresses` | Multiple entries with labels |
| `ORG` | `organization` | Company/organization |
| `TITLE` | `job_title` | Job title |
| `URL` | `website` | First URL (if multiple, take first) |
| `BDAY` | `birthday` | ISO 8601 date (YYYY-MM-DD) |
| `PHOTO` | `photo` | Base64 data URL |
| `NICKNAME` | `nickname` | Nickname |
| `NOTE` | `notes` | Notes |
| `CATEGORIES` | `category` | Map to Oikos categories or use 'Sonstiges' |

### Error Handling

- **Connection failures:** Log error, skip sync, return error to UI
- **Invalid vCards:** Log warning, skip contact, continue with next
- **Database errors:** Rollback transaction, return error
- **Auth failures:** Log error, mark account as "needs re-auth" (future enhancement)

## API Routes

### New CardDAV Management Routes

```
POST   /api/v1/contacts/cardav/accounts
  Body: { name, cardavUrl, username, password }
  Response: { data: { account, addressbooks: [...] } }

GET    /api/v1/contacts/cardav/accounts
  Response: { data: [{ id, name, cardavUrl, username, lastSync }] }

DELETE /api/v1/contacts/cardav/accounts/:id
  Response: { data: { deleted: true } }

POST   /api/v1/contacts/cardav/accounts/:id/test
  Response: { data: { ok: true } }

GET    /api/v1/contacts/cardav/accounts/:id/addressbooks
  Response: { data: [{ id, url, name, enabled }] }

POST   /api/v1/contacts/cardav/accounts/:id/addressbooks/refresh
  Response: { data: [{ id, url, name, enabled }] }

PUT    /api/v1/contacts/cardav/addressbooks/:id
  Body: { enabled: true/false }
  Response: { data: { id, enabled } }

POST   /api/v1/contacts/cardav/accounts/:id/sync
  Response: { data: { synced: 15, errors: 0 } }
```

### Extended Contacts Routes

```
GET    /api/v1/contacts/:id
  Response: { 
    data: {
      id, name, category, notes, organization, jobTitle, birthday, 
      website, photo, nickname, cardavAccountId, cardavUid,
      phones: [{ id, label, value, isPrimary }],
      emails: [{ id, label, value, isPrimary }],
      addresses: [{ id, label, street, city, state, postalCode, country, isPrimary }]
    }
  }

POST   /api/v1/contacts
  Body: { name, ..., phones: [...], emails: [...], addresses: [...] }
  Response: { data: Contact }

PUT    /api/v1/contacts/:id
  Body: { name, ..., phones: [...], emails: [...], addresses: [...] }
  Response: { data: Contact }
```

## UI Integration

### Settings → Calendar Tab (Extended)

Restructure with two sections:

```
Settings → Calendar
  
  [Section 1: Calendar Sync]
    - Google Calendar OAuth
    - CalDAV Accounts
    - ICS Subscriptions
  
  [Section 2: Contacts Sync] ← NEW
    - CardDAV Accounts
```

**CardDAV Account Card:**

```html
<div class="sync-account-card">
  <div class="account-header">
    <strong>iCloud</strong>
    <span class="last-sync">Last sync: 2 minutes ago</span>
  </div>
  <div class="account-actions">
    <button class="refresh-addressbooks">Refresh Addressbooks</button>
    <button class="sync-now">Sync Now</button>
    <button class="delete-account">Delete</button>
  </div>
  
  <!-- Addressbook Selection (expandable) -->
  <div class="addressbook-list">
    <label>
      <input type="checkbox" checked data-id="1"> 
      📇 Personal (enabled)
    </label>
    <label>
      <input type="checkbox" data-id="2"> 
      💼 Work (disabled)
    </label>
  </div>
</div>
```

**Add Account Modal:**
- Fields: Name, CardDAV URL, Username, Password
- Test connection on save
- On success: Show addressbook list immediately

### Contact List (`public/pages/contacts.js`)

**Source Badge:**

```html
<div class="contact-card">
  <div class="contact-header">
    <strong>Max Mustermann</strong>
    <span class="contact-source-badge" v-if="contact.cardavAccountId">
      <i data-lucide="cloud"></i> iCloud
    </span>
  </div>
  <div class="contact-phones">
    📱 +49 123 456 (mobile) · 🏢 +49 789 (work)
  </div>
  <div class="contact-emails">
    ✉️ max@example.com (home) · 💼 max@work.com (work)
  </div>
</div>
```

### Contact Modal (Extended)

**New Fields:**
- Organization (text input)
- Job Title (text input)
- Birthday (date picker)
- Website (URL input)
- Nickname (text input)
- Photo (upload button, like Birthdays module)

**Multiple Values UI:**

```html
<div class="form-group">
  <label>Phone Numbers</label>
  <div id="phones-list">
    <div class="multi-value-row">
      <select class="phone-label">
        <option value="mobile">Mobile</option>
        <option value="work">Work</option>
        <option value="home">Home</option>
        <option value="other">Other</option>
      </select>
      <input type="tel" class="phone-value" value="+49 123">
      <label class="checkbox-inline">
        <input type="checkbox" class="is-primary"> Primary
      </label>
      <button class="btn-remove">✕</button>
    </div>
  </div>
  <button id="add-phone" class="btn btn--secondary">+ Add Phone</button>
</div>

<!-- Same pattern for Emails and Addresses -->
```

## Testing (`test-cardav.js`)

Uses Node's built-in test runner with in-memory SQLite (like `test-caldav.js`).

### Test Coverage

```javascript
// DB Schema
- should create cardav_accounts table
- should create cardav_addressbook_selection table with FK CASCADE
- should add new columns to contacts table
- should create contact_phones/emails/addresses tables
- should enforce UNIQUE constraint on (cardav_url, username)

// Account Management
- should add account and store encrypted password
- should reject duplicate accounts (same URL + username)
- should delete account and set contacts' cardav_account_id = NULL
- should keep contacts when account is deleted

// Addressbook Selection
- should insert addressbook selection
- should CASCADE delete when account deleted
- should toggle enabled/disabled status

// Smart Merge Logic
- should create new contact when cardav_uid not found
- should update existing contact when cardav_uid matches
- should match by email and link to CardDAV
- should match by phone and link to CardDAV
- should fill only NULL fields on merge (preserve manual changes)

// Multiple Values
- should insert multiple phones/emails/addresses
- should mark is_primary correctly
- should CASCADE delete when contact deleted

// vCard Parsing
- should parse FN, N, TEL, EMAIL, ADR, ORG, TITLE, URL, BDAY, PHOTO, NOTE
- should handle missing optional fields
- should handle multiple TEL/EMAIL/ADR entries with labels
```

### Mock Strategy

- In-memory SQLite (no persistent DB)
- Mock `tsdav` imports with fixture vCard data
- No real CardDAV server calls in tests

## Implementation Notes

### Phase 1: Database & Core Service
1. Migration 30 (all tables)
2. `server/services/cardav-sync.js` (account management, sync logic)
3. Tests for DB schema and sync logic

### Phase 2: API Routes
4. New `/api/v1/contacts/cardav/*` routes
5. Extended `/api/v1/contacts` routes for multiple values
6. Tests for API routes

### Phase 3: UI Integration
7. Settings → Calendar tab extended
8. Contact list with source badges
9. Contact modal extended (new fields, multiple values)
10. Tests for UI interactions

### Phase 4: Cron Integration
11. Add CardDAV sync to existing cron job (like CalDAV)
12. Use same `SYNC_INTERVAL_MINUTES` env var

## Security Considerations

- **Password Encryption:** Use same encryption as CalDAV (DB_ENCRYPTION_KEY)
- **CSRF Protection:** All POST/PUT/DELETE routes use existing CSRF middleware
- **Session Auth:** All routes require authenticated session
- **Input Validation:** Validate all fields (max lengths, URL format, email format)
- **SQL Injection:** Use parameterized queries (better-sqlite3)
- **XSS Prevention:** Use `esc()` for all user-generated content in UI

## Future Enhancements

- **Conflict Resolution UI:** Show conflicts when manual changes differ from server
- **Selective Field Sync:** Choose which fields to sync per addressbook
- **Sync Statistics:** Show detailed sync logs (added, updated, skipped)
- **vCard Export (Multi):** Export all contacts as single .vcf file
- **CardDAV Server Mode:** Oikos as CardDAV server (Issue #10 mentioned this as possible future)

---

**Design Status:** ✅ Approved  
**Next Step:** Create implementation plan via `writing-plans` skill
