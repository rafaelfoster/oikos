# CardDAV API Routes Implementation - Fortschritt

**Stand:** 2026-05-04, nach Task 9 von 15
**Plan:** `docs/superpowers/plans/2026-05-04-cardav-api-routes.md`

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

## Offene Tasks (10-15)

### 🔄 Task 10: POST /accounts/:id/sync
- Sync Account (alle enabled addressbooks)

### 🔄 Task 11: GET /contacts/:id
- Erweitern um Multi-Value Fields (phones, emails, addresses)

### 🔄 Task 12: POST /contacts
- Erstellen mit Multi-Value Fields

### 🔄 Task 13: PUT /contacts/:id
- Update mit Multi-Value Fields

### 🔄 Task 14: OpenAPI Documentation
- Alle neuen Routes in `server/openapi.js` dokumentieren

### 🔄 Task 15: Mount CardDAV Router
- Router in `server/index.js` mounten unter `/api/v1/contacts/cardav`
- Auth + CSRF Middleware werden global angewendet

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

## Nächste Schritte beim Fortsetzen (Frische Session)

1. **Task 9 starten:** PUT /addressbooks/:id - Toggle Addressbook
   - Test schreiben (erst Account + Addressbooks erstellen, dann toggle enabled)
   - Route implementieren mit bool Validation (nutzt neuen bool Validator)
   - CardDAVSync.toggleAddressbook(id, enabled) aufrufen
   - 2 Tests: success case, validation failure
   - Commit

2. **Verbleibende Tasks 10-15:**
   - Task 10: POST /accounts/:id/sync - Sync Account
   - Task 11: GET /contacts/:id - With Multi-Values
   - Task 12: POST /contacts - Create With Multi-Values
   - Task 13: PUT /contacts/:id - Update With Multi-Values
   - Task 14: Document All Routes in OpenAPI
   - Task 15: Mount CardDAV Router in server/index.js

3. **Review-Workflow beibehalten:**
   - TDD: RED → Verify RED → GREEN → Verify GREEN → Commit
   - PROGRESS.md nach jedem Task aktualisieren
   - Nach jedem Commit: Optional Code Review

4. **Am Ende:** Final Code Review + Release Prep

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
```

## Test-Status

- **Gesamt:** 99 Tests, alle bestehen
- **Suites:** 15 Suites
- **CardDAV API Routes Suite:** 12 Tests
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
#10. [pending] Task 10: POST /accounts/:id/sync - Sync Account
#11. [pending] Task 11: GET /contacts/:id - With Multi-Values
#12. [pending] Task 12: POST /contacts - Create With Multi-Values
#13. [pending] Task 13: PUT /contacts/:id - Update With Multi-Values
#14. [pending] Task 14: Document All Routes in OpenAPI
#15. [pending] Task 15: Mount CardDAV Router
```
