# CardDAV API Routes — Implementation Design

**Date:** 2026-05-04  
**Status:** Approved  
**Related:** [CardDAV Contacts Design](../../designs/2026-05-04-cardav-contacts-design.md)

## Überblick

Implementierung von 11 API Routes für CardDAV Contacts Integration:
- 8 neue CardDAV Management Routes (Account CRUD, Addressbook Discovery, Sync)
- 3 erweiterte Contacts Routes (Multi-Value-Felder: phones, emails, addresses)

## Entscheidungen

### Route-Organisation
- **CardDAV Management Routes:** Neue Datei `server/routes/cardav.js`
- **Extended Contacts Routes:** Existierende `server/routes/contacts.js` erweitern
- **Rationale:** Klare Trennung (Contact CRUD vs. CardDAV Management), folgt Oikos One-Router-Per-Module Pattern

### Implementierungs-Reihenfolge
**User Flow Approach:**
1. Account Management (POST/GET/DELETE)
2. Connection Test
3. Addressbook Discovery & Toggle
4. Sync Operations
5. Extended Contacts Routes

**Rationale:** Natürliche User Journey, einfacher zu testen

### Architektur
**Route-Level Validation mit Service Delegation:**
- Routes validieren Input mit `validate.js` Middleware
- Routes delegieren Business Logic an `cardav-sync.js`
- **Rationale:** Konsistent mit existierenden Oikos-Routes, bessere User-facing Error Messages

### Error Handling
**Einfaches Fallback:**
```javascript
catch (err) {
  log.error('CardDAV error:', err);
  res.status(500).json({ error: err.message || 'Interner Fehler', code: 500 });
}
```
**Rationale:** Funktioniert sofort, Error-Klassen können später eingeführt werden

---

## File Structure

### Neue Dateien
- `server/routes/cardav.js` — CardDAV Management Routes

### Geänderte Dateien
- `server/routes/contacts.js` — Extended Contacts Routes (Multi-Values)
- `server/index.js` — Mount cardav.js Router
- `server/openapi.js` — 11 neue Path Definitionen
- `test-carddav.js` — API Route Tests

### Mount Point
```javascript
// server/index.js
import cardavRouter from './routes/cardav.js';
app.use('/api/v1/contacts/cardav', cardavRouter);
```

Alle CardDAV-Routes unter `/api/v1/contacts/cardav/*`, Extended Contacts unter `/api/v1/contacts/*`.

---

## Route Definitions

### CardDAV Management Routes

#### 1. POST /api/v1/contacts/cardav/accounts
**Zweck:** Account erstellen und Addressbooks discovern

**Request:**
```json
{
  "name": "iCloud",
  "cardavUrl": "https://contacts.icloud.com",
  "username": "user@icloud.com",
  "password": "app-specific-password"
}
```

**Validation:**
- `name`: str, max MAX_TITLE, required
- `cardavUrl`: str, max MAX_URL, required
- `username`: str, max MAX_TITLE, required
- `password`: str, max MAX_TITLE, required

**Service Call:**
```javascript
const result = await CardDAVSync.addAccount(name, cardavUrl, username, password);
```

**Response:** `201 Created`
```json
{
  "data": {
    "account": {
      "id": 1,
      "name": "iCloud",
      "cardavUrl": "https://contacts.icloud.com",
      "username": "user@icloud.com",
      "lastSync": null
    },
    "addressbooks": [
      { "id": 1, "url": "https://...", "name": "Personal", "enabled": 1 }
    ]
  }
}
```

---

#### 2. GET /api/v1/contacts/cardav/accounts
**Zweck:** Alle Accounts auflisten

