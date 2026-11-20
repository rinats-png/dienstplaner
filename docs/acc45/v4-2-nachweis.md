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
| 6 | Gruppenüberschrift der Seitenleiste (`.sgruppe`, 10,5 px) mit Weiß .40 = 3,5:1 (AA verfehlt) | Token `schriftGruppe` .55 = 5,3:1 (hell) / 6,0:1 (dunkel); die übrigen Werte der Seitenleiste (`V4_SEITENLEISTE`) unverändert übernommen | Seitenleiste ≥ 4,5:1 |
| 7 | Review #425 A1: Seitenleiste und Telefonkopf sagten „CENTRIC“ zweimal an (Logo `role=img aria-label` und Wortmarke `alt`) | `Wortmarke` mit `alt`-Eigenschaft; neben dem Logo `alt=""` (App.jsx `.marke`, mobil.jsx `.m-wort`); Kopfzeile und Einstieg (Bildmarke `aria-hidden`) behalten `alt="CENTRIC"`. Commit f80f81dd rot (1 von 20), Fix 0bcf7de4, danach 20/20 | Name nur einmal |

`V4_TOKENS_VERSION` bleibt 1: kein bestehender Tokenwert wurde geändert, nur ergänzt. Kein bestehender Test angepasst.

**Sichtbare Wertänderungen (Review #425 H3).** App.jsx las bisher eigene Werte; jetzt liest es die Tokens. Dadurch
ändern sich diese Werte:

| Wert | vorher (App.jsx) | jetzt (Token) |
|---|---|---|
| Schattenfarbton hell (alle Ebenen) | rgba(7,19,23,…) | rgba(7,30,34,…) |
| `--schatten` hell (Karte) | .04 / .05 | .05 / .06 |
| `--schatten-blatt` hell | .18 | .20 |
| `--schatten-blatt` dunkel | .5 | .55 |
| `--schatten-hoch`, `--schatten-toast` hell | .10/.14, .28 (Ton 7,19,23) | gleiche Deckkraft, Ton 7,30,34 |
| `.sgruppe` Schrift (Seitenleiste) | Weiß .40 | Weiß .55 |
| Avatar-Paare | V3-Töne | V4-Farbschlüssel (s. Befund 3) |

Alle übrigen Werte der Seitenleiste und die dunklen Schatten außer `blatt` sind unverändert.

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
- **P1 vor Release, Paket V4-2b** (Abschnitt 6): `--v4-*` fehlen nach Neuladen mit Sitzung. Nicht in diesem PR behoben.
- **Paket V4-2c, MITTEL-HOCH** (Abschnitt 6): `.slink.on/.slink:hover` im hellen Thema 1,76:1 (WCAG 1.4.3). Nicht in
  diesem PR behoben.
- Startsequenz (`src/startbild.jsx`) zeigt unter der Bildmarke noch „CENTRIC“ als Text (Bildnachweis
  `fehler-anmeldung-1280-dark`); nicht in der Akzeptanz genannt, Canvas-Ablauf mit Abtastung — eigener Folgeschritt.
- Paketabhängigkeiten V4-1/WP-40 laut SSOT nicht integriert; Umsetzung auf Auftrag trotzdem, Status REVIEW.

## 6. Browserbeleg zu Review #425 H2 und V4-2c (nicht behoben, neue Pakete)

Lauf 2026-11-20 auf 0bcf7de4: eigener `vite build`, `node server.mjs` auf 127.0.0.1 mit Wegwerf-Datenordner und
zufälligem Verwaltungsschlüssel, Rolle Leitung, Playwright-Chromium mit `colorScheme` light bzw. dark, Dienstarbeiter
blockiert. Ablauf: anmelden, messen, neu laden (F5, Sitzung bleibt), messen. Bilder nur im Scratchpad.

| Messung (1280 px) | hell vor F5 | hell nach F5 | dunkel vor F5 | dunkel nach F5 |
|---|---|---|---|---|
| `<style id="v4-stil">` vorhanden | ja | **nein** | ja | **nein** |
| `--v4-flaeche` | `#fffefa` | **leer** | `#0e3034` | **leer** |
| `.seitenleiste` background | rgb(14,48,52) | **rgba(0,0,0,0)** | rgb(7,30,34) | **rgba(0,0,0,0)** |
| `.karte` background | rgb(255,254,250) | **rgba(0,0,0,0)** | rgb(14,48,52) | **rgba(0,0,0,0)** |
| `.btn-primary` background | rgb(11,96,88) | **rgba(0,0,0,0)** | rgb(185,239,220) | **rgba(0,0,0,0)** |

Ergebnis: Nach dem Neuladen mit Sitzung sind die Flächen von Seitenleiste, Karte und Primärknopf transparent. Das Bild
der Schublade (390 px, hell, nach F5) zeigt weiße Navigationsschrift direkt über dem hellen Inhalt; sie ist praktisch
nicht lesbar. Ursache: `v4Stil()` wird nur in `v4EinstiegAnwenden()` (`src/v4/thema.js:58-66`) eingesetzt;
`src/main.jsx:84` ruft das nur ohne Sitzung. Die Regeln in `src/v4/app-stil.js` (`html[data-v4-app] …`) lesen `--v4-*`
und werden ungültig. Zusätzlich folgen `--v4-*` dem Systemthema bzw. `data-v4-thema`, nicht `data-thema` der
Anwendung. → **Paket V4-2b, P1 vor Release** (SSOT, Konfliktzone App.jsx, Abhängigkeit V4-2).

Schublade 390 px, Kontrast weiße Schrift auf `.slink.on` bzw. `.slink:hover` (Fläche über der Seitenleiste gemischt),
vor F5:

| | hell | dunkel |
|---|---|---|
| `.slink.on` | rgba(255,255,252,.72) → **1,76:1** | rgba(25,65,68,.62) → 13,4:1 |
| `.slink:hover` | rgba(255,255,252,.72) → **1,76:1** | rgba(25,65,68,.62) → 13,4:1 |

(Die Reviewzahl 1,85:1 für Hover ist rechnerisch; gemessen sind Hover und aktiv gleich, weil beide `var(--v4-glas)`
tragen.) WCAG 1.4.3 im hellen Thema verfehlt. → **Paket V4-2c, MITTEL-HOCH** (SSOT, Datei `src/v4/app-stil.js`).
Nach F5 ist der Wert nicht messbar (Seitenleiste transparent, siehe oben).

## 7. V4-2b — `--v4-*` in der Anwendung immer gesetzt und an `data-thema` gebunden

Basis `origin/integration/release-v4` 014c86ab (Merge #425), Branch `acc45/v4/v4-2b-variablen`.

**Ursache (Code).** Die App-Schicht `src/v4/app-stil.js` (Scope `html[data-v4-app]`) liest nur `var(--v4-…)`. Die
Variablen standen nur in `v4Variablen()` (`src/v4/stil.js`), eingehängt als `<style id="v4-stil">` allein durch
`v4EinstiegAnwenden()` (`src/v4/thema.js`). `src/main.jsx` ruft das nur ohne Sitzung (`if (!SP.angemeldet())`, Modulebene)
und im `Einstieg`-Effekt nur bei `!an`. Neuladen mit Sitzung: kein `#v4-stil`, alle `--v4-*` leer, die Flächen fallen auf
`transparent`. Ohne Neuladen bleibt `#v4-stil` stehen, aber `v4EinstiegVerlassen()` entfernt `data-v4-thema`; dann
wählt `@media (prefers-color-scheme: dark)` die Werte, nicht `data-thema` der Anwendung (`themaSetzen`, `App.jsx`).

**Test zuerst** (Commit 63132c7e, rot auf 014c86ab):

| Test | rot (alt) | grün (neu) |
|---|---|---|
| `pruefungen/v4-2b-variablen.test.js` (in `pruefung:v4-tokens`): gerenderter App-Stil, Kaskade am Wurzelelement; App hell/dunkel × System hell/dunkel × Start (F5 ohne `#v4-stil`, Anmeldung mit `#v4-stil`, veraltetes `data-v4-thema`) | 11/14 rot | 14/14 |
| `e2e/v4-variablen.spec.mjs`: Anmeldung → F5 → `data-thema`, `--v4-flaeche`, computed background `.seitenleiste`/`.karte`/`.btn-primary` = Token des App-Themas; 390 und 1280 px; App ≠ System; Themenwechsel ohne Neuladen | 5/5 rot (`--v4-flaeche` leer) | 5/5 |

Der E2E-Test läuft nur im Projekt 390x844 und stellt beide Breiten selbst ein (1280 px ist kein Projekt der
Gerätematrix). App-Thema über die gemerkte Wahl dieses Geräts (`centric.thema`), System über `emulateMedia`; nichts
wird auf dem Server geschrieben außer dem bestehenden `tourZu` in `anmelden()`. Vor Grün zwei Anpassungen am neuen
Test (kein bestehender Test geändert): `.karte` ohne eigene Inline-Fläche messen (Hinweiskarte trägt Warnfarbe inline),
nach dem Themenwechsel 500 ms für die Übergänge (`transition background .14–.18 s`) warten.

**Fix (minimal, nur bestehende Tokens).** `src/v4/stil.js`: neue Ausgabe `v4AppVariablen()` aus denselben
`festeVariablen()`/`farbVariablen()` wie der Einstieg, gebunden an `:root[data-v4-app][data-thema="hell"|"dunkel"]`
(Spezifität 0,3,0 über allen Regeln des Einstiegsstils). `src/App.jsx`: Import und eine Zeile in `bauStyles()` vor
`v4AppStil()`. Damit trägt jeder App-Stilblock (alle Zweige, auch Fehler- und Ladeseite) die Variablen selbst. Keine
Änderung an `main.jsx`, `thema.js`, Klassennamen oder Locators. Nach Abmelden verschwindet der App-Stil mit der App; der
Einstieg gilt wieder allein.

**Bildbeleg** (lokal, 127.0.0.1, Wegwerfdaten, `pruefungen/browser/v4-abnahme.mjs` als Kopie mit F5-Schritt im
Scratchpad, Rolle Leitung; Bilder nur im Scratchpad):

| nach F5 | `#v4-stil` | `data-thema` | `--v4-flaeche` | `.seitenleiste` | `.karte` | `.btn-primary` |
|---|---|---|---|---|---|---|
| 390 hell | nein | hell | `#fffefa` | rgb(14,48,52) | rgb(255,254,250) | rgb(11,96,88) |
| 390 dunkel | nein | dunkel | `#0e3034` | rgb(7,30,34) | rgb(14,48,52) | rgb(185,239,220) |
| 1280 hell | nein | hell | `#fffefa` | rgb(14,48,52) | rgb(255,254,250) | rgb(11,96,88) |
| 1280 dunkel | nein | dunkel | `#0e3034` | rgb(7,30,34) | rgb(14,48,52) | rgb(185,239,220) |

Gleiche Werte wie vor F5 in Abschnitt 6. Die Schublade (390 px, hell, nach F5) ist opak dunkel, die Navigationsschrift
lesbar. Sichtbar bleibt der helle Glaszustand von `.slink.on` mit weißer Schrift: das ist V4-2c (WCAG 1.4.3), hier
nicht berührt.

**Lokale Läufe** (2026-11-20, je Datei `--maxWorkers=1`): v4-2b-variablen 14/14, v4-tokens 32/32, v4-app-stil 16/16,
v4-markenrest 20/20, gestalt 19/19, kontrast 207/207, wcag-wp40 35/35, oberflaeche-render 40/40, wp39-app-aufbau 4/4,
endgeraete-speicher 6/6, prozess-wachen 15/15, doku 5/5, verdrahtung 8/8, ci-abdeckung 8/8, acc45-status 17/17;
eslint 0 Fehler (nur bestehende Warnungen), tsc 0. E2E (`E2E_PORT` frei gewählt): v4-variablen 5/5, barrierefreiheit
14/14 (Projekte 390x844 und 1024x768).

**Offen.** V4-2c (Kontrast `.slink.on`/`:hover` hell) bleibt eigenes Paket. Vollregression nur in CI.
