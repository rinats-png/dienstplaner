# V4-Design-Release: Voraussetzungen für Staging und Browser-Abnahme

Stand: 2026-11-10 · Basis: `origin/integration/release-v4` (6203b0a) und `origin/main` (0423eea) · Branch
`acc45/v4/staging-voraussetzungen`.

Dieses Dokument bereitet vor. Es führt nichts aus: kein Merge, kein Push nach `main`, kein Deployment, kein Staging-Zugriff.
Alles, was hier „belegt“ heißt, wurde in dieser Sitzung am Repository oder lokal im Browser gemessen (Befehle in Abschnitt 6).
Zeitangaben sind **Annahmen** und als solche gekennzeichnet. Die Betreiberfreigaben „(a) bis (f)“ aus dem Analysebericht im
Chat liegen diesem Dokument nicht vor; Abschnitt 5 nennt nur, was sich aus dem Repository ableiten lässt.

## 1. Befund: was in `integration/release-v4` schon ist und was gegen `main` fehlt

### 1.1 Stand der Linien

| Größe | Wert (belegt) |
|---|---|
| Commits nur in `main` | 3 (Demo-Schalter, Selbststart-Schalter, deren Merges; PR #78/#79) |
| Commits nur in `release-v4` | 1103 |
| Dateien geändert (`main...release-v4`) | 1177, +288 166 / −26 708 Zeilen |
| `src/App.jsx` | main: 23 013 Zeilen (Monolith) · release-v4: 2 066 Zeilen (nach WP-39, 45 Ansichten in `src/ansichten`, `src/ui`, `src/app`) |
| `public/sw.js` Fassung | main: von Hand `"v4"` · release-v4: Platzhalter `"__CENTRIC_BUILD__"`, der Bau setzt einen Hash (`werkzeug/sw-fassung.mjs`, WP-37) |
| PR #91 (`feature/v4-phase1-tokens`) | offen, Basis `integration/centric-complete`, 11 Dateien. Der Kopf (616fe28) ist Vorfahre von `release-v4`. |
| PR #92 (`feature/v4-phase2-app`) | offen, Basis `feature/v4-phase1-tokens`, 4 Dateien. Der Kopf (458e429) ist Vorfahre von `release-v4`. |

V4 steckt also bereits vollständig im Integrationsstand, einschließlich der Nachbesserungen nach PR #92 (Touchziele, 320 px,
Dunkelmodus, Tour). `main` enthält davon nichts.

### 1.2 V4-Dateien: in `release-v4` vorhanden, in `main` nicht (Status `A`/`D` gegen `main`)

| Gruppe | Dateien |
|---|---|
| V4-Kern | `src/v4/tokens.js` (118 Zeilen), `stil.js` (130), `thema.js` (96), `app-stil.js` (99), `komponenten.jsx` (95) |
| Gestaltschicht | `src/gestalt/ansichten.jsx`, `bausteine.jsx`, `icons.jsx`, `lesbar.js`, `rahmen.jsx`, `stil.js` |
| Marke und Symbole | `public/centric-logo.svg`, `centric-logo-hell-auf-dunkel.svg`, `centric-bildmarke.svg`, `centric-wortmarke.svg`, `centric-wortmarke-hell.svg`; `public/icon-v4-192.png`, `icon-v4-192-maskierbar.png`, `icon-v4-512.png`, `icon-v4-512-maskierbar.png` (neu); `icon-192.png`, `icon-192-maskierbar.png`, `icon-512.png`, `icon-512-maskierbar.png` (entfallen) |
| Werkzeug | `werkzeug/icons-bauen.mjs`, `werkzeug/vorschau.html` |
| Prüfungen | `pruefungen/v4-tokens.test.js`, `v4-app-stil.test.js`, `einstellungen-wirkung.test.js`, `social-vorschau.test.js`, `tour-dialog.test.js`, `etag-pflicht.test.js`, `pruefungen/browser/bereiche.mjs`, `tour-etag.mjs` |

### 1.3 V4-Anschlüsse in bestehenden Dateien (Handarbeit beim Port)

