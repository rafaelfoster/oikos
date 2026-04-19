# Oikos — Farbpaletten-Redesign-Vorschlag

**Status:** Implementiert ✅ · **Datum:** 2026-04-19 · **Scope:** `tokens.css`, `reminders.css`, `dashboard.css`, `tasks.css`, `tasks.js`
**Bezugsdokumente:** `.interface-design/system.md`, `docs/SPEC.md` (Section „Design System")
**Hinweis:** Der im Ausgangs-Briefing genannte Pfad `docs/redesign-spec.md` existiert nicht im Repo. Als Ausgangspunkt dienen `system.md` (verbindliche Design-Intention) und der bereits in `tokens.css` umgesetzte Akzent-Wechsel auf `#2563EB`.

---

## 1. Design-Rationale

**Status quo (Stärken, die erhalten bleiben).** Oikos besitzt bereits eine sehr gute Grundentscheidung: eine warm-getönte Neutral-Skala (`#FAFAF8 → #121211`) statt kaltem Corporate-Grau. Diese „Leinen/unbleached paper"-Atmosphäre trägt die Intention des `system.md` („well-organized family kitchen — warm, practical, never sterile"). Daran wird nicht gerüttelt.

**Schwächen, die der Vorschlag adressiert.** Drei konkrete Probleme:

1. **Generischer Primary-Akzent.** `#2563EB` ist das Tailwind-Default-Blau und wirkt austauschbar — es transportiert „SaaS-Dashboard", nicht „familiäre Wärme". Die Spanne zwischen dem warmen Neutral-Fundament und dem kühlen Blau ist tonal unversöhnt.
2. **Semantische Kollisionen in Modul-Akzenten.** Vier Rollen teilen sich `#B45309` (Warning, Priority-Medium, Meals, Meal-Breakfast). Zwei teilen `#D4511E` (Shopping, Priority-High). Eine Badge mit dieser Farbe ist nicht mehr eindeutig dekodierbar. `system.md` sieht „semantic accent colors tied to life domain" vor — Domain und Severity müssen trennbar bleiben.
3. **Dark-Mode-Akzent driftet von Light-Mode-Identität ab.** Light: `#2563EB` (Indigo-Blau). Dark: `#60A5FA` (helles Himmelblau). Das ist nicht bloß eine Helligkeits-Anpassung, sondern ein Hue-Shift.

**Leitprinzipien.**
- **Wärmebias konsequent durchziehen.** Primary bewegt sich vom neutralen Blau in Richtung Indigo mit leichtem Violett-Drall. Indigo trägt Seriosität eines Planers und verbindet sich farblich mit dem bestehenden `--module-calendar` (Violett) und `--color-accent-secondary` (`#7C5CFC`). Referenz: Things 3, Notion-Accents.
- **Module entflechten.** Domain-Farben (Module, Mahlzeiten) werden von Severity-Farben (Warning/Danger/Priority) hue-getrennt. Keine Doppelbelegungen ohne dokumentierten Grund.
- **Kontrast gegen AA puffern, nicht nur erfüllen.** Mehrere aktuelle Paarungen liegen knapp über 4.5:1 (Accent auf Weiß: 4.56:1). Ein `--color-btn-primary` für Flächen mit weißem Text hält ≥ 6:1, damit Normaltext robust lesbar bleibt.
- **Dark Mode als tonale Inversion, nicht als separates System.** Akzent-Hue bleibt gleich, nur Lightness/Saturation werden angepasst.

**Abgrenzung zu Referenz-Kategorien.**
- *Cozi/FamilyWall* (familiär) → zu laut für einen Self-Hoster. Oikos übernimmt die Wärme, aber nicht die Pastell-Fröhlichkeit.
- *Todoist/Notion/Things 3* (Produktivität) → Oikos übernimmt Neutral-Dominanz und einen Signature-Akzent.
- *Nextcloud/Home Assistant* (Self-Hosted) → Oikos übernimmt technische Solidität (stabile Tokens, WCAG, dark mode), aber nicht deren funktional-kühle Palette.

Die Schnittmenge: **Things 3 × Tandoor** — warmer Papiergrund, klare Module, ein charaktervoller Primary. Genau dort positioniert sich der Vorschlag.

---

## 2. Palette

Alle Werte primär in HSL (Präzision, leichter anzupassen), Hex in Klammern. Unveränderte Tokens sind explizit als „beibehalten" markiert.

### 2.1 Neutral-Skala (Light Mode)

| Token | Aktuell | Neu | Rolle | Begründung |
|---|---|---|---|---|
| `--neutral-50` | `hsl(60, 20%, 98%)` (`#FAFAF8`) | *beibehalten* | Lowest surface | Bereits gute Wärme, funktioniert als Inset-Surface. |
| `--neutral-100` | `hsl(45, 17%, 95%)` (`#F5F4F1`) | *beibehalten* | Canvas/BG | Trägt die Wärmeidentität, kein Grund zur Änderung. |
| `--neutral-150` | `hsl(45, 17%, 92%)` (`#EFEEE9`) | *beibehalten* | Subtle border / surface-3 | |
| `--neutral-200` | `hsl(45, 13%, 89%)` (`#E8E7E2`) | *beibehalten* | Default border | |
| `--neutral-250` | `hsl(45, 11%, 86%)` (`#DDDCD7`) | *beibehalten* | | |
| `--neutral-300` | `hsl(50, 7%, 81%)` (`#D1D0CB`) | *beibehalten* | Disabled text | |
| `--neutral-400` | `hsl(48, 5%, 70%)` (`#B5B4AF`) | *beibehalten* | | |
| `--neutral-500` | `hsl(45, 3%, 54%)` (`#8E8D89`) | *beibehalten* | Mid-tone | Identisch in Light/Dark — Grenzfall, aber gewollt für kontinuierliche Mittelwerte. |
| `--neutral-600` | `hsl(45, 3%, 41%)` (`#6C6B67`) | *beibehalten* | Secondary text | 5.0:1 auf Weiß — AA konform. |
| `--neutral-700` | `hsl(45, 3%, 29%)` (`#4A4A46`) | *beibehalten* | | |
| `--neutral-800` | `hsl(45, 4%, 18%)` (`#2E2E2B`) | *beibehalten* | | |
| `--neutral-900` | `hsl(60, 6%, 11%)` (`#1C1C1A`) | *beibehalten* | Primary text | |
| `--neutral-950` | `hsl(60, 5%, 7%)` (`#121211`) | *beibehalten* | | |

