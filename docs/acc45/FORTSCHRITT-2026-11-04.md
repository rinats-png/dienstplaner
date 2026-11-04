# CENTRIC – Gesamtbestand, Restaufwand und Terminprognose (Stand 2026-11-04)

Stand: 2026-11-04, ca. 01:00 Uhr · Basis `origin/integration/centric-complete` = `6e02b4e` (letzter Merge #75, 03.11. 23:22),
`origin/main` = `2eae5c4` · reine Analyse, kein Produktcode, `work-packages.json` unverändert (Korrekturen nur als Vorschlag, §8).

**Kennzeichnung:** [M] gemessen (git, `gh`, Quelle) · [A] Annahme (Abschnitt 10) · [R] gerechnet. Optimistische Daten sind
Rechengrößen, keine Termine. Jede Prozentzahl nennt ihren Nenner.

**Quellen/Methode:** `git fetch`, 134 Remote-Branches; `git merge-tree --write-tree` gegen die Integration und paarweise;
`gh pr list --state all` (73 PRs); `gh run list` (1 195 abgeschlossene Läufe, 03.11. 05:54 bis 04.11. 01:06 MEZ, API-Grenze);
`node werkzeug/acc45-backlog.mjs fortschritt|prognose|kritischer-pfad`; Ablaufsimulation `simulieren()` aus demselben Werkzeug
(unverändert) mit eigener Paketliste (Abschnitt 6, Anhang); Nachweise `wp*-nachweis.md` auf den Branches. Historische Basis
(nicht Wahrheit): `MACHBARKEIT-2026-12-24.md` (integriert), `INTELLIGENCE-MVP.md` und `MEILENSTEINE-INTERN-2026-12-24.md`
(Branch `acc45/docs/intelligence-mvp-meilensteine`), `G9-ABRECHNUNG-SERVER.md` (Branch `acc45/docs/abrechnung-server-entscheidung`).

---

## 0. Ergebnis in acht Sätzen

1. **Statuszahl 29 INTEGRATED / 3 DONE von 147** ist korrekt nach der Quelle, sagt aber nur „im Integrationsbranch“ bzw.
   „produktiv/erledigt“: Kein Paket hat die Stufe „Staging geprüft“, produktiv sind nur WP-01 (H8+) und WP-08 [M].
2. **Ehrliche Zählung (147 Pakete, Quelle):** A fertig+integriert 31 · B fertig auf Branch 8 · C teilweise 8 · D nur geplant 54
   · E fehlerhaft 1 · F extern/entscheidungsblockiert 45 [M/R]. Hinzu kommen rund 55 Einträge aus Dokumenten außerhalb der Quelle (viele klein, 7 davon Schnitte aus
   Mutterpaketen; §1.4).
3. **Laufendes System:** `app.*` läuft `main@274bfa0` (Bundle-Abgleich); die 29 integrierten ACC45-Pakete sind **nicht** deployed;
   die Hauptwebsite ist nicht deployed [M].
4. **Restaufwand neu: 466–807 PT (Mitte 637)** statt 432–735 PT der Quelle; −13 bis −22 PT für nachweislich Fertiges/Doppeltes,
   +47 bis +94 PT für neu entstandene Pakete [R]. **Intelligence 287–505 PT = 62 %** der Mitte (Nenner 637 PT) [R].
5. **Integrationsrückstand:** 8 Code-Branches mit ≈ 28–46 PT nominell fertiger Arbeit; seit Merge #66 (03.11. 18:26) wurde
   **0 PT Code** integriert, nur 9 Doku-PRs [M]. Die nächsten 1–2 Arbeitstage gehören dem Merge-Fenster (§4).
6. **Durchsatz:** nominell ≈ 14 PT je Agent und Tag im besten Fenster; real integriert 100 PT am 02./03.11. und 0 PT danach.
   Zwei Messtage sind keine Planungsbasis (§5).
7. **Termine (realistisch, Mo–Fr, Pilotpfad mit Vorrang):** Testinstanz 11.11., interner Pilotstart technisch ab 11.11. möglich
   (Ziel 24.12. **hoch**), Intelligence-MVP mit echten Aufrufen 16.12. (**mittel**), Branchenmodule (Code) 23.11., technisch
   vollständiges Produkt 11.02.2027 (mit `App.jsx`-Nähten 15.01.2027), kommerziell produktionsreif (Kern) 15.01.2027 nur bei
   sofortiger Beauftragung aller Externen (§6).
8. **Größte Hebel:** Merge-Fenster jetzt, zwei rote CI-Ursachen beseitigen (Datum, Trivy), `App.jsx`-Nähte (−20 AT am technischen
   Gesamtende [R]), Vorrang für den Pilotpfad (Testinstanz 25.11. → 11.11. [R]), externe Aufträge sofort (§7).

---

## 1. Statuslogik und ehrliche Zählung

### 1.1 Warum 29 / 3 von 147

Die Quelle führt **zwei** Achsen [M]: den Status (`BLOCKED`, `READY`, `IN_PROGRESS`, `REVIEW`, `CI_FAILED`, `INTEGRATED`,
`VERIFIED`, `DONE`; Werkzeug `STATUS`) und **sieben Stufen** je Paket mit Beleg: (1) implementiert, (2) lokal getestet,
(3) reviewt, (4) integriert, (5) Staging geprüft, (6) fachlich freigegeben, (7) produktiv.

- `INTEGRATED` = Stufe 4 erreicht (Merge in `integration/centric-complete`). `VERIFIED` (Stufe 5) hat **kein** Paket, weil der
  Integrationsstand nie auf Staging lief. `DONE` = WP-01 (produktiv), WP-08 (lesende Prüfung ohne Code), E-21i (Entscheidung).
- `READY` setzt **integrierte** Abhängigkeiten voraus. Deshalb sind 81 Pakete `BLOCKED`, obwohl viele nur auf ein Paket in
  `REVIEW` warten (z. B. WP-48 auf WP-16) — `BLOCKED` heißt „noch nicht startbar“, nicht „gestört“.
- Die Quelle **hinkt nach** [M]: WP-30 (Code fertig, 2 Review-Runden) steht auf `BLOCKED`, WP-I11 (Code fertig, 1 Runde) auf
  `BLOCKED`; WP-19.0b, G9S-1…5, WP-INSTANZ, WP-48.x u. a. fehlen ganz; sechs WP-19-Module tragen Stufe 4 = true (Server-Teil aus
  #44/#49), Status aber `BLOCKED`.

### 1.2 Kategorien A–F je Strang (Nenner: Pakete und Gesamt-PT der Quelle)

A fertig + integriert · B implementiert und lokal getestet, nicht integriert · C teilweise (Teil integriert oder nur Doku) ·
D nur geplant · E integriert, aber mit bekanntem Fehler · F wartet auf Externe oder Betreiberentscheidung.

| Strang | Nenner Pakete | Nenner PT (gesamt) | A | B | C | D | E | F |
|---|---|---|---|---|---|---|---|---|
| ACC45 | 51 | 167–246 | **30** (87,5–126,5 PT) | 3: WP-16, WP-30, WP-33 | 3: WP-09, WP-19 (Sammel), WP-48 | 9 | 1: WP-22 | 5: WP-16c, 18, 36, 42, 44 |
| WP-19 | 15 | 70–109 | 0 | 4: 19.0, 19.10, 19.11, 19.12 | 3: 19.1, 19.4, 19.7 (Server-Teil) | 7 | 0 | 1: 19.R (BS-3) |
| Intelligence | 37 | 303–533 (inkl. I35 bedingt) | 0 | 1: I11 | 1: I10 (Doku in #70, Review offen) | 31 | 0 | 4: I1, I18, I27, I34 |
| Folgepakete | 9 | 17–33,5 | 0 | 0 | 1: WP-PILOT (Doku, Seed fehlt) | 7 | 0 | 1: WP-24b |
| Extern | 35 | 20,9–47,1 (Begleitaufwand) | 1: E-21i | – | – | – | – | 34 (16 sofort beauftragbar, 18 warten auf Entwicklung) |
| **Summe Quelle** | **147** | | **31** | **8** | **8** | **54** | **1** | **45** |

E: WP-22 — `schutzdurchsetzung.mjs` rechnet „heute“ als UTC-Tag; 14 von 19 Prüfungsläufen zwischen 00 und 01 Uhr MEZ am 04.11.
scheiterten an `fachpruefung-server.test.js`/`sicht-schichtverantwortung.test.js` [M]; Korrektur auf `fix/fachpruefung-datumsabhaengig`
(PR #80). Ohne Paketzuordnung zusätzlich: drei **hohe** Altbefunde im integrierten Code (SI-01 Push-SSRF, SI-02 CSV-Formel-Injektion,
SI-06 Betreiber-Codes), behoben nur auf `acc45/sicherheit/interne-pruefung` [M].

### 1.3 Review-Stand der Kategorie B (und neuer Branches)

| Paket / Branch | Kopf | Review-Runden [M] | Stand |
|---|---|---|---|
| WP-16 `acc45/time/wp16-pausen-und-monatsabschluss` | 6e51aa2 | 4 (1 Review + 3 Delta), Nachtrag 4 umgesetzt | 3. Urteil „mit Auflagen integrierbar, Lohnexport nicht produktionsreif“; Rest → WP-16c; Delta-Prüfung N4 offen |
| WP-19.0 `acc45/frontend/wp19-0-modulkern` | c041f9b | 3 abgeschlossen, Nachtrag 4 läuft | „integrierbar mit Auflagen“ |
| WP-19.0b G9 `…/wp19-0b-g9-verkauf` (nicht in Quelle) | 60becf1 | 3 | Nachtrag 3 umgesetzt; enthält alte 19.0-Commits → Rebase nötig |
| WP-30 `acc45/infra/wp30-mail-und-push` | 287f349 | 2 (B1–B7, F1–F8) | Nachprüfung F1–F8 offen; Echtzustellung braucht E-9 |
| WP-I11 `intelligence/wp-i11-faktenpaket` | b466bc6 | 1 (F1–F10) | Nachprüfung offen |
| WP-48.1/48.2 `acc45/backend/wp48-1-2-pruefnetz-speicherkern` | 5457406 | 1 | „mit Auflagen“ (Auflage für 48.3 dokumentiert) |
| Interne Sicherheitsprüfung `acc45/sicherheit/interne-pruefung` | 991b2e7 | 1 | Review-Befund S1 **hoch offen**; P1–P8 (mittel) offen |
| WP-19.10/11/12 `acc45/frontend/wp19-10-industrie` | eeac3fa | 0 | Nachweise vorhanden, kein Review, 27 Commits hinter Integration |
| WP-33 `acc45/qa/wp33-testinfrastruktur` | dc27b7d | 0 | seit 02.11. 19:03 unverändert, 476 Commits hinter Integration |

### 1.4 Nicht in der Quelle (neu entstanden; Nenner separat)

| Strang (neu) | Pakete | PT gesamt | Beleg |
|---|---|---|---|
| Abrechnung | WP-19.0b (4–8, B), G9S-1…5 (9,5–14,5, D) | 13,5–22,5 | G9-ABRECHNUNG-SERVER.md §2 (Branch) |
| Pilot/Instanz | WP-INSTANZ 5,5–10,5; PM-3…13 ohne Doppel ≈ 6–11; WP-IONOS-SMTP 1,5–3; WP-VERTRAG 3–10; DL-P2/P3/P7 3–6 | 19–40,5 | MEILENSTEINE-INTERN §6/§7, PILOT-MINDESTANFORDERUNGEN, IONOS-PRUEFUNG (Branches) |
| Deployment | Hauptwebsite (`deploy/hauptwebsite-docker`), Demo-Schalter (PR #79), Selbststart (in `main`, PR #77 offen), Rückführung `main`→Integration | 0,8–1,5 Rest | Branches |
| ACC45-Nachzüge | WP-48.3–48.9 (12,5–20), WP-30b, SI-P1…P8, Interne Prüfung, Datums-Fix, Aufbewahrungsfristen (`stammdatenMonate`/`gruendeMonate`), M4-Abdruck | siehe §3 | Nachweise |
| Intelligence-MVP-Schnitt | I12a, I15a, KI-FREIGABE, I18a, I20a, I22a (aus Mutterpaketen), I21a neu | +1–3 netto, I21a +2–4 | MEILENSTEINE-INTERN §7 |

---

## 2. Stufen getrennt: geschrieben → verifiziert im laufenden System

| Strang | Code geschrieben | lokal getestet | reviewt (≥ 1 Runde) | integriert | deployed (Produktion) | im laufenden System verifiziert |
|---|---|---|---|---|---|---|
| ACC45 (51) | 33 + WP-48 teilweise | 33 | 31 (+ WP-48.1/2 mit Auflagen) | 30 | **1** (WP-01; WP-08 ist Prüfung) | 1 (WP-01, Bundle `main@274bfa0`) |
| WP-19 (15) | 4 voll (19.0, 19.10–12) + 3 Server-Teil | dito | 1 voll (19.0) + 6 Server-Teil | 0 voll, 6 Server-Teil | 0 | 0 |
| Intelligence (37) | 1 Code (I11) + 1 Doku (I10) | 1 | 1 (I11) | 0 Code (I10 als Doku) | 0 | 0 |
| Folge (9) | 0 (WP-PILOT nur Doku) | 0 | 0 | 0 | 0 | 0 |
| Abrechnung (neu, 6) | 1 (19.0b) | 1 | 1 (3 Runden) | 0 | 0 | 0 |
| Deployment (neu) | 3 Branches | CI | Selbststart (PR #78) | 1 in `main` (`2eae5c4`), 0 in Integration | **0** (Hauptwebsite nicht deployed; `main@2eae5c4` nicht ausgerollt) | 0 |
| Pilot (neu) | 0 (nur Doku) | – | – | – | – | – |

**Abstand Integration ↔ Produktion [M]:** Die Integration ist 536 Commits vor `main`, `main` 3 Commits vor der Integration
(Selbststart). `git merge-tree` meldet Konflikte `main`↔Integration in `.env.example`, `deploy/compose.yml`,
`pruefungen/zugaenge-anlegen.test.js`.

---

## 3. Restaufwand neu (ohne externe Begleitzeit)

**Methode [R]:** Rest je Paket wie im Werkzeug (`restAufwand`: IN_PROGRESS × 0,5, REVIEW × 0,2, `bedingt` = 0, WP-I35 daher
nicht enthalten). Ausgangspunkt `offenerAufwandPT` der Quelle **432,2–735 PT**. Zahlen gerundet.

| Schritt | min | max | Begründung |
|---|---|---|---|
| Quelle offen | 432,2 | 735,0 | `work-packages.json` |
| − WP-30 Code fertig (BLOCKED → REVIEW) | −1,6 | −2,4 | 2 Review-Runden |
| − WP-I11 Code fertig (BLOCKED → REVIEW) | −4,8 | −8,0 | Nachweis, 48 Mutanten |
| − WP-19.10/11/12 fertig, ohne Review (→ × 0,5) | −3,0 | −5,5 | Branch `eeac3fa` |
| − WP-48.1/48.2 fertig (→ × 0,2) | −2,8 | −4,8 | 3,5–6 PT von 16–26 |
| − WP-09 doppelt zu E-1/E-23/WP-34 | −1,0 | −1,5 | §8 |
| + WP-19.0b (Rest) und G9S-1…5 | +10,3 | +16,1 | G9-Dokument |
| + WP-39 Nähte N0–N4 (4–5,5 → 8–14) | +4,0 | +8,5 | Machbarkeit §4.2 |
| + WP-INSTANZ, PM-3…13 ohne Doppel | +11,5 | +21,5 | Pilot-Dokumente |
| + WP-IONOS-SMTP (≡ DL-P1), WP-VERTRAG (≡ DL-P4), DL-P2/P3/P7, DL-P5-Zusatz | +9,5 | +23,0 | Dienstleister-Dokumente |
| + WP-30b, Interne Prüfung (Rest), SI-P1…P8 [A], Datums-Fix | +7,1 | +14,25 | Nachweise; P1–P8 ohne Schätzung im Bericht → [A] 5–9,5 |
| + Aufbewahrungsfristen [A], M4-Abdruck [A], Deployment-Rest | +1,6 | +3,5 | [A] |
| + I21a, MVP-Schnitt netto | +3,0 | +7,0 | MEILENSTEINE-INTERN §7 |
| **Neu (Simulation, gleiche Regeln)** | **466,4** | **807,2** | Rundungsdifferenz ≤ 0,6 PT |

| Strang | Rest min–max | Mitte | Anteil an 636,8 PT Mitte |
|---|---|---|---|
| Intelligence | 286,6–504,8 | 395,7 | **62 %** |
| ACC45 (inkl. WP-48.x, Nachzüge) | 70,2–114,0 | 92,1 | 14 % |
| WP-19 (ohne 19.0b) | 64,6–100,3 | 82,5 | 13 % |
| Pilot/Instanz/Dienstleister | 19,0–40,5 | 29,8 | 5 % |
| Folgepakete | 15,8–31,5 | 23,7 | 4 % |
| Abrechnung (G9S) | 9,5–14,5 | 12,0 | 2 % |
| Deployment | 0,8–1,5 | 1,2 | < 1 % |
| davon Konfliktzone `src/App.jsx` | 211,6–368,8 | 290,2 | 46 % |
| davon Konfliktzone `daten.mjs` | 54,8–92,6 | 73,7 | 12 % |

**Mit Nacharbeit [R/A]:** optimistisch × 1,0 auf min = **466 PT**, realistisch × 1,3 auf Mitte = **828 PT**, pessimistisch × 1,5
auf max = **1 211 PT**. Begründung des Aufschlags: gemessen 35 % Nacharbeits-Merges (19 von 55 Integrations-PRs) und 14 %
Nachtragszeilen (Machbarkeit); auf den offenen Branches sind 22 von 48 Commits Review-Nacharbeit [M].
**Was den Rest ausmacht:** Intelligence (62 %), darin der kritische Pfad I10 → I12 → I13 → I17 → I19 → I27 → I37 (75–130 PT
laut Quelle) und 19 von 37 I-Paketen in `App.jsx`. Ohne Intelligence bleiben 180–302 PT.

---

## 4. Integrationsrückstand

`git merge-tree --write-tree` gegen `6e02b4e` und paarweise [M]. „Konflikt“ = textueller Konflikt; semantische Überlappungen
gesondert.

| # | Branch (Kopf) | Umfang | Konflikt mit Integration | Konflikte mit anderen offenen Branches | ohne Entwicklung integrierbar? |
|---|---|---|---|---|---|
| 1 | `fix/fachpruefung-datumsabhaengig` (3c786ac, PR #80) | 4 Dateien | keiner | keiner (außer `main`-Rückführung über Basis) | **ja**, nach Review |
| 2 | `main` → Integration (Selbststart, PR #77; danach Demo-Schalter PR #79) | 12–17 Dateien | `.env.example`, `deploy/compose.yml`, `zugaenge-anlegen.test.js` | Demo-Schalter mit allen (über `daten.mjs`, `serverlauf.mjs`) | ja, Konfliktauflösung klein |
| 3 | Doku: `pilot-mindestanforderungen`, `pilot-betriebskonzept` (#76), `dienstleister-datenfluss`, `intelligence-mvp-meilensteine`, `abrechnung-server-entscheidung` | je 2–8 Dateien | keiner | **`intelligence-mvp-meilensteine` × `abrechnung-server-entscheidung`**: 6 Dateien (SSOT, GESAMTPLAN, STATUS, DEPENDENCIES, ROADMAP) | ja; zweiter nach Rebase, eine SSOT-Pflege |
| 4 | WP-I11 (b466bc6) | 18 Dateien, nur neue Module | keiner | nur `package.json` | ja, nach Nachprüfung F1–F10 |
| 5 | WP-30 (287f349) | 30 Dateien | keiner | G9: `daten.mjs`; Interne Prüfung: `sw.js`, `zustellung.mjs`, `webpush.mjs` | ja, nach Nachprüfung F1–F8; **semantisch doppelt mit SI-01** (§8) |
| 6 | Interne Prüfung (991b2e7) | 17 Dateien | keiner | WP-30 (3), WP-16 (`App.jsx`) | **nein** — S1 hoch offen |
| 7 | WP-16 (6e51aa2) | 44 Dateien, +7 143 Zeilen | keiner | 19.0: 6 Dateien inkl. `App.jsx`, `daten.mjs`, `speicher.js`; G9: 3; WP-48.1/2: 2; Industrie, Interne Prüfung: `App.jsx` | ja, nach Delta-Prüfung N4 |
| 8 | WP-19.0 (c041f9b) | 29 Dateien | keiner | WP-16 (6), G9 (3), Industrie (3) | nach Nachtrag 4 + Delta |
| 9 | WP-19.0b G9 (60becf1) | 31 Dateien | keiner | 19.0 (`daten.mjs`, `rechte.mjs`, `speicher.js`) | **nein** — Rebase auf finales 19.0 |
| 10 | WP-19.10–12 Industrie (eeac3fa) | 28 Dateien | keiner | 19.0, G9 (`App.jsx`, `daten.mjs`, Rechtematrix-Test) | **nein** — Review + Rebase |
| 11 | WP-48.1/48.2 (5457406) | 11 Dateien | `work-packages.json` | WP-16: `package.json`, `scherben.mjs` | nach Auflagen, nach WP-16 |
| 12 | `deploy/hauptwebsite-docker` (f40975f) | 11 Dateien | keiner | `package.json` (WP-30, I11, Pilot-Doku) | ja, nach Review; Ziel `main` klären |
| 13 | WP-33 (dc27b7d) | 21 Dateien | `package.json` | `package.json`, `package-lock.json` | **nein** — 476 Commits alt; neu bewerten |

**Reihenfolge-Vorschlag:** 1 → 2 → 3 → 4 → 5 (mit Entscheidung SI-01 vs. WP-30-Allowlist) → 6 → 7 → 8 → 9 → 10 → 11; 12 unabhängig.
Begründung: zuerst alles ohne Konfliktzone und mit CI-Wirkung (1, 2), dann die SSOT (3), dann Server-Branches ohne `App.jsx`
(4, 5), dann die `App.jsx`/`daten.mjs`-Kette in einem exklusiven Fenster (6–10), zuletzt WP-48 auf integriertem WP-16.
Ohne weitere Entwicklung nach Review und grüner CI integrierbar: **1, 2, 3, 4, 12**; nach reiner Nachprüfung zusätzlich 5, 7.

---

## 5. Durchsatz

| Größe | Wert | Quelle |
|---|---|---|
| Integrierte PT, 02.11. 16:51 – 03.11. 18:26 | 100 PT Mitte (82–119), 27 Pakete | Machbarkeit §1.2 [M] |
| Integrierte Code-PT seit Merge #66 (03.11. 18:26) bis 04.11. 01:00 | **0** (9 Doku-PRs #67–#75) | `gh pr list` [M] |
| Nominell fertig auf Branches (B + 48.1/2 + 19.0b), nicht integriert | ≈ 28–46 PT | Stufen + §3 [R] |
| Merges in die Integration (first-parent) je Tag | 02.11.: 15 · 03.11.: 42 · 04.11.: 0 | `git log --first-parent --merges` [M] |
| Commits ohne Merges, alle Branches | 02.11.: 102 (13 aktive h) · 03.11.: 240 (19 h) · 04.11. bis 01 Uhr: 13 | `git log --remotes` [M] |
| PR geöffnet → gemergt (Integration, 55 PRs) | Median 7,0 min, p90 18,3 min | PRs werden erst beim Merge geöffnet — keine Wartezeitaussage [M] |
| Review-Runden je Paket | gemergte: 1,9 (Machbarkeit); offene B-Pakete: 2,1 im Mittel (4/3/3/2/1/1/1), zwei Runden laufen | Nachweise [M] |
| Nacharbeitsquote | 19 von 55 Integrations-PRs = 35 % Nachträge; offene Branches 22 von 48 Commits Review-Nacharbeit (46 %) | PR-Titel/Branchnamen, Commit-Texte [M] |
| CI „Prüfung“ | 292 Läufe, Median 5,8 min, p90 7,2 min; rot 40 = 13,7 %; seit 03.11. 22 Uhr MEZ 15 von 51 = 29 % | `gh run list` [M] |
| CI „Lieferkette“ | 286 Läufe, rot 17 = 5,9 %; **alle 17 seit 03.11. 22:37 MEZ** (17 von 45 = 38 %), Ursache Trivy-Installation `v0.70.0` bricht mit Exit 6 ab | Log Lauf 41742705820 [M] |
| Ursache roter Prüfungsläufe 00–01 Uhr MEZ | 14 von 19: datumsabhängige Tests (UTC-Tag), Stichprobe 4 von 4 Logs mit Fehlerzeile | Logs [M] |

**Aussagekraft:** Zwei Messtage mit einem Regimewechsel (zuerst gut geschnittene Server-P0-Pakete, danach `App.jsx`/`daten.mjs`
und lange Review-Ketten) erlauben keine Mehrwochen-Hochrechnung; der Wert 50 PT/Kalendertag ist eine **Obergrenze unter günstigen
Bedingungen**. **Nominelle Agentenleistung** (implementiert auf Branch) und **realer Integrationsdurchsatz** gehen seit 18:26
auseinander: ≈ 28–46 PT nominell gegenüber 0 PT integriert. Planungsrelevant ist der Integrationsdurchsatz; die Szenarien rechnen
deshalb mit 3,5 / 6 / 10 PT je Agent und Tag statt 14 [A].

---

## 6. Szenarien und Meilensteine

**Parameter [A]:** 3 Schreiber (Maschine laut `AGENTS.md`), Start Mi 04.11.2026, Feiertage der Quelle; 7-Tage-Betrieb = jeder
Kalendertag ein Sitzungstag mit 0,85 Leistung, externe Wartezeiten × 1,4. Externe Wartezeiten ab Beauftragung am 04.11. (bisher
nicht belegt beauftragt). „Vorrang Pilotpfad“ = offene Branches, Testinstanz und Intelligence-MVP vor dem übrigen Backlog.

| | optimistisch | realistisch | pessimistisch |
|---|---|---|---|
| Rest-PT × Nacharbeit | 466 × 1,0 | 637 × 1,3 = 828 | 807 × 1,5 = 1 211 |
| PT je Agent und Arbeitstag | 10 | 6 | 3,5 |
| Mindestdauer je Paket | 0,25 AT | 0,5 AT | 1 AT |
| `App.jsx` nach WP-39 frei (Nähte) | ja | nein (Variante „+ Nähte“ angegeben) | nein |
| Kapazität | 30 PT/AT | 18 PT/AT | 10,5 PT/AT |
| Untergrenze aus Menge | 16 AT | 46 AT | 115 AT |
| Kritischer Pfad (Treiber, Simulation) | Intelligence-Kette | WP-I2 → … wartet auf Zone `App.jsx` | dito |

### 6.1 Termine je Meilenstein (Datum Mo–Fr / Datum 7-Tage)

| # | Meilenstein | optimistisch | realistisch | real. + Nähte | pessimistisch | Konfidenz |
|---|---|---|---|---|---|---|
| 1 | Hauptwebsite erreichbar | 05.11. / 05.11. | 06.11. / 07.11. | – | 09.11. / 09.11. | hoch, wenn Betreiber Caddy/DNS setzt |
| 2 | Geschützte Testinstanz funktionsfähig | 06.11. / 07.11. | 11.11. / 10.11. | – | 18.11. / 15.11. | mittel (E-35 Betreiber, Entscheidung Instanz vs. Staging) |
| 3 | Aktueller Integrationsstand auf dem VPS | 06.11. / 07.11. | 11.11. / 10.11. | – | 18.11. / 15.11. | mittel; real. Merge-Fenster 2–4 AT [A] statt Simulationsminimum |
| 4 | Interner Pilotstart technisch möglich (Ziel 24.12.) | 06.11. / 07.11. | 11.11. / 10.11. | – | 23.11. / 16.11. | **hoch** für 24.12. (Kern, synthetische Daten) |
| 5 | Intelligence-MVP mit realen API-Aufrufen (F2 + F3-light) | 19.11. / 16.11. | **16.12. / 09.12.** | 16.12. / 09.12. | 22.02.27 / 30.01.27 | **mittel** (nur mit Vorrang und E-33); ohne Vorrang real. 21.12. |
| 6 | Vollständige Branchenmodule (Code, WP-19.13 + 19.R) | 12.11. / 10.11. | 23.11. / 18.11. | 23.11. / 20.11. | 16.12. / 09.12. | mittel; fachlich frei erst nach E-22 (15–45 AT) |
| 7 | Vollständige Abrechnungsarchitektur (19.0b + G9S-1…5) | 10.11. / 09.11. | 25.11. / 23.11. | 24.11. / 21.11. | 18.01.27 / 31.12. | mittel (Betreiberentscheidungen G9 §3 offen) |
| 8 | Vollständige Intelligence (technisch, Attrappe wo Externe fehlen) | 27.11. / 23.11. | 11.02.27 / 22.01.27 | 15.01.27 / 29.12. | 07.07.27 / 19.05.27 | niedrig |
| 9 | Technisch vollständig integriertes Produkt | 27.11. / 23.11. | 11.02.27 / 22.01.27 | 15.01.27 / 29.12. | 07.07.27 / 19.05.27 | niedrig |
| 10 | Vollständige interne QS (M9 + WP-42a + Staging-Abnahme E-1) | 30.11. / 25.11. | 15.02.27 / 24.01.27 | 19.01.27 / 01.01.27 | 12.07.27 / 24.05.27 | niedrig |
| 11 | Freigabe externe Firmenpiloten (Kern; ohne / mit Pentest) | 02.12. / 02.12. | 21.12. / 20.12. (mit: 21.12.) | gleich | 25.01.27 (mit: 11.02.27) / 08.01.27 | niedrig — nur bei Beauftragung E-18, E-19, E-30, E-31, E-32 **heute** |
| 12 | Kommerziell produktionsreif (Kern: WP-42 → E-23 → E-24 + WP-48) | 17.12. / 18.12. | 15.01.27 / 10.01.27 | 15.01.27 / 10.01.27 | 12.03.27 / 21.02.27 | niedrig; Intelligence produktiv (WP-I37): 22.01.27 / 18.03.27 / 13.07.27 |

**Voraussetzungen und kritische Abhängigkeiten je Meilenstein**

- **1:** Review `deploy/hauptwebsite-docker`, Betreiber setzt Site-Datei/DNS (nicht im Repo). Ohne Vorrang rutscht die 0,5-PT-Aufgabe
  in der Simulation auf 24.11. (realistisch) — reine Priorisierungsfrage.
- **2–4:** WP-S1 → WP-32d → WP-INSTANZ → E-35; Merge-Fenster §4 (1–7); PM-3/PM-4 (Pilot-Hinweis, Kenntnisnahme) in `App.jsx`.
  Zwingend laut MEILENSTEINE-INTERN Z1–Z7; Pentest, Kanzlei, E-22 sind **nicht** Voraussetzung des internen Starts.
- **5:** I11 → I12a (`App.jsx`) → I13 → I17 (`App.jsx`) → I22a/I20a (`App.jsx`) → I21a; E-33 (Schlüssel, Deckel), Abweichung von AD-21
  für die isolierte Instanz (Betreiber). Treiber realistisch: drei Wartezeiten auf die Zone `App.jsx`.
- **6:** WP-19.0 → 19.12 (`App.jsx`) → 19.13; BS-3 (Rettungsdienst) offen; Regelwerte bleiben `provisional` bis E-22.
- **7:** WP-19.0b nach 19.0; G9S-1…4 ohne Konfliktzone parallel; G9S-5 in `App.jsx`/`rechte.mjs`.
- **8–10:** Intelligence-Kette; 19 I-Pakete in `App.jsx`; E-25…E-28 für Echtbetrieb (nicht für „technisch“).
- **11:** WP-42a + E-1 + Rechtstexte E-18 (nach E-32 → WP-36), E-30, E-31, Mitbestimmung E-19 je Pilotbetrieb, Mail E-9, 2FA E-10,
  WP-48 Stufe 1 (48.3–48.5). Pentest: laut interner Prüfung „nach dem Pilot“ — Variante ohne/mit angegeben.
- **12:** E-17a → E-17, E-22, E-29 (nach WP-16c) → WP-42 → E-23 → E-24 (10–15 AT Pilot); WP-48.9.

**PT-Reduktion ≠ Kalenderreduktion [R]:** Der 7-Tage-Betrieb verkürzt das technische Ende realistisch um 20 Kalendertage
(11.02. → 22.01.2027), den kommerziellen Meilenstein aber nur um 5 (15.01. → 10.01.2027), weil dort Externe treiben. Nähte
verkürzen M9 um 20 AT, verschieben M11/M12 gar nicht.

### 6.2 Externe Wartezeiten (separat, Arbeitstage ab Beauftragung, Quelle `wartezeitAT`)

E-17a Pentest-Vorlauf 10–30 → E-17 Pentest 5–15 · E-18 Rechtstexte 10–30 · E-19 Mitbestimmung 15–45 · E-22 Fachnachweise 15–45 ·
E-29 Korrekturrevision 10–30 (nach WP-16c) · E-30 Gesamtprüfung 15–30 · E-31 Pilotvereinbarung 10–20 · E-32 Dienstleister/AVV 10–15 ·
E-24 Pilot 10–15 · E-24i Intelligence-Piloten 20–60 · E-25…E-28 Intelligence-Recht 15–60 · E-9 Mail/Push 2–15. **Jede Woche
spätere Beauftragung verschiebt M11/M12 um bis zu eine Woche.**

---

## 7. Engpässe nach Ursache und Maßnahmen

| Ursache | Beleg [M] | Maßnahme | erwartete messbare Wirkung |
|---|---|---|---|
| Integrationsstau | 0 Code-PT integriert seit 18:26; 8 Code-Branches offen | Merge-Fenster nach §4, ein Integrator, keine neuen `App.jsx`-Pakete bis Schritt 10 | offene fertige Branches 8 → ≤ 2 in 2 AT; ≈ 28–46 PT integriert |
| `App.jsx`-Serialisierung | 290 PT Mitte = 46 % des Rests in der Zone; 6 offene Branches ändern `App.jsx` | WP-39 Nähte N1/N2 sofort nach dem Merge-Fenster (½ Tag Stillstand) | realistisch M9 11.02. → 15.01.2027 (−20 AT) [R]; Anteil Merges mit `App.jsx` |
| Review-Runden | offene B-Pakete 2,1 Runden, WP-16 4; 46 % der Branch-Commits Nacharbeit | Rundenbudget 2; nicht blockierende Befunde als Folgepaket; Delta-Review nur auf Diff | Runden je Paket ≤ 2; Nacharbeits-PRs 35 % → < 20 % |
| Rote CI durch Datum | 14 von 19 Prüfungsläufen 00–01 Uhr MEZ rot | PR #80 zuerst mergen; Regel „kein `new Date()` ohne Zeitzone in Tests“ | Prüfung rot 29 % → < 5 % (Rest echte Fehler) |
| Rote CI durch Trivy-Installation | 17 von 45 Lieferkette-Läufen seit 22:37 rot, Exit 6 beim Laden von `v0.70.0` | Binary cachen/festen Pfad nutzen oder Installationsschritt mit Wiederholung; Bericht-Schritt bleibt nicht blockierend | Lieferkette rot 38 % → ≈ 0 % |
| Doppelte CI je Push | 5 Branch-Paare mit gleichem Kopf (`wp16-nachtrag4`, `wp19-0-nachtrag3`, `g9-nachtrag3`, `wp30-nachtrag2`, `i11-nachtrag`) | Hilfsrefs nach Push löschen (nur nach Rückfrage) | CI-Läufe dieser Pakete −50 % |
| Merge-Konflikte | WP-16 × 19.0: 6 Dateien; G9 × 19.0: 3; Demo-Schalter mit allen | Reihenfolge §4; Rebase nur vor dem Fenster | Rück-Merges je Branch (WP-16: 4) → ≤ 1 |
| Maschine | 3 Schreiber, Tests lokal einzeln | Vollregression nur in CI (5,8 min Median, keine Warteschlange) | lokale Läufe je Paket; ermöglicht stabile 3 Schreiber |
| Externe Abhängigkeiten | Treiber M11/M12 (E-32 → WP-36 → E-18; E-17a → E-17) | alle sofort beauftragbaren 16 E-Pakete beauftragen (E-17a, E-18, E-19, E-22, E-30, E-31, E-32 …) | jede Woche früher = bis zu 1 Woche früher M11/M12 |
| Priorisierung | ohne Vorrang Testinstanz real. 25.11., mit 11.11. | Vorrang Pilotpfad (§6) ausdrücklich festlegen | −10 AT bis M2/M4 [R] |

---

## 8. Doppelte, überholte Pakete und unnötige Abhängigkeiten (Vorschläge, nichts löschen)

| # | Fund | Begründung | Vorschlag |
|---|---|---|---|
| 1 | WP-09 ↔ E-1, E-23, WP-34, WP-42 | offene Punkte von WP-09 (Staging, Merge nach `main`, Deploy) sind genau diese Pakete | WP-09 auf Rest 0 bzw. schließen; Abhängigkeiten von WP-18, WP-34 (und integrierten WP-26/43) auf WP-09 entfernen (schon `NUR_REIHENFOLGE`) |
| 2 | DL-P1 ≡ WP-IONOS-SMTP; DL-P4 ≡ WP-VERTRAG; DL-P6 ≈ WP-KI-FREIGABE; DL-P5 ⊂ I13 + I18 | gleicher Inhalt in zwei Dokumenten | je ein Paket führen, Zusatz von DL-P5 (2–4 PT) an I18a hängen |
| 3 | DL-P3 ≈ WP-36 | beide: Rechtstexte auf Ist-Zustand | zusammenlegen |
| 4 | PM-1, PM-2, PM-10, PM-11 (Mail) ⊂ WP-INSTANZ; PM-2 ≈ WP-PILOT-Seed; PM-9 ≈ interne Sicherheitsprüfung | Abgrenzung in MEILENSTEINE-INTERN §6 genannt, Seed doppelt geführt | Seed nur in WP-INSTANZ; PM-9 als erledigt bis auf Rest |
| 5 | SI-01 (Push-SSRF, Interne Prüfung) ≈ WP-30 A4 (`pushEndpunktErlaubt`) | zwei Umsetzungen derselben Abwehr, Konflikt in `webpush.mjs`/`zustellung.mjs`/`sw.js` | eine Umsetzung wählen (Opus), andere verwerfen |
| 6 | SI-P4 (2FA Leitung/Planung) ↔ WP-32d (Betreiber-2FA) ↔ „2FA Pflicht“ | drei Stellen für eine Anforderung | ein Paket „2FA alle privilegierten Rollen“ |
| 7 | SI-P3 (Mail-Relay) ≈ DL-P2 ≈ WP-INSTANZ T2 | Mailminimierung dreifach | zusammenlegen |
| 8 | WP-44 ↔ E-15 | WP-44 wartet auf E-15, E-15 ist die Handlung zu WP-44 | Richtung festlegen (E-15 hängt an WP-44) |
| 9 | WP-42a → WP-19 → WP-19.13 | Sammelpaket mit 0 PT nur als Zwischenglied | WP-42a direkt auf WP-19.13; WP-19 als Sammel kennzeichnen |
| 10 | WP-48 (16–26 PT) ↔ WP-48.1…48.9 | Teilpakete existieren nur im Dokument | Teilpakete in die Quelle, WP-48 auf 0 PT |
| 11 | WP-30 → E-9 | E-9 nur für Echtzustellung (A7) nötig | WP-30 Code auf REVIEW; Abnahme A7 an E-9 |
| 12 | WP-30b ↔ WP-IONOS-SMTP | Webhook-Bounces sind Resend-spezifisch | WP-30b erst nach Anbieterentscheidung DL-P1 |
| 13 | WP-I10 REVIEW, Doku bereits in #70 integriert | Status passt nicht | INTEGRATED (Doku), Review als Stufe |
| 14 | Stufe 4 = true bei WP-19.1/4/7/10/11/12 mit Status BLOCKED | Server-Teil ≠ Paket | Beleg „teilweise“, Stufe false |
| 15 | `deploy/website-hauptdomain` (5a8f35b) | Commit ist in `deploy/hauptwebsite-docker` enthalten | Branch als überholt kennzeichnen |
| 16 | PRs #6, #7, #15–#18 (Oktober) | Inhalt über WP-10/11 (#31) und H8+ (#20) eingeflossen | prüfen und schließen |
| 17 | WP-33 | 476 Commits hinter Integration; teilweise durch #48 (Werkzeuge/Flakes) überholt — nicht geprüft | neu bewerten oder schließen |
| 18 | WP-I13 → WP-I12 (ganze Engine) | MVP braucht nur I12a | auf I12a umhängen (verkürzt kritischen Pfad) |

---

## 9. Nächste 10 ausführbare Aufgaben (Reihenfolge)

| # | Aufgabe | Modell | Dateibereich | Ergebnis |
|---|---|---|---|---|
| 1 | PR #80 Datums-Fix reviewen und mergen | Sonnet Review, Agent 0 Merge | `server/lib/schutzdurchsetzung.mjs`, 3 Tests | Prüfung nachts grün |
| 2 | Trivy-Installation in der Lieferkette stabilisieren | Haiku (Sonnet Review) | `.github/workflows/lieferkette.yml` | Lieferkette grün |
| 3 | `main` → Integration zurückführen (PR #77), danach Demo-Schalter (#79) | Sonnet | `.env.example`, `deploy/compose.yml`, `pruefungen/zugaenge-anlegen.test.js`, `server/lib/schalter.mjs` | ein gemeinsamer Stand |
| 4 | Doku-Branches mergen, **eine** SSOT-Pflege mit den Korrekturen aus §1.4/§8 | Sonnet, Opus-Gegenlesen | `docs/acc45/*`, `work-packages.json` | Quelle = Realität |
| 5 | WP-30 Nachprüfung F1–F8 und Entscheidung SI-01 vs. A4; dann Interne Prüfung S1 beheben | Opus (Review), Sonnet (Fix) | `server/lib/webpush.mjs`, `server/funktionen/zustellung.mjs`, `public/sw.js` | 2 Branches integriert |
| 6 | WP-I11 Nachprüfung F1–F10, Merge | Opus | `server/lib/intelligence/*`, `package.json` | MVP-Kette startbar |
| 7 | WP-16 Delta-Prüfung Nachtrag 4, Merge im exklusiven Fenster | Opus, Agent 0 | `src/App.jsx`, `server/funktionen/daten.mjs`, `server/lib/*` | Datenkette frei für 16b/16c/48.3 |
| 8 | WP-19.0 Nachtrag 4 abschließen und mergen; G9 rebasen, Delta, Merge; Industrie rebasen und erstes Review | Opus Review, Sonnet Rebase | `src/App.jsx`, `server/lib/rechte.mjs`, `sicht.mjs`, `src/module/*` | M6/M7 entsperrt |
| 9 | Parallel ohne `App.jsx`: WP-S1 → WP-32d → WP-INSTANZ; G9S-1…4 | Sonnet, Opus-Review (Sicherheit) | `deploy/*`, `werkzeug/*`, `server/lib/abrechnung/*` | M2 bis 11.11. real. |
| 10 | WP-39 Nähte N1/N2 (½ Tag `App.jsx`-Stillstand), danach WP-I12a | Opus (Schnitt), Sonnet (mechanisches Verschieben) | `src/App.jsx`, `src/ansichten/*`, `src/gestalt/*`, `src/kern/*` | Zone aufgeteilt, MVP-Pfad frei |

Routing nach `MODELL-ROUTING.md`/ACC45-Regel: Opus für Sicherheit, Datenkette und Architektur; Sonnet für Umsetzung und Rebase;
Haiku nur für mechanische CI-/Statusarbeit; frische Delta-Agenten statt Wiederaufnahme großer Kontexte.

---

## 10. Annahmen (getrennt)

- A1 Leistung je Agent und Arbeitstag 10 / 6 / 3,5 PT; gemessener Bestwert 14 PT gilt nur für das Fenster 02./03.11.
- A2 Nacharbeitsaufschlag 1,0 / 1,3 / 1,5 (zwischen 14 % Zeilenanteil und 46 % Commitanteil gemessen).
- A3 3 parallele Schreiber, keine Zunahme durch 7-Tage-Betrieb; 7-Tage-Leistung 0,85 je Kalendertag; externe Wartezeit × 1,4.
- A4 Alle externen Aufträge am 04.11. erteilt (nicht belegt); sonst verschieben sich M11/M12 1 : 1.
- A5 SI-P1…P8 5–9,5 PT, Aufbewahrungsfristen 0,5–1,5 PT, M4-Abdruck 0,25–0,5 PT, Deployment-Rest 0,75–1,5 PT, WP-30b 1,5–3 PT,
  Interne Prüfung Rest 0,5–1,5 PT, WP-VERTRAG mit E-34 Wartezeit 1–5 AT, Hauptwebsite Betreiberhandlung 1–3 AT — eigene Schätzungen.
- A6 WP-I35 (bedingt, 15–28 PT) und WP-48.8 (5–8 PT, optional) nicht im Rest.
- A7 Die Simulation kennt keinen Integrator-Engpass und keine Konfliktnacharbeit zwischen Branches; Merge-Fenster real 2–4 AT.
- A8 Meilenstein 4 misst technische Startbereitschaft; das Startdatum 24.12. ist Betreiberwahl.

## Anhang – Reproduzierbarkeit

Szenario-Skript (nicht im Repository): baut die Paketliste aus `work-packages.json`, wendet die Korrekturen aus §3 an, ergänzt die
Pakete aus §1.4 mit Abhängigkeiten und Konfliktzonen sowie Meilenstein-Pseudopakete (0 PT) und ruft `simulieren()` und
`arbeitstag()` aus `werkzeug/acc45-backlog.mjs` auf. „Vorrang Pilotpfad“ = künstlicher externer Nachfolger mit 1 000 AT Wartezeit
für die Pakete des Pilotpfads (hebt deren Restkette im Vorrang). Technische Meilensteine (6–9) aus einem Lauf ohne externe Pakete,
übrige aus dem Gesamtlauf. Konfliktmatrix: `git merge-tree --write-tree --name-only <a> <b>` für 19 Refs paarweise.
