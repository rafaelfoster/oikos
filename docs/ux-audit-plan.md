# Oikos UX/UI Audit & Implementation Plan

## 1. Design-System & Styling

### Issues Identified
1. **Touch Targets Too Small**: `--target-sm: 32px` and `.btn--icon-sm` (36x36px) violate minimum touch target guidelines (44x44px or 48x48px). This causes usability issues on mobile devices (fat-finger syndrome).
2. **Duplicated Dark Mode Tokens**: Dark mode CSS variables in `tokens.css` are duplicated across `@media (prefers-color-scheme: dark)` and `[data-theme="dark"]`, creating a maintenance nightmare.

### Implementation Steps
- [x] **Fix Touch Targets**: `--target-base: 44px` Token ergänzt; `.btn--icon-sm` auf `min-height/min-width: var(--target-base)` korrigiert; `--target-sm` bleibt 32px als visuelle Größe (kein Touch-Target).
- [ ] **Refactor Theme Tokens**: Bewusst übersprungen — der CSS-native `@media (prefers-color-scheme: dark)`-Block ist eine Stärke (Dark Mode ohne JS). Entfernen würde Nutzer ohne JS ohne Dark Mode lassen.

---

## 2. Components & Interaction

### Issues Identified
1. **Mobile Modal Swipe-to-Close Bug**: If a user drags the modal down (`dy > 0`) and then back up (`dy < 0`) without lifting their finger, `dragging` is set to `false`. The `touchend` event is then ignored, leaving the modal stuck out of position.
2. **Accessibility (A11y) Violation**: The `.modal-overlay` element uses `role="presentation"` alongside an `aria-label`. `role="presentation"` hides the element from screen readers, conflicting with the label and its function as a clickable close area.
3. **Misplaced Utility Functions**: Generic UI helpers (`wireBlurValidation`, `validateAll`, `btnSuccess`, `btnLoading`, `btnError`) are hardcoded in `pages/dashboard.js` instead of a shared utility file.

### Implementation Steps
- [x] **Fix Swipe Bug (`modal.js`)**: `touchmove`-Handler korrigiert — bei `dy < 0` wird Panel auf `translateY(0)` zurückgesetzt, `dragging` bleibt `true`.
- [x] **Fix Modal A11y (`modal.js`)**: `role="presentation"` aus `.modal-overlay` entfernt.
- [x] **Relocate Utilities**: Bereits erledigt — `wireBlurValidation`, `validateAll`, `btnSuccess`, `btnLoading`, `btnError` sind in `utils/ux.js` (Zeilen 538–620).

---

## 3. Layout, Navigation & Routing

### Issues Identified
1. **FOUC (Flash of Unstyled Content) on Navigation**: In `router.js`, `loadPageStyle` removes the old stylesheet before the new page transition animation (`page-transition--in-right`) completes, causing layout jumps.
2. **Missing Focus Trap in Global Search**: The `#search-overlay` does not use the focus trap logic from `modal.js`. Users can tab out of the search overlay into the hidden page below.
3. **SVG ID Collision Risk**: The logo generated in `router.js` uses a hardcoded ID (`id="oikos-logo-bg"`) for its gradient. If reused, this will break rendering.

### Implementation Steps
- [ ] **Fix Routing FOUC (`router.js`)**: Kein echter Bug — `style.cleanup()` wird vor `module.render()` aufgerufen, aber die neue Seite startet `opacity: 0`. Kein sichtbares FOUC in der aktuellen Implementierung.
- [x] **Add Search Focus Trap (`router.js`)**: Eigenständiger Focus Trap in `openSearch`/`closeSearch` implementiert (ohne modal.js-Kopplung).
- [x] **Fix SVG IDs (`router.js`)**: Gradient-ID wird nun mit `Math.random().toString(36)`-Suffix generiert.

---

## 4. Dashboard

### Issues Identified
1. **Wasted Space from Large Empty States**: Empty widgets (e.g., no tasks) render a large "Empty State" UI. On mobile, this pushes populated widgets below the fold.
2. **Lack of Visual Feedback in Customization**: Reordering widgets in the customize modal (`rebuildList()`) happens instantly without transition, feeling jarring.

### Implementation Steps
- [ ] **Compact Empty States (`dashboard.js`)**: Offen — `.widget__empty` hat bereits reduziertes Padding (`space-5`), aber kein echtes Row-Layout. Niedrige Priorität.
- [ ] **Animate Widget Reordering (`dashboard.js`)**: Offen — View Transition API wäre sinnvoll, aber kein Bug. Niedrige Priorität.
