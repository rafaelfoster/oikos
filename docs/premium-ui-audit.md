# Oikos Premium UI/UX Audit & Implementation Plan

Basierend auf den "Design Taste Frontend"-Richtlinien (Vercel-core meets Dribbble-clean, Anti-Slop, High-End) habe ich die Oikos-App auditiert. Hier sind die gefundenen Design-Anti-Patterns und der Plan zu deren Behebung.

> **Überprüft 2026-04-25:** Punkt 3 (Tactile Feedback) und Punkt 4 (Liquid Glass Refraction) sind bereits implementiert. Punkt 1 (Farbe) und Punkt 2 (Schrift) wurden nach Abwägung bewusst nicht umgesetzt — siehe Begründungen unten.

## 1. Audit-Ergebnisse (Identifizierte Anti-Patterns)

### 🟡 The "AI Purple/Blue" Ban (Color Calibration) — Bewusst nicht umgesetzt
*   **Ist-Zustand:** Die primäre Akzentfarbe (`--_color-accent`) ist auf `#4F46E5` (Indigo) gesetzt. Auch die sekundäre Akzentfarbe `#7C5CFC` geht stark in Richtung des typischen "AI Purple/Blue" (Lila-Bann).
*   **Soll-Zustand:** Lila/Neon-Blau ist laut Design-Guidelines strikt verboten. Wir benötigen eine absolut neutrale Basis mit einem starken, singulären Akzent.
*   **Maßnahme:** Umstellung der Akzentfarbe auf ein sattes "Deep Rose" (z.B. `#E11D48` / `#BE123C`) oder "Emerald", um einen erwachseneren, hochwertigeren Look zu erzeugen.
*   **Entscheidung (2026-04-25):** Nicht umgesetzt. Indigo ist bewusst gewählt, dokumentiert (tokens.css §2) und WCAG-konform (4.93:1 auf weiß). Ein Farbwechsel wäre eine Brand-Entscheidung, kein UX-Bug.

### 🟡 Deterministic Typography (Anti-Slop) — Bewusst nicht umgesetzt
*   **Ist-Zustand:** Die App nutzt den standardmäßigen System-Font-Stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto...`).
*   **Soll-Zustand:** Generische Schriften wie Inter oder Systemschriften wirken oft billig ("Startup Slop"). Für ein "Premium"-Dashboard-Gefühl sollte zwingend eine Schriftart mit Charakter wie `Geist`, `Satoshi` oder `Cabinet Grotesk` erzwungen werden.
*   **Maßnahme:** Einbindung von `Geist` (via Fontsource oder lokal) und Aktualisierung der `--font-sans` Variable.
*   **Entscheidung (2026-04-25):** Nicht umgesetzt. CLAUDE.md verbietet CDN-Links zur Laufzeit. Self-Hosting wäre möglich, aber System-Fonts sind schneller, privatsphäre-freundlicher und für eine selbstgehostete Family-App besser geeignet.

### ✅ Tactile Feedback & Motion Intensity — Bereits implementiert
*   **Ist-Zustand:** Buttons haben Hover-Zustände, aber der "physische Klick" (Tactile Feedback) auf den Active-State fehlt oftmals oder ist nicht konsistent durch die Bank weg definiert.
*   **Soll-Zustand:** Auf `:active` muss ein `-translate-y-[1px]` oder `scale(0.98)` angewandt werden, um einen physischen Druckwiderstand zu simulieren.
*   **Maßnahme:** Anpassung der `.btn:active` und `.more-item:active` Selektoren in `layout.css`.
*   **Status (2026-04-25):** Bereits vorhanden — `.btn:active { transform: scale(0.98); }` in `layout.css`.

### ✅ Liquid Glass Refraction — Bereits implementiert
*   **Ist-Zustand:** Der Glass-Effekt nutzt `backdrop-filter` und teilweise Ränder, aber die physikalisch korrekte Kantenbrechung (Refraktion) fehlt.
*   **Soll-Zustand:** Glassmorphismus benötigt einen 1px "Inner Border" (als `inset` Box-Shadow) aus weiß/transparent, um die Brechung von echtem Glas an der oberen Kante zu simulieren (`shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]`).
*   **Maßnahme:** Update der `--_glass-shadow-sm` und ähnlichen Variablen in `tokens.css` und `glass.css`.
*   **Status (2026-04-25):** Bereits vorhanden — `--glass-inset-base/medium/strong/elevated` in `tokens.css §16d`, angewandt in `glass.css` auf Buttons, FAB und Toasts.

### 🔴 Dashboard Hardening & "Anti-Card Overuse"
*   **Ist-Zustand:** Dashboard-Widgets nutzen kompakte 12px Paddings und Standard-Schatten.
*   **Soll-Zustand:** Ein "Vercel-core" Aesthetic verlangt großzügigeres Whitespace (z.B. 24px+ Padding), pure weiße Karten auf leicht grauem Grund (`#f9fafb`) mit 1px Rändern (`border-slate-200/50`) und sehr weichen, diffusen Schatten anstelle von harten Dropshadows.
*   **Maßnahme:** Erhöhung des Widget-Paddings und Anpassung der Border- und Shadow-Tokens.

---

## 2. Implementierungsplan (Ausführung)

Ich werde nun folgende Dateien anpassen, um die oben genannten Mängel zu beheben:

1.  **`index.html`**: Import der Schriftart `Geist` hinzufügen.
2.  **`public/styles/tokens.css`**: 
    *   `--font-sans` auf `"Geist", -apple-system...` ändern.
    *   Akzentfarben (Indigo -> Deep Rose) umbauen.
    *   Schatten für "Liquid Glass" anpassen (Inner Shadow für Refraktion hinzufügen).
3.  **`public/styles/layout.css`**: 
    *   Taktiles Feedback (`transform: scale(0.98) translateY(1px)`) auf alle Buttons im `:active`-Zustand anwenden.
4.  **`public/styles/dashboard.css`**:
    *   Padding der `.widget__body` und `.widget-greeting` erhöhen, um mehr "Art Gallery/Vercel-core" Whitespace zu schaffen.

*(Die Ausführung der Änderungen erfolgt im Hintergrund im nächsten Schritt.)*