# Backlog

Feature requests and planned extensions. Entries here will **not** be implemented until explicitly prioritized and moved into a release branch.

New suggestion? → [Open an issue](https://github.com/ulsklyc/oikos/issues/new?template=feature_request.md) or add it here.

## Open Entries

| ID | Issue | Feature | Notes |
|----|-------|---------|-------|
| BL-11 | [#10](https://github.com/ulsklyc/oikos/issues/10) | Contacts: CardDAV (read-only) provider | Sync address book entries from phone/server; backend lib evaluation needed |

---

## Completed Features (Reference)

| ID | Feature | Version |
|----|---------|---------|
| BL-01 | Calendar: Expand recurring events (RRULE) | v0.3.0 |
| BL-02 | Budget: Monthly comparison (current vs. previous month) | v0.3.0 |
| BL-03 | Meal plan: Drag & drop between slots and days | v0.3.0 |
| BL-04 | Calendar sync: Wire up settings UI completely | v0.3.0 |
| BL-05 | Budget: Auto-generate recurring entries | v0.3.0 |
| BL-06 | Shopping: Quick-add autocomplete | v0.3.0 |
| BL-07 | Notes: Full-text search / filter | v0.4.0 |
| BL-08 | Dashboard: Weather widget refresh | v0.4.0 |
| BL-09 | Contacts: vCard import / export | v0.4.0 |
| BL-10 | PWA: Offline fallback for critical pages | v0.4.0 |
| - | UX Polish (animations, bottom sheet, FAB, stagger, vibration) | v0.2.0 |
| - | Event listener leaks, CSS gaps, modal tests | v0.2.1 |
| - | Internationalisation system (de + en), locale picker, formatDate/Time | v0.5.0 |
| - | PWA: Correct Oikos icons (192/512/maskable/apple-touch), service worker v22 | v0.5.1 |
| - | Calendar: Fix all-day RFC 5545 DTEND, DURATION support, birthday sync | v0.5.6 |
| - | Calendar: RRULE expansion fix (strip RRULE: prefix), YEARLY support | v0.5.7 |
| - | Italian (it) localization (497 keys) | v0.5.8 |
| - | Swedish (sv) localization (548 keys) - contributed by @olsson82 | v0.11.3 |
| - | Security hardening: XSS, rate limiter bypass, OAuth CSRF, CSV injection, session invalidation | v0.5.9 |
| - | Budget: Fix update failing when category changes | v0.6.0 |
| - | Upgrade bcrypt 5 → 6, ESM migration, structured logger, remove SESSION_SECRET fallback | v0.7.0 |
| - | XSS fix: shared esc() utility, deduplicate escHtml across all modules | v0.7.1 |
| - | Dashboard: Shopping list widget (lists with open items, progress bar, item preview) | v0.8.0 |
| - | Tasks: optional "None" priority level (default for new tasks, hides badge) | v0.9.0 |
| - | Tasks: persist kanban/list view in localStorage; ?view=kanban URL parameter | v0.9.1 |
| - | Meals: customizable meal type visibility (breakfast/lunch/dinner/snack toggles in Settings) | v0.10.0 |
| - | Budget: configurable currency (13 currencies selectable in Settings → Budget) | v0.11.2 |
| - | Swedish (sv) translation contributed by @olsson82 | v0.11.3 |
| - | Shopping: custom categories - add, rename, delete, reorder in Settings | v0.12.0 |
| - | Meals: optional recipe link per meal (recipe_url field, link icon on card) | v0.13.0 |
| - | Spanish (es) translation - all sections fully translated | v0.14.0 |
| - | Settings: categorized tab navigation (General, Meals, Budget, Shopping, Calendar, Account) | v0.16.0 |
| - | Budget: CNY (Chinese Yuan) added to currency list (#42) | v0.16.2 |
| - | i18n: French (fr), Turkish (tr), Russian (ru), Greek (el), Chinese Simplified (zh) locales | v0.16.3 |
| - | Budget: TRY (Turkish Lira) and RUB (Russian Ruble) added to currency list | v0.16.3 |
| - | i18n: Japanese (ja), Arabic (ar), Hindi (hi), Portuguese (pt) locales (567 keys each) | v0.19.0 |
| - | Budget: AED (UAE Dirham), BRL (Brazilian Real), INR (Indian Rupee), SAR (Saudi Riyal) added to currency list | v0.19.0 |
| - | ICS/webcal URL subscriptions: per-subscription color, shared/private visibility, auto-sync, SSRF protection, ETag conditional fetch, RRULE expansion, `user_modified` guard, "Reset to original" link | v0.20.38 |
| - | Web installer (`tools/installer/`): browser-based wizard, auto-configures `.env`, starts Docker, creates admin account | v0.21.0 |
| - | CLI installer (`install.sh`): 7-step interactive wizard, prerequisite check, secret generation, optional integrations, Docker startup, `--env-file` non-interactive mode | v0.21.0 |
| - | Bootstrap endpoint `POST /api/v1/auth/setup`: first-run admin creation via HTTP without shell access | v0.21.0 |
| - | Recipes module: CRUD with notes, recipe link, per-ingredient categories; duplicate; "Add to meal plan"; save meal as recipe | v0.22.0 |
| - | Meals: select recipe to auto-fill modal, scale ingredient quantities | v0.22.0 |
| - | External calendar display names & colors: `external_calendars` table (migration v14), colored `event-cal-label` badge in all calendar views | v0.23.0 |
| - | Calendar event location display with RFC 5545 backslash-escape normalization (`fmtLocation()`) | v0.23.0 |
| - | Tasks: filter defaults to `status: open`; effective due date sort; due chip shows time component | v0.23.0 |
| - | Dashboard: FAB shortcuts open new-item modal directly after navigation | v0.23.0 |
| - | Budget: DB-backed expense categories (stable slug keys), subcategories (35 predefined + custom), CSV export with subcategory column | v0.24.0 |
| - | i18n: all 14 non-German locales extended with budget category & subcategory keys | v0.24.0 |
| - | Server-side log messages and API error strings translated to English — contributed by @rafaelfoster | v0.24.0 |
| - | UX/Accessibility: skip-to-content link, modal focus fix, swipe-to-close, 44 px touch targets, unique SVG gradient IDs | v0.24.1 |
| - | API tokens: named Bearer / X-API-Key tokens for external integrations; SHA-256-hashed, expiry, revocation, last-used tracking | v0.25.0 |
| - | OpenAPI 3.0 specification at `/api/v1/openapi.json` | v0.25.0 |
| - | SPA router: dynamic imports, module cache, directional transitions, per-module accent theming | v0.25.x |
| - | innerHTML → replaceChildren / insertAdjacentHTML migration across all modules (PR #88) | v0.25.x |
| - | Birthdays module: name, birth date, photo, notes; auto-synced to calendar (yearly recurring event) and reminders (1 day before) | v0.26.0 |
| - | Dashboard: birthdays widget, family participants widget, budget overview widget; customisable widget order | v0.26.0 |
| - | Settings › General: custom application name | v0.26.0 |
| - | Birthday image upload limit: 5 MB | v0.26.5 |
| - | Family management: family roles (Dad, Mom, Parent, Child, etc.) separate from system access role | v0.27.0 |
| - | Profile pictures: upload own avatar (PNG/JPEG/WebP, ≤ 5 MB, auto-resized to 512 px) | v0.27.0 |
| - | Admin: edit any family member's profile (name, role, picture) | v0.27.0 |
| - | API: `GET /api/v1/family/members`, `PATCH /api/v1/auth/users/:id`, `PATCH /api/v1/auth/me/profile` | v0.27.0 |
| - | Google Calendar null guard: initial OAuth sync no longer silently fails on empty item arrays | v0.27.1 |
| - | Navigation: sidebar tooltips in icon-only breakpoint; global keyboard shortcuts (`/`, `n`, `?`, `g d/t/c/s/n`) | v0.28.0 |
| - | PWA: offline connectivity banner | v0.28.0 |
| - | UX: `deleteWithUndo` for birthdays; contextual onboarding hints in all empty states | v0.28.0 |
| - | Calendar: custom event icons (102 Lucide options via visual picker); birthday events auto-assigned `cake` icon | v0.29.0 |
| - | Calendar: extended reminder presets (2 days, 1 week, 2 weeks) + fully custom reminder (number + unit) | v0.29.0 |
| - | Calendar: locale-aware date text inputs (MDY / DMY / YMD) in all date fields across Calendar, Tasks, Meals, Birthdays, Budget | v0.29.0 |
| - | i18n: recipe strings contributed by @baragoon for 13 locales (ar, el, es, fr, hi, it, ja, pt, ru, sv, tr, zh, uk) | v0.30.0 |
| - | Family: phone, email, and birthday fields on family member records, auto-synced to Contacts and Birthdays | v0.31.0 |
| - | Settings: dedicated Family Management tab and API Tokens tab (admin-only) | v0.31.0 |
| - | Settings: ICS subscription edit modal — update name, color, and shared visibility inline | v0.31.2 |
| - | Documents module: upload and manage family files with grid/list view, category tags, visibility ACL (family / restricted / private), archive, download | v0.32.0 |
| - | Tasks: archive status — completed tasks can be archived; visible in dedicated Archived filter | v0.32.0 |
| - | Tasks: inline reminder presets (15 min–2 weeks or custom offset from due date/time) | v0.32.0 |
| - | Typography: Plus Jakarta Sans variable font self-hosted under `public/fonts/` — no CDN dependency at runtime | v0.32.3 |
| - | Module toolbars sticky while scrolling (Tasks, Notes, Calendar, Contacts, Shopping) | v0.32.3 |
| - | Calendar: overlapping timed events render side-by-side in week and day views | v0.33.0 |
| - | Calendar: event file attachments (images, PDFs, Office documents ≤ 5 MB); drag-and-drop upload; inline image preview | v0.33.0 |
| - | Navigation: Kitchen (Meals / Recipes / Shopping) grouped behind a single bottom-bar entry with a persistent tab bar | v0.34.0 |
| - | Settings: Backup Management tab (admin-only) — database download and restore via file upload with pre-restore rollback copy | v0.35.0 |
| - | UX: empty states in all modules include a primary CTA button that triggers the page FAB | v0.36.0 |
| - | UX: `friendlyError()` helper — unhandled promise rejections show status-code-aware messages instead of raw error text | v0.36.0 |
| - | Date input: default format changed to DMY with dot separator; dot-separated dates accepted everywhere | v0.36.1 |
| - | Microinteraction long loops: FAB entry animation stops after 5 views; keyboard shortcut hint hides after first use; success toasts suppressed after 50 saves; empty-state CTA delayed fade-in | v0.38.0 |
| - | Calendar: recurring events with `FREQ=WEEKLY;INTERVAL=N;BYDAY` now correctly skip N−1 weeks between occurrences | v0.38.2 |
| - | Dashboard portrait mode on mobile: horizontal scrollbar and overflow bugs fixed | v0.38.3 / v0.38.4 |
| - | Settings: 24-hour / AM·PM time format toggle, persisted globally; calendar remembers last selected view | v0.39.0 |
| - | Swedish (sv) translation completed by @olsson82; i18n gap-fill for 13 non-German locales | v0.39.1 |
| - | Budget date picker: native `type="date"` input on iOS and Android instead of plain text field | v0.39.2 |
| - | Budget loans tracker: instalment-based loans, per-payment records, remaining balance, auto-close when paid off (PR #117 by @rafaelfoster) | v0.40.0 |
| - | Dashboard: configurable widget sizes via named presets (Tiny, Narrow, Standard, Large, Full), persisted in user preferences | v0.40.0 |
| - | Settings: four additional date formats — MM.DD.YYYY, YYYY.MM.DD, YYYY/MM/DD, DD/MM/YYYY | v0.40.0 |
| - | Typography: tighter letter-spacing on page/modal titles, `text-wrap: balance`; warm-tinted shadows; larger button radius (--radius-md); module-accent empty-state icons; sentence-case search section labels | v0.40.1 |
| - | Tabular figures: `font-variant-numeric: tabular-nums` on all numeric displays (budget, weather, dashboard, calendar) | v0.40.1 |
| - | Birthdays: nav badge when any family member has a birthday within the next 3 days | v0.41.0 |
| - | Tasks: up to three recently-used filter chips, persisted in localStorage | v0.41.0 |
| - | Calendar: live keyword search in the icon picker; icons grouped into labelled categories | v0.41.0 |
| - | Calendar: repeat indicator icon on recurring events in month and week views | v0.41.0 |
| - | Calendar: 3-day week view on screens narrower than 640 px | v0.41.0 |
| - | Forms: required-field asterisk via `.required-marker` CSS class; enlarged modal drag-handle hit area (44 px); budget tab minimum height 40 px | v0.41.0 |