**Service Call:**
```javascript
const accounts = await CardDAVSync.getAllAccounts();
```

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": 1,
      "name": "iCloud",
      "cardavUrl": "https://contacts.icloud.com",
      "username": "user@icloud.com",
      "lastSync": "2026-05-04T10:30:00Z"
    }
  ]
}
```

---

#### 3. DELETE /api/v1/contacts/cardav/accounts/:id
**Zweck:** Account löschen (CASCADE löscht addressbooks + contacts)

**Validation:**
- `id`: parseInt, must be > 0

**Service Call:**
```javascript
await CardDAVSync.deleteAccount(id);
```

**Response:** `200 OK`
```json
{
  "data": { "deleted": true }
}
```

---

#### 4. POST /api/v1/contacts/cardav/accounts/:id/test
**Zweck:** Connection testen (ohne Account zu erstellen)

**Validation:**
- `id`: parseInt, must be > 0

**Logic:**
1. Account aus DB laden
2. `testConnection(cardavUrl, username, password)` aufrufen

**Response:** `200 OK`
```json
{
  "data": {
    "ok": true,
    "addressbooks": [...]
  }
}
```

---

#### 5. GET /api/v1/contacts/cardav/accounts/:id/addressbooks
**Zweck:** Addressbooks für Account auflisten

**Validation:**
- `id`: parseInt, must be > 0

**DB Query:**
```sql
SELECT id, addressbook_url as url, addressbook_name as name, enabled
FROM carddav_addressbook_selection
WHERE account_id = ?
ORDER BY addressbook_name
```

**Response:** `200 OK`
```json
{
  "data": [
    { "id": 1, "url": "https://...", "name": "Personal", "enabled": 1 },
    { "id": 2, "url": "https://...", "name": "Work", "enabled": 0 }
  ]
}
```

---

#### 6. POST /api/v1/contacts/cardav/accounts/:id/addressbooks/refresh
**Zweck:** Addressbooks neu discovern (PROPFIND)

**Validation:**
- `id`: parseInt, must be > 0

**Logic:**
1. Account aus DB laden
2. `discoverAddressbooks(account)` aufrufen
3. Addressbooks aus DB neu laden

**Response:** `200 OK`
```json
{
  "data": [
    { "id": 1, "url": "https://...", "name": "Personal", "enabled": 1 }
  ]
}
```

---

#### 7. PUT /api/v1/contacts/cardav/addressbooks/:id
**Zweck:** Addressbook enable/disable

**Request:**
```json
{
  "enabled": true
}
```

**Validation:**
- `id`: parseInt, must be > 0
- `enabled`: bool, required

**Service Call:**
```javascript
await CardDAVSync.toggleAddressbook(id, enabled);
```

**Response:** `200 OK`
```json
{
  "data": { "id": 1, "enabled": true }
}
```

---

#### 8. POST /api/v1/contacts/cardav/accounts/:id/sync
**Zweck:** Account syncen (alle enabled addressbooks)

**Validation:**
- `id`: parseInt, must be > 0

**Logic:**
1. Account aus DB laden
2. `syncAccount(account)` aufrufen

**Response:** `200 OK`
```json
{
  "data": {
    "synced": 15,
    "errors": 0
  }
}
```

---

### Extended Contacts Routes

#### 9. GET /api/v1/contacts/:id
**Zweck:** Kontakt mit allen Multi-Value-Feldern laden

**Validation:**
- `id`: parseInt, must be > 0

**DB Queries:**
```sql
SELECT * FROM contacts WHERE id = ?;
SELECT * FROM contact_phones WHERE contact_id = ?;
SELECT * FROM contact_emails WHERE contact_id = ?;
SELECT * FROM contact_addresses WHERE contact_id = ?;
```

**Response:** `200 OK`
```json
{
  "data": {
    "id": 1,
    "name": "Alice Smith",
    "category": "Sonstiges",
    "organization": "Tech Corp",
    "jobTitle": "Developer",
    "birthday": "1990-01-15",
    "website": "https://alice.dev",
    "nickname": "Ali",
    "notes": "Great developer",
    "cardavAccountId": 1,
    "cardavUid": "urn:uuid:alice-123",
    "phones": [
      { "id": 1, "label": "mobile", "value": "+1234567890", "isPrimary": 1 },
      { "id": 2, "label": "work", "value": "+0987654321", "isPrimary": 0 }
    ],
    "emails": [
      { "id": 1, "label": "home", "value": "alice@home.com", "isPrimary": 1 }
    ],
    "addresses": [
      {
        "id": 1,
        "label": "home",
        "street": "123 Main St",
        "city": "Springfield",
        "state": "IL",
        "postalCode": "62701",
        "country": "USA",
        "isPrimary": 1
      }
    ]
  }
}
```

---

#### 10. POST /api/v1/contacts
**Zweck:** Kontakt mit Multi-Values erstellen

**Request:**
```json
{
  "name": "Bob Jones",
  "category": "Sonstiges",
  "phones": [
    { "label": "mobile", "value": "+1111111111", "isPrimary": true }
  ],
  "emails": [
    { "label": "work", "value": "bob@work.com", "isPrimary": true }
  ],
  "addresses": []
}
```

**Validation:**
- `name`: str, max MAX_TITLE, required
- `category`: oneOf(VALID_CATEGORIES), default 'Sonstiges'
- `phones`: validatePhones() (siehe Validation Schema)
- `emails`: validateEmails()
- `addresses`: validateAddresses()
- Alle anderen Felder optional

**Logic (Transaction):**
```javascript
const transaction = db.get().transaction(() => {
  // 1. INSERT contact
  const result = db.get().prepare(`
    INSERT INTO contacts (name, category, ...)
    VALUES (?, ?, ...)
  `).run(...);
  const contactId = result.lastInsertRowid;
  
  // 2. INSERT phones (bulk)
  if (phones?.length) {
    const placeholders = phones.map(() => '(?, ?, ?, ?)').join(', ');
    const values = phones.flatMap(p => [contactId, p.label, p.value, p.isPrimary ? 1 : 0]);
    db.get().prepare(`INSERT INTO contact_phones (...) VALUES ${placeholders}`).run(...values);
  }
  
  // 3. INSERT emails (bulk)
  // 4. INSERT addresses (bulk)
  
  return contactId;
});