| Datei | Art der V4-Änderung | Lage gegen `main` |
|---|---|---|
| `src/App.jsx` | Imports `v4ThemaMerken`, `v4ThemaGemerkt`, `v4SystemthemaBeobachten`, `v4AppStil`; Klassen- und Themenanschluss. 14 der 19 V4-Commits ändern diese Datei. | main ist ein 23 013-Zeilen-Monolith, release-v4 hat nach WP-39 nur noch 2 066 Zeilen. Kein sauberes Übertragen der Diffs. |
| `src/main.jsx` | Einstieg: `v4EinstiegAnwenden`, `v4EinstiegVerlassen`, Themenwahl | 227 Zeilen hinzu, 201 entfernt (gegen main) |
| `src/farben.js` | Palette aus `src/v4/tokens.js` (`v4AlsAltePalette`) | 25 hinzu, 88 entfernt |
| `src/marke.jsx`, `src/pruefung.jsx`, `index.html` | C-Logo, Social-Vorschau, Themenfarbe | abweichend |
| `public/manifest.webmanifest` | Symbole auf `icon-v4-*`, `theme_color` `#D9E4E8` statt `#071317` | abweichend |
| `public/sw.js` | Symbolverweise `icon-v4-192.png`; zusätzlich WP-07/WP-30/WP-37-Änderungen (siehe Konfliktstellen) | 77 hinzu, 19 entfernt |
| `package.json` | Skripte `pruefung:v4-tokens` u. a. | abweichend |

### 1.4 Konfliktstellen (belegt durch Probemerge, nur Objekte, ohne Checkout)

**a) Cherry-Pick der V4-Commits auf `main`.** Schon der erste V4-Commit (`d12a4c3`, C-Logo) bricht ab mit:
Konflikt in `public/sw.js`, Konflikt in `src/App.jsx`, und `src/gestalt/rahmen.jsx` ist in `main` nicht vorhanden (modify/delete).
Ein Weiterführen der Kette ist ohne manuelle Auflösung nicht möglich. Das bestätigt den Befund aus
`WIEDERAUFNAHME.md`: kein gezielter Pfad-Merge.

**b) Umgekehrt, `main` in `release-v4` aufnehmen** (`git merge-tree`, Ergebnis 6 Konfliktdateien, alle aus den drei `main`-Commits):
`.env.example`, `BEREITSTELLUNG.md`, `deploy/compose.yml`, `pruefungen/serverlauf.mjs`, `pruefungen/zugaenge-anlegen.test.js`,
`server/funktionen/daten.mjs`. Diese Konflikte entstehen unabhängig von V4 und müssen in jedem Fall gelöst werden, bevor
`release-v4` nach `main` darf.

**c) `public/sw.js`.** `main` hat `FASSUNG = "v4"` von Hand. Wird V4 dort portiert, muss die Fassung hochgezählt werden
(`"v5"`, `sw.js:41` laut `WIEDERAUFNAHME.md`), sonst hält ein Gerät den alten Speicher. In `release-v4` entfällt das: der Bau
stempelt einen Hash (belegt: `dist/sw.js` nach `vite build` trägt `FASSUNG = "7f985a1c18e5"`, kein Platzhalter; `pruefung:pwa`
prüft es). Ein Port auf `main` ohne WP-37 verliert diese Eigenschaft.

## 2. Wiederaufnahme-Befund und Skill

- `WIEDERAUFNAHME.md`, Abschnitt „V4-Design-Release“: gilt unverändert (siehe 1.4).
- Ein Skill `design-aufspielen` liegt nicht unter `.claude/skills`, sondern als Befehl `.claude/commands/design-aufspielen.md`.
  Er beschreibt **Version 3** (Branch `design/version-3` von `main`, Instrument Sans, `design/canvas/V3-*`). Für V4 ist er
  nicht geschrieben: er kennt weder `src/v4/*` noch den Port auf `main`. Sein Schritt 5 (Auslieferung über `deploy.yml` auf
  `main` mit `ausliefern: true`) ist Betreibersache und wird hier nicht benutzt.
- `deploy.yml` liefert nur aus, wenn `github.ref == refs/heads/main` und nach Freigabe in der Umgebung `produktion`. Ein
  Staging-Bild des Integrationsstands ist damit kein Vorgang, den ein Agent anstoßen darf (Abschnitt 5).

## 3. Browser-Abnahme: was lokal läuft

### 3.1 Umgebung (belegt)

