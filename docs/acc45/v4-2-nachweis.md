# V4-2 Markenrest — Nachweis

Paket V4-2 (`docs/acc45/work-packages.json`). Basis `origin/integration/release-v4` 6e19564b (Merge #422),
Branch `acc45/v4/v4-2-markenrest`. Nur das bestehende V4-Glass-System (`design/v4-glass/*`, `src/v4/*`);
keine Neugestaltung, Klassennamen und E2E-Locators unverändert (`.wort`, `.m-wort`, `.marke`, `.seitenleiste`,
`.slink`, `.sheet-back`, `.m-tabs`, `.bpille`, `.karte` …).

## 1. Befunde und Änderungen (Test zuerst)

Test: `pruefungen/v4-markenrest.test.js` (19 Fälle), eingehängt in `pruefung:v4-tokens` (CI-Schritt
`pruefung.yml`, unverändert). Commit ddf3ad8c (nur Test): **15 von 19 rot** auf dem alten Stand.
Danach 19/19 grün.

| # | Befund (alter Stand) | Änderung | Test |
|---|---|---|---|
| 1 | `theme_color`/`background_color` und `<meta theme-color>` in V3 `#D9E4E8` | `public/manifest.webmanifest`, `index.html` auf V4 `bg` hell `#f0f3ed` (Laufzeit setzt weiter das gültige Thema) | Browserfarbe 2/2 |
| 2 | Wortmarke als HTML-Text (DESIGNSYSTEM: „immer bereitgestelltes SVG“) in Kopfzeile, Seitenleiste, Telefonschale, Einstieg | `Wortmarke` in `src/marke.jsx` (`<img>` auf `public/centric-wortmarke(-hell).svg`, `alt="CENTRIC"`, Seitenverhältnis der Datei); Einsatz in `gestalt/rahmen.jsx` (`.wort`), `App.jsx` (`.marke`), `ansichten/mobil.jsx` (`.m-wort`), `main.jsx` (Markenzeile). Helle/dunkle Datei nach Thema (`dunkelAktiv()` in `farben.js`); Seitenleiste immer hell. Dienstarbeiter hält beide Dateien vor (`GERUEST`, eigener Zweig Netz-zuerst/Speicher-Rückfall), sonst offline nur Alternativtext | Wortmarke 4/4 |
| 3 | Avatar-Paare in V3-Tönen (`#017070`, `#3FBFBF` …) in `farben.js` | `v4AvatarPaare(thema)` in `src/v4/tokens.js`: acht Paare als Farbschlüssel aus `V4_FARBEN`; `farben.js` ohne Hexfarbe | Avatar 2/2, `kontrast.test.js` Avatar-Töne (16 Paare ≥ 4,5:1) |
| 4 | `backdrop-filter` ohne Rückfall: `gestalt/stil.js` (10), `App.jsx` (1) — Gate 4 | `gestalt/stil.js`: `@supports not (backdrop-filter…)` und `@media (prefers-reduced-transparency: reduce)` → `.kopfblock/.tabbar/.m-kopf/.m-tabs` opak (`var(--c-flaeche)` = `V4_GLAS.grund`), Weichzeichner aus; `.m-blattrahmen` und `.sheet-back` (App.jsx) ohne Weichzeichner, Abdunklung bleibt | Glas-Rückfall 6/6 |
| 5 | 25 rgb/rgba- und 9 Hex-Literale in `App.jsx` (Schatten, Seitenleiste) | `V4_SCHATTEN` um `hoch/toast/regler/schublade` ergänzt (hell auf V4-Schattenton 7,30,34); neu `V4_SEITENLEISTE`; `App.jsx` liest beide (`--schatten-*`, `--sl-*`) | Farbliterale 5/5 |
| 6 | Gruppenüberschrift der Seitenleiste (`.sgruppe`, 10,5 px) mit Weiß .40 = 3,5:1 (AA verfehlt) | Token `schriftGruppe` .55 = 5,3:1 (hell) / 6,0:1 (dunkel); übrige Werte unverändert übernommen | Seitenleiste ≥ 4,5:1 |

`V4_TOKENS_VERSION` bleibt 1: kein bestehender Tokenwert wurde geändert, nur ergänzt. Kein bestehender Test angepasst.

## 2. Bildmaterial gegen das C-Logo (nur Prüfung)

- `public/vorschau.png` (1200×630): C-Bildmarke + Wortmarke aus der freigegebenen Familie, V4-Dunkeltöne
  (Quelle `werkzeug/vorschau.html`). **Passt**, kein Austausch nötig.
- `marketing/posts/*.png` (30 Blätter), `marketing/kontaktbogen.png`: ohne C-Bildmarke, Wortmarke als gesperrter
  Text in eigener Schrift, Palette V3 „Midnight“ (`marketing/erzeuge.py:37-45`, Türkis 2,160,160).
  **Austausch wäre eine Designentscheidung** (Marketingreihe, eigene Schriftwahl) → nur gemeldet, nicht geändert.

## 3. Messung V4-Inventar (`node werkzeug/v4-inventar.mjs`)

| Kennzahl | vorher (6e19564b) | nachher |
|---|---|---|
| rgb/rgba-Literale gesamt / Dateien | 58 / 13 | 52 / 12 |
| Hex-Literale gesamt | 149 | 144 |
| `App.jsx` rgb / hex | 25 / 9 | 0 / 3 (Druck `#fff`/`#D1D5DB`, Warnzahl `#fff` Z. 2054) |
| Querschnitt/Bausteine Farbliterale (`--hauptansichten`) | 41 | 10 |
| Dateien mit Glas ohne Rückfall | 8 (u. a. `gestalt/stil.js` 10, `App.jsx` 1) | 6 (nur Ansichten, s. 5) |

`src/v4/tokens.js` steigt als Quelle (rgb 17 → 36, hex 58 → 59); das ist gewollt.

## 4. Lokale Läufe

Windows, je Datei `npx vitest run <datei> --maxWorkers=1`, Stand 71de0454 (Docs danach):

| Prüfung | Ergebnis |
|---|---|
| v4-markenrest (neu) | 19/19 (alter Stand 15/19 rot) |
| v4-tokens · v4-ist-stand · v4-inventar · v4-app-stil | 32/32 · 16/16 · 15/15 · 16/16 |
| gestalt · kontrast · pwa | 19/19 · 207/207 · 29/29 |
| wcag-wp40 · oberflaeche-render · wp39-app-aufbau · endgeraete-speicher | 35/35 · 40/40 · 4/4 · 6/6 |
| prozess-wachen · doku · verdrahtung · ci-abdeckung · acc45-status | 15/15 · 5/5 · 8/8 · 8/8 · 17/17 |
| `npm run lint` · `npm run pruefung:typen` (tsc) | 0 Fehler (nur bekannte Warnungen) · Exit 0 |
| E2E `barrierefreiheit.spec.mjs` + `pwa-dienstarbeiter.spec.mjs`, Projekte 390x844 und 1024x768 | 16 bestanden, 4 übersprungen (Vorgabe der Specs) |
| `node werkzeug/acc45-backlog.mjs status-schreiben` + `pruefen` | OK |

Bildnachweis (lokal, 127.0.0.1, Wegwerfdaten, Bilder nicht im Repo):
`node pruefungen/browser/v4-abnahme.mjs reflow,fehler` mit `THEMEN=light,dark`, `BILDER_ALLE=1`.
Wortmarke hell/dunkel in Telefonschale (390/320) und Avatar im Kopf sichtbar und lesbar; Fehlertext 320/1280 hell/dunkel OK.
Vergleich Basis 6e19564b gegen Branch, `ROLLEN=leitung reflow`, je allein laufend: **gleich** — je 90 geprüft, 2 Befunde
(Reflow „Verteilung“ 320 px, Tabelle 26 px zu breit, hell und dunkel; vorbestehend). Ein erster Branch-Lauf zeigte 4×
„Klick scheitert“ (dunkel, 320); er lief parallel zu lint/tsc. Im Einzellauf traten sie nicht auf.

## 5. Offen / Risiken

- Glas ohne Rückfall bleibt in `ansichten/ablauf.jsx`, `bestaetigungsfrage.jsx`, `fenster.jsx`, `kommandoleiste.jsx`,
  `speicherlage.jsx`, `teilkonflikt.jsx` (je 1, Inline-`backdropFilter` der Rücken). Nicht im Auftrag (nur
  `gestalt/stil.js`, `App.jsx`); Inline-Stile brauchen eine Klasse für die Medienabfrage → V4-3a/V4-3b.
- Befund außerhalb des Pakets: Die `--v4-*`-Variablen kommen nur aus `v4EinstiegAnwenden()` (`src/main.jsx:84,634`).
  Nach einem Neuladen mit bestehender Sitzung wird sie nicht aufgerufen; außerdem folgen `--v4-*` nach dem Einstieg der
  Systemeinstellung, nicht `data-thema` der Anwendung. `v4AppStil()` liest `--v4-*`. Deshalb nutzt V4-2 in `App.jsx`
  eigene Variablen aus den Tokens (`--schatten-*`, `--sl-*`). Klärung in V4-3a.
- Befund außerhalb des Pakets: `html[data-v4-app] .slink.on/.slink:hover` setzt `var(--v4-glas)` (hell: Weiß .72) auf
  die dunkle Seitenleiste mit weißer Schrift (rechnerisch etwa 1,8:1, nur Schublade < 1025 px, helles Thema). Nicht
  geändert (`src/v4/app-stil.js`, Gestaltung V4-3a).
- Startsequenz (`src/startbild.jsx`) zeigt unter der Bildmarke noch „CENTRIC“ als Text (Bildnachweis
  `fehler-anmeldung-1280-dark`); nicht in der Akzeptanz genannt, Canvas-Ablauf mit Abtastung — eigener Folgeschritt.
- Paketabhängigkeiten V4-1/WP-40 laut SSOT nicht integriert; Umsetzung auf Auftrag trotzdem, Status REVIEW.