const contactId = transaction();
```

**Response:** `201 Created`
```json
{
  "data": { /* Contact mit allen Multi-Values */ }
}
```

---

#### 11. PUT /api/v1/contacts/:id
**Zweck:** Kontakt mit Multi-Values updaten

**Request:**
```json
{
  "name": "Bob Jones Updated",
  "phones": [
    { "label": "mobile", "value": "+2222222222", "isPrimary": true }
  ]
}
```

**Validation:**
- `id`: parseInt, must be > 0
- Alle Felder optional (nur gesendete werden geupdatet)

**Logic (Transaction):**
```javascript
const transaction = db.get().transaction(() => {
  // 1. UPDATE contacts (nur gesendete Felder)
  const updates = [];
  const params = [];
  if (req.body.name !== undefined) {
    updates.push('name = ?');
    params.push(req.body.name);
  }
  // ... andere Felder
  params.push(id);
  db.get().prepare(`UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  
  // 2. Wenn phones gesendet: DELETE + INSERT
  if (req.body.phones !== undefined) {
    db.get().prepare('DELETE FROM contact_phones WHERE contact_id = ?').run(id);
    // ... bulk INSERT wie in POST
  }
  
  // 3. Wenn emails gesendet: DELETE + INSERT
  // 4. Wenn addresses gesendet: DELETE + INSERT
});

transaction();
```

**Response:** `200 OK`
```json
{
  "data": { /* Updated Contact mit allen Multi-Values */ }
}
```

---

## Validation Schema

### CardDAV Routes

```javascript
import { str, bool, collectErrors, MAX_TITLE, MAX_URL } from '../middleware/validate.js';

// POST /accounts
const vName     = str(req.body.name, 'Name', { max: MAX_TITLE });
const vUrl      = str(req.body.cardavUrl, 'CardDAV URL', { max: MAX_URL });
const vUsername = str(req.body.username, 'Username', { max: MAX_TITLE });
const vPassword = str(req.body.password, 'Password', { max: MAX_TITLE });
const errors = collectErrors([vName, vUrl, vUsername, vPassword]);
if (errors.length) return res.status(400).json({ error: errors.join(' '), code: 400 });

// PUT /addressbooks/:id
const vEnabled = bool(req.body.enabled, 'Enabled');
if (vEnabled.error) return res.status(400).json({ error: vEnabled.error, code: 400 });

// Alle :id params
const id = parseInt(req.params.id, 10);
if (!id || id < 1) return res.status(400).json({ error: 'Invalid ID', code: 400 });
```

### Extended Contacts Routes

**Multi-Value Array Validators:**

```javascript
// phones: [{ label, value, isPrimary? }]
function validatePhones(phones) {
  if (!Array.isArray(phones)) return { valid: false, error: 'Phones must be an array' };
  for (let p of phones) {
    if (!p.label || !p.value) return { valid: false, error: 'Phone requires label and value' };
    if (typeof p.label !== 'string' || p.label.length > 50) {
      return { valid: false, error: 'Phone label invalid or too long' };
    }
    if (typeof p.value !== 'string' || p.value.length > 50) {
      return { valid: false, error: 'Phone value invalid or too long' };
    }
  }
  return { valid: true };
}

// emails: [{ label, value, isPrimary? }]
function validateEmails(emails) {
  if (!Array.isArray(emails)) return { valid: false, error: 'Emails must be an array' };
  for (let e of emails) {
    if (!e.label || !e.value) return { valid: false, error: 'Email requires label and value' };
    if (typeof e.label !== 'string' || e.label.length > 50) {
      return { valid: false, error: 'Email label invalid or too long' };
    }
    if (typeof e.value !== 'string' || e.value.length > 255) {
      return { valid: false, error: 'Email value invalid or too long' };
    }
  }
  return { valid: true };
}

// addresses: [{ label, street?, city?, state?, postalCode?, country?, isPrimary? }]
function validateAddresses(addresses) {
  if (!Array.isArray(addresses)) return { valid: false, error: 'Addresses must be an array' };
  for (let a of addresses) {
    if (!a.label) return { valid: false, error: 'Address requires label' };
    if (typeof a.label !== 'string' || a.label.length > 50) {
      return { valid: false, error: 'Address label invalid or too long' };
    }
    // street, city, state, postalCode, country sind optional
    // Wenn vorhanden: Type-Check + Max-Length (255 für Text-Felder)
    const fields = ['street', 'city', 'state', 'postalCode', 'country'];
    for (let field of fields) {
      if (a[field] !== undefined && (typeof a[field] !== 'string' || a[field].length > 255)) {
        return { valid: false, error: `Address ${field} invalid or too long` };
      }
    }
  }
  return { valid: true };
}
```

**Usage in Routes:**

```javascript
// POST/PUT /contacts
if (req.body.phones !== undefined) {
  const phoneCheck = validatePhones(req.body.phones);
  if (!phoneCheck.valid) return res.status(400).json({ error: phoneCheck.error, code: 400 });
}

if (req.body.emails !== undefined) {
  const emailCheck = validateEmails(req.body.emails);
  if (!emailCheck.valid) return res.status(400).json({ error: emailCheck.error, code: 400 });
}

if (req.body.addresses !== undefined) {
  const addressCheck = validateAddresses(req.body.addresses);
  if (!addressCheck.valid) return res.status(400).json({ error: addressCheck.error, code: 400 });
}
```

---

## Service Integration

### Import Pattern

```javascript
// server/routes/cardav.js
import { createLogger } from '../logger.js';
import express from 'express';
import * as db from '../db.js';
import * as CardDAVSync from '../services/cardav-sync.js';
import { str, bool, collectErrors, MAX_TITLE, MAX_URL } from '../middleware/validate.js';

const log = createLogger('CardDAV');
const router = express.Router();
```

### Service Call Examples

**Async/Await Pattern:**
```javascript
router.post('/accounts', async (req, res) => {
  try {
    // Validation...
    
    const result = await CardDAVSync.addAccount(
      vName.value,
      vUrl.value,
      vUsername.value,
      vPassword.value
    );
    
    res.status(201).json({ data: result });
  } catch (err) {
    log.error('Error adding CardDAV account:', err);
    res.status(500).json({ error: err.message || 'Interner Fehler', code: 500 });
  }
});
```

**DB-Direct Queries** (wo kein Service existiert):
```javascript
router.get('/accounts/:id/addressbooks', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid ID', code: 400 });
    
    const addressbooks = db.get().prepare(`
      SELECT id, addressbook_url as url, addressbook_name as name, enabled
      FROM carddav_addressbook_selection
      WHERE account_id = ?
      ORDER BY addressbook_name
    `).all(id);
    
    res.json({ data: addressbooks });
  } catch (err) {
    log.error('Error fetching addressbooks:', err);
    res.status(500).json({ error: err.message, code: 500 });
  }
});
```

### Transaction Handling

**Extended Contacts Routes** nutzen Transactions für atomare Multi-Value-Updates:

```javascript
router.post('/', async (req, res) => {
  try {
    // Validation...
    
    const transaction = db.get().transaction(() => {
      // 1. Insert contact
      const result = db.get().prepare(`
        INSERT INTO contacts (name, category, organization, job_title, birthday, website, nickname, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        vName.value,
        vCategory.value || 'Sonstiges',
        req.body.organization || null,
        req.body.jobTitle || null,
        req.body.birthday || null,
        req.body.website || null,
        req.body.nickname || null,
        req.body.notes || null
      );
      const contactId = result.lastInsertRowid;
      
      // 2. Insert phones (bulk)
      if (req.body.phones?.length) {
        const phonePlaceholders = req.body.phones.map(() => '(?, ?, ?, ?)').join(', ');
        const phoneValues = req.body.phones.flatMap(p => [
          contactId,
          p.label,
          p.value,
          p.isPrimary ? 1 : 0
        ]);
        db.get().prepare(`
          INSERT INTO contact_phones (contact_id, label, value, is_primary)
          VALUES ${phonePlaceholders}
        `).run(...phoneValues);
      }
      
      // 3. Insert emails (analog)
      // 4. Insert addresses (analog)
      
      return contactId;
    });
    
    const contactId = transaction();
    
    // Fetch full contact with multi-values
    const contact = db.get().prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
    const phones = db.get().prepare('SELECT * FROM contact_phones WHERE contact_id = ?').all(contactId);
    const emails = db.get().prepare('SELECT * FROM contact_emails WHERE contact_id = ?').all(contactId);
    const addresses = db.get().prepare('SELECT * FROM contact_addresses WHERE contact_id = ?').all(contactId);
    
    res.status(201).json({
      data: {
        ...contact,
        phones,
        emails,
        addresses
      }
    });
  } catch (err) {
    log.error('Error creating contact:', err);
    res.status(500).json({ error: err.message, code: 500 });
  }
});
```

---

## OpenAPI Integration

Alle 11 Routes werden in `server/openapi.js` dokumentiert:

```javascript
// CardDAV Management Routes
'/api/v1/contacts/cardav/accounts': {
  get: op({ summary: 'List CardDAV accounts', tag: 'Contacts' }),
  post: op({ summary: 'Add CardDAV account', tag: 'Contacts', stateChanging: true, requestBody: jsonBody(null) }),
},