| Frage | Ergebnis |
|---|---|
| Playwright | global vorinstalliert (`/opt/node22/lib/node_modules/playwright`), nicht in `node_modules` des Projekts |
| Chromium | `chromium.launch()` ohne Optionen startet Chromium 153.0.8010.12 (headless). Nichts installiert. |
| Vorhandene Browserskripte (`pruefungen/browser/bereiche.mjs`, `ablaeufe.mjs`, `einbindung.mjs`, `tour-etag.mjs`) | laufen hier **nicht**: sie importieren `playwright-core` (fehlt, `ERR_MODULE_NOT_FOUND`) und starten Edge (`channel: "msedge"`, nicht vorhanden) |
| Bau und Vorschau | `vite build --outDir <tmp>` dauert rund 5 s. Der Projektserver `server.mjs` liefert den Bau (`CENTRIC_STATIK`) mit frischem Wegwerf-Datenordner. |

### 3.2 Neu: `pruefungen/browser/v4-abnahme.mjs`

Ein lokales Skript, das den Bau in einem temporären Ordner erzeugt, `server.mjs` auf 127.0.0.1 mit zufällig erzeugtem
Verwaltungsschlüssel und Wegwerf-Datenordner startet, einen künstlichen Betrieb anlegt und die Punkte der Abnahme im
Browser prüft. Bilder und `bericht.json` gehen nach `design/abnahme/v4-staging/` (in `.gitignore`).
Aufruf: `npm run abnahme:browser-v4` oder `node pruefungen/browser/v4-abnahme.mjs reflow,ziele,fokus,fehler,folge,ki`.
Das Ziel muss Loopback sein, sonst bricht es ab. Die reinen Bewertungsfunktionen stehen in
`pruefungen/browser/abnahme-kern.mjs` und sind ohne Browser getestet (`pruefungen/browser-abnahme-kern.test.js`, in der
CI verdrahtet als `pruefung:browser-abnahme-kern`).

### 3.3 Ergebnis des Laufs auf Basis 6203b0a (184 Messungen, 37 Belege, 9 Befunde, 6 Hinweise)

Alle Messungen nur Chromium, headless, Rollen Leitung und Beschäftigte, Wegwerfdaten.

| Kriterium | Ergebnis | Beleg |
|---|---|---|
| WP-40 Reflow 320 px (1.4.10) | **1 Befund.** Beschäftigte: 4 Ansichten, kein Querscroll. Leitung: 45 Ansichten, hell und dunkel; kein Querscroll außer **Schublade/Verteilung**: Seite 26 px breiter als 320 px (Tabelle `Person`, 905 px breit, liegt in einem Rollbereich; die Ursache der 26 px ist nicht eingegrenzt). | `bericht.json`, Bild `leitung-320-light-schublade-verteilung.png` (lokal) |
| WP-40 Zielgröße 24 px (2.5.8), 390 px | Kein Befund nach Norm-Ausnahmen (Abstand, Fließtext). Leitung: 45 Ansichten, 3 118 Ziele, kleinstes 13 × 13 px (Kontrollfeld „Zuschlag Nachtarbeit“, besteht über die Abstandsausnahme). Beschäftigte: 45 Ziele, kleinstes 40 × 23 px (Schalter „Feldmodus“, Abstandsausnahme). | s. o. |
| WP-40 Fokus sichtbar (2.4.7) und nicht verdeckt (2.4.11), Tab-Taste | Beschäftigte 1280 und 320 px: 38 Tab-Stopps, überall sichtbar, nichts verdeckt. Leitung 1280 px: 44 Stopps, in Ordnung. **Leitung 320 px: 1 Befund.** 43 Tab-Stopps liegen außerhalb des Bildschirms (x −240 … −13): die geschlossene Schublade (`.seitenleiste .slink`: Start, Ablauf, Handbuch, Hilfe …) bleibt per Tab erreichbar. Der Fokus verschwindet damit für Tastatur- und Vorlesenutzer. | `bericht.json` |
| WP-40 Fehlertext (3.3.1), falscher Zugangscode | Bestanden: 320 und 1280 px, hell und dunkel; „Unbekannter Zugangscode.“ in `role="alert"`, im Bild, ohne Querscroll. Hinweis (kein Befund): das Eingabefeld trägt weder `aria-invalid` noch `aria-describedby` (`wp40-fragen.md`, Frage 2). | s. o. |
| WP-I2 Schichtfolge (Live-Prüfung) | Bestanden: Bereich `role="status"` „Live-Prüfung“ vorhanden („Keine Befunde für dieses Raster“). Nach Nachtdienst am Montag und Frühdienst am Dienstag in jeder Woche ändert er sich zu „Ruhezeit unterschritten (12×) …“ und weiteren Befunden, ohne Speicherschritt (es gibt keinen Speichern-Knopf in der Ansicht). | Bild `schichtfolge-live-1280.png` |
| WP-I17 Intelligence-Antwort | **6 Befunde (Ursache belegt).** `KiAntwort` ist in der App nicht eingehängt; die Prüfung nutzt eine kleine, im ignorierten Ordner erzeugte Prüfseite, die nur `KiAntwort` bündelt, mit Antworten aus der Attrappe des Gateways. Im Browser zeigen die Zustände „fertig“, „Rückfall“ und „Injektion“ nur „Das hat gerade nicht geklappt“ statt Kennzeichnung bzw. Rückfall-Hinweis. Ursache: `server/lib/intelligence/schemas.mjs` (`strukturPruefen`) ruft `Buffer.byteLength` auf; `Buffer` gibt es im Browser nicht, der `catch` meldet „nicht serialisierbar“, `antwortLesen` (`ki-client.js`) ergibt „fehler“. Mit einem `Buffer.byteLength` aus `TextEncoder` vor dem Laden bestehen alle 7 Fälle auf 320 und 1280 px (KI-Entwurf, „Nicht veröffentlicht“, `role="status"`/`alert`, `aria-busy`, Rollensicht: Betriebsrat und Beschäftigte ohne F9 sehen nichts, keine Links, kein Querscroll). | `bericht.json`; Tests laufen in Node und merken es nicht |