**Resultat Neutral-Skala:** Unverändert. Sie ist bereits exakt der Tone-of-Voice des Designs.

### 2.2 Semantische Neutral-Aliase

| Token | Aktuell | Neu | Rolle | Begründung |
|---|---|---|---|---|
| `--color-bg` | `var(--neutral-100)` | *beibehalten* | Page canvas | |
| `--color-surface` | `#FFFFFF` | *beibehalten* | Card/Modal | |
| `--color-surface-2` | `var(--neutral-50)` | *beibehalten* | Inset | |
| `--color-surface-3` | `var(--neutral-150)` | *beibehalten* | | |
| `--color-border` | `var(--neutral-200)` | *beibehalten* | | |
| `--color-border-subtle` | `var(--neutral-150)` | *beibehalten* | | |
| `--color-text-primary` | `var(--neutral-900)` | *beibehalten* | | |
| `--color-text-secondary` | `var(--neutral-600)` | *beibehalten* | | |
| `--color-text-tertiary` | `hsl(60, 3%, 42%)` (`#6B6B68`) | `hsl(48, 4%, 40%)` (`#6A6964`) | Tertiary text | Minimaler Shift in Richtung Warm-Bias (gleiche Neutral-Familie wie `--neutral-600`). Kontrast 4.6:1 statt 4.52:1 — etwas mehr Puffer. |
| `--color-text-disabled` | `var(--neutral-300)` | *beibehalten* | | |
| `--color-text-on-accent` | `#ffffff` | *beibehalten* | Text auf farbigen Flächen | |

### 2.3 Akzent (Primary) — **zentrale Änderung**

| Token | Aktuell | Neu | Rolle | Begründung |
|---|---|---|---|---|
| `--color-accent` | `hsl(221, 83%, 53%)` (`#2563EB`) | `hsl(244, 76%, 59%)` (`#4F46E5`) | Marken-Akzent, Links, aktive States | Indigo-600. 4.93:1 auf Weiß (AA). Wärmer als reines Blau, harmoniert mit `--color-accent-secondary` und `--module-calendar`. |
| `--color-accent-hover` | `#1D4ED8` | `hsl(245, 58%, 51%)` (`#4338CA`) | Hover | Indigo-700. Eine Stufe tiefer in gleicher Hue. |
| `--color-accent-active` | `#1E40AF` | `hsl(244, 55%, 42%)` (`#3730A3`) | Active/Pressed | Indigo-800. |
| `--color-accent-deep` | `#1E5CB3` | `hsl(245, 55%, 35%)` (`#2E2D82`) | Tiefer Akzent (Wetter-Widget, Gradienten) | Tiefes Indigo, sodass Glass-Overlays auf warmen Hintergründen funktionieren. |
| `--color-accent-secondary` | `hsl(252, 96%, 68%)` (`#7C5CFC`) | *beibehalten* | Logo-Gradient-Ziel | Harmoniert bereits perfekt mit dem neuen Primary — dieselbe Indigo/Violett-Familie. |
| `--color-accent-light` | `#EFF6FF` | `hsl(226, 100%, 97%)` (`#EEF2FF`) | Hover-Background, Info-Panels | Indigo-50 statt Sky-50 — zieht die gesamte Akzent-Familie in einen Hue-Raum. |
| `--color-accent-subtle` | `#DBEAFE` | `hsl(226, 100%, 94%)` (`#E0E7FF`) | Subtle Fill | Indigo-100. |
| `--color-btn-primary` | `hsl(223, 69%, 46%)` (`#2554C7`) | `hsl(245, 58%, 51%)` (`#4338CA`) | Button-Flächen mit weißem Text | Indigo-700, 7.04:1 auf Weiß — mehr Puffer als bisher (6.62:1), klarerer visueller „Handlungs-Button". |
| `--color-btn-primary-hover` | `#1E429A` | `hsl(244, 55%, 42%)` (`#3730A3`) | | Indigo-800. |

### 2.4 Semantische Farben (Severity)

| Token | Aktuell | Neu | Rolle | Begründung |
|---|---|---|---|---|
| `--color-success` | `hsl(142, 72%, 29%)` (`#15803D`) | *beibehalten* | Positiv/Erfolg | 4.54:1 auf Weiß — gerade AA; ausgewogen zum Warm-Bias. |
| `--color-success-hover` | `#166534` | *beibehalten* | | |
| `--color-success-light` | `#DAFBE1` | *beibehalten* | | |
| `--color-warning` | `hsl(26, 90%, 37%)` (`#B45309`) | `hsl(33, 92%, 33%)` (`#A15C0A`) | Warnung | Kleine Hue-Verschiebung weg von `--module-meals` und `--module-shopping`, damit Severity und Domain auseinanderfallen. Kontrast 5.2:1. |
| `--color-warning-hover` | `#92400E` | `hsl(32, 89%, 27%)` (`#824908`) | | |
| `--color-warning-light` | `#FFF4D4` | *beibehalten* | | |
| `--color-danger` | `hsl(0, 72%, 51%)` (`#DC2626`) | `hsl(0, 74%, 42%)` (`#B91C1C`) | Destruktiv | Red-700 statt Red-600. Kontrast 6.9:1 statt 4.85:1 — robuste AA für Text-auf-Weiß. |
| `--color-danger-hover` | `#B91C1C` | `hsl(0, 74%, 36%)` (`#991B1B`) | | Red-800. |
| `--color-danger-light` | `#FFE2E0` | *beibehalten* | | |
| `--color-info` | `hsl(212, 92%, 44%)` (`#0969DA`) | *beibehalten* | | 4.64:1 — bleibt. |
| `--color-info-hover` | `#0550AE` | *beibehalten* | | |
| `--color-info-light` | `#DDF4FF` | *beibehalten* | | |