'/api/v1/contacts/cardav/accounts/{id}': {
  delete: op({ summary: 'Delete CardDAV account', tag: 'Contacts', params: [idParam()], stateChanging: true }),
},

'/api/v1/contacts/cardav/accounts/{id}/test': {
  post: op({ summary: 'Test CardDAV connection', tag: 'Contacts', params: [idParam()] }),
},

'/api/v1/contacts/cardav/accounts/{id}/addressbooks': {
  get: op({ summary: 'List addressbooks for account', tag: 'Contacts', params: [idParam()] }),
},

'/api/v1/contacts/cardav/accounts/{id}/addressbooks/refresh': {
  post: op({ summary: 'Refresh addressbooks for account', tag: 'Contacts', params: [idParam()], stateChanging: true }),
},

'/api/v1/contacts/cardav/addressbooks/{id}': {
  put: op({ summary: 'Toggle addressbook enabled state', tag: 'Contacts', params: [idParam()], stateChanging: true, requestBody: jsonBody(null) }),
},

'/api/v1/contacts/cardav/accounts/{id}/sync': {
  post: op({ summary: 'Sync CardDAV account', tag: 'Contacts', params: [idParam()], stateChanging: true }),
},

// Extended Contacts Routes (ersetzen existierende Definitionen)
'/api/v1/contacts/{id}': {
  get: op({ summary: 'Get contact with multi-value fields', tag: 'Contacts', params: [idParam()] }),
  put: op({ summary: 'Update contact with multi-value fields', tag: 'Contacts', params: [idParam()], stateChanging: true, requestBody: jsonBody(null) }),
  delete: op({ summary: 'Delete contact', tag: 'Contacts', params: [idParam()], stateChanging: true }),
},

