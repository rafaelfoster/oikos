# Generisches CalDAV Multi-Account Sync

**Datum:** 2026-05-04  
**Issue:** #90 - [Feature] CalDav (radicale)  
**Status:** Approved Design

## Kontext

Die aktuelle Apple CalDAV-Integration funktioniert bereits mit verschiedenen CalDAV-Servern (iCloud, radicale, Nextcloud, Baikal), ist aber limitiert:

- **Single Account:** Nur ein CalDAV-Account möglich
- **Keine Kalenderauswahl:** Alle Kalender vom Server werden automatisch synchronisiert
- **Apple-Branding:** Name und UI suggerieren iCloud-Exklusivität

Der Benutzer möchte:
- Eigenen gehosteten CalDAV-Server (radicale) verwenden
- Kontrolle darüber haben, welche Kalender synchronisiert werden
- Mehrere CalDAV-Accounts gleichzeitig nutzen können

## Ziel

Transformation der Apple CalDAV-Integration in eine generische, flexible CalDAV-Lösung mit:

1. **Multiple Accounts:** Mehrere CalDAV-Accounts parallel (z.B. iCloud + radicale + Nextcloud)
2. **Kalenderauswahl:** Pro Account können Benutzer wählen, welche Kalender synchronisiert werden (Checkboxen)
3. **Bidirektional mit Account-Auswahl:** Beim Event-Erstellen kann der Ziel-Account/Kalender gewählt werden
4. **Provider-agnostisch:** Funktioniert mit allen CalDAV-kompatiblen Servern

## Ansatz: Kompletter Neuanfang

Neue Implementierung parallel zur bestehenden Apple-Integration, mit sauberer Architektur für Multi-Account-Support und späterer Deprecation von Apple CalDAV.

---

## 1. Architektur

### Komponenten

