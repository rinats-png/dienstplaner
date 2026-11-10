# Staging-Abnahme V4 (Vorbereitung)

Stand: 2026-11-10. Basis: `origin/integration/release-v4` @ `38fc7d07`. **Reine Vorbereitung.** Nichts hiervon wurde
auf Staging oder Produktion ausgeführt, nichts ist freigegeben. Kein Kästchen unten ist abgehakt, solange kein
Prüfergebnis eingetragen ist. Ergänzt `docs/acc45/STAGING-ABNAHME-CHECKLISTE.md` (E-1, API-Proben) und
`docs/RC-2026-11-05-STAGING-ABNAHME.md`; sie ersetzt beide nicht.

## 0. Befund zur Ausgangslage (belegt)

- `integration/release-v4` enthält V4 bereits (`src/v4/*`, `src/ui/logo.jsx`, `public/centric-logo*.svg`,
  `public/icon-v4-*.png`, Manifest mit V4-Symbolen). Es liegt 1103 Commits vor `main`; `main` selbst enthält V4 nicht.
- Kein gezielter Pfad-Merge nach `main` möglich (Funktionsabhängigkeit, Konflikte in App.jsx, main.jsx, sw.js;
  `docs/acc45/WIEDERAUFNAHME.md`, Abschnitt „V4-Design-Release“). Ein Port-Branch von `main` ist nötig.
- Service-Worker-Fassung: Auf `main` steht `const FASSUNG = "v4"` (`public/sw.js:41`); der Port auf `main` muss
  auf `"v5"` zählen. Auf `integration/release-v4` steht stattdessen der Platzhalter `"__CENTRIC_BUILD__"`
  (`public/sw.js:54`), den der Bau (`werkzeug/sw-fassung.mjs`, WP-37) durch einen Hashwert ersetzt. Das Prüfkriterium
  hängt deshalb vom getesteten Stand ab (siehe 3.5). **Zu klären, bevor abgenommen wird:** Welcher Stand wird
  abgenommen, der Integrationsstand (Hash) oder der Port auf `main` (`v5`)? Diese Datei deckt beide Fälle ab.
- Frühester realistischer Termin laut WIEDERAUFNAHME: 16.11.2026 (Annahme, nicht bestätigt).

## 1. Voraussetzungen und Freigaben

Es liegt in dieser Sitzung keine ausdrückliche Betreiberfreigabe für (a) bis (f) vor. Die Spalte „Beleg“ bleibt
leer, bis der Betreiber die Freigabe schriftlich nennt.

| | Freigabe | Stand | Beleg (Datum, Wortlaut/Fundstelle) |
|---|---|---|---|
| (a) | Ausnahme vom Merge-Verbot für den Design-Branch | **offen** | |
| (b) | Merge nach `main` | **offen** | |
| (c) | Bau und Bild-Digest | **offen** | |
| (d) | Staging- und Browserabnahme | **offen** (diese Liste bereitet sie vor) | |
| (e) | Produktionsdeployment mit Rückweg-Bild | **offen** | |
| (f) | Logo-Klärung | **offen** | |

Weitere Voraussetzungen vor Abschnitt 3 (alle ungeprüft):

- [ ] Staging-Bild des abzunehmenden Stands gebaut, Index-Digest notiert (Wert: ______________________)
- [ ] Sicherung der Staging-Daten angelegt, Wiederherstellung geprüft (`docs/BETRIEB-SICHERUNG.md`)
- [ ] Rückweg-Bild bestimmt: aktuell aktives Produktionsbild laut Freigabeliste, Digest notiert (______________________)
- [ ] Zugangscodes je Rolle im Testbetrieb erzeugt (nur im Passwortmanager; in Nachweisen „Testperson Rolle X“)
- [ ] Testdaten-Vorgabe beachtet: nur Testdaten, keine Migration echter Daten
- [ ] Production unverändert: Container-Id, Bild, Startzeit vorher notiert (______________________)

## 2. Vorabprüfung (lokal, Worktree, Stand 38fc7d07)

