# Bereitschaftsanalyse und SSOT-Abgleich der offenen Pakete (2026-11-12)

Basis: `origin/integration/release-v4` **6c195b66** (Merge #216). Branch `acc45/ssot/abgleich-review-pakete`.
Grundlage ist der **Code und die Prüfungen** im Integrationsstand, nicht die SSOT-Notizen. Kein Produktcode geändert,
keine neuen Produkt- oder Rechtsentscheidungen. Statuswerte in `work-packages.json` sind **nicht** verändert; nur
Statusstufen und Notizen, wo der Code eindeutig ist (Abschnitt 6).

## 0. Legende

| Klasse | Bedeutung |
|---|---|
| **A** | technisch jetzt ausführbar (keine offene Betreiber-/externe Entscheidung im Weg, technische Vorgänger im Code vorhanden) |
| **B** | nur ein Teil ausführbar (welcher Teil steht dabei); der Rest hängt an einer benannten Entscheidung oder Voraussetzung |
| **C** | gesperrt durch eine konkrete Betreiberentscheidung oder externe Voraussetzung (genannt) |
| **D** | bereits im Code des Integrationsstands; es fehlt nur der SSOT-Beleg (Stufen, PR-Beleg oder Koordinatorentscheidung zum Status) |
| **V** | nur durch einen technischen Vorgänger gesperrt, der selbst noch nicht integriert ist (keine Entscheidung in der Kette); ausführbar, sobald der Vorgänger integriert ist |

„Direkt-Merge“ = Merge auf `integration/release-v4` ohne Pull Request (erste-Eltern-Kette, `git log --first-parent`).
Für Direkt-Merges wird hier **kein** INTEGRATED gesetzt (offene Koordinator-/Betreiberentscheidung, vgl. die 33
`BELEG_FEHLT`-Fälle aus `node werkzeug/ssot-abgleich.mjs`).

## 1. Methode

1. `node` über `docs/acc45/work-packages.json`: alle 116 Pakete ohne INTEGRATED/DONE, ihre Akzeptanz, Tests, Dateien, Abhängigkeiten.
2. Branch-Spitzen: `git merge-base --is-ancestor <branch> origin/integration/release-v4`, ahead/behind, und die erste Stelle der
   erste-Eltern-Kette, die die Spitze enthält (PR-Merge oder Direkt-Merge).
3. Code: Marker, Endpunkte und Einhängepunkte per `grep`; Prüfdateien in `pruefungen/`, Verdrahtung in `package.json` (`pruefung`)
   und `.github/workflows/pruefung.yml`.
4. Prüfläufe einzeln im Vordergrund, `npx vitest run <datei> --testTimeout=120000`, Windows/Node, auf 6c195b66 (Abschnitt 5).

## 2. Befunde zur Herkunft (Git-Historie)

| Branch-Spitze | Vorfahr von integration? | Erste Stelle in der erste-Eltern-Kette | Art |
|---|---|---|---|
| `acc45/time/wp16-pausen-und-monatsabschluss` 6e51aa27 | ja (0 vor / 714 hinter) | 58432b75 = **PR #85** (`acc45/time/wp16-integration` → `integration/centric-complete`, 2026-11-04) | PR-Merge |
| `acc45/backend/wp48-1-2-pruefnetz-speicherkern` 54574060 | ja (0 / 729) | 794df9a7 = **PR #87** (`acc45/backend/wp48-integration`, 2026-11-04) | PR-Merge |
| `acc45/backend/wp48-integration` c4232c0d | ja (0 / 622) | **PR #87** | PR-Merge |
| `acc45/frontend/wp19-0-modulkern` 5ce81367 | ja (0 / 695) | a9faf7ef = **PR #82** (Nachträge 1–5, Reviews 1–5) | PR-Merge |
| `acc45/sicherheit/integration-wp30` | ja | 1e5096bc = **PR #84** (WP-30 + Sicherheit) | PR-Merge |
| `feature/wp15-wp32d` 3c492f3a | ja (0 / 531) | **1c1a27e0** „Merge WP-15/WP-32d (nach Opus-Review)“ | Direkt-Merge |
| `feature/wp16c-stempelkette` ab4e3ba0 | ja (0 / 514) | **594f32c3** „Merge WP-16c/14c/16b/07b (nach drei Opus-Review-Runden)“ | Direkt-Merge |
| `feature/branchenmodule-wp19` (Wachbuch, Objektbericht, Pflegequal., Bereitschaft, Funktionsdienst, Rotation, Rechte) | ja | **abe3e157** (2026-11-06) | Direkt-Merge |
| `feature/wp40-wp35-darstellung` a7c2948b | ja (0 / 519) | a7c2948b selbst (Commit direkt auf der Kette; dazu ba0d846b, 866eec67) | Direkt-Commit; Review per PR #165 |
| `acc45/qa/wp33-testinfrastruktur` dc27b7de | **nein** (3 vor / 1196 hinter) | – | nicht integriert |
| `intelligence/wp-i12c-kennzahlen` 4174058a | nein (1 / 288) | – (PR #139 offen, Hold) | nicht integriert |
| `wp-i4-vorgaben-verwaltung` a8e366bc | nein (2 / 151) | – (PR #177 Entwurf) | nicht integriert |

Die Branch-Namen in der SSOT für WP-15, WP-16b, WP-16c, WP-14c, WP-07b und WP-40 existieren auf `origin` nicht; der Code kam
über die oben genannten `feature/*`-Branches.

`werkzeug/ssot-abgleich.mjs` sieht PR #85, #87 und #82 nicht, weil diese PRs gegen `integration/centric-complete` liefen
(Vorgänger von `integration/release-v4`), nicht gegen `integration/release-v4`.

## 3. Tiefenprüfung der beauftragten Pakete

### WP-15 Selbstauskunft mit Freigabe — **D**
- Code: `server/lib/selbstauskunft.mjs` (`selbstauskunftStellen` :115, `selbstauskunftEntscheiden` :157, `stempelAbgleich` :66,
  `abweichungVomPlan` :84); Handler `server/funktionen/daten.mjs:2334`, `:2383`; Oberfläche `src/ansichten/selbstauskunft.jsx`,
  eingehängt in `src/ansichten/korrekturen.jsx:18`, `meineschichten.jsx:10`, `mobil.jsx:17` (Einbindung 7cee8eaf, 6dd20a39).
- Akzeptanz „Antrag; Abweichung markiert; erst nach Freigabe Ist“: abgedeckt durch `pruefungen/selbstauskunft.test.js` (22),
  `selbstauskunft-oberflaeche.test.js` (6), `einbindung-korrektur-selbstauskunft.test.js` (10); `pruefung:selbstauskunft-ui` in der
  Sammelkette und als CI-Schritt (`pruefung.yml:60`). Lauf 2026-11-12: 38/38 grün.
- Herkunft: Direkt-Merge 1c1a27e0 (PR-Beleg fehlt). Opus-Review: `docs/acc45/wp15-nachweis.md` Abschnitt „Review-Nachträge“.
- Offen: Browser-E2E (Akzeptanz „Unit, E2E“), Selbstfreigabe Einpersonenbetrieb (F15-2, Betreiberentscheidung, `wp15-wp32d-fragen.md`).

### WP-16 Pausen, Monatsabschluss — **D**
- Code: `server/lib/monatsabschluss.mjs`, `server/lib/zeitregeln.mjs:44` (`pauseZuLang`), `/api/monatsabschluss` (`daten.mjs:2227`),
  Freeze Schema 3, Lohnexport. Prüfungen in `pruefung:zeiterfassung` (`monatsabschluss*.test.js`, `pausenerfassung.test.js`), CI-Schritt
  `pruefung.yml:419`. Lauf: `monatsabschluss-nachtrag.test.js` 25/25.
- Herkunft: **PR #85** (58432b75) — die SSOT-Angabe „integriert: nein, Nachweis nur auf dem Branch“ ist überholt;
  `docs/acc45/wp16-nachweis.md` liegt im Integrationsstand.
- Status bleibt REVIEW: Die Prüfregel erlaubt `integriert=true` nur mit INTEGRATED; die Statushebung ist eine Koordinatorentscheidung
  (Betreibervorgabe: WP-16 erst mit WP-16c abnahmefähig — WP-16c ist ebenfalls im Code, siehe unten).
- Messmatrix 60/150/400 × 12/24/36 für Abschluss/Freeze: `werkzeug/wp16-messung.mjs` (manuell, nicht CI); Stichprobe in
  `monatsabschluss-nachtrag.test.js`.

### WP-16b Spur-Zeilen ohne Tag — **D**
- Code: Schreibweg ohne `Person|Tag` (`daten.mjs`, Stempel-Integrität), Lesen geschwärzt in `server/lib/schutz.mjs:1246`
  (`spurFuerBetreiber`). Test `pruefungen/wp16b-spur.test.js` 3/3 (in `pruefung:wp-nachtraege`, CI `pruefung.yml:63`).
- Herkunft: 5dab792e, Direkt-Merge 594f32c3.
- Offen nur die Frage, ob die Ablage zusätzlich bereinigt wird (`wp16c-fragen.md` Abschnitt WP-16b; Akzeptanz lässt „beim Lesen geschwärzt“ zu).

### WP-16c Korrekturrevisionen — **B** (Kern **D**)
Abgleich mit der Akzeptanz (SSOT) und den Erwartungen des Auftrags:

| Punkt | Stand im Code | Beleg |
|---|---|---|
| Revision 1 bleibt historisch, `revisionen[]` | umgesetzt | `monatsabschluss.mjs:664` `korrekturBeginnen`; Tests „Revision 1 historisch“, „PUT kann Revisionen nicht verändern“ |
| Zeit, Berechtigter, Anlass, Grund, Differenz | umgesetzt (Grund nur im Verlauf, Spur ohne Grund/Tag) | `daten.mjs:2278–2280`; `wp16c-nachweis.md` |
| Differenzberechnung | umgesetzt | `abschliessen` :392, `exportZeilenFuer` :643 |
| Gekennzeichneter Korrekturexport (Lohn/DATEV) | umgesetzt („Korrektur R2 zu R1“, `…_korrektur_r2_…`) | `exportZeilenFuer`, `src/lib/fachlogik.js` `datevSaetze` |
| Zweite berechtigte Freigabe | umgesetzt (andere Person, keine Mitwirkenden, nicht eigene Personalnummer, `"?"` sperrt) | `korrekturFreigeben` :730, `korrekturFingerabdruck` :822 |
| `korrektur-beginnen/-freigeben/-verwerfen` | Endpunkt mit Positivliste `MONATSABSCHLUSS_RUMPF` | `daten.mjs:115`, `:2227–2257`; `monatsabschluss.mjs:884` |
| Oberfläche | eingehängt | `src/ansichten/korrekturen.jsx:177` (`MonatsKorrektur`), `src/app/aktionen/plan.js:257` (`monatKorrektur`) |
| Keine starre Frist; gesetzliche Berichtigung als Anlass | umgesetzt | Test „keine starre Frist“ (500 Tage) |
| Nie still 0 h | als Prüffall statt still: Pause ≥ Anwesenheit ⇒ `PAUSE_ZU_LANG` (`daten.mjs:1890`, `:1946`), Altdaten `zurPruefung`; Fehlstempel `DAUER_NULL` bleibt Prüffall | `wp14c-folgebefunde.test.js` F2/F6 |
| Offline-Stempel bei Revision, parallele Beginne, Migration ohne Revisionsschema, Tarif-/Vertragsänderung, Rechtematrix | getestet | `wp16c-korrekturrevision.test.js` 33/33 (Lauf 2026-11-12) |
| **Freeze-/Laufzeitmessung 60/150/400 × 12/24/36** | **für Abschluss/Freeze vorhanden** (`werkzeug/wp16-messung.mjs`), **für den Korrekturpfad nicht**: Fingerabdruck (zweimal `istEinfrieren` je Schreibvorgang bei offener Korrektur) „nicht gemessen am 12-MB-Bestand“ (`wp16c-fragen.md` L6) | Lücke |
| Externe Prüfung der lohn-/buchhalterischen Details | offen | **E-29** |

- Herkunft: 9bc6967f … ab4e3ba0, Direkt-Merge 594f32c3; Einbindung 7cee8eaf.
- **Ausführbar (B):** Messung des Korrekturpfads in `werkzeug/wp16-messung.mjs` ergänzen (Beginn, Schreiben mit offener Korrektur,
  Freigabe, Abschluss je Zelle 60/150/400 × 12/24/36) und Browser-Probe der Monatskorrektur.
- **Gesperrt (C):** Einzelinhaber-Betriebe ohne zweite Person (Frage 1), gesetzliche Berichtigung ohne Zweitfreigabe (3), Weg bei
  `KORREKTUR_BASIS_ABWEICHEND` (5), Aufbewahrung der abgelegten Lohnzeilen (6), DATEV-Korrekturformat negative Stunden vs. Storno (7),
  Zugänge ohne Person (R2), Folgemonate (R7), Rückbau beim Verwerfen (L5) — alle Betreiberentscheidungen bzw. **E-29**.

### WP-14c Folgebefunde F2, F4–F8 — **D** (F6 **C**)
| Befund | Stand | Beleg |
|---|---|---|
| F2 Pause ≥ Anwesenheit | behoben (Prüffall `PAUSE_ZU_LANG`, Korrektur ohne neue Pause 422) | `daten.mjs:1890`, `:1946`; Test F2 |
| F4 ZEITUMSTELLUNG nicht umgehbar | behoben | `stempelintegritaet.mjs:378` `zeitumstellungSperre`; Test F4 |
| F5 gemessene Dauer im Befund | behoben | `istdaten.mjs:295` `gemesseneDauerMin`; Test F5 |
| F6 24-h-Einsatz / verwerfen | **nicht umgesetzt**, fail-closed festgenagelt | Fachfrage F6a/F6b (`wp16c-fragen.md`) |
| F7 „überholt“ in der Oberfläche | behoben | `istdaten.mjs:319` `antragUeberholt`; Test F7 |
| F8 Selbstauskunft Mitternacht | bereits mit WP-16 erledigt, festgenagelt | `zeitregeln.mjs:44`; Test F8 |

Test `pruefungen/wp14c-folgebefunde.test.js` 18/18 (CI über `pruefung:wp-nachtraege`). Herkunft 50bbe0b0, Direkt-Merge 594f32c3.

### WP-07b Stempel „500 nach Speicherung“ — **D**
Kein Codeänderungsbedarf: Server erkennt die `clientEventId` unter der Raumsperre (`daten.mjs:1717` → `zeiterfassung.mjs:492`
`ereignisFinden`), Puffer behält das Ereignis. Alle sechs Szenarien in `pruefungen/wp07b-stempel-500.test.js` 9/9 (CI). Grenze laut
`wp07b-nachweis.md`: ein echter serverseitiger 500 nach dem Schreiben ließ sich im Code nicht erzeugen (nachgestellt).

### WP-19.0 Modulkern-Nacharbeit (Modulplan Abschnitt 13) — **D**
Alle acht Bausteine sind umgesetzt (`wp19-0-nachweis.md` Abschnitt 1): Aktivierungsoberfläche `src/module/kern.jsx`, Statusvertrag
`pruefeModulStatus`, Mitbestimmungsbestätigung `server/lib/branchenmodule.mjs:291–394`, Regelwerte `:401–474`, Abschalten/Nur-Lesen,
Paketdarstellung `src/stufen.js`, Einhängepunkte `src/module/index.js` + `server/lib/modulschreibwege.mjs`, Rechte-Invariante.
Fünf Opus-Review-Runden, **PR #82** (a9faf7ef). `modul-kern.test.js` 44/44. Offen nur fachlich (FN-32, FN-33) und Folgepaket
`stammdatenMonate`/`gruendeMonate` (12.6).

### WP-33 Testinfrastruktur — **B**
Die drei Commits des Branches (nicht integriert, 1196 Commits hinter integration):
1. 039d62d4 „Sammelprüfung: 14 CI-Suiten in die Kette, Abgleich Kette gegen CI“ (`werkzeug/pruefkette-abgleich.mjs`,
   `pruefungen/pruefkette-abgleich.test.js`) — **inhaltlich abgedeckt** durch `pruefung:verdrahtung` und `pruefung:ci-abdeckung`
   (#186; `werkzeug/verdrahtung-pruefen.mjs`, `werkzeug/ci-abdeckung.mjs`, CI-Schritte `pruefung.yml:43–48`).
2. 674d1c04 „E2E-Suite mit Playwright“ (`e2e/*.spec.mjs` Anmeldung, Rollen, Stempeln, Datenschutz, Offline, axe; `playwright.config.mjs`;
   `.github/workflows/e2e.yml`) — **nicht abgedeckt**: Integration hat keine Playwright-Abhängigkeit in `package.json`, keinen `e2e/`-Ordner,
   keinen E2E-Workflow; die Browserskripte in `pruefungen/browser/*.mjs` nutzen `playwright-core` + lokalen Edge und laufen nur von Hand
   (in CI nur die reine Bewertung `pruefung:browser-abnahme-kern`).
3. dc27b7de Nachweis `docs/acc45/wp33-nachweis.md` — nicht integriert.
- **Ausführbar:** die E2E-Suite (2.) auf den heutigen Stand portieren (Rollen nach RB-1…RB-5, V4-Oberfläche), axe-core als
  Entwicklungsabhängigkeit, E2E-Workflow. Achtung: offener PR **#217** (`feature/wp33-testinfrastruktur-neu`, „WP-33 Teil …
  Sammelprüfung“) eines anderen Agenten — nicht anfassen, Ergebnis abwarten. Neue Abhängigkeit (`@playwright/test`, `axe-core`) ist
  Lieferkettenthema (SI-P8/Lieferkette-Workflow).

### WP-40 WCAG 2.2 AA — **B**
| Ebene | Belegt |
|---|---|
| Quelltext/Render (`pruefungen/wp40-zugaenglichkeit.test.js` 28/28, `kontrast.test.js`, `v4-app-stil.test.js`) | 1.1.1, 1.3.1 (Beschriftung), 1.4.1, 1.4.3, 1.4.11, 2.1.1, 2.1.2, 2.4.3, 2.4.7, 4.1.2, 4.1.3 (laut Review PR #165 „12 AA belegt“) |
| Browser, lokal (Edge, `pruefungen/browser/abnahme-kern.mjs`; Lauf auf 6203b0a, `V4-STAGING-VORAUSSETZUNGEN.md` §3.3) | 2.5.8 (24 px, 390 px) ohne Befund; 3.3.1 Fehlertext bestanden; 2.4.7/2.4.11 Beschäftigte ohne Befund; **1.4.10 Leitung 320 px: Schublade/Verteilung 26 px Querscroll**; **2.4.11 Leitung 320 px: 43 Tab-Stopps in der geschlossenen Schublade** |
| Seither im Code | geschlossene Seitenleiste `visibility:hidden` (`src/ui/geraete.js:93–94`) — der 2.4.11-Befund ist damit vermutlich behoben, **nicht nachgemessen** |
| CI | nur die Bewertungslogik `pruefung:browser-abnahme-kern`, kein Browser |
| Nicht belegt | axe-core (nicht installiert), Vorlesesoftware, 200 % Zoom/Textabstand (1.4.4/1.4.12), Überschriftenstruktur je Ansicht, `aria-invalid`/`aria-describedby` am Feld (`wp40-fragen.md` Frage 2) |
- **Ausführbar:** `abnahme-kern.mjs` auf 6c195b66 erneut laufen lassen, Verteilung bei 320 px beheben. axe hängt an WP-33.
- **Gesperrt:** Frage 2 (Fehlertext am Feld) und Frage 6 (Kartenansicht) sind offene Betreiberfragen.

### WP-48 Teilspeicherung — **B**
- 48.1 Prüfnetz und 48.2 Speicherkern sind über **PR #87** integriert (nicht „ohne PR“, wie die SSOT-Notiz sagt):
  `server/lib/bestand.mjs:879` `teileSchreiben`, Hash-Vermerk, Epoche, Lesecache; `pruefungen/wp48-speicherkern.test.js` 44/44,
  `wp48-rundweg.test.js` 31/31 (beide in `pruefung:datenintegritaet`, CI `pruefung.yml:428`); `werkzeug/wp48-mutanten.mjs` (32/32 laut
  Dokument). `teileSchreiben` hat **keinen** Aufrufer im Produktcode (nur Tests).
- 48.3 ff. fehlen: kein `POST /api/bestand/teile`, kein Teil-Weg in `src/speicher.js`, kein Häppchen-Abschluss.
- Befund §7 (`WP48-TEILSPEICHERUNG.md`): gespeicherte abgeleitete Personenfelder (`sichtbereich`, `planungsregeln`) und leere
  `mutterschutzEinwilligungen: []` brechen die Rundweg-Invariante — Schichtverantwortung bekäme im Teilweg 403. Auflage für 48.3:
  virtueller Rumpf über einen angeglichenen Stand (`server/lib/gestalt.mjs:71` `personenAngleichen`) oder einmalige Bereinigung.
  Zusätzlich `preisgestaltung: null` vs. `{}` gleich behandeln.
- **Ausführbar:** 48.3 (Server-Teilweg mit der Auflage aus §7) und 48.6/48.7 technisch; WP-16 ist im Code (PR #85).
  SSOT sperrt nur formal (Abhängigkeit WP-16 = REVIEW).
- **Gesperrt:** 48.4 (Entscheidung 1 Löschlauf), 48.5 (Entscheidung 4 Konfliktführung, 2 Voll-PUT abschalten), 48.8 (Entscheidung 3),
  Freigabe großer Betriebe (Entscheidung 5) — `WP48-TEILSPEICHERUNG.md` Abschnitt 6.

## 4. Alle offenen Pakete

Spalten: Status (SSOT) · Stand laut Code · Abhängigkeiten (Code) · Klasse · erste ausführbare Scheibe bzw. Sperrgrund.

### 4.1 acc45, Folge, Import, Sicherheit

| Paket | Status | Stand laut Code | Abhängigkeiten | Klasse | Scheibe / Sperre |
|---|---|---|---|---|---|
| WP-09 Kette B nach main | IN_PROGRESS | Integrationsbranch steht | – | C | Merge nach `main` nur mit Betreiberfreigabe; E-1 Staging-Abnahme |
| WP-15 | REVIEW | vollständig im Code (3) | WP-14 integriert | D | Direkt-Merge 1c1a27e0, PR-Beleg fehlt; danach Browser-E2E (B) |
| WP-16 | REVIEW | vollständig im Code (3) | erfüllt | D | PR #85 vorhanden; Statushebung = Koordinator |
| WP-16b | REVIEW | im Code (3) | WP-16 im Code | D | Direkt-Merge 594f32c3 |
| WP-16c | REVIEW | Kern im Code (3) | WP-16 im Code | B | Messung Korrekturpfad 60/150/400 × 12/24/36; Rest C (E-29, Fragen 1/3/5/6/7, R2, R7, L5) |
| WP-14c | REVIEW | F2/F4/F5/F7/F8 im Code | erfüllt | D | F6 = Fachentscheidung F6a/F6b (C) |
| WP-07b | REVIEW | Schutz vorhanden, 6 Szenarien getestet | erfüllt | D | Direkt-Merge 594f32c3 |
| WP-19 (Sammel) | IN_PROGRESS | 12 Module im Code, alle `geplant` | siehe 4.3 | B | siehe 4.3 |
| WP-21 | IN_PROGRESS | Teil 1–3 + SV integriert (#183, #192, #211, #213) | erfüllt | B | fehlende Viewports in Edge messen; Kartenansicht = wp40-Frage 6 (C); echte Geräte = E-5 |
| WP-30 Mail/Push | BLOCKED | **implementiert und über PR #84 integriert** (`docs/acc45/wp30-nachweis.md`, `pruefung:mail-push-*`); Notiz „noch nicht gebaut“ überholt | E-9 | B | Nachprüfung F1–F8 (Nachweis §11) ausführbar; produktiv nur nach **E-9** |
| WP-33 | REVIEW | Sammelprüfung abgedeckt (#186), E2E/axe fehlen (3) | – | B | E2E-Suite portieren; PR #217 abwarten |
| WP-34 Branches aufräumen | BLOCKED | – | WP-09 | C | nach Merge nach main (Betreiber) |
| WP-36 Rechtstexte | BLOCKED | Platzhalter | E-32 | C | Inhalte und Dienstleisternamen vom Betreiber (E-32) |
| WP-40 | REVIEW | Quelltext belegt, Browser teilweise (3) | WP-39 integriert | B | Browser-Nachmessung 320 px, Verteilung beheben; Fragen 2/6 (C) |
| WP-42 Endabnahme | BLOCKED | – | WP-42a, 20 E-Pakete | C | alle E-Abnahmen |
| WP-42a RC (R3) | BLOCKED | – | 28 Pakete | C | WP-44/E-15, WP-30/E-9, WP-24b/E-21 u. a. |
| WP-42R1 Gate R1 | BLOCKED | WP-16/16c/07b/18/S1/SI-P4 im Code | WP-33 (B), WP-44 (C) | C | **E-15** (Code-Rotation) über WP-44; sonst Koordinator-Status zu WP-16/16c/07b |
| WP-42R2 Gate R2 | BLOCKED | – | R1, SI-P6b, WP-24b, WP-30 … | C | SI-P6b-Spezifikation, E-21, E-9 |
| WP-44 Zugangscodes | BLOCKED | – | E-15 | C | Betreiber rotiert Z1–Z7 (E-15) |
| WP-48 | BLOCKED | 48.1/48.2 integriert (#87), 48.3+ fehlt (3) | WP-16 im Code | B | 48.3 mit Auflage §7; 48.4/48.5/48.8 Entscheidungen §6 |
| WP-24b Altfeeds | BLOCKED | – | E-21 | C | WP-24-Stichtag (E-21, bis 2026-12-01) |
| WP-28b Sicherung unter Last | IN_PROGRESS | fail-closed Teilfix (#100), WP-28c integriert | – | C | **E-20** Nachlauf S2/S5 (Handstart Betreiber, Linux) |
| WP-PILOT | IN_PROGRESS | nur Doku/Definitionen | WP-19.0 (im Code), E-19 | B | Seeds SD-P/SD-S als synthetische Testdaten (Anschluss WP-S1); Echtdaten erst nach E-31/E-19 |
| SI-P6b | BLOCKED | – | – | C | Betreiber-Spezifikation (Zustimmungsform, Notfallablauf, AV-Einordnung) |
| IMP-6 Schichtmodelle | IN_PROGRESS | Bibliothek integriert (#185), nicht verdrahtet | – | B | Analyse/Vorschau in `/api/import` verdrahten (ohne Schreiben); Schreiben = Datenmodellentscheidung „mehrere Modelle je Person“ (C) |
| IMP-7 Historische Pläne | BLOCKED | – | IMP-6 | V | nach IMP-6; Unsicherheit hoch, Opus-Review |
| IMP-8 Testmatrix | IN_PROGRESS | 20 Fälle Unit (#215) | – | C | Betreiber bestätigt Fallliste (IMPORT-PLAN.md fehlt); Browser-E2E erst bei eingeschalteter Oberfläche (`IMPORT_DATEI_AKTIV`, T-18…T-20) |
| IMP-10 Handbuch Import | BLOCKED | Entwicklervertrag `docs/acc45/IMPORT-VERTRAG.md` vorhanden; im Handbuch nur ein Satz (`src/handbuch-inhalt.js:106` „Team → Personal → Importieren“) und `CENTRIC_IMPORT_ADRESSRAUM_KB` in `docs/BETRIEBSHANDBUCH.md`; kein Kapitel für Leitung/Betreiber | IMP-4 integriert | A | Formate, Grenzen, Rechte, Dubletten, Fehlermeldungen für Leitung und Betreiber dokumentieren (Oberfläche bleibt aus) |
| OPT-2 | BLOCKED | Freigabemechanik aus WR-3 vorhanden (`server/lib/kontowiederherstellung.mjs:16`) | SI-P4, WR-3 integriert | B | Weg hinter ausgeschaltetem Schalter bauen; Anzahl betroffener Konto-Betriebe vorab per Betreiberabfrage |
| OPT-4 | IN_PROGRESS | Teilumfang integriert (#182) | – | C | Betreiberentscheidungen E1–E4 (`OPT-4-WR-2-LUECKEN.md`, Migration bestehender Leitungskonten) |
| WR-4 | BLOCKED | Werkzeug unverändert | WR-3 integriert | C | Betreiberentscheidung **I.6** (Art der Zweitfreigabe) |
| WR-5 | BLOCKED | T14–T18, T20 durch WR-3-Tests abgedeckt (D-Anteil) | erfüllt | C | **I.5** (alleiniges Betreiberkonto) für T19 |
| WR-7 Sicherheitsreview | BLOCKED | – | WR-5 | C | über WR-5 / I.5 |
| WR-8 Nachweis | BLOCKED | – | WR-7 | C | über WR-7 |
| WR-9 | BLOCKED | – | OPT-4 | C | über OPT-4 (E1–E4) |
| WR-BETREIBER | BLOCKED | – | WR-4 | C | Betreiberentscheidung (I.5/I.6) |

### 4.2 Intelligence-Strang (WP-I1 … WP-I37)

Im Code vorhanden (integriert): Rechenkern `server/lib/engine/*` (I12, I12a, I12b), Faktenpaket/Positivliste/Alias/Leckprüfung
`server/lib/intelligence/*` (I11), Gateway mit Attrappe, Router, Prüfer, Limits, Notschalter `gateway/schalter.mjs` (I13, I15; Schalter
nicht an `server.mjs` verdrahtet — das ist laut Kopfkommentar Betreiberfreigabe), Fingerprint/Ergebnis-Speicher (I14), Oberflächengrundlage
`src/ansichten/intelligence/KiAntwort.jsx` (I17, **nirgends eingehängt**). E-21i (technische Freigabe) ist DONE; echte Modellaufrufe mit
Personendaten bleiben an **E-25** gebunden. Bekannter Befund: `server/lib/intelligence/schemas.mjs:327` nutzt `Buffer.byteLength` — im
Browser bricht `KiAntwort` damit für „fertig/Rückfall/Injektion“ (V4-STAGING-VORAUSSETZUNGEN.md §3.3).

| Paket | Kette im Code erfüllt? | Klasse | Erste ausführbare Scheibe bzw. Sperre |
|---|---|---|---|
| WP-I1 Warnen-oder-Sperren | nein: E-21 | C | Fachentscheidung warnen/sperren (E-21) |
| WP-I4 Interne Vorgaben: Verwaltung | ja (I3 integriert) | B | Verwaltung ohne Betriebsrat-Sicht (Entwurf PR #177, 2 vor / 151 hinter); BR-Lesesicht wartet auf Betreiberfreigabe (§ 87 BetrVG) |
| WP-I5 Vorgaben wirksam | nein: I4 | V | nach I4 |
| WP-I7 Planer-Kern | nein: I5 | V | nach I5 |
| WP-I8 Varianten/Erfüllungsbericht | nein: I7 | V | nach I7 |
| WP-I9 Verbessern-Modus | nein: I7, I8 | V | nach I8 |
| WP-I12c planKennzahlen | ja (I12 INTEGRATED #190) | C | Fehler weiter im Code (`server/lib/engine/kennzahlen.mjs:63` ruft `verteilung` mit Monat statt von/bis); PR #139 im Hold bis **Betreiberentscheidung zur Spanne-Definition** (`wp-i12-fragen.md` Frage 4) |
| WP-I16 Betriebssteuerung/Transparenz | ja (I13, I15) | B | Transparenzansicht und BR-Pausierung gegen die Attrappe, Schalter bleibt aus; Verdrahtung des Prozessschalters an die Umgebung = Betreiberfreigabe |
| WP-I18 Anbieter live | nein: E-25 | B | technische Auflagen aus dem Review von PR #146 (Modellregistry Pflicht, Schlüsselbund) ausführbar; Live-Anbindung **E-25** |
| WP-I19 Altplan-Übernahme (F7A) | ja (I12, I13, I17) | B | Übernahme-Logik mit Vorschau gegen Attrappe/strukturierte Testdaten; Datei-Upload bleibt aus (`IMPORT_DATEI_AKTIV`, T-18…T-20) |
| WP-I20 Ausfall-Vorschlag (F3) | ja (I12a `ersatzVorschlaege`, `server/lib/engine/einsatz.mjs`) | A | Route mit Obergrenze Personenzahl, einheitliches `ruhezeit.ist`, Golden um Ruhezeit-/Folgegrenzen (Review-Hinweise #174) |
| WP-I21 Testsätze/Schattenbetrieb | nein: I19, I20, E-24i | C | **E-24i** (Piloten) |
| WP-I22 F1 Plan-Erklärer + F2 | ja | B | `Buffer.byteLength` → `TextEncoder` (schemas.mjs:327), `KiAntwort` hinter Schalter einhängen, gegen Attrappe; live **E-25** |
| WP-I23 F9 Hilfe-Assistent | ja | B | wie I22, Inhalt aus `src/handbuch-inhalt.js`; live E-25 |
| WP-I24 F15 Änderungsübersicht | ja | B | wie I22; live E-25 |
| WP-I25 F16 Regel-Übersetzer | nein: I4 | V | nach I4 |
| WP-I26 F17 Regel-Konflikte | nein: I8 | V | nach I8 |
| WP-I27 F7B Scan/PDF/Foto | nein: I19, I16, E-25, E-26 | C | **E-25**, **E-26** (DSFA) |
| WP-I28 F8 Schichtmodell-Analyse | nein: I19 | V | nach I19 |
| WP-I29 Batch + F4/F11/F12 | ja | B | Batch-Infrastruktur (kein Code vorhanden) gegen Attrappe; live E-25 |
| WP-I30 F5 Nachrichten-Werkstatt | ja | B | gegen Attrappe; live E-25 |
| WP-I31 F6 Fragen an Daten | ja | B | gegen Attrappe über Faktenpaket/Positivliste; live E-25 |
| WP-I32 F10 Personalansatz | nein: I28 | V | nach I28 |
| WP-I33 F14 Was-wäre-wenn | nein: I28 | V | nach I28 |
| WP-I34 F18 Gutachten + F13 | nein: I8, I9, E-27 | C | **E-27** (KI-VO, Art. 22) |
| WP-I35 Kontingent/Preise | ja | C | Phase-3-Entscheidung (bedingt, in keiner Summe) |
| WP-I36 Governance-Ansichten | nein: I9, I16 | V | nach I9 und I16 |
| WP-I37 Abnahme/Rollout | nein | C | **E-28**, **E-24i** und alle Vorgänger |

### 4.3 Die zwölf WP-19-Module (+ 19.13, 19.R)

Für alle zwölf gilt im Code: Server-Bibliothek `server/lib/modul-<id>.mjs`, Oberfläche `src/module/<id>.jsx`, eingehängt über
`src/module/index.js:26–62`, Registry-Eintrag `server/lib/branchenmodule.mjs:151–227` mit Status **`geplant`** (wirkt nicht, Schreiben
geschlossen, R-9). Der Kern (WP-19.0) ist über PR #82 integriert; WP-16, WP-26, WP-07, WP-43 sind im Code. Die SSOT sperrt die Module
nur, weil WP-19.0 dort noch REVIEW ist. Rechte der sechs Module aus abe3e157 sind **vorläufig streng** (`wp19-offene-fragen-agent.md`
R-1…R-12, `modul-rechte-wp19.test.js` 54/54). Statuswechsel auf `vorlaeufig` nur durch den Betreiber mit `abnahme` (G8, WP-19.13).

| Paket | Code-Herkunft | Lauf 2026-11-12 | Kette im Code | Klasse | Erste ausführbare Scheibe / Sperre |
|---|---|---|---|---|---|
| WP-19.1 Posten | #49 + Rechte abe3e157 | – | ja | B | Postenplan-Einhängung in der Tagesansicht im Prüfmodus (E2E-Vorarbeit für 19.13); Rechte-Bestätigung (Betreiber) |
| WP-19.2 Wachbuch | Direkt-Merge abe3e157 (614626d6) | modul-wachbuch 35/35 | ja | D / C | Rest gesperrt: WB-1 (Feld vs. Dienstbuch), WB-2 (Rollenzugriff), WB-3 = FN-01/02 (Frist), WB-5 (Anonymisierung) — Betreiber/E-22 |
| WP-19.3 Objektbericht | Direkt-Merge abe3e157 (12a8519b) | modul-objektbericht 17/17 | ja | B | OB-2: `kontext.dienstzeit` an die bestätigte Ist-Zeit (WP-16) anbinden (`src/module/zugriff.js:55` liefert heute immer null); OB-1/OB-3/OB-4 = Rechtsgrundlage/PDF/Weitergabe (C) |
| WP-19.4 Bereichsplan | #49 | – | ja | B | E2E im Prüfmodus (19.13-Vorarbeit); Profil Rettungsdienst = 19.R (BS-3) |
| WP-19.5 Pflegequalifikation | Direkt-Merge abe3e157 (9514c634) | modul-pflegequal 19/19 | ja | D / C | `qualGueltig` ist geliefert (`zugriff.js`); Rest PQ-1 (FN-12 Besetzungswerte), PQ-2 (Landesrecht Assistenz), PQ-3 |
| WP-19.6 Bereitschaftsdienst | Direkt-Merge abe3e157 (32f46922) | modul-bereitschaftsdienst 22/22 | ja (WP-16 im Code; 19.7 teilweise) | C | BD-1…BD-6 = FN-15–FN-19 (Tarifwerte, Arbeitszeitrecht, Opt-out); BD-7 Kontoanrechnung hängt an der Bestätigung von BD-2/BD-3 |
| WP-19.7 Geteilter Dienst | #49 (`istJeAbschnitt`) | – | ja (WP-07, WP-16, WP-07b im Code) | B | Stempeln je Abschnitt in den Stempelpfaden (Konfliktzone Stempel; nicht parallel zu WP-14c/WP-07b-Folgearbeit); Lohnexport = FN-22 (C) |
| WP-19.8 Funktionsdienst | Direkt-Merge abe3e157 (8123d4c9) | modul-funktionsdienst 18/18 | ja | D / C | FD-2 (Schreibweg) über `modul-wege.mjs` erledigt; FD-1 Regelstufe = Nutzerentscheidung |
| WP-19.9 Rotation | Direkt-Merge abe3e157 (889d2eb4) | modul-rotation 16/16 | ja (WP-43 integriert) | D / C | RO-1/RO-2 (§ 99 BetrVG, Prüfvorbehalt), RO-3 (Sicht), RO-4 |
| WP-19.10 Anlagen | #44 | – | ja | B | E2E im Prüfmodus; fachlich FN-26 (C) |
| WP-19.11 Maschinenqualifikation | #44 | – | ja | B | wie 19.10 |
| WP-19.12 Kontimodelle | #44 | – | ja | B | E2E im Prüfmodus; FN-29 (keine stille Vorgabe) (C) |
| WP-19.13 Modulabnahme | – | modul-kern 44/44 | ja (Code aller 12) | B | E2E, Viewports, Rollenmatrix der 12 Module mit Prüf-Status nur im Test; Status `vorlaeufig` setzt nur der Betreiber (G8) |
| WP-19.R Rettungsdienst | – | – | 19.4 im Code | C | Entscheidung **BS-3** |

### 4.4 Externe Pakete (E-…) — wer muss was tun

| Paket | Status | Wer | Was |
|---|---|---|---|
| E-1 | BLOCKED | Betreiber | Staging-Abnahme des Integrationsstands inkl. WP-12 Prüfpunkte 3.1–3.4 (nach WP-42a, WP-S1, E-16) |
| E-2 | BLOCKED | Betreiber | Android: PWA und Offline-Stempeln auf echtem Gerät |
| E-3 | BLOCKED | Betreiber | iOS: PWA und Offline-Stempeln |
| E-4 | BLOCKED | Betreiber | Geo/GPS am Einsatzort prüfen |
| E-5 | BLOCKED | Betreiber | Tablet, Desktop, Viewports 360/390/430 px auf echten Geräten |
| E-6 | BLOCKED | Betreiber | Offline- und Wiederanlauf-Tests |
| E-7 | READY | Betreiber | Backup außer Haus einrichten und echten Restore durchführen |
| E-8 | READY | Betreiber | Monitoring und externe Alarmierung einrichten |
| E-9 | READY | Betreiber | Mailanbieter (SPF/DKIM/DMARC), VAPID, echter Zustelltest Android/iOS |
| E-10 | BLOCKED | Betreiber | Betreiber-2FA einrichten (nach WP-32, WP-32d) |
| E-11 | READY | Betreiber | GitHub-Umgebung `produktion`, Forced-Command-Schlüssel |
| E-12 | READY | Betreiber | `CENTRIC_VERTRAUTE_PROXYS`, Caddy, Branch-Schutz (`BETREIBER-BRANCHSCHUTZ.md`) |
| E-13 | READY | Betreiber | Produktions-`.env` migrieren, gesperrte Bilder/Tags entfernen |
| E-14 | BLOCKED | Betreiber | Rücksprung-Probe A→B→A (nach E-13) |
| E-15 | READY | Betreiber | Code-Rotation Z1–Z7 (schaltet WP-44 frei) |
| E-16 | READY | Betreiber | `brist:`-Schlüssel auf Staging löschen |
| E-17a | READY | Betreiber | Pentest-Anbieter anfragen, auswählen, beauftragen, Scope |
| E-17 | BLOCKED | Pentest-Anbieter | Durchführung, Bericht, Behebung, Nachprüfung (nach E-1, E-17a) |
| E-18 | BLOCKED | Kanzlei | Rechtsfreigabe der Rechtstexte (nach WP-36) |
| E-19 | READY | Betreiber/Betriebsrat | Mitbestimmung, Betriebsvereinbarungen |
| E-20 | READY | Betreiber | Lasttest-Nachlauf S2/S5 auf Linux starten (schaltet WP-28b frei) |
| E-21 | READY | Betreiber | Fachentscheidungen aus STATUS.md (warnen/sperren, Mindestbesetzung, Alarmweg, Vier-Augen, Feeds, WP-24-Stichtag, JArbSchG/MuSchG) |
| E-22 | READY | Betreiber/Fachleute | WP-19-Fachnachweise FN-01 bis FN-34 |
| E-23 | BLOCKED | Betreiber | Produktions-Deployment mit Freigabe-Checkliste und Rücksprung (nach WP-42) |
| E-24 | BLOCKED | Betreiber + Pilotbetriebe | Pilot nach Endabnahme, 2 Wochen ohne P0/P1 |
| E-24i | BLOCKED | Betreiber + Pilotbetriebe | Intelligence-Piloten (≥ 2 Betriebe, anonymisierte Altpläne) |
| E-25 | BLOCKED | Betreiber + Anbieter | KI-Anbieter, AVV, Zero-Data-Retention |
| E-26 | BLOCKED | Betreiber/DSB | DSFA für F7B |
| E-27 | BLOCKED | Kanzlei | KI-VO-Einordnung, Art. 22 DSGVO |
| E-28 | BLOCKED | Kanzlei | Anwaltsprüfung Muster-BV |
| E-29 | BLOCKED | Kanzlei/Steuerberatung/Lohnbüro | lohn-/buchhalterische Detailanforderungen der Korrekturrevisionen (WP-16c; der Code ist da — die Sperre „nach WP-16c“ ist nur formal) |
| E-30 | READY | Kanzlei/DSB | arbeits- und datenschutzrechtliche Gesamtprüfung |
| E-31 | READY | Betreiber + Pilotbetriebe | Pilotvertrag, AV-Vertrag Pilot, Testdatenregeln |
| E-32 | READY | Betreiber | Betriebsdienstleister auswählen, AV-Verträge, Drittlandprüfung |

## 5. Prüfläufe (2026-11-12, 6c195b66, Windows, je Datei einzeln)

| Datei | Ergebnis |
|---|---|
| `wp16c-korrekturrevision.test.js` | 33/33 |
| `wp14c-folgebefunde.test.js` | 18/18 |
| `wp16b-spur.test.js` | 3/3 |
| `wp07b-stempel-500.test.js` | 9/9 |
| `selbstauskunft.test.js` / `selbstauskunft-oberflaeche.test.js` / `einbindung-korrektur-selbstauskunft.test.js` | 22/22 · 6/6 · 10/10 |
| `wp40-zugaenglichkeit.test.js` | 28/28 |
| `wp48-speicherkern.test.js` / `wp48-rundweg.test.js` | 44/44 · 31/31 |
| `monatsabschluss-nachtrag.test.js` | 25/25 |
| `modul-wachbuch` / `-objektbericht` / `-pflegequal` / `-bereitschaftsdienst` / `-funktionsdienst` / `-rotation` | 35 · 17 · 19 · 22 · 18 · 16 (alle grün) |
| `modul-rechte-wp19.test.js` / `modul-kern.test.js` | 54/54 · 44/44 |

Alle genannten Dateien sind in der Sammelkette `npm run pruefung` und als CI-Schritt in `.github/workflows/pruefung.yml` verdrahtet
(`pruefung:wp-nachtraege` :63, `pruefung:selbstauskunft-ui` :60, `pruefung:branchenmodule` :240, `pruefung:zeiterfassung` :419,
`pruefung:datenintegritaet` :428).

## 6. Änderungen an `work-packages.json` in diesem Branch

Nur Statusstufen und Notizen mit Code-Beleg; **kein Status geändert**.

- WP-15, WP-16, WP-16b, WP-16c, WP-14c, WP-07b: `implementiert`, `lokalGetestet`, `reviewt` mit Commit-/Testbeleg; WP-14c `implementiert`
  = teilweise (F6 offen); Notiz „Code integriert per Direkt-Merge 594f32c3 bzw. 1c1a27e0, PR-Beleg fehlt“; WP-16: PR #85.
- WP-19.0: Stufen mit PR #82 und Review-Runden 1–5; Notiz.
- WP-19.2, 19.3, 19.5, 19.6, 19.8, 19.9: `implementiert`/`lokalGetestet` = teilweise (Direkt-Merge abe3e157).
- WP-48: Notiz „ohne PR“ korrigiert (PR #87), Stufen teilweise.
- WP-30: Notiz „noch nicht gebaut“ korrigiert (PR #84), Stufen.
- WP-33, WP-40, WP-I12c, IMP-10, WR-5: Notiz um den Code-Befund ergänzt; WP-40 `lokalGetestet`.

## 7. Offene Koordinator-/Betreiberentscheidungen aus diesem Abgleich (keine Entscheidung getroffen)

1. Statushebung auf INTEGRATED für PR-belegte Pakete: **WP-16 (#85)**, **WP-19.0 (#82)**, **WP-30 (#84)** — formal möglich, inhaltlich
   Koordinator (WP-16 laut Betreiber erst mit WP-16c abnahmefähig; WP-30 produktiv erst nach E-9).
2. Direkt-Merges ohne PR: WP-15 (1c1a27e0), WP-16c/14c/16b/07b (594f32c3), sechs WP-19-Module (abe3e157) — wie die übrigen
   `BELEG_FEHLT`-Fälle.
3. Folge: Mit 1. und 2. würden WP-42R1 (bis auf WP-33/WP-44), WP-48 (48.3) und die WP-19-Module in der SSOT startfähig; heute sperrt
   die SSOT sie nur formal.