Der KI-Befund wirkt heute nicht auf Betrieb, weil `KiAntwort` nirgends eingehängt ist. Er blockiert aber den Einhängepunkt
(`wp-i17-nachweis.md`). Eine Korrektur gehört in `schemas.mjs` und ist hier **nicht** vorgenommen worden (sicherheitsrelevantes
Serverschema, eigenes Paket und Review).

### 3.4 Lokale Gegenprobe der Staging-Proben (belegt)

`npm run pruefung:staging-proben` (startet auf Port 3000 einen frischen Server mit Wegwerf-Ablage und führt
`werkzeug/staging-smoke.mjs`, `staging-geo.mjs`, `staging-aufraeumen.mjs` aus): 132 Prüfungen bestanden, Exit 0, Smoke 51/51,
Geo 30/30, Aufräumen 19/19, mit `CENTRIC_GESUND_PLATZ_WARNUNG_PROZENT=5`. **Ohne** diese Variable schlägt ein Fall fehl
(`/gesund` meldet `warnung`, Smoke 50/51), weil in dieser Umgebung nur 11 % Platz frei sind und die Vorgabe-Schwelle 15 % beträgt
(`server/lib/gesund.mjs`); das ist ein Umgebungseffekt und kein Befund im Code. Gegen Staging selbst wurde nichts ausgeführt.

### 3.5 Was sich nicht automatisieren lässt

Vorlesesoftware (Namen der Planzellen, Überschriftenstruktur), Zoom 200 % mit Textabstand (1.4.12), echte Geräte und Safari/iOS,
Firefox, Tastaturführung in Blättern auf dem Telefon, axe-core (nicht installiert, Netzfreigabe nicht geprüft), Standortabfrage der
Stempeluhr, Service Worker und Offline-Verhalten auf echtem Gerät. Diese Punkte bleiben Teil der Abnahme durch den Betreiber
(`STAGING-ABNAHME-CHECKLISTE.md`, Abschnitte 2 und 6).

## 4. Portplan

Zwei Wege liegen auf dem Tisch. `WIEDERAUFNAHME.md` nennt den ersten. Die Entscheidung trifft der Betreiber.

### Weg A: Port-Branch von `main` (Stand `WIEDERAUFNAHME.md`)