Ausgeführt am 2026-11-10, Node v24.18.0, npm 11.16.0, Windows 11, nach `npm ci` (0 Schwachstellen gemeldet).
Alle Läufe lokal ohne Zugriff auf Staging/Produktion.

| Befehl | Ergebnis | Ausgabe (Auszug) |
|---|---|---|
| `npm run build` | **Exit 0** | `✓ built in 20.79s`; Warnung „Some chunks are larger than 700 kB“ (`index-*.js` 1.436,96 kB, gzip 437,23 kB) |
| `npm run lint` | **Exit 0, 0 Fehler, 130 Warnungen** | `✖ 130 problems (0 errors, 130 warnings)`; u. a. ungenutzte Variablen und überflüssige eslint-disable (auch in `dist/`, das mitgeprüft wird) |
| `npm run pruefung:typen` | **Exit 0** | keine Ausgabe von `tsc` |
| `npm run pruefung:pwa` | **Exit 0** | 1 Datei, 29 von 29 Tests bestanden |
| `npm run pruefung:v4-tokens` | **Exit 0** | 30 von 30 |
| `npm run pruefung:kontrast` | **Exit 0** | 207 von 207 |
| `npm run pruefung:gestalt` | **Exit 0** | 19 von 19 |
| `npm run pruefung:app-aufbau` | **Exit 0** | 4 von 4 |
| `npm run pruefung:render` | **Exit 0** | 22 von 22 |
| `npx vitest run pruefungen/tour-dialog.test.js pruefungen/v4-app-stil.test.js` | **Exit 0** | 2 Dateien, 18 von 18 |

Belegt aus dem Bau: `dist/sw.js` enthält `FASSUNG = "b06ae2fbc904"` und keinen Platzhalter mehr
(`grep -c CENTRIC_BUILD dist/sw.js` = 0). Der Hash gilt nur für diesen lokalen Bau.

**Nicht ausgeführt (also nicht belegt):**

- der Gesamtlauf `npm run pruefung` (rund 150 Teilläufe, inklusive Serverläufe)
- die Browserproben `pruefungen/browser/bereiche.mjs`, `tour-etag.mjs` (brauchen `playwright-core` und Edge)
- jede Prüfung gegen Staging, jedes Gerät, jeder Kontrast-/Tastaturtest von Hand
- Docker-Bau und Bild-Digest

Keine Fehlschläge in den ausgeführten Läufen; nichts wurde repariert oder abgeschwächt.

## 3. Staging-Abnahme (alles offen)

Trage je Zeile Ergebnis (OK / Mangel / n. a.), Datum, Prüfer und Fundstelle (Bild, Notiz) ein. Leer heißt: nicht geprüft.

### 3.1 Identität des Prüflings

- [ ] Bild-Digest auf Staging = Digest aus Voraussetzungen (Revision-Label `org.opencontainers.image.revision` = Commit)
- [ ] Gesundheitsweg des Servers meldet die erwartete Fassung
- [ ] Standardwerte unverändert: `CENTRIC_DEMO`, `CENTRIC_SELBSTSTART` aus; `CENTRIC_DATENSCHUTZLAUF` = `vorschau`

Ergebnis: ____________________

### 3.2 Seiten und Rollen

Rollen: Leitung, Planung, Schichtverantwortung, Beschäftigte, Betriebsrat, Betreiber. Die Rolle `kunde` ist
abgelöst (`docs/FREIGABEPAKET-BETREIBER.md` D.2) und wird nur geprüft, um zu bestätigen, dass sie fehlt.
Je Rolle jede Navigationsseite öffnen (Seitenleiste bzw. Unterleiste):

| Prüfpunkt | 360 px | 390 px | 430 px | Desktop |
|---|---|---|---|---|
| Seite lädt, kein „Lädt …“-Hänger | | | | |
| Kein Querscrollen (kein horizontaler Scrollbalken) | | | | |
| Keine Konsolenfehler, keine fehlgeschlagenen Anfragen | | | | |
| Touchziele mindestens 40 px (Telefon) | | | | n. a. |
| Tour/Dialog: Tour blendet bei offenem Dialog aus, sitzt über der Unterleiste | | | | |
| Leer- und Ladezustände sichtbar und sinnvoll | | | | |