'/api/v1/contacts': {
  get: op({ summary: 'List contacts', tag: 'Contacts' }),
  post: op({ summary: 'Create contact with multi-value fields', tag: 'Contacts', stateChanging: true, requestBody: jsonBody(null) }),
},
```

**Hinweis:** Alle Routes bleiben unter dem `'Contacts'` Tag für konsistente Swagger-Gruppierung.

---

## Testing Strategy

### Test File Structure

Neue Suite in `test-carddav.js`:

```javascript
describe('CardDAV API Routes', () => {
  
  describe('Account Management', () => {
    it('POST /accounts - should create account and discover addressbooks');
    it('POST /accounts - should return 400 for missing fields');
    it('GET /accounts - should list all accounts');
    it('GET /accounts - should return empty array when no accounts');
    it('DELETE /accounts/:id - should delete account and cascade addressbooks');
    it('DELETE /accounts/:id - should return 400 for invalid ID');
    it('POST /accounts/:id/test - should test connection');
  });
  
  describe('Addressbook Management', () => {
    it('GET /accounts/:id/addressbooks - should list addressbooks');
    it('GET /accounts/:id/addressbooks - should return empty array when none');
    it('POST /accounts/:id/addressbooks/refresh - should refresh addressbooks');
    it('PUT /addressbooks/:id - should enable addressbook');
    it('PUT /addressbooks/:id - should disable addressbook');
    it('PUT /addressbooks/:id - should return 400 for missing enabled field');
  });
  
  describe('Sync Operations', () => {
    it('POST /accounts/:id/sync - should return sync result structure');
  });
  
  describe('Extended Contacts Routes', () => {
    it('POST /contacts - should create contact with phones/emails/addresses');
    it('POST /contacts - should create contact without multi-values');
    it('POST /contacts - should return 400 for invalid phone array');
    it('POST /contacts - should return 400 for invalid email array');
    it('GET /contacts/:id - should return contact with all multi-values');
    it('GET /contacts/:id - should return 404 for non-existent contact');
    it('PUT /contacts/:id - should update contact and replace phones');
    it('PUT /contacts/:id - should update contact and keep existing multi-values if not sent');
    it('PUT /contacts/:id - should handle transaction rollback on error');
  });
});
```

### Testing Approach

**Direct Handler Testing:**

```javascript
// Mock Express req/res
function mockRequest(body = {}, params = {}, query = {}) {
  return { body, params, query };
}