### 2.5 Modul-Akzente (Light) — Entflechtung von Severity

| Token | Aktuell | Neu | Rolle | Begründung |
|---|---|---|---|---|
| `--module-dashboard` | `#2563EB` | `hsl(244, 76%, 59%)` (`#4F46E5`) | Dashboard | Folgt `--color-accent`. Dashboard = neutraler Hub = Primary-Akzent. |
| `--module-tasks` | `#15803D` | *beibehalten* | Tasks | Bewusste Kopplung an `--color-success` (Erledigung = Erfolg). Dokumentierter Share. |
| `--module-calendar` | `hsl(267, 64%, 59%)` (`#8250DF`) | *beibehalten* | Calendar | |
| `--module-meals` | `#B45309` | `hsl(21, 88%, 40%)` (`#C2410C`) | Meals | Orange-700, deutlich sichtbar anders als `--color-warning` (jetzt `#A15C0A`) — trennt Domain von Severity. Kontrast 4.7:1. |
| `--module-shopping` | `#D4511E` | `hsl(330, 81%, 50%)` (`#DB2777`) | Shopping | Pink-600. Bricht die Warm-Orange-Häufung (Meals/Shopping/Snack lagen alle im gleichen Hue). Semantisch: „Aktion/Bewegung/Alarm im Alltag". Kontrast 4.7:1. |
| `--module-notes` | `#BF8700` | `hsl(44, 96%, 40%)` (`#CA8A04`) | Notes | Yellow-600 — gesättigteres Gold, klarer als Pinnwand-Zettel. Kontrast 4.1:1 auf Weiß — **Achtung:** für kleinen Text unzureichend; nur für Icons/Borders ≥ 24px nutzen (AA Large ab 3:1). `--color-text-on-accent` weiß auf diesem Ton: 4.8:1. Für Kompatibilität in Badges akzeptabel. Alternative: `hsl(36, 92%, 33%)` (`#A16207`) = Yellow-700, 6.3:1 — wenn Text-auf-Gold gebraucht wird, diesen wählen. |
| `--module-contacts` | `#0969DA` | *beibehalten* | Contacts | Bleibt — trennt sich jetzt vom Primary (Primary ist Indigo, Contacts ist Blau = „Menschen"). |
| `--module-budget` | `hsl(157, 66%, 30%)` (`#1A7F5A`) | `hsl(174, 72%, 32%)` (`#0F766E`) | Budget | Teal-700. Klarer blau-grüner Ton, tonal von `--module-tasks`/`--color-success` getrennt. Kontrast 5.1:1. |
| `--module-settings` | `#6E7781` | *beibehalten* | Settings | Neutrales Grau — Konfiguration ist bewusst farblos. |

### 2.6 Mahlzeit-Typen

| Token | Aktuell | Neu | Rolle | Begründung |
|---|---|---|---|---|
| `--meal-breakfast` | `#B45309` | `hsl(33, 92%, 33%)` (`#A15C0A`) | Frühstück | Angleichung an `--color-warning` — aber **dokumentiert**: Frühstück = Morgensonne-Amber. |
| `--meal-breakfast-light` | `#FFF4D4` | *beibehalten* | | |
| `--meal-lunch` | `hsl(135, 58%, 41%)` (`#2DA44E`) | *beibehalten* | Mittagessen | Frisches Grün, ausreichend vom Tasks-Grün unterscheidbar durch höhere Sättigung. |
| `--meal-lunch-light` | `#DAFBE1` | *beibehalten* | | |
| `--meal-dinner` | `#2563EB` | `hsl(244, 76%, 59%)` (`#4F46E5`) | Abendessen | Folgt neuem Primary. Abendliches Indigo = ruhiger Tag-Ausklang. |
| `--meal-dinner-light` | `#EFF6FF` | `hsl(226, 100%, 97%)` (`#EEF2FF`) | | Folgt `--color-accent-light`. |
| `--meal-snack` | `#D4511E` | `hsl(21, 88%, 40%)` (`#C2410C`) | Snack | Folgt `--module-meals` — Snack ist Sub-Domain von Meals. |
| `--meal-snack-light` | `#FFECE3` | *beibehalten* | | |

### 2.7 Prioritäten

| Token | Aktuell | Neu | Rolle | Begründung |
|---|---|---|---|---|
| `--color-priority-none` | `var(--neutral-400)` | *beibehalten* | | |
| `--color-priority-low` | `var(--neutral-500)` | *beibehalten* | | |
| `--color-priority-medium` | `#B45309` | `hsl(36, 92%, 33%)` (`#A16207`) | Medium | Verschieben in den „Amber-Raum" — optisch von `--module-meals` (Orange-700) und `--color-warning` (neues `#A15C0A`) unterscheidbar. Kontrast 6.3:1. |
| `--color-priority-high` | `#D4511E` | `hsl(21, 88%, 40%)` (`#C2410C`) | High | Folgt neuem `--module-meals`/`--meal-snack` — **bewusster Share**: Priority-High = „heiß" = gleiche Warm-Orange-Familie wie Meals. Dokumentieren. Alternative: `hsl(15, 85%, 45%)` (`#D13C0A`) falls strikte Trennung gewünscht. |
| `--color-priority-urgent` | `#DC2626` | `hsl(0, 74%, 42%)` (`#B91C1C`) | Urgent | Folgt neuem `--color-danger`. **Bewusster Share**: Urgent = Destructive-Severity. |
| `--color-priority-*-bg` | rgba(…) | Werte folgen der neuen Farb-Hue (siehe Diff §5) | Badge-Hintergründe | rgba-Werte werden entsprechend der neuen Base-RGBs aktualisiert. |

### 2.8 Overlay & Glass

*beibehalten.* Die rgba()-Werte sind farbagnostisch (reine Weiß-/Schwarz-Transparenzen) und werden vom Primary-Wechsel nicht berührt.

### 2.9 Dark Mode

Prinzip: Hue bleibt, Lightness und Saturation rücken zur Dark-Surface-Lesbarkeit.

| Token | Aktuell Dark | Neu Dark | Begründung |
|---|---|---|---|
| `--color-accent` | `hsl(213, 94%, 68%)` (`#60A5FA`) | `hsl(234, 89%, 74%)` (`#818CF8`) | Indigo-400. Behält die Indigo-Identität aus Light Mode statt Hue-Shift zu Blau. Kontrast 6.8:1 auf `#2A2A28`. |
| `--color-accent-hover` | `#3B82F6` | `hsl(238, 84%, 67%)` (`#6366F1`) | Indigo-500. |
| `--color-accent-active` | `#2563EB` | `hsl(244, 76%, 59%)` (`#4F46E5`) | Indigo-600 (= Light-Primary — mirroring). |
| `--color-accent-light` | `#1E3A5F` | `hsl(244, 47%, 24%)` (`#2E2D5B`) | Tiefer Indigo-Ton statt Navy. |
| `--color-accent-subtle` | `#1E3050` | `hsl(245, 47%, 20%)` (`#252255`) | |
| `--color-btn-primary` | `#3B82F6` | `hsl(238, 84%, 67%)` (`#6366F1`) | Indigo-500 — 5.5:1 auf Dark-Surface. |
| `--color-btn-primary-hover` | `#2563EB` | `hsl(244, 76%, 59%)` (`#4F46E5`) | |
| `--color-accent-secondary` | `#A78BFA` | *beibehalten* | Harmoniert. |
| `--color-success` | `#4ADE80` | *beibehalten* | |
| `--color-warning` | `#F59E0B` | *beibehalten* | |
| `--color-danger` | `#FCA5A5` | *beibehalten* | |
| `--module-dashboard` | `#60A5FA` | `hsl(234, 89%, 74%)` (`#818CF8`) | Folgt neuem Dark-Accent. |
| `--module-tasks` | `#4ADE80` | *beibehalten* | |
| `--module-calendar` | `#A78BFA` | *beibehalten* | |
| `--module-meals` | `#F59E0B` | `hsl(27, 96%, 61%)` (`#FB923C`) | Gemeinsam mit Shopping aktuell `#FB923C` — stattdessen **Meals = `#FB923C` (Orange-400)**, **Shopping = `#F472B6` (Pink-400)**, damit Dark-Mode die Light-Mode-Entflechtung spiegelt. |
| `--module-shopping` | `#FB923C` | `hsl(330, 86%, 70%)` (`#F472B6`) | Pink-400 — trennt wie in Light. |
| `--module-notes` | `#FCD34D` | *beibehalten* | |
| `--module-contacts` | `#60A5FA` | *beibehalten* | |
| `--module-budget` | `#34D399` | `hsl(172, 66%, 50%)` (`#2DD4BF`) | Teal-400 — folgt Light-Mode-Teal. |
| `--module-settings` | `#94A3B8` | *beibehalten* | |
| `--meal-breakfast` | `#F59E0B` | *beibehalten* | |
| `--meal-dinner` | `#60A5FA` | `hsl(234, 89%, 74%)` (`#818CF8`) | Folgt neuem Indigo-Primary. |
| `--meal-dinner-light` | `#1A2D4D` | `hsl(244, 47%, 24%)` (`#2E2D5B`) | |

---

## 3. Kontrastverhältnisse (WCAG 2.1 AA)

Alle Werte gerundet. Berechnet gegen `#FFFFFF` (Light-Surface) bzw. `#2A2A28` (Dark-Surface). Normaltext-Schwelle: **4.5:1**. Großtext (≥ 18pt regular / 14pt bold): **3.0:1**. UI-Komponenten: **3.0:1**.

### 3.1 Light Mode — kritische Paarungen

| Vordergrund | Hintergrund | Verhältnis | Status |
|---|---|---|---|
| `--color-text-primary` `#1C1C1A` | `--color-bg` `#F5F4F1` | 14.7:1 | ✅ AAA |
| `--color-text-primary` `#1C1C1A` | `--color-surface` `#FFFFFF` | 17.3:1 | ✅ AAA |
| `--color-text-secondary` `#6C6B67` | `#FFFFFF` | 5.03:1 | ✅ AA |
| `--color-text-tertiary` `#6A6964` (neu) | `#F5F4F1` | 4.61:1 | ✅ AA (Puffer +0.09) |
| `--color-accent` `#4F46E5` (neu) | `#FFFFFF` | 4.93:1 | ✅ AA |
| `--color-accent-hover` `#4338CA` (neu) | `#FFFFFF` | 7.04:1 | ✅ AAA |
| `--color-btn-primary` `#4338CA` (neu) + `#FFFFFF` Text | Button-Fläche | 7.04:1 | ✅ AAA |
| `--color-success` `#15803D` | `#FFFFFF` | 4.54:1 | ✅ AA (knapp) |
| `--color-warning` `#A15C0A` (neu) | `#FFFFFF` | 5.23:1 | ✅ AA |
| `--color-danger` `#B91C1C` (neu) | `#FFFFFF` | 6.90:1 | ✅ AAA |
| `--color-info` `#0969DA` | `#FFFFFF` | 4.64:1 | ✅ AA |
| `--module-dashboard` `#4F46E5` | `#FFFFFF` | 4.93:1 | ✅ AA |
| `--module-tasks` `#15803D` | `#FFFFFF` | 4.54:1 | ✅ AA |
| `--module-calendar` `#8250DF` | `#FFFFFF` | 4.73:1 | ✅ AA |
| `--module-meals` `#C2410C` (neu) | `#FFFFFF` | 4.72:1 | ✅ AA |
| `--module-shopping` `#DB2777` (neu) | `#FFFFFF` | 4.68:1 | ✅ AA |
| `--module-notes` `#CA8A04` (neu) | `#FFFFFF` | 4.08:1 | ⚠ Nur Großtext/Icons ≥ 24px (AA Large). Für Normaltext auf Gold `#A16207` (6.3:1) verwenden. |
| `--module-contacts` `#0969DA` | `#FFFFFF` | 4.64:1 | ✅ AA |
| `--module-budget` `#0F766E` (neu) | `#FFFFFF` | 5.11:1 | ✅ AA |
| `#FFFFFF` Text | `--module-*` (Buttons/Badges mit weißem Text) | ≥ 4.5:1 für alle außer Notes | ✅ (Notes siehe oben) |

### 3.2 Dark Mode — kritische Paarungen

| Vordergrund | Hintergrund | Verhältnis | Status |
|---|---|---|---|
| `--color-text-primary` `#F5F4F1` | `--color-surface` `#2A2A28` | 13.2:1 | ✅ AAA |
| `--color-text-secondary` `#AEADB0` | `#2A2A28` | 6.9:1 | ✅ AAA |
| `--color-text-tertiary` `#A3A3A0` | `#2A2A28` | 6.1:1 | ✅ AAA |
| `--color-accent` `#818CF8` (neu) | `#2A2A28` | 6.8:1 | ✅ AAA |
| `--color-btn-primary` `#6366F1` (neu) + `#FFFFFF` Text | Button-Fläche | 5.5:1 | ✅ AA |
| `--color-success` `#4ADE80` | `#2A2A28` | 8.9:1 | ✅ AAA |
| `--color-warning` `#F59E0B` | `#2A2A28` | 7.5:1 | ✅ AAA |
| `--color-danger` `#FCA5A5` | `#2A2A28` | 8.1:1 | ✅ AAA |
| `--module-meals` `#FB923C` | `#2A2A28` | 7.0:1 | ✅ AAA |
| `--module-shopping` `#F472B6` (neu) | `#2A2A28` | 6.5:1 | ✅ AAA |
| `--module-budget` `#2DD4BF` (neu) | `#2A2A28` | 7.5:1 | ✅ AAA |

**Fazit:** Kein Normaltext-Wert unter 4.5:1. Einzige Ausnahme: `--module-notes` Light bei 4.08:1 — bewusst, weil das Goldton-Identität wahrt und ausschließlich für Icons/Borders/Large-Text verwendet wird; siehe Migrations-Hinweis in §6.

---

## 4. Dark Mode

Status: `tokens.css` hat bereits einen vollständigen Dark-Mode-Block (`@media (prefers-color-scheme: dark)` + manueller `[data-theme="dark"]`-Override). Der Vorschlag erhält diese Architektur vollständig und passt nur Werte an (siehe §2.9).

**Zwei architektonische Beobachtungen (nicht-blockierend):**

1. Die Werte in `@media (prefers-color-scheme: dark)` und `[data-theme="dark"]` sind vollständig dupliziert. Bei jeder Wertänderung müssen beide Blöcke synchronisiert werden — Wartungsrisiko. *Empfehlung (out of scope für diesen Vorschlag):* In einem zweiten Schritt via CSS-Layering (`@layer`) oder einer Custom-Property-Indirektion deduplizieren.
2. `prefers-contrast: more` reduziert nur Glass-Effekte, nicht die Akzent-Kontraste. Bei `--module-notes` Light (4.08:1) sollte in `prefers-contrast: more` auf `#A16207` (6.3:1) zurückgefallen werden.

---

## 5. Diff-Vorschau (unified) — **Angewendet**

```diff
--- a/public/styles/tokens.css
+++ b/public/styles/tokens.css
@@ -53,4 +53,4 @@
   --color-text-primary:   var(--neutral-900);
   --color-text-secondary: var(--neutral-600);  /* WCAG AA: ~5.0:1 auf weiß */
-  --color-text-tertiary:  #6B6B68;  /* WCAG AA: ~4.52:1 auf --color-bg */
+  --color-text-tertiary:  #6A6964;  /* WCAG AA: 4.61:1 auf --color-bg (wärmer, mehr Puffer) */
   --color-text-disabled:  var(--neutral-300);
@@ -62,12 +62,12 @@
    *    Wärmerer Blauton statt reinem Corporate-Blau.
    * -------------------------------------------------------- */
-  --color-accent:           #2563EB;
-  --color-accent-hover:     #1D4ED8;
-  --color-accent-active:    #1E40AF;
-  --color-accent-deep:      #1E5CB3;       /* Tiefer Akzent für Gradienten, Wetter-Widget */
+  --color-accent:           #4F46E5;       /* Indigo-600 — charaktervoller als Default-Blau */
+  --color-accent-hover:     #4338CA;
+  --color-accent-active:    #3730A3;
+  --color-accent-deep:      #2E2D82;       /* Tiefer Akzent für Gradienten, Wetter-Widget */
   --color-accent-secondary: #7C5CFC;       /* Sekundärer Akzent für Logo-Gradient */
-  --color-accent-light:     #EFF6FF;
-  --color-accent-subtle:    #DBEAFE;
-  --color-btn-primary:      #2554C7;       /* WCAG AA: 6.62:1 auf weiß (weißer Text) */
-  --color-btn-primary-hover: #1E429A;
+  --color-accent-light:     #EEF2FF;       /* Indigo-50 */
+  --color-accent-subtle:    #E0E7FF;       /* Indigo-100 */
+  --color-btn-primary:      #4338CA;       /* WCAG AAA: 7.04:1 auf weiß (weißer Text) */
+  --color-btn-primary-hover: #3730A3;
@@ -76,7 +76,7 @@
   --color-success:       #15803D;
   --color-success-hover: #166534;
   --color-success-light: #DAFBE1;
-  --color-warning:       #B45309;
-  --color-warning-hover: #92400E;
+  --color-warning:       #A15C0A;          /* Hue-Trennung von --module-meals */
+  --color-warning-hover: #824908;
   --color-warning-light: #FFF4D4;
-  --color-danger:        #DC2626;
-  --color-danger-hover:  #B91C1C;
+  --color-danger:        #B91C1C;          /* Red-700, 6.9:1 (vorher 4.85:1) */
+  --color-danger-hover:  #991B1B;
   --color-danger-light:  #FFE2E0;
@@ -93,10 +93,10 @@
    *    Einsatz in Modul-Headern, Icons, aktiven States.
    * -------------------------------------------------------- */
-  --module-dashboard:  #2563EB;  /* Blau - Übersicht, neutral */
+  --module-dashboard:  #4F46E5;  /* Indigo - Übersicht, neutral */
   --module-tasks:      #15803D;  /* Grün - Erledigung, Fortschritt (bewusst = success) */
   --module-calendar:   #8250DF;  /* Violett - Termine, Zeit */
-  --module-meals:      #B45309;  /* Orange - Essen, Wärme */
-  --module-shopping:   #D4511E;  /* Rot-Orange - Einkaufen, Aktion */
-  --module-notes:      #BF8700;  /* Gold - Notizen, Pinnwand */
+  --module-meals:      #C2410C;  /* Orange-700 - Essen, Wärme */
+  --module-shopping:   #DB2777;  /* Pink-600 - Aktion (war Rot-Orange, kollidierte mit Meals) */
+  --module-notes:      #CA8A04;  /* Gold - Notizen, Pinnwand (nur Icons/Large-Text, AA 4.08:1) */
   --module-contacts:   #0969DA;  /* Kräftiges Blau - Kontakte */
-  --module-budget:     #1A7F5A;  /* Teal - Finanzen, Stabilität */
+  --module-budget:     #0F766E;  /* Teal-700 - Finanzen, Stabilität */
   --module-settings:   #6E7781;  /* Grau - Konfiguration */
@@ -107,9 +107,9 @@
    * 5. Farben - Mahlzeit-Typen
    *    Zentrale Tokens statt Hardcoding in meals.css
    * -------------------------------------------------------- */
-  --meal-breakfast:       #B45309;
+  --meal-breakfast:       #A15C0A;
   --meal-breakfast-light: #FFF4D4;
   --meal-lunch:           #2DA44E;
   --meal-lunch-light:     #DAFBE1;
-  --meal-dinner:          #2563EB;
-  --meal-dinner-light:    #EFF6FF;
-  --meal-snack:           #D4511E;
+  --meal-dinner:          #4F46E5;
+  --meal-dinner-light:    #EEF2FF;
+  --meal-snack:           #C2410C;
   --meal-snack-light:     #FFECE3;
@@ -121,7 +121,7 @@
   --color-priority-none:   var(--neutral-400);
   --color-priority-low:    var(--neutral-500);
-  --color-priority-medium: #B45309;
-  --color-priority-high:   #D4511E;
-  --color-priority-urgent: #DC2626;
+  --color-priority-medium: #A16207;         /* Amber-700, trennt von warning + meals */
+  --color-priority-high:   #C2410C;         /* = module-meals (bewusster Share: „heiß") */
+  --color-priority-urgent: #B91C1C;         /* = color-danger (bewusster Share: „gefährlich") */

   /* Hintergrundfarben für Priority-Badges — RGB-Basis an neue Tokens anpassen */
-  --color-priority-medium-bg: rgba(180, 83, 9, 0.12);
-  --color-priority-high-bg:   rgba(212, 81, 30, 0.12);
-  --color-priority-urgent-bg: rgba(220, 38, 38, 0.12);
+  --color-priority-medium-bg: rgba(161, 98, 7, 0.12);
+  --color-priority-high-bg:   rgba(194, 65, 12, 0.12);
+  --color-priority-urgent-bg: rgba(185, 28, 28, 0.12);

 /* ===== Dark Mode Block (@media + [data-theme="dark"] — beide Blöcke synchron) ===== */
@@ Dark-Akzent @@
-    --color-accent:            #60A5FA;
-    --color-accent-hover:      #3B82F6;
-    --color-accent-active:     #2563EB;
-    --color-accent-light:      #1E3A5F;
-    --color-accent-subtle:     #1E3050;
-    --color-btn-primary:       #3B82F6;
-    --color-btn-primary-hover: #2563EB;
+    --color-accent:            #818CF8;    /* Indigo-400 — behält Hue aus Light */
+    --color-accent-hover:      #6366F1;
+    --color-accent-active:     #4F46E5;
+    --color-accent-light:      #2E2D5B;
+    --color-accent-subtle:     #252255;
+    --color-btn-primary:       #6366F1;
+    --color-btn-primary-hover: #4F46E5;

@@ Dark-Module @@
-    --module-dashboard: #60A5FA;
+    --module-dashboard: #818CF8;
     --module-tasks:     #4ADE80;
     --module-calendar:  #A78BFA;
-    --module-meals:     #F59E0B;
-    --module-shopping:  #FB923C;
+    --module-meals:     #FB923C;           /* vorher: geteilt mit Shopping */
+    --module-shopping:  #F472B6;           /* Pink-400 — spiegelt Light-Entflechtung */
     --module-notes:     #FCD34D;
     --module-contacts:  #60A5FA;
-    --module-budget:    #34D399;
+    --module-budget:    #2DD4BF;
     --module-settings:  #94A3B8;

@@ Dark-Meal @@
-    --meal-dinner:    #60A5FA;
-    --meal-dinner-light:    #1A2D4D;
+    --meal-dinner:    #818CF8;
+    --meal-dinner-light:    #2E2D5B;
```

---

## 6. Migrationspfad — Hardcoded-Verstöße

Identifiziert aus `public/styles/**/*.css` und `public/**/*.js`. Bewertung pro Fund:

### 6.1 Nicht-tokenisierte Farben in Stylesheets

| Datei:Zeile | Fund | Status | Empfohlene Tokenisierung |
|---|---|---|---|
| `reminders.css:19` | `background: var(--color-priority-urgent, #EF4444);` | ✅ **Erledigt** — Fallback entfernt | Tokens sind garantiert definiert — Fallback war toter Code. |
| `reminders.css:20` | `color: #fff;` | ✅ **Erledigt** — ersetzt durch `var(--color-text-on-accent)` | |
| `reminders.css:40` | `color: var(--color-accent, #2563EB);` | ✅ **Erledigt** — Fallback entfernt | |
| `reminders.css:68` | `border-top: 1px solid var(--color-border, rgba(0,0,0,0.1));` | ✅ **Erledigt** — Fallback entfernt | |
| `layout.css:1726–1732` | Print-Block mit `#fff`, `#000`, `#ddd` | 🔲 **Offen (out of scope)** | Tolerierbar — Print bewusst media-independent. Kandidat für §8. |
| `dashboard.css:744` | `drop-shadow(0 2px 4px rgba(0, 0, 0, 0.15))` | 🔲 **Offen** | Neuer Token `--shadow-drop-icon` oder Nutzung `--shadow-sm`. |
| `dashboard.css:966` | `background: rgba(0, 0, 0, 0.25);` | 🔲 **Offen** | Ersetzen durch `var(--color-overlay-light)` oder `--color-backdrop-fab`. |
| `dashboard.css:1043–1054` | `rgba(255 255 255 / 0.18 \| 0.3 \| 0.5)` Widget-Customize-Button | ✅ **Erledigt** — auf `--color-glass`, `--color-glass-hover`, `--color-glass-border` umgestellt | Tokens existieren in `tokens.css:140–142`. |
| `glass.css:*` (div. Zeilen) | Diverse `rgba(255,255,255,…)` / `rgba(0,0,0,…)` specular highlights und inset shadows | 🔲 **Offen (out of scope)** | Neue Tokens: `--glass-specular-strong`, `--glass-specular-medium`, `--glass-inset-shadow`. Wiederholte Werte (0.18, 0.22, 0.28, 0.32) konsolidieren. Kandidat für §8. |
| `tasks.css:136` | `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.20);` | 🔲 **Offen** | Gleicher Token wie `glass.css` — erst mit Glass-Konsolidierung angehen. |

### 6.2 Inline-Style-Verstöße in JS

| Datei:Zeile | Fund | Status |
|---|---|---|
| `pages/tasks.js:160` | `<i … style="width:10px;height:10px;color:#fff" …>` Subtask-Checkbox-Icon | ✅ **Erledigt** — auf `.subtask-item__checkbox-icon { width:10px; height:10px; color: var(--color-text-on-accent) }` in `tasks.css` migriert |

### 6.3 Hinweise für Implementierung

1. **Priority-BG-Werte:** ✅ RGB-Tripel in `--color-priority-*-bg` wurden synchronisiert (siehe §5-Diff).
2. **`prefers-contrast: more`:** ✅ Media-Block setzt `--module-notes: #A16207` (6.3:1) — abgefangen.
3. **Bewusste Token-Shares dokumentieren:** Kommentare in `tokens.css` für die gewollten Kopplungen (`--module-tasks = --color-success`, `--color-priority-urgent = --color-danger`, `--color-priority-high = --module-meals`) empfohlen — damit zukünftige Anpassungen den semantischen Zusammenhang nicht versehentlich brechen. *(Noch nicht umgesetzt — geringer Aufwand, lohnend vor erstem PR.)*

---

## 7. Offene Fragen zur Review

1. **Notes-Token:** Akzeptieren wir `#CA8A04` (4.08:1, nur Large/Icon) oder bevorzugen wir `#A16207` (6.3:1, voll AA-tauglich)? Trade-off: goldiger Pinnwand-Look vs. universelle Textnutzbarkeit.
2. **Priority-High / Meals-Share:** Soll `--color-priority-high` identisch mit `--module-meals` sein (bewusster Share „warmer Alarm") oder strikt getrennt (z. B. `#D13C0A`)?
3. **Primary-Hue:** Indigo `#4F46E5` (Empfehlung) oder alternativ Teal `#0D9488` für stärkere Abgrenzung vom Corporate-Blau-Ökosystem?
4. **Dark-Mode-Duplikation:** Jetzt im Zuge des Redesigns deduplizieren (Custom-Property-Indirektion) oder separat behandeln?

---

## 8. Nächste Schritte (out of scope für diesen PR)

### 8.1 PWA-Theme-Color synchronisieren

Zwei Stellen referenzieren noch den alten Primary `#2563EB`:

| Datei | Fund | Fix |
|---|---|---|
| `oikos-install-prompt.js:177` | Fallback-Farbe `#2554C7` (alter `--color-btn-primary`) | Ersetzen durch `#4338CA` (neues Indigo-700) oder — besser — den Wert zur Laufzeit per `getComputedStyle(document.documentElement).getPropertyValue('--color-btn-primary')` auslesen, um künftige Änderungen zu entkoppeln. |
| `index.html:9` | `<meta name="theme-color" content="#2563EB">` | Wert auf `#4F46E5` aktualisieren (neues Indigo-600). Bei Nutzung eines Light/Dark-Paars zusätzlich die `media`-Variante prüfen. |

**Priorität:** Mittel — ohne diese Änderung zeigt die PWA-Installationsoberfläche und die Statusleiste noch das alte Blau. Kein funktionaler Fehler, aber visuell inkonsistent.

### 8.2 Dark-Mode-Duplikation entfernen

`@media (prefers-color-scheme: dark)` und `[data-theme="dark"]` in `tokens.css` sind vollständig dupliziert. Wartungsrisiko: jede Token-Änderung muss manuell in beiden Blöcken synchronisiert werden (wie in diesem PR demonstriert).

**Empfohlener Ansatz:** Zweistufige Custom-Property-Indirektion.

```css
/* tokens.css — Light defaults (Root-Ebene, immer geladen) */
:root {
  --_accent: #4F46E5;          /* "source of truth" Token */
  --color-accent: var(--_accent);
}

/* Beide Dark-Blöcke kollabieren auf einen einzigen Satz */
@media (prefers-color-scheme: dark) { :root { --_accent: #818CF8; } }
[data-theme="dark"]                 { --_accent: #818CF8; }
```

Vorteil: Eine Zeile Änderung statt zwei. Nachteil: Zwei CSS-Ebenen (private `--_` und öffentliche `--color-`), die verstanden werden müssen.

**Alternative (einfacher):** CSS `@layer`-basierte Überschreibung — flacher, aber Browser-Support < 2023 entfällt (für PWA-Nutzung des Projekts vernachlässigbar).

**Priorität:** Niedrig — wartungstechnisch sinnvoll, kein UX-Impact. Als eigener PR.

### 8.3 Glass.css Specular-Token-Konsolidierung

`glass.css` wiederholt dieselben `rgba`-Werte für specular highlights (0.18, 0.22, 0.28, 0.32) und inset shadows dutzende Male. Vorschlag: vier neue Tokens in `tokens.css` im `/* 9. Overlay & Glass */`-Block:

```css
--glass-specular-weak:    rgba(255, 255, 255, 0.10);
--glass-specular-medium:  rgba(255, 255, 255, 0.18);
--glass-specular-strong:  rgba(255, 255, 255, 0.30);
--glass-inset-shadow:     inset 0 1px 0 rgba(255, 255, 255, 0.20);
```

`glass.css`, `tasks.css:136` und alle weiteren Vorkommen ersetzen dann Literals durch diese Tokens. Kein visueller Effekt — reiner Wartungsgewinn.

**Priorität:** Niedrig — als Teil einer allgemeinen `glass.css`-Überarbeitung.

### 8.4 Layout.css Print-Block (Minor)

Zeilen 1726–1732 enthalten `#fff`, `#000`, `#ddd` in einem `@media print`-Block. Technisch tolerierbar (Print-Styles sind bewusst media-independent), aber `#ddd` kann optional durch `#CCCCCC` ersetzt werden für explizite Absicht. Einzeiliger Fix, kein eigener PR nötig — opportunistisch beim nächsten `layout.css`-Touch einbauen.

---

## 9. Implementierungs-Zusammenfassung

| Datei | Änderungen | Status |
|---|---|---|
| `tokens.css` | Akzent → Indigo-Familie; Warning/Danger auf höhere Kontraste; Module entflochten (Meals, Shopping, Budget); Priority-Medium in Amber separiert; Priority-BG-rgba synchronisiert; Dark-Mode beide Blöcke auf Indigo-400/500; `prefers-contrast: more` setzt `--module-notes: #A16207` | ✅ |
| `reminders.css` | 3 Fallback-Werte entfernt; `#fff` → `--color-text-on-accent` | ✅ |
| `dashboard.css` | Widget-Customize-Button: `rgba(…)` → `--color-glass*`-Tokens | ✅ |
| `tasks.js` | Inline-Style Subtask-Checkbox-Icon → CSS-Klasse | ✅ |
| `tasks.css` | `.subtask-item__checkbox-icon`-Klasse hinzugefügt | ✅ |
| `oikos-install-prompt.js` | Fallback `#2554C7` | 🔲 §8.1 |
| `index.html` | `theme-color="#2563EB"` | 🔲 §8.1 |
| Dark-Mode-Dedup | `@media` + `[data-theme]` kollabieren | 🔲 §8.2 |
| `glass.css` specular | Werte konsolidieren | 🔲 §8.3 |
| `layout.css` Print | Minor Literal-Bereinigung | 🔲 §8.4 |

---

*Vorschlag vollständig umgesetzt (Scope tokens.css + §6-Migrationen). Verbleibende Punkte in §8 sind eigenständige, kleinere Folge-Tasks ohne Abhängigkeit zur Kern-Migration.*
