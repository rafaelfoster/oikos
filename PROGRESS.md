# CardDAV API Routes Implementation - Fortschritt

**Stand:** 2026-05-04, nach Task 3 von 15 (Session pausiert bei ~77k tokens)
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

## Offene Tasks (5-15)

### 🔄 Task 5: POST /accounts/:id/test
- Test Connection Endpoint (nutzt existierende testConnection Funktion)

### 🔄 Task 6: GET /accounts/:id/addressbooks
- Liste Addressbooks für Account

### 🔄 Task 7: POST /accounts/:id/addressbooks/refresh
- Re-discover Addressbooks

### 🔄 Task 8: bool Validator
- `bool()` Validator zu `server/middleware/validate.js` hinzufügen
- Export ergänzen

### 🔄 Task 9: PUT /addressbooks/:id
- Toggle Addressbook enabled/disabled

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

1. **Task 4 starten:** DELETE /accounts/:id implementieren
   - Test schreiben (erst Account erstellen, dann löschen)
   - Route implementieren mit ID-Validation
   - CardDAVSync.deleteAccount() aufrufen
   - Commit + Reviews

2. **Review-Workflow beibehalten:**
   - Nach jedem Commit: Spec Compliance Review (optional)
   - Nach jedem Commit: Code Quality Review (optional)
   - Fixes committen wenn nötig
   - Task als completed markieren

3. **Tasks 4-15 abarbeiten gemäß Plan**
4. **Am Ende:** Final Code Review + Release Prep

## Commits-Übersicht

```
a715475 feat(contacts): add multi-value array validators
cf68bff feat(cardav): create cardav router with GET /accounts
930800e fix(cardav): improve router security and test coverage
f7eb73b feat(cardav): implement POST /accounts endpoint
ca92cb2 feat(cardav): implement DELETE /accounts/:id endpoint
```

## Test-Status

- **Gesamt:** 91 Tests, alle bestehen
- **Suites:** 13 Suites
- **CardDAV API Routes Suite:** 4 Tests
  - GET /accounts (empty)
  - GET /accounts (populated)
  - POST /accounts (success)
  - POST /accounts (validation)

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
#5. [pending] Task 5: POST /accounts/:id/test - Test Connection
#6. [pending] Task 6: GET /accounts/:id/addressbooks - List Addressbooks
#7. [pending] Task 7: POST /accounts/:id/addressbooks/refresh - Refresh Addressbooks
#8. [pending] Task 8: Add bool validator to validate.js
#9. [pending] Task 9: PUT /addressbooks/:id - Toggle Addressbook
#10. [pending] Task 10: POST /accounts/:id/sync - Sync Account
#11. [pending] Task 11: GET /contacts/:id - With Multi-Values
#12. [pending] Task 12: POST /contacts - Create With Multi-Values
#13. [pending] Task 13: PUT /contacts/:id - Update With Multi-Values
#14. [pending] Task 14: Document All Routes in OpenAPI
#15. [pending] Task 15: Mount CardDAV Router
```
