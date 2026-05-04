# CardDAV API Routes Implementation - Fortschritt

**Stand:** 2026-05-04, nach Task 12 von 15 (Session 3)
**Plan:** `docs/superpowers/plans/2026-05-04-cardav-api-routes.md`
**Nächster Task:** Task 13 - PUT /contacts/:id mit Multi-Value Fields

## Abgeschlossene Tasks

### ✅ Task 1: Multi-Value Array Validators
**Commit:** a715475 + 930800e (fixes)

- Implementiert: `validatePhones()`, `validateEmails()`, `validateAddresses()`
- Location: `server/routes/contacts.js`
- Tests: 33 neue Tests in test-carddav.js
- Validierungen: Arrays, Objekt-Struktur, Pflichtfelder, Max-Längen, Email-Format, isPrimary-Typ, Array-Länge (max 20)

**Review-Findings & Fixes:**
- Spec Compliance: Minor extras (logging) - akzeptabel
- Code Quality Issues behoben:
  - Whitespace-Validierung ergänzt
  - Null-Guards hinzugefügt
  - Email-Format-Check ergänzt
  - isPrimary Typ-Validierung
  - DoS-Schutz: Array-Länge begrenzt auf 20

### ✅ Task 2: CardDAV Router Setup
**Commits:** cf68bff, 930800e

- Erstellt: `server/routes/cardav.js` mit Express Router
- Implementiert: GET /accounts Endpoint
- Test-Infrastruktur:
  - `_setTestDatabase()` / `_resetTestDatabase()` in `server/db.js`
  - before()/after() Hooks in test-carddav.js
  - Migration 30 wird in Tests angewendet
- Tests: 2 Tests (empty array, populated with shape validation)

**Review-Findings & Fixes:**
- Unused imports entfernt (wurden für Task 3 wieder gebraucht)
- Error-Message leakage behoben (generic "Interner Fehler")
- Test-Cleanup mit after() Hook
- `after` aus node:test importiert

### ✅ Task 3: POST /accounts - Create Account
**Commit:** f7eb73b

- Implementiert: POST /accounts mit Validation
- Validierung: name, cardavUrl, username, password (alle required, mit max lengths)
- Delegiert an: `CardDAVSync.addAccount()`
- Response: 201 mit `{ account, addressbooks }`
- Tests: 2 Tests (success case, validation failure)

**Test-Mocking:**
- `_mockTestConnection()` in cardav-sync.js hinzugefügt
- Mock gibt fake addressbooks zurück für Tests
- Mock wird in before() gesetzt, in after() zurückgesetzt

**Wichtige Änderung:**
- `addAccount()` Return-Wert geändert von `{ accountId, addressbooks }` zu `{ account: { id, name, cardavUrl, username, createdAt, lastSync }, addressbooks }`

### ✅ Task 4: DELETE /accounts/:id - Delete Account
**Commit:** ca92cb2

- Implementiert: DELETE /accounts/:id mit ID-Validierung
- Validierung: ID muss positive Ganzzahl sein
- Delegiert an: `CardDAVSync.deleteAccount(id)`
- Response: 200 mit `{ deleted: true }`
- Tests: 2 Tests (success case mit cascade, invalid ID → 400)
- CASCADE-Verhalten: Foreign Key Constraints löschen addressbooks + contacts automatisch

### ✅ Task 5: POST /accounts/:id/test - Test Connection
**Commit:** dd5ac88

- Implementiert: POST /accounts/:id/test mit ID-Validierung
- Lädt Account aus DB (404 wenn nicht gefunden)
- Delegiert an: `CardDAVSync.testConnection(url, username, password)`
- Response: 200 mit `{ ok, addressbooks }`
- Test: 1 Test (success case mit addressbooks)
- Verwendet gemockten testConnection für konsistente Test-Results

### ✅ Task 6: GET /accounts/:id/addressbooks - List Addressbooks
**Commit:** 12e8edf

- Implementiert: GET /accounts/:id/addressbooks mit ID-Validierung
- Query: carddav_addressbook_selection table, ORDER BY addressbook_name
- Response: 200 mit Array von `{ id, url, name, enabled }`
- Tests: 2 Tests (success case mit shape validation, empty array für non-existent account)

### ✅ Task 7: POST /accounts/:id/addressbooks/refresh - Refresh Addressbooks
**Commit:** c078a48

- Implementiert: POST /accounts/:id/addressbooks/refresh mit ID-Validierung
- Lädt Account aus DB (404 wenn nicht gefunden)
- Delegiert an: `CardDAVSync.discoverAddressbooks(accountId)` für PROPFIND
- Query updated addressbooks nach Discovery
- Response: 200 mit Array von addressbooks
- Test: 1 Test (success case)

### ✅ Task 8: Add bool Validator
**Commit:** 362f711

- Implementiert: `bool(val, field)` Validator in server/middleware/validate.js
- Validiert: type === 'boolean', required by default
- Exportiert: bool in export statement
- Keine Tests (wird in Task 9 verwendet)

### ✅ Task 9: PUT /addressbooks/:id - Toggle Addressbook
**Commit:** 9ec7fda