1. Branch `port/v4-design` von `origin/main`. (Agent, kein Betreiber.)
2. Konfliktfrei übernehmen: `src/v4/*` (5), `src/gestalt/*` (6), Marke und Symbole unter `public/`, `werkzeug/icons-bauen.mjs`,
   `werkzeug/vorschau.html`, die V4-Prüfungen (1.2). Importe der Gestaltschicht gehen nur auf `farben.js`, `marke.jsx`,
   `kontakt.js`, `stufen.js`, `regelwerk.js`, `paketlogik.js` und Serverbausteine (`rollenvergabe.mjs`, `geo.mjs`); jede davon
   muss in `main` in passender Fassung vorliegen (nicht geprüft).
3. Von Hand verdrahten: `src/App.jsx` (Monolith, 23 013 Zeilen), `src/main.jsx`, `src/farben.js`, `src/marke.jsx`,
   `src/pruefung.jsx`, `index.html`, `package.json`.
4. `public/manifest.webmanifest` auf `icon-v4-*`; `public/sw.js`: `FASSUNG` `"v4"` → `"v5"` und Symbolverweise.
5. `npm ci`, `npm run lint`, `pruefung:kontrast`, `pruefung:gestalt`, `pruefung:v4-tokens`, `pruefung:pwa`, `vite build`, dann
   `npm run pruefung`. Danach `npm run abnahme:browser-v4` (Selektoren `.bpille`, `.utab`, `.tabbar` gehören zur Gestaltschicht und
   müssen dort stehen).
6. PR gegen den vom Betreiber bestimmten Zielbranch. Kein Merge nach `main`.

Risiken Weg A: (1) Die 14 App.jsx-Commits lassen sich nicht übertragen, nur neu verdrahten; Fehler dort sind visuell, nicht
fachlich, aber breit. (2) `main` hat keinen der 1103 Integrationscommits; der Port erbt daher auch die Mängel des alten
Stands (etwa fehlende Sicherheitsfixes, kein WP-37-Hash, kein WP-39). (3) Zwei Linien mit V4: wandert `release-v4` später
nach `main`, kollidiert der Port mit sich selbst (gleiche Dateien, andere Fassung); der Merge braucht dann eine Regel „V4 aus
release-v4“. (4) Der Weg A liefert nur das Design und lässt den Browser-Befund aus Abschnitt 3 liegen, soweit er aus
Nicht-V4-Quellen stammt (KI, Schichtfolge sind in `main` ohnehin nicht vorhanden).

### Weg B: `release-v4` als Ganzes nach `main` (Gates R1 bis R3)

1. `main` in `release-v4` aufnehmen und die 6 Konflikte aus 1.4 b lösen (Schalter für Demo und Selbststart).
2. Befunde aus Abschnitt 3 beheben: Verteilung bei 320 px, geschlossene Schublade nicht fokussierbar machen, vor dem Einhängen
   von `KiAntwort` das `Buffer`-Problem in `schemas.mjs`.
3. Staging-Bild des Integrationsstands, Staging-Abnahme (Betreiber, `STAGING-ABNAHME-CHECKLISTE.md`), erst danach Merge nach
   `main`.

Risiken Weg B: Der Umfang ist 1177 Dateien statt eines Designs; die Gates R2/R3 (Pilot, SaaS) hängen an Paketen, die noch nicht
fertig sind (`RELEASE-GATES-R1-R2-R3.md`). Das ist der größere Schritt, vermeidet aber die doppelte V4-Linie.

### Was beide Wege vom Betreiber brauchen

Siehe Abschnitt 5.

## 5. Was Betreiberfreigabe braucht (aus dem Repository abgeleitet)