Bekannter Rest laut `docs/STATUS-FERTIGSTELLUNG.md`: „Verteilung 320 px (26 px)“. 320 px ist nicht Teil dieser Abnahme.

Rollenmatrix (leer = offen):

| Rolle | Kernseiten ohne Fehler | Keine fremden Daten in API-Antwort | Ergebnis |
|---|---|---|---|
| Leitung | | | |
| Planung | | | |
| Schichtverantwortung | | | |
| Beschäftigte | | | |
| Betriebsrat | | | |
| Betreiber (inkl. zweiter Faktor, Pflicht bei `NODE_ENV=production`) | | | |

### 3.3 Kontrast Hell/Dunkel

Für jede Seite aus 3.2 in beiden Themen (Umschalter in der App und Systemeinstellung `prefers-color-scheme`;
Reihenfolge laut `src/v4/thema.js`: Nutzerwahl vor Systemeinstellung):

- [ ] Einstieg/Anmeldung hell und dunkel: Wechsel ohne Aufblitzen des falschen Themas, Wahl bleibt nach Neuladen
- [ ] Fließtext und Beschriftungen mindestens 4,5:1, große Schrift und Bedienelemente mindestens 3:1 (Messung mit
      Browserwerkzeug, Werte notieren)
- [ ] Einheitenfarben und aktiver Seitenleisteneintrag im Dunkelmodus gut unterscheidbar (frühere Befunde 1,1:1)
- [ ] Fokusring in beiden Themen sichtbar
- [ ] Gedruckte/exportierte Ansichten (Rechnung, Handbuch) nicht vom Dunkelmodus beeinträchtigt

Messwerte / Mängel: ____________________

### 3.4 Tastatur und Zugänglichkeit

- [ ] Alle Seiten nur mit Tab/Umschalt+Tab/Enter/Leertaste/Esc bedienbar; keine Tastaturfalle
- [ ] Sichtbarer Fokus, Reihenfolge entspricht der visuellen Reihenfolge
- [ ] Dialoge (`aria-modal`): Fokus geht hinein, Esc schließt, Fokus kehrt zurück
- [ ] Seitenstruktur (Überschriften, Sprunglink) vorhanden
- [ ] Fehlertexte bei Formularen am Feld verständlich (WCAG 3.3.1)
- [ ] Zoom 200 % ohne Verlust von Inhalt (Reflow)

Ergebnis: ____________________

### 3.5 Service Worker und PWA

- [ ] Auf `integration/release-v4`-Stand: `https://<staging>/sw.js` enthält **keinen** Platzhalter
      `__CENTRIC_BUILD__`, sondern eine Hash-Fassung (12 Hexzeichen). Erwartete Fassung (aus dem Bau des geprüften
      Bildes): ____________
- [ ] Auf Port-Stand von `main`: `sw.js` enthält `const FASSUNG = "v5"` (erwartet nach Port; `main` steht auf `v4`)
- [ ] DevTools > Application > Service Workers: neue Fassung aktiv, Caches heißen `centric-schale-<Fassung>` und
      `centric-daten-<Fassung>`; Caches der alten Fassung nach Aktivierung gelöscht
- [ ] Update-Pfad: Gerät/Profil mit alter Fassung laden, neu laden, danach zeigt es die neue Oberfläche
- [ ] Offline: Startseite lädt aus dem Cache; Personaldaten bleiben nicht über das Abmelden hinaus in `centric-daten-*`
- [ ] Manifest: Symbole `icon-v4-192/512` (any) und `-maskierbar` (maskable) laden (HTTP 200), `theme_color` stimmt
- [ ] Installation als PWA auf einem Telefon möglich, Symbol zeigt V4-Marke

Beobachtete Fassung: ____________

### 3.6 Logo

Hinweis: Freigabe (f) Logo-Klärung ist offen. Dieser Abschnitt prüft nur, dass das Vorhandene stimmig ist, und
bestätigt das Logo nicht als freigegeben.

- [ ] Wort-/Bildmarke in Kopfzeile, Anmeldung, Seitenleiste hell und dunkel korrekt (`centric-logo.svg`,
      `centric-logo-hell-auf-dunkel.svg`), nicht verzerrt, nicht abgeschnitten