- Implementiert: PUT /addressbooks/:id Route in server/routes/cardav.js
- Validierung: ID muss positive Ganzzahl sein, enabled muss boolean sein
- Delegiert an: `CardDAVSync.toggleAddressbook(id, enabled)`
- Response: 200 mit `{ updated: true, enabled: boolean }`
- Tests: 2 Tests (success case mit toggle, validation failure für invalid enabled)
- bool Validator verwendet

### ✅ Task 10: POST /accounts/:id/sync - Sync Account
**Commit:** 674fe79

- Implementiert: POST /accounts/:id/sync Route in server/routes/cardav.js
- Validierung: ID muss positive Ganzzahl sein
- Lädt Account aus DB (404 wenn nicht gefunden)
- Delegiert an: `CardDAVSync.syncAccount(accountId)`
- Response: 200 mit `{ synced, contactsAdded, contactsUpdated }`
- Tests: 2 Tests (success case, 404 für non-existent account)
- Mock: `_mockSyncAccount()` für Tests hinzugefügt (Pattern wie `_mockTestConnection`)

### ✅ Task 11: GET /contacts/:id - With Multi-Value Fields
**Commit:** fe8af33

- Implementiert: GET /contacts/:id Route in `server/routes/contacts.js`
- Queries: Separate Abfragen für `contact_phones`, `contact_emails`, `contact_addresses`
- Mapping: is_primary (Integer DB) → isPrimary (Boolean Response), snake_case → camelCase
- Sortierung: ORDER BY is_primary DESC, id ASC (Primary-Einträge zuerst)
- Response-Format: `{ ...contact, phones: [], emails: [], addresses: [] }`
- Tests: 2 neue Tests
  - Contact mit allen Multi-Value Fields (phones, emails, addresses)
  - Contact ohne Multi-Value Fields (leere Arrays)
- TDD-Workflow eingehalten: RED → GREEN → Commit

### ✅ Task 12: POST /contacts - Create With Multi-Value Fields
**Commit:** [wird gesetzt nach commit]

- Implementiert: POST /contacts erweitert um phones, emails, addresses Arrays
- Validierung: `validatePhones()`, `validateEmails()`, `validateAddresses()` vor Insert
- Transaktionen: `db.transaction()` für atomare Contact + Multi-Values Inserts
- Backward Compatible: Optional fields, leere Arrays wenn nicht angegeben
- Response: Contact mit allen Multi-Value Fields inkl. generierte IDs
- Tests: 3 neue Tests
  - Contact mit allen Multi-Value Fields erstellen
  - Validierung: Fehler bei invaliden Phone-Daten (400)
  - Backward Compatibility: Contact ohne Multi-Values (leere Arrays)
- Refactoring: `loadMultiValueFields(contactId)` Helper extrahiert (DRY)
- TDD-Workflow eingehalten: RED → GREEN → REFACTOR → Commit

## Offene Tasks (13-15)

### 🔄 Task 13: PUT /contacts/:id
- Update mit Multi-Value Fields
- Replacement-Semantik für Arrays (DELETE + INSERT)
- Atomare Transaktionen

### 🔄 Task 14: OpenAPI Documentation
- Alle neuen Routes in `server/openapi.js` dokumentieren
- CardDAV Account Management Routes
- Addressbook Discovery Routes
- Sync Routes
- Contacts Multi-Value Schemas

### 🔄 Task 15: Mount CardDAV Router
- Router in `server/index.js` mounten unter `/api/v1/contacts/cardav`
- Auth + CSRF Middleware werden global angewendet
- Finale Integration Tests

## Wichtige Erkenntnisse

### Test-Infrastruktur
1. **DB-Mocking:** `_setTestDatabase()` / `_resetTestDatabase()` in db.js
2. **CardDAV-Mocking:** `_mockTestConnection()` in cardav-sync.js
3. **before()/after() Pattern:** Setup in before(), Cleanup in after()
4. **Migration 30:** Muss in jedem Test-Setup angewendet werden für CardDAV-Tabellen

### Code-Patterns
1. **Error-Handling:** Immer generic "Interner Fehler", niemals err.message leaken
2. **Validation:** str(), collectErrors(), MAX_TITLE (100), MAX_URL (500)
3. **Response-Format:** `{ data: ... }` für Success, `{ error: ..., code: ... }` für Fehler
4. **Status Codes:** 200 (GET), 201 (POST create), 400 (validation), 500 (server error)

### Konventionen
- Tests nutzen Node built-in test runner (`node:test`)
- Test-DB ist in-memory SQLite (`:memory:`)
- Commits mit Co-Authored-By: Claude Sonnet 4.5
- TDD-Workflow: Test → Run (fail) → Implement → Run (pass) → Commit

## Nächste Schritte beim Fortsetzen (Session 3 - Frische Session)

**Aktueller Stand:** Tasks 1-10 abgeschlossen (101 Tests bestehen), Tasks 11-15 offen