| Nr | Vorgang | Grundlage |
|---|---|---|
| 1 | Entscheidung Weg A oder B (und bei A: Zielbranch des Ports) | Abschnitt 4 |
| 2 | Merge nach `main` | E-23, `RELEASE-GATES-R1-R2-R3.md` („Merge nach `main` bleibt untersagt“) |
| 3 | Staging-Bild des Integrationsstands bauen und ausliefern | `deploy.yml` (nur von Hand, Auslieferung nur von `main` und nach Freigabe in der Umgebung `produktion`), `STAGING-ABNAHME-CHECKLISTE.md` Abschnitt 0 |
| 4 | Sicherung der Staging-Daten und Wiederherstellungsprobe | `STAGING-ABNAHME-CHECKLISTE.md` Abschnitt 0, `docs/BETRIEB-SICHERUNG.md` |
| 5 | SSH-Tunnel zu Staging (eigene Freigabe) | `STAGING-ABNAHME-CHECKLISTE.md` Abschnitt 0 |
| 6 | Zugangscodes je Rolle im Testbetrieb | ebenda; nur Testpersonen, keine Zugangsdaten im Repository |
| 7 | Browser-Abnahme auf echten Geräten, Vorlesesoftware, Safari/iOS (3.5) | WP-40-Nachweis, Abschnitt „Nur im Browser prüfbar“ |
| 8 | Produktivfreigabe (Digest aus `FREIGEGEBENE-IMAGES.md`) | `deploy.yml`, `BEREITSTELLUNG.md` |
| 9 | Weitere Betreibervoraussetzungen unabhängig von V4 | E-25 (KI), E-10 (Betreiber-2FA vor produktivem Zugriff), E-9 (Mail/DNS) |

## 6. Terminrahmen (Annahme, nicht belegt)

Annahmen: Arbeitstage, ein Agent schreibt, Betreiber verfügbar für Freigaben und Staging; Start nach der Entscheidung in Punkt 1;
`WIEDERAUFNAHME.md` nennt als frühesten Termin den 16.11.2026 (ebenfalls Annahme).

| Schritt | Weg A (Port) | Weg B (Gesamt) |
|---|---|---|
| Entscheidung und Freigabe zum Start | Tag 0 | Tag 0 |
| Port bzw. Zusammenführen von `main` in `release-v4` | 2 bis 3 Tage | 1 bis 2 Tage |
| Befunde aus Abschnitt 3 beheben, erneut messen | 1 Tag | 1 bis 2 Tage |
| CI, Review (bei sicherheitsnahen Änderungen unabhängig) | 1 Tag | 1 bis 2 Tage |
| Staging-Bild, Sicherung, Tunnel, Abnahme durch den Betreiber | 1 bis 2 Tage | 2 bis 3 Tage |
| Merge und Produktivfreigabe | 1 Tag | getrennt, hängt an R2/R3 |
| Frühestens fertig, wenn Tag 0 der 11.11.2026 ist | 18. bis 20.11.2026 | 20. bis 25.11.2026 |

Der 16.11.2026 aus `WIEDERAUFNAHME.md` wäre nur zu halten, wenn die Entscheidung am 10./11.11. fällt, der Port ohne unerwartete
App.jsx-Konflikte gelingt und Staging am 14./15.11. bereitsteht. Der Puffer für Befunde der Betreiberabnahme ist darin nicht
enthalten. Vor dem 24.12.2026 (`MACHBARKEIT-2026-12-24.md`) bleibt in beiden Wegen Luft.

## 7. Nicht geprüft

- Staging selbst, jede Auslieferung, jedes Bild in GHCR, der Stand von `main` in CI.
- Echte Geräte, Safari/iOS, Firefox, Android-Chrome; Vorlesesoftware; axe-core; Zoom 200 % und Textabstand.
- Der Port selbst (nur der erste Cherry-Pick-Schritt und der Rückwärtsmerge als Probe berechnet; keine Datei in `main` geändert).
- Ob `main` mit der portierten Gestaltschicht baut (Weg A, Schritt 2).
- Die Ursache der 26 px Überbreite in „Verteilung“ bei 320 px; Rollen Planung, Betriebsrat, Kunde, Betreiber; Ansichten, die nur
  mit echten Daten sichtbar werden; Dialoge und Blätter.
- Der Inhalt des Analyseberichts mit den Freigaben (a) bis (f) im Chat.

## 8. Befehle zur Nachprüfung

```
git merge-tree --write-tree --name-only origin/main origin/integration/release-v4     # 1.4 b
git diff --name-status origin/main origin/integration/release-v4 -- src/v4 src/gestalt public    # 1.2
npm ci && node pruefungen/browser/v4-abnahme.mjs                                        # 3.3 (Chromium, lokal)
CENTRIC_GESUND_PLATZ_WARNUNG_PROZENT=5 npm run pruefung:staging-proben                  # 3.4 (Port 3000 frei)
npm run pruefung:browser-abnahme-kern && npm run pruefung:verdrahtung                   # Wiring
```