- [ ] Favicon (`favicon-32.png`) und Tab-Titel
- [ ] PWA-Symbol maskierbar: Marke bleibt in der Sicherheitszone
- [ ] Kein altes Logo mehr sichtbar (Suche in Seitenquelltext und Netzwerkanfragen)
- [ ] Entscheidung zu (f) schriftlich verknüpft: ____________________

### 3.7 Funktionsprobe (Regression durch V4-Oberfläche)

Aus `docs/acc45/STAGING-ABNAHME-CHECKLISTE.md` zu übernehmen: API-Proben (Abschnitt 1), Zeiterfassung (3.2),
Datenschutz (3.3), Integration (3.4). Ergebnis dort eintragen und hier verlinken: ____________________

## 4. Rückweg-Plan

Maßgeblich sind `docs/BETRIEBSHANDBUCH.md` (Rücksprung) und `docs/DEPLOY-AUTOMATISIERUNG.md`. Kurzfassung, nicht ausgeführt:

1. Vor dem Deployment: Rückweg-Bild (Digest) und Sicherung der Produktionsdaten festhalten; Eintrag `vorherig` der
   Freigabeliste prüfen.
2. Rücksprung nur über `./ruecksprung.sh` auf den Eintrag `vorherig`, nie auf ein gesperrtes Bild und nie auf ein Kennzeichen (Tag).
3. `deploy.sh --bei-fehler=ruecksprung` nur, wenn das neue Bild noch nichts geschrieben hat; sonst Daten gesondert
   beurteilen (Wiederherstellung aus Sicherung; danach sind alle bisherigen Sicherungsschlüssel ungültig).
4. Service Worker: Ein Rücksprung liefert wieder die alte `sw.js`; Geräte mit der neuen Fassung holen sich die alte
   beim nächsten Abruf. Prüfen, dass kein Gerät auf der neuen Oberfläche festhängt (Fassung im Browser kontrollieren).
5. Nach dem Rücksprung: Digest, Gesundheitsweg und Anmeldung prüfen, Ergebnis dokumentieren.

Rückweg-Bild (Digest): ______________________  Verantwortlich: ______________

## 5. Abbruchkriterien

Abnahme abbrechen, wenn eines zutrifft:

- Eine der Freigaben (a) bis (d) fehlt für den jeweiligen Schritt, oder (e)/(f) fehlt vor Produktion.
- Bild-Digest oder Revision auf Staging weicht vom vorgesehenen Prüfling ab.
- Eine Rolle sieht Daten einer anderen Rolle oder eines anderen Mandanten.
- Anmeldung oder zweiter Faktor (Betreiber) funktioniert nicht.
- Seitenabsturz (weißer Bildschirm, `TypeError`/`NaN` in der Oberfläche) auf einer Kernseite.
- Service Worker aktiviert sich nicht, behält alte Caches, oder `sw.js` enthält noch den Platzhalter.
- Kontrast unter 4,5:1 (Text) auf einer Kernseite, ohne dass der Betreiber den Mangel ausdrücklich annimmt.
- Tastaturfalle oder nicht erreichbare Kernfunktion.
- Datenverlust oder Schreibfehler bei Stempeln/Plan in der Funktionsprobe.
- Production zeigt Veränderung (Id, Bild, Start) gegenüber vorher.

Bei Abbruch: nichts nach `main` mergen, kein Produktionsdeployment, Befund mit Fundstelle festhalten.

## 6. Gesamtergebnis (vom Prüfer auszufüllen)

| Feld | Eintrag |
|---|---|
| Prüfer | |
| Datum / Uhrzeit | |
| Geprüfter Commit | |
| Bild-Digest Staging | |
| Beobachtete SW-Fassung | |
| Geräte/Browser (Modell, Version) | |
| Mängel (Nr., Seite, Rolle, Schwere) | |
| Gesamtbewertung (bestanden / mit Mängeln / nicht bestanden) | |
| Empfehlung an den Betreiber | |
| Freigabe (d) erteilt von / am | |