1. **Task 11 starten:** GET /contacts/:id - Mit Multi-Value Fields erweitern
   - Bestehende Route in `server/routes/contacts.js` lesen
   - Tests schreiben (TDD RED):
     - Success case: Contact mit phones, emails, addresses
     - Empty arrays wenn keine Multi-Values vorhanden
   - Route erweitern:
     - Zusätzliche Queries für `contact_phones`, `contact_emails`, `contact_addresses`
     - JOIN oder separate Queries
     - Response-Format: `{ ...existingFields, phones: [], emails: [], addresses: [] }`
   - Commit

2. **Task 12:** POST /contacts - Create With Multi-Values
   - Validierung mit `validatePhones()`, `validateEmails()`, `validateAddresses()` (bereits implementiert in Task 1)
   - Atomare Transaktionen (BEGIN/COMMIT) für Contact + Multi-Values
   - Tests für Success + Validation

3. **Task 13:** PUT /contacts/:id - Update With Multi-Values
   - Replacement-Semantik: DELETE alle Multi-Values, dann INSERT neue
   - Atomare Transaktionen

4. **Task 14:** OpenAPI Documentation
   - Alle CardDAV Routes in `server/openapi.js` dokumentieren
   - Schemas für Multi-Value Arrays

5. **Task 15:** Mount CardDAV Router
   - `server/index.js` anpassen
   - Finale Integration Tests

6. **Review-Workflow beibehalten:**
   - TDD: RED → Verify RED → GREEN → Verify GREEN → Commit
   - PROGRESS.md nach jedem Task aktualisieren

7. **Am Ende:** Final Code Review + Release Prep

## Commits-Übersicht

```
a715475 feat(contacts): add multi-value array validators
cf68bff feat(cardav): create cardav router with GET /accounts
930800e fix(cardav): improve router security and test coverage
f7eb73b feat(cardav): implement POST /accounts endpoint
ca92cb2 feat(cardav): implement DELETE /accounts/:id endpoint
38fa84c docs: update PROGRESS.md for completed Task 4
dd5ac88 feat(cardav): implement POST /accounts/:id/test endpoint
2964696 docs: update PROGRESS.md for completed Task 5
12e8edf feat(cardav): implement GET /accounts/:id/addressbooks endpoint
c078a48 feat(cardav): implement POST /accounts/:id/addressbooks/refresh endpoint
362f711 feat(validate): add bool validator
9ec7fda feat(cardav): implement PUT /addressbooks/:id endpoint
674fe79 feat(cardav): implement POST /accounts/:id/sync endpoint
```

## Test-Status

- **Gesamt:** 106 Tests, alle bestehen
- **Suites:** 19 Suites
- **CardDAV API Routes Suite:** 14 Tests
- **Contacts API - Multi-Value Fields Suite:** 5 Tests
  - GET /contacts/:id: 2 Tests
  - POST /contacts: 3 Tests
  - Account Management (6 Tests):
    - GET /accounts (empty)
    - GET /accounts (populated with shape)
    - POST /accounts (success)
    - POST /accounts (validation failure)
    - DELETE /accounts/:id (success with cascade)
    - DELETE /accounts/:id (invalid ID → 400)
  - Connection & Discovery (4 Tests):
    - POST /accounts/:id/test (success)
    - GET /accounts/:id/addressbooks (success with addressbooks)
    - GET /accounts/:id/addressbooks (empty array)
    - POST /accounts/:id/addressbooks/refresh (success)
  - Addressbook Management (2 Tests):
    - PUT /addressbooks/:id (toggle enabled/disabled)
    - PUT /addressbooks/:id (validation failure)
  - Sync (2 Tests):
    - POST /accounts/:id/sync (success)
    - POST /accounts/:id/sync (404 for non-existent account)

## Branch & Remote

- **Branch:** feature/cardav-contacts
- **Worktree:** /home/ulsklyc/Workspace/oikos/.worktrees/feature/cardav-contacts
- **Base:** main (commit 6cc7267)
- **Bereit zum Pushen:** Ja, nach diesem Status-Commit

## Task-Liste Status

```
#1. [completed] Task 1: Multi-Value Array Validators
#2. [completed] Task 2: CardDAV Router Setup
#3. [completed] Task 3: POST /accounts - Create Account
#4. [completed] Task 4: DELETE /accounts/:id - Delete Account
#5. [completed] Task 5: POST /accounts/:id/test - Test Connection
#6. [completed] Task 6: GET /accounts/:id/addressbooks - List Addressbooks
#7. [completed] Task 7: POST /accounts/:id/addressbooks/refresh - Refresh Addressbooks
#8. [completed] Task 8: Add bool validator to validate.js
#9. [completed] Task 9: PUT /addressbooks/:id - Toggle Addressbook
#10. [completed] Task 10: POST /accounts/:id/sync - Sync Account
#11. [completed] Task 11: GET /contacts/:id - With Multi-Values
#12. [completed] Task 12: POST /contacts - Create With Multi-Values
#13. [pending] Task 13: PUT /contacts/:id - Update With Multi-Values
#14. [pending] Task 14: Document All Routes in OpenAPI
#15. [pending] Task 15: Mount CardDAV Router
```
