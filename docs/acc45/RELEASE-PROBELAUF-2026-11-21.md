# Release-Probelauf 2026-11-21 (REL-1, nur lesend)

Lesender Online-Lauf von `werkzeug/release-pruefung.mjs` gegen den Kopf von `integration/release-v4`. Ziel: Wo steht
ein Release heute, und was blockiert je Gate? Erwartet war NO-GO. Das Ergebnis ist NO-GO in allen zehn Gates.

Dieser Lauf ist **keine** Vorprüfung im Sinn von [RELEASE-PROZESS.md](RELEASE-PROZESS.md) §4 Phase 0: Der Kandidat ist
kein Commit auf `main`, es gibt kein Bild, keinen Digest, keine Bildangaben und keine Freigabedatei.

## 1. Aufruf

| Angabe | Wert |
|---|---|
| Zeit (UTC, echte Uhr) | Start 2026-11-21T02:25:02Z, Ende 2026-11-21T02:45:51Z |
| Modus | online, `uebersteuert: false` |
| Kandidat | `8e67ac0ead6eddd762b981164111265f11c23b26` (Kopf `integration/release-v4`, Merge #427) |
| Basis | `274bfa0baca5681f383eea334aab69875f31d5c1` (Zeile `aktiv` in `deploy/FREIGEGEBENE-IMAGES.md`) |
| Release-ID | `v4-probe` (Probe; keine Freigabedatei) |
| Digest, `--bild-info`, `--nachweise` | nicht angegeben (es gibt kein Bild des Kandidaten) |
| Werkzeugstand | `werkzeug/release-pruefung.mjs` aus dem Kandidaten (`git show 8e67ac0e:…`), also ohne die Änderungen dieses Branches |
| Zugriffe | git lokal lesend; `gh api` nur GET (Check-Runs, PRs, PR-Commits, Reviews, Commit→PR). Kein Push, kein Schreiben auf GitHub, kein VPS |
| Ergebnis | `gesamt: NO-GO`, Exit 1, `vorpruefungOk: false` |

Befehl (sinngemäß, aus dem Worktree):

    node rp-kandidat.mjs --wurzel . --kandidat 8e67ac0e… --basis 274bfa0b… --release-id v4-probe

Umfang des Pakets laut Werkzeug: 2012 Commits im Bereich `274bfa0..8e67ac0e`, 384 PRs, 149 Commits ohne bestätigten PR.
Die Rohausgabe (JSON) ist nicht eingecheckt: Sie listet 366 manuelle Bestätigungen und alle PR-Nummern; Geheimnisse
enthält sie nicht. Sie lässt sich mit demselben Aufruf jederzeit neu erzeugen.

Die Änderungen dieses Branches (N1, G8-Verweis `ssotPakete`) ändern das Ergebnis nicht: Der Kandidat enthält keinen Pfad
mit Steuerzeichen, und seine `RELEASE-UNFERTIG.json` hat noch kein Feld `ssotPakete`.

## 2. Ergebnis je Gate

| Gate | Ergebnis | Grund (Werkzeugausgabe, gekürzt) |
|---|---|---|
| G1 CI | NO-GO | Pflicht-Checks `pruefen`, `browser-abnahme`, `compose` zum Prüfzeitpunkt `in_progress`; die übrigen acht `success`. Nachabfrage nach dem Lauf: `pruefen` und `browser-abnahme` jetzt `success`; `compose` meldet weiter `status: in_progress` mit `conclusion: success` und gesetzter Endzeit (Lauf 136694019958) — ein widersprüchlicher GitHub-Zustand, den G1 richtig als nicht abgeschlossen wertet |
| G2 Review | NO-GO | 217 PRs ohne maschinell prüfbaren Review-Beleg (Liste in `manuelleBestaetigungen`); 149 Commits ohne PR im Paket. 167 PRs sind belegt (SSOT-Stufe reviewt, `REVIEW-NACHWEIS*.md`, GitHub-Review) |
| G3 Schalter | NO-GO | einziger Grund: Freigabedatei ohne `vorlagenHashes` (Vorlagenbindung, Endprüfung). Die Grammatik-Prüfung ist sauber: 5 Vorlagen gelesen, 76 `CENTRIC_`-Namen im Server-Code, alle klassifiziert, `IMPORT_DATEI_AKTIV = false`, kein Schalter und keine unfertige Funktion aktiv |
| G4 Bild | NO-GO | Digest fehlt; Bildangaben (`--bild-info`) fehlen |
| G5 Migration | NO-GO | gegenüber der Basis geändert oder neu: W-1 bis W-9 und der Startblock (`server.mjs`); NO-GO bis `migration.freigegeben` in der Freigabedatei |
| G6 Sicherung | NO-GO | Nachweise `letzte-erfolgreiche.json`, `probe-status.json`, `widerrufbuch-probe-status.json` fehlen |
| G7 Rückweg | NO-GO | `rueckweg.strategie` fehlt (keine Freigabedatei) |
| G8 Pakete | NO-GO | 14 P0/P1-Pakete nicht fertig, aber mit PR im Kandidaten: WP-16 (#85), WP-19 (#234, #243, #244, #247, #249, #359), WP-21 (#183, #192, #211, #213, #258), WP-16c P0 (#223), WP-48 P0 (#87, #224, #271, #322, #341, #342, #346, #348, #350, #351), WP-14c (#368), WP-19.3 (#234), WP-19.5 (#359), WP-19.6 (#359), WP-19.13 (#243), E-9 (#353), OPT-4 (#182), WP-ST1 (#279, #299), REL-1 (#427) |
| G9 Befunde | NO-GO | offene P0/P1-Befunde: WP-14c, WP-07b, ABN-A2, ABN-S2 |
| G10 Freigabe | NO-GO | HEAD nicht auf `origin/main` (Kandidat ist kein `main`-Commit); Freigabedatei `docs/acc45/releases/v4-probe.freigabe.json` fehlt |

## 3. Blockaden: technisch lösbar oder Betreiberhandlung

Einordnung als Bewertung des Bearbeiters, nicht als Entscheidung. „Technisch“ heißt: Claude kann es ohne Freigabe im
Repository erledigen. „Betreiber“ heißt: Freigabe, Handlung am System oder Entscheidung nötig.

| Gate | Blockade | Art | Nächster Schritt |
|---|---|---|---|
| G1 | Checks auf dem Kopf noch nicht abgeschlossen; `compose` in widersprüchlichem Zustand | technisch | Lauf auf dem echten Kandidaten (`main`) neu abwarten; bleibt `compose` hängen, den Lauf neu anstoßen (nur Prüf-Workflow, kein Deploy) |
| G2 | 217 PRs ohne prüfbaren Beleg | teils technisch | Beleglage nacharbeiten: SSOT-Stufe `reviewt` und Tabellen in `REVIEW-NACHWEIS*.md` dort ergänzen, wo ein Review tatsächlich stattfand (nur mit echtem Beleg, nichts erfinden). Rest: Betreiber bestätigt in `reviewBestaetigt` |
| G2 | 149 Commits ohne PR (frühere Direkt-Merges, `DIREKTMERGE-ABGLEICH-2026-11-13.md`) | Betreiber | `akzeptierteCommits` mit Grund je Commit (volle 40 Zeichen); vorbereitende Liste kann Claude erstellen |
| G3 | `vorlagenHashes` fehlen | Betreiber (vorbereitet technisch) | Claude erzeugt die Hashes mit `--vorlagen-hashes --kandidat <main-commit> --basis 274bfa0…`; der Betreiber quittiert sie in der Freigabedatei |
| G4 | kein Bild, kein Digest, keine Bildangaben | Betreiber | Kandidat nach `main` (B-9, Claude per PR), Bildbau „Auslieferung“ mit `bauen=true`, `ausliefern=false` (P3-2, Auslösung durch den Betreiber); danach Bildangaben per `docker buildx imagetools inspect` (REL-3) |
| G5 | W-1 bis W-9 und Startblock geändert | Betreiber | Migrationsfreigabe in der Freigabedatei (`migration.freigegeben`, `abgedeckt`, Probebericht); Grundlage `PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md` §3.2 |
| G6 | Sicherungs- und Probe-Nachweise fehlen | Betreiber | Sicherung außer Haus (< 26 h), Restore-Probe und Widerrufbuch-Probe (< 35 Tage), vor dem ersten Wechsel K0–K11; drei Statusdateien ohne Personendaten unter `docs/acc45/releases/<id>/nachweise/` |
| G7 | Rückweg nicht festgelegt | Betreiber | `rueckweg.strategie` sowie O-1/O-2 in der Freigabedatei |
| G8 | 14 unfertige P0/P1-Pakete im Kandidaten | teils technisch, teils Betreiber | technisch: Pakete fertigstellen und SSOT ehrlich nachziehen (z. B. WP-14c, REL-1 nach Review/Merge, WP-16/16c Abschluss). Betreiber: `akzeptiertePakete` mit Grund für Pakete, deren Code nur hinter Schalter AUS liegt (z. B. WP-48 hinter `CENTRIC_TEILSPEICHERUNG`), oder Entscheidungen (E-9, OPT-4, WP-19-Module). Kein Teil-Release (§2) |
| G9 | WP-14c, WP-07b, ABN-A2, ABN-S2 offen | teils technisch, teils Betreiber | WP-14c, WP-07b: Review abschließen, Status nachziehen. ABN-A2, ABN-S2: Code-Korrektur oder `akzeptierteBefunde` mit Grund |
| G10 | Kandidat nicht auf `main`, keine Freigabedatei | Betreiber | Listen-PR (Claude), Merge und Freigabedatei mit `basisCommit` (Betreiber); Branch-Schutz P3-3 als Voraussetzung für belastbare Belege |

**Kurzfassung.** Technisch ohne Freigabe lösbar: G1 (abwarten/neu anstoßen), Teile von G2 (Belege nacharbeiten), Teile
von G8 und G9 (Pakete abschließen, SSOT ehrlich nachziehen) und die Vorbereitung von G3 und G2-Listen. Betreiberhandlung
nötig: G4 (Bildbau auslösen), G5 (Migrationsfreigabe), G6 (Sicherung und Proben), G7 (Rückweg), G10 (Freigabedatei,
Merge nach `main`), dazu die Annahmen in G2, G8 und G9. Kein Gate ist im jetzigen Stand allein durch Claude auf GO zu
bringen.

## 4. Beobachtungen zum Werkzeug

1. G1 wertet einen Check-Run mit `status: in_progress` trotz `conclusion: success` als nicht abgeschlossen — richtig
   (fail-closed). Bei einem echten Kandidaten den Lauf vorher prüfen.
2. G3 hat ohne Freigabedatei nur den Bindungsgrund; die zweite Schicht (Grammatik, Schalterwerte) ist auf dem echten
   Stand ohne Fehlalarm.
3. Laufzeit online etwa 21 Minuten für 384 PRs (viele `gh api`-Abfragen). Für den Gate-Job (REL-2, Anhang A.2) ist die
   Zeitgrenze des Jobs darauf auszulegen.