function mockResponse() {
  const res = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.data = data; return res; };
  return res;
}

// Example Test
it('POST /accounts - should create account', async () => {
  const req = mockRequest({
    name: 'Test Account',
    cardavUrl: 'https://example.com/carddav',
    username: 'user',
    password: 'pass'
  });
  const res = mockResponse();
  
  // Note: Actual handler testing requires importing route handlers
  // This is simplified pseudo-code
  
  assert.strictEqual(res.statusCode, 201);
  assert.ok(res.data.data.account);
});
```

### Mocking External CardDAV

**Strategie:** Tests fokussieren auf HTTP-Layer (Validation, Response Format, DB-Operations).

Integration Tests für `cardav-sync.js` existieren bereits (Task #2), daher müssen API Route Tests nicht externe CardDAV-Server mocken.

**Für Sync/Discovery Routes:**
- Setup: Account + Addressbooks direkt in DB anlegen
- Test: Response-Struktur validieren
- Skip: Echte PROPFIND/REPORT Requests

### Test Coverage Goals

- ✅ Alle 11 Routes: mindestens 1 Happy-Path-Test
- ✅ Validation Errors (400) für alle POST/PUT Routes
- ✅ Not Found (404) für invalide IDs
- ✅ Multi-Value-Arrays korrekt gespeichert/geladen
- ✅ Transaction Rollback bei Fehlern
- ✅ Error Messages sind user-facing (nicht technische Stack Traces)

---

## Implementation Order

### Phase 1: CardDAV Management (Routes 1-3)
1. POST /accounts — Account erstellen
2. GET /accounts — Accounts auflisten
3. DELETE /accounts/:id — Account löschen

**Tests:** Account CRUD Happy Paths + Validation Errors

---

### Phase 2: Connection & Discovery (Routes 4-6)
4. POST /accounts/:id/test — Connection testen
5. GET /accounts/:id/addressbooks — Addressbooks auflisten
6. POST /accounts/:id/addressbooks/refresh — Addressbooks refreshen

**Tests:** Discovery Flow + Error Handling

---

### Phase 3: Addressbook Toggle & Sync (Routes 7-8)
7. PUT /addressbooks/:id — Addressbook togglen
8. POST /accounts/:id/sync — Sync triggern

**Tests:** Toggle + Sync Response Structure

---

### Phase 4: Extended Contacts (Routes 9-11)
9. GET /contacts/:id — Mit Multi-Values
10. POST /contacts — Mit Multi-Values erstellen
11. PUT /contacts/:id — Mit Multi-Values updaten

**Tests:** Multi-Value CRUD + Transaction Safety

---

## Next Steps

Nach Approval dieses Designs:
1. **Invoke `writing-plans` skill** — Detaillierten Implementation Plan erstellen
2. **TDD Approach** — Tests vor Implementation schreiben
3. **Code Review** nach jeder Phase

---

## Anhang: Service Functions Reference

Aus `server/services/cardav-sync.js`:

**Account Management:**
- `addAccount(name, cardavUrl, username, password)` → `{ account, addressbooks }`
- `getAllAccounts()` → `Account[]`
- `deleteAccount(accountId)` → `void`
- `testConnection(cardavUrl, username, password)` → `{ ok, addressbooks }`

**Addressbook Discovery:**
- `discoverAddressbooks(account)` → `Addressbook[]`
- `toggleAddressbook(addressbookId, enabled)` → `void`

**Contact Sync:**
- `syncAccount(account)` → `{ synced, errors }`
- `syncAddressbook(account, addressbook)` → `void`
- `parseAndMergeContact(vCardText, accountId, addressbookUrl)` → `void`

**Helpers:**
- `parseVCard(vCardText)` → `ContactData`