| Komponente | Beschreibung |
|------------|-------------|
| **Service** | server/services/caldav-sync.js - Neue Datei für Multi-Account-Logik |
| **DB-Tabellen** | caldav_accounts, caldav_calendar_selection |
| **API-Routen** | server/routes/calendar.js erweitert mit /calendar/caldav/* |
| **Frontend** | public/pages/settings.js - Neue CalDAV-Karte (ersetzt Apple-Karte) |
| **Migration** | server/db.js - Migration 22: Neue Tabellen + Apple-Daten migrieren |
| **Tests** | test-caldav-sync.js - Neue Test-Suite |

### Datenfluss

#### Account-Setup
Admin verbindet CalDAV in Settings → POST /caldav/accounts → testConnection via tsdav → INSERT INTO caldav_accounts → fetchCalendars → INSERT INTO caldav_calendar_selection (enabled=1 default) → UI zeigt Kalender-Checkboxen → User wählt aus → PATCH /caldav/accounts/:id/calendars

#### Inbound-Sync (CalDAV → Oikos)
Scheduler ruft caldav-sync.sync() → Für jeden Account: tsdav-Client erstellen → Kalender WHERE enabled=1 → fetchCalendarObjects → parseICS → Upsert in calendar_events mit external_source='caldav' → UPDATE caldav_accounts SET last_sync

#### Outbound-Sync (Oikos → CalDAV)
User erstellt Event → Event-Modal zeigt Dropdown mit CalDAV-Zielen → User wählt Account + Kalender → Speichern mit target_caldav_account_id → Nächster Sync: buildICS → tsdav createCalendarObject → UPDATE external_source='caldav'

---

## 2. Datenbank-Schema

### Neue Tabelle: caldav_accounts

Speichert CalDAV-Account-Credentials.

Spalten:
- id (PK, AUTOINCREMENT)
- name (TEXT, benutzer-definiert: "Mein Radicale", "iCloud")
- caldav_url (TEXT, z.B. https://caldav.icloud.com)
- username (TEXT)
- password (TEXT, Klartext wenn DB_ENCRYPTION_KEY fehlt)
- created_at (TEXT, ISO-8601)
- last_sync (TEXT, ISO-8601)
- UNIQUE(caldav_url, username)

### Neue Tabelle: caldav_calendar_selection

Speichert Kalenderauswahl pro Account.

Spalten:
- id (PK, AUTOINCREMENT)
- account_id (INTEGER, FK zu caldav_accounts ON DELETE CASCADE)
- calendar_url (TEXT, CalDAV calendar.url)
- calendar_name (TEXT, displayName)
- calendar_color (TEXT, #RRGGBB)
- enabled (INTEGER, 1=sync, 0=ignore, default 1)
- created_at (TEXT, ISO-8601)
- UNIQUE(account_id, calendar_url)

Index: idx_caldav_selection_enabled ON (account_id, enabled)

### Änderung an calendar_events

Neue Spalten für Outbound-Target:
- target_caldav_account_id (INTEGER, nullable)
- target_caldav_calendar_url (TEXT, nullable)

NULL = nur lokal, NOT NULL = zu diesem Account synchronisieren

### Änderung an external_calendars

Keine Schema-Änderung. source bekommt neuen Wert 'caldav' (zusätzlich zu 'google', 'apple', 'ics').

---

## 3. Backend-Service (caldav-sync.js)

Neue Datei server/services/caldav-sync.js mit folgenden Funktionen:

### Account-Management

**addAccount(name, caldavUrl, username, password)**
- Validiert via testConnection() (tsdav createDAVClient + fetchCalendars)
- INSERT INTO caldav_accounts
- Fetcht Kalender-Liste
- INSERT INTO caldav_calendar_selection (enabled=1)
- Return: { accountId, calendars }

**updateAccount(accountId, { name, caldavUrl, username, password })**
- UPDATE account
- Bei Credentials-Änderung: testConnection() erneut
- Kalender-Liste neu laden (alte löschen, neue laden)

**deleteAccount(accountId)**
- DELETE FROM caldav_accounts (CASCADE löscht caldav_calendar_selection)
- Events bleiben erhalten (orphaned)

**listAccounts()**
- SELECT * FROM caldav_accounts
- Passwort NICHT zurückgeben

### Kalender-Auswahl

**getCalendars(accountId, { refresh = false })**
- refresh=false: SELECT FROM caldav_calendar_selection
- refresh=true: Frisch via tsdav fetchen

**updateCalendarSelection(accountId, calendarUrl, enabled)**
- UPDATE caldav_calendar_selection SET enabled WHERE account_id AND calendar_url

### Sync

**sync()**

Inbound:
- Für jeden Account: tsdav-Client → enabled Kalender → fetchCalendarObjects → parseICS → Upsert calendar_events (external_source='caldav', external_calendar_id=UID, calendar_ref_id via upsertExternalCalendar)

Outbound:
- SELECT WHERE external_source='local' AND target_caldav_account_id IS NOT NULL → buildICS → tsdav createCalendarObject → UPDATE external_source='caldav'

Error Handling: Fehler pro Account loggen, nicht abbrechen (andere Accounts weiterlaufen lassen)

**getStatus()**
- Anzahl Accounts, letzte Syncs, Fehler pro Account

### Wiederverwendung

Von apple-calendar.js übernehmen: parseICS, buildICS, escapeICS, unescapeICS, normalizeCalColor, upsertExternalCalendar, tsdav-Import

---

## 4. API-Routen

Neue Endpoints in server/routes/calendar.js (alle requireAdmin):

### Account-Management

- POST /calendar/caldav/accounts → addAccount() → { data: { accountId, calendars } }
- GET /calendar/caldav/accounts → listAccounts() → { data: [{ id, name, caldavUrl, username, lastSync }] }
- PUT /calendar/caldav/accounts/:id → updateAccount()
- DELETE /calendar/caldav/accounts/:id → deleteAccount()

### Kalender-Auswahl

- GET /calendar/caldav/accounts/:id/calendars?refresh=true → getCalendars()
- PATCH /calendar/caldav/accounts/:id/calendars → updateCalendarSelection()

### Sync & Status

- POST /calendar/caldav/sync → sync()
- GET /calendar/caldav/status → getStatus()

---

## 5. Frontend-UI

### Settings-Seite (public/pages/settings.js)

Neue CalDAV-Karte ersetzt Apple-Karte:

Struktur:
- Account-Liste mit pro Account:
  - Header: Name, URL, Status (Verbunden + letzte Sync)
  - Kalender-Liste (expandable details): Checkboxen für jeden Kalender mit Farbe und Name
  - Actions: "Jetzt synchronisieren", "Kalender aktualisieren", "Entfernen"
- Button: "CalDAV-Konto hinzufügen"

Modal für Account hinzufügen:
- Name (Textfeld)
- CalDAV-URL (URL-Feld, Placeholder: https://caldav.icloud.com)
- Benutzername (Textfeld)
- Passwort (Password-Feld)
- Hint: Für iCloud App-spezifisches Passwort verwenden

Event-Binding:
- Checkboxen onChange → PATCH /caldav/accounts/:id/calendars
- Sync-Button → POST /caldav/sync
- Refresh-Button → GET /caldav/accounts/:id/calendars?refresh=true
- Delete-Button → Confirmation + DELETE /caldav/accounts/:id

### Event-Modal (public/pages/calendar.js)

Neues Feld im Event-Formular:

Label: "Zu CalDAV synchronisieren (optional)"
Select mit Optionen:
- "Nur lokal speichern" (value="")
- Optgroups pro Account mit Optionen pro enabled Kalender
- Value-Format: "accountId|calendarUrl"

Backend splittet beim Speichern: [accountId, calendarUrl] = value.split('|')

Laden der Optionen: GET /caldav/accounts → für jeden Account GET /caldav/accounts/:id/calendars → nur enabled Kalender

---

## 6. Migration

DB-Migration 22 in server/db.js:

1. CREATE TABLE caldav_accounts
2. CREATE TABLE caldav_calendar_selection
3. CREATE INDEX idx_caldav_selection_enabled
4. Apple-Daten aus sync_config lesen (apple_caldav_url, apple_username, apple_app_password, apple_last_sync)
5. Falls vorhanden: INSERT INTO caldav_accounts mit name='Apple Calendar (migriert)'
6. Alle Apple-Kalender aus external_calendars WHERE source='apple' → INSERT INTO caldav_calendar_selection mit enabled=1
7. UPDATE external_calendars SET source='caldav' WHERE source='apple'
8. UPDATE calendar_events SET external_source='caldav' WHERE external_source='apple'
9. ALTER TABLE calendar_events ADD COLUMN target_caldav_account_id
10. ALTER TABLE calendar_events ADD COLUMN target_caldav_calendar_url

Eigenschaften:
- Idempotent (kann mehrfach laufen)
- Non-destructive (Apple-Daten bleiben in sync_config für Rollback)
- Graceful (überspringt wenn keine Apple-Daten)

---

## 7. Error Handling

### Verbindungsfehler

Beim Account-Hinzufügen: testConnection() wirft bei 401/Network Error → Frontend zeigt Toast mit Fehlermeldung

Beim Sync: Fehler pro Account loggen, nicht abbrechen → Status-API zeigt Fehler pro Account

### Credential-Fehler

401 Unauthorized → Account als nicht verbunden markieren → UI zeigt Warnung "Anmeldedaten ungültig"

Password-Änderung: User muss Account bearbeiten und neues Passwort eingeben

### CalDAV-Protokollfehler

Kalender existiert nicht mehr (404) → UPDATE enabled=0 → UI zeigt "Kalender nicht verfügbar"

ICS-Parse-Fehler → Event überspringen, aber loggen

### Outbound-Fehler

Event kann nicht hochgeladen werden → external_source bleibt 'local' → Retry beim nächsten Sync

Konflikt (UID existiert bereits) → Neuen UID generieren und erneut hochladen

### Logging

Alle Fehler via createLogger('CalDAV') → Console

UI zeigt Fehler-Status pro Account (rote Badges bei Fehlern)

### Graceful Degradation

tsdav nicht installiert → import('tsdav') wirft → Frontend zeigt "CalDAV requires tsdav package"

---

## 8. Testing

Test-Suite: test-caldav-sync.js (--experimental-sqlite, in-memory DB)

Test-Bereiche:

**DB-Schema:**
- caldav_accounts table korrekt erstellt
- caldav_calendar_selection mit FK CASCADE
- calendar_events target-Spalten vorhanden

**Account-Management:**
- addAccount funktioniert (mit Mock tsdav)
- Duplikate werden verhindert (UNIQUE constraint)
- listAccounts gibt keine Passwörter zurück
- updateAccount funktioniert
- deleteAccount mit CASCADE

**Kalender-Auswahl:**
- getCalendars lädt Auswahl
- updateCalendarSelection togglet enabled
- sync() berücksichtigt nur enabled Kalender

**Migration:**
- Apple → caldav_accounts Migration
- external_calendars source apple→caldav
- calendar_events external_source apple→caldav

**Sync (Mock tsdav):**
- Inbound nur von enabled Kalendern
- Outbound zu spezifischem Account/Kalender
- Fehler-Handling (Account 1 fail, Account 2 continue)

**Error Handling:**
- Invalid credentials rejected
- Missing calendars → enabled=0

Mocking: tsdav-Funktionen mocken (createDAVClient, fetchCalendars, fetchCalendarObjects, createCalendarObject)

Alternative: Docker radicale für Integrationstests (später, optional)

package.json:
- "test:caldav": "node --experimental-sqlite test-caldav-sync.js"
- In test script einbinden

---

## 9. i18n Keys

Neue Übersetzungen in public/locales/de.json und en.json:

Settings:
- caldavTitle: "CalDAV Kalender"
- caldavDescription: "Verbinde mehrere CalDAV-Konten..."
- caldavAddAccount: "CalDAV-Konto hinzufügen"
- caldavEmptyState: "Noch keine CalDAV-Konten verbunden..."
- caldavNameLabel, caldavNamePlaceholder
- caldavUrlLabel, caldavUrlHint
- caldavUsernameLabel, caldavPasswordLabel, caldavPasswordHint
- caldavAccountAdded, caldavAccountDeleted
- caldavCalendarsToggle: "Kalender anzeigen/ausblenden"
- caldavRefreshCalendars: "Kalender aktualisieren"

Calendar:
- caldavTargetLabel: "Zu CalDAV synchronisieren"
- caldavTargetLocal: "Nur lokal speichern"
- caldavTargetHint: "Wähle einen CalDAV-Kalender..."

---

## 10. Implementierungsumfang

**Dieses Design beschreibt die vollständige Implementierung aller Features in einem Release.**

Falls gewünscht, könnte die Implementierung theoretisch in Phasen erfolgen:
- Phase 1: Single Account (wie Apple) → Funktionsparität, generisch
- Phase 2: Kalenderauswahl → Löst Issue #90 Hauptproblem
- Phase 3: Multiple Accounts → Vollständig Multi-Account
- Phase 4: Outbound mit Account-Auswahl → Vollständig bidirektional

**Gewählter Ansatz:** Alle Features in einem Release implementieren (einfacher zu testen, keine Zwischenzustände, kohärente Architektur von Anfang an)

---

## 11. Designentscheidungen

**Alte Apple-Integration:**
- Bleibt parallel bestehen (nicht entfernen)
- Später als deprecated markieren (separate Issue)
- Ermöglicht sanfte Migration und Rollback bei Problemen

**Sync-Intervall:**
- Wie bestehende Google/Apple-Integration
- Via SYNC_INTERVAL_MINUTES aus .env (default 15 Minuten)

**Outbound-Standard:**
- Events ohne CalDAV-Target bleiben nur lokal (external_source='local')
- Kein automatischer Upload
- Benutzer muss explizit CalDAV-Ziel wählen

**Multi-User-Support:**
- Nur Admin kann CalDAV-Accounts verwalten (wie Google/Apple)
- Alle User sehen die gleichen synchronisierten Kalender
- Normale User können keine eigenen CalDAV-Accounts hinzufügen

---

## 12. Success Criteria

Funktional:
- Mehrere CalDAV-Accounts parallel
- Kalenderauswahl funktioniert
- Inbound-Sync nur ausgewählte Kalender
- Outbound-Sync mit Account-Auswahl
- Migration ohne Datenverlust

UI/UX:
- Settings zeigt alle Accounts mit Status
- Kalender-Checkboxen intuitiv
- Event-Modal zeigt verfügbare Ziele
- Fehler-Status klar sichtbar

Qualität:
- Alle Tests bestehen
- Error Handling für alle Szenarien
- Migration fehlerfrei
- Kein Datenverlust bei Fehlern

Kompatibilität:
- Funktioniert mit iCloud, radicale, Nextcloud, Baikal
- Google Calendar unberührt
- Apple CalDAV läuft parallel

---

## 13. Risiken & Mitigation

| Risiko | Mitigation |
|--------|------------|
| tsdav Breaking Changes | Optional dependency, Version pinnen |
| Migrations-Fehler | Idempotent, non-destructive |
| CalDAV-Server Inkompatibilität | Tests mit verschiedenen Servern |
| Performance bei vielen Accounts | Index, später Pagination |
| Credential-Sicherheit | DB_ENCRYPTION_KEY empfehlen, Warnung |

---

## Fazit

Diese Spec beschreibt eine vollständige Transformation der Apple CalDAV-Integration in eine generische Multi-Account-Lösung. Der Ansatz "Kompletter Neuanfang" ermöglicht saubere Architektur und einfaches Rollback. Alle Anforderungen aus Issue #90 werden erfüllt.

**Nächster Schritt:** Implementation Plan erstellen (via writing-plans Skill).
