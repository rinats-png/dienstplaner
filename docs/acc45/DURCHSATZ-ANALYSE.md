# Durchsatz-Analyse der Entwicklungsorganisation (2026-11-13)

Auftrag des Betreibers vom 2026-11-13: maximalen **nachhaltigen** Durchsatz erreichen, ohne Sicherheit, Testabdeckung, Codequalität oder Nachvollziehbarkeit zu schwächen.
Dieses Dokument ist (A) die belegte Analyse. (B) ist das Werkzeug `werkzeug/durchsatz.mjs` mit dem erzeugten [DURCHSATZ-DASHBOARD.md](DURCHSATZ-DASHBOARD.md).
(C) sind die Prozessmaßnahmen (Abschnitt 6) und die Modellrouting-Bewertung (Abschnitt 7). Es wurde **kein Gate abgeschwächt**, kein SSOT-Dokument geändert, nichts gemergt.

## 0. Methode, Datenlage, Grenzen

- **Quelle:** `gh pr list --state all --limit 400` (279 PRs seit 2026-08-14, alle in einer Abfrage), je PR `gh api …/pulls/N/commits` und `gh api …/actions/runs?branch=…&event=pull_request` (nur lesend, ca. 530 Aufrufe, Zwischenspeicher im Scratchpad), `git log --remotes`, Git-Verlauf von `work-packages.json`.
- **Ausgewertet:** PRs mit Ziel `integration/release-v4` (189, davon 173 gemergt, 2026-11-07 bis 2026-11-13) und Ziel `integration/centric-complete` (74, davon 70 gemergt, 2026-11-02 bis 2026-11-05, der Vorläufer-Zweig, nur zum Vergleich). Die 11 PRs gegen `main` und Sonderzweige zählen nicht.
- **Zeiten** sind UTC. **Median, Bereich und n** stehen bei jedem Wert; „Proxy“ heißt: aus Näherungsdaten abgeleitet, nicht direkt gemessen.
- **Nicht messbar** wird ausdrücklich so genannt, mit Grund (Abschnitt 4, 5).
- **Vor dem 2026-11-07 gibt es für `release-v4` keine Daten** (Zweig neu). Ein 7-Tage-Vergleich über zwei Fenster nutzt deshalb beide Integrationszweige; fürs Fenster davor reichen die Daten nur knapp.
- **Commits sind nicht die Kennzahl.** Allein 95 Commits seit 2026-11-10 sind Lease-Erneuerungen auf `koordination/lease` (keine CI, kein Produktwert); 263 Commits seit 2026-11-01 tragen Review-/Befund-/Nachbesserungs-/Nachtrag-Wörter.
- Titelklassen nach Präfix (feature, fix, docs, ssot, test-infra, review, merge) sind grob; „fix“ ist selten (1 von 173), weil Fixes meist mit Paketkennung beginnen. Klassenzahlen daher nur als Größenordnung.

## 1. Messwerte (PRs gemergt auf `integration/release-v4`, soweit nicht anders genannt)

| Größe | Wert | n | Methode |
|---|---|---|---|
| Gemergte PRs je Kalendertag | 24,0 im Mittel (22 / 17 / 43 / 28 am 11-10 bis 11-13; 8 / 7 / 44 am 11-07 bis 11-09) | 173 | `mergedAt`, UTC-Tag |
| Davon Funktion (feature+fix) | 101 von 173 (58 %); SSOT 45 (26 %), test-infra 16, docs 11 | 173 | Titelpräfix |
| Durchlaufzeit angelegt → gemergt | Median 35,6 min, p90 210 min, Bereich 12 min – 19,3 h | 173 | `createdAt`, `mergedAt` |
| Vergleich `centric-complete` (11-02 bis 11-05) | Median 7,5 min, p90 37 min | 70 | wie oben |
| CI-Dauer „Prüfung“ (erster Start → letzter grüner Lauf auf gemergtem Kopf) | Median 17,7 min, p90 22,6 min, Bereich 7,7 – 63 min (Maximum enthält manuelle Wiederholungen) | 169 | Läufe Ereignis `pull_request` |
| CI-Dauer je Merge-Tag (Median) | 9,1 → 14,0 → 15,4 → 16,3 → 19,2 → 21,0 → 22,0 min (11-07 bis 11-13) | 8–44 je Tag | wie oben |
| Laufzeit erfolgreicher „Prüfung“-Läufe je Tag (Median / Maximum) | 11-09 15,1 / 16,8; 11-10 16,5 / 19,9; 11-11 19,3 / 20,6; 11-12 20,9 / 23,7; 11-13 21,1 / 23,5 min; `timeout-minutes` in `pruefung.yml` = **25** | 331 Läufe | `run_started_at` → `updated_at` |
| CI-Anteil an der Durchlaufzeit | Median 56 % | 169 | CI-Dauer / Durchlaufzeit |
| Zeit von grüner CI bis Merge | Median 4,5 min, p90 33 min | 169 | `updated_at` letzter grüner Lauf → `mergedAt` |
| CI-Warteschlange (Lauf angelegt → gestartet) | Median 0 s; 7 PRs über 5 min, Maximum 40 min | 173 | `created_at`, `run_started_at` |
| Fehlgeschlagene „Prüfung“-Läufe | 97 von 431 Läufen (22,5 %); 40 von 173 PRs (23 %) mit mindestens einem Fehlschlag; Median-Dauer eines Fehlschlags 4,0 min | 431 / 173 | Ergebnis `failure` |
| Fehlschläge nach Tag | 11-07: 39, 11-09: 32, übrige Tage 3–6 (73 % an zwei Tagen) | 97 | `created_at` |
| Commits nach Anlage (Nachbesserungs-Proxy, >5 min nach PR-Anlage) | 73 von 173 PRs (42 %) hatten mindestens einen; Median 0; vor 11-10 Median 1 (n = 63), seit 11-10 Median 0 (n = 110) | 173 | Committer-Datum, Proxy |
| Ein-Commit-PRs | 85 von 173 (49 %) | 173 | `commits`-Endpunkt |
| Geänderte Zeilen je PR | Median 243 (seit 11-10), Bereich 6 – 3252 | 110 | `additions + deletions` |
| Gleichzeitig offene PRs (Ziel `release-v4`) | 16 / 11 / 53 / 31 / 27 / 53 / 42 (11-07 bis 11-13) | 7 Tage | angelegt ≤ Tagesende, nicht vorher beendet |
| Abstand aufeinanderfolgender Merges | Median 0,5 h; 14 Abstände über 2 h (davon 3 über 10 h, nachts) | 172 | `mergedAt` sortiert |
| Ausführbare, unbearbeitete Pakete | 13 (plus 34 per Textmuster betreiber-/staging-blockiert) | 202 Pakete | Dashboard-Definition |

**Doppelte CI je Push.** `pruefung.yml` startet bei `push` auf jeden Zweig **und** bei `pull_request`. Stichprobe von 6 Kopf-Commits gemergter PRs (`gh run list --commit`): 5 mit je zwei vollen „Prüfung“-Läufen (18 – 24 min), 1 nur mit dem Push-Lauf. Die Wartezeit steigt dadurch nicht (Warteschlange 0 s), es werden aber Laufzeitminuten verdoppelt. Eine Umstellung ist eine Änderung der Gate-Konfiguration (Abschnitt 8, Entscheidung E1) und wurde nicht vorgenommen.

## 2. Kernmetrik: „korrekt integrierte, abnahmereife Funktionalität je Zeiteinheit“

**Operative Definition.** Zählung je Kalendertag (UTC):
(a) gemergte PRs mit Ziel `integration/release-v4` der Klassen **feature** und **fix**, ohne SSOT-, Doku-, Merge-, Review- und Infrastruktur-PRs; für 169 von 173 gemergten PRs ist ein grüner Lauf „Prüfung“ auf dem gemergten Kopf belegt, für 4 nicht (Ursache nicht untersucht: Direkt-Merge-Ersatz, anderer Ereignistyp oder Lauf außerhalb des Abfragefensters);
(b) Pakete, die in `work-packages.json` erstmals auf INTEGRATED/DONE gesetzt wurden, und solche mit erstmals `stufen.lokalGetestet.wert = true` (aus dem Git-Verlauf der Datei). (b) misst die **SSOT-Buchung** und hinkt der Integration hinterher.
Ausdrücklich **nicht** gezählt: Commits, Zeilen, geschlossene Tickets, SSOT-Rauschen.

**Gemessen.** (a) seit 2026-11-10: 101 PRs (feature+fix) in 4 Kalendertagen, also 25 je Tag; je Tag 12 / 7 / 27 / 10. (b) seit 2026-11-01: 89 Pakete erstmals INTEGRATED/DONE, 114 erstmals lokalGetestet (Tageswerte im Dashboard).
**Grenzen.** Ein PR ist keine feste Größe (Median 243 Zeilen, Maximum 3252); „abnahmereif“ im Sinn von Staging-geprüft und fachlich freigegeben (`stagingGeprueft`, `fachlichFreigegeben`) ist nicht erfasst, weil diese Stufen fast durchgängig noch nicht gesetzt sind. Die Kennzahl ist ein Durchsatzindikator, kein Fertigstellungsgrad.

## 3. Befund: wo geht die Zeit hin?

1. **Die CI ist der größte messbare Anteil der Durchlaufzeit** (Median 56 %, n = 169), und sie wird mit jedem Tag länger: 9,1 min (11-07) → 22,0 min (11-13). Ursache laut Daten: die Kette `pruefung` hat 170 Skripte, jedes startet vitest einzeln; die Länge wächst mit jedem neuen Paket. Der Maximalwert erfolgreicher Läufe (23,7 min am 11-12) liegt **1,3 min unter dem Timeout von 25 min**. Wächst die Kette weiter, scheitern gültige PRs an der Zeit, nicht am Test. Das ist der dringlichste messbare Engpass (Entscheidung E2).
2. **Fehlschläge sind teuer, aber meist früh und vermeidbar:** Ein Fehlschlag dauert Median 4 min, kostet aber die ganze Wiederholung (rund 20 min) plus Wartezeit. Von 91 Fehlschlägen der „Prüfung“ mit bekannter Stelle (je Lauf `…/jobs`, nur lesend) liegen **53 (58 %)** an Stellen, die lokal in Sekunden bis Minuten prüfbar sind: Typen 23, Verdrahtung der Prüfdateien 11, ACC45-Status 10, Dokumentation 8, Linter 1. Die übrigen verteilen sich auf Fachprüfungen (Schreib-Halt 6, Rechte 5, Sitzungsbindung 4 und weitere, je 1–3). Hinzu kommen Fehlschläge der anderen Workflows (Sicherheit 29, Lieferkette 22, Betriebs-Sicherung 30 Läufe); „Bild bauen“ scheitert in zwei Workflows 41-mal, vermutlich dieselbe Ursache je Commit (nicht einzeln geprüft).
3. **Die Fehlschläge stecken in zwei Tagen** (11-07: 39, 11-09: 32). Das fällt mit der Konfliktwelle bei `package.json` und den Flake-Korrekturen zusammen (Abschnitt 5), ist aber ein zeitliches Zusammentreffen, keine bewiesene Ursache.
4. **Nach grüner CI wartet ein PR wenig** (Median 4,5 min bis Merge). Wo Wartezeit auf Reviews steckt, ist aus GitHub nicht ablesbar (Abschnitt 4).
5. **Parallelität ist hoch** (11 bis 53 gleichzeitig offene PRs, Median 31, n = 7 Tage; Pearson-Korrelation mit den Konfliktauflösungen je Tag 0,86, n = 7 Tage, Proxy). Beide Größen steigen mit dem Gesamtvolumen; Kausalität ist daraus nicht ableitbar. Außerdem 8 der 13 ausführbaren Pakete tragen die Konfliktzone `App.jsx`: Parallelität wird durch Dateizonen begrenzt, nicht durch Agentenzahl.
6. **Kritischer Pfad:** Nach `STAGING-PLAN-V4.md` (Abschnitt 8.3) ist die **rechtliche Kette** (Dienstleister-AVVs, Kanzleifreigabe, 22 / 36 / 51 Arbeitstage, Betreiber- und Externwartezeit) deutlich länger als die technische (7 / 14 / 28 Arbeitstage). Mehr Paketdurchsatz verkürzt den Weg zu G1 nur bei den technischen Gliedern P1, P5, P6, P8, P12 und bei der Entlastung des Betreibers. Das sind geplante Schätzungen, keine Messwerte.

## 4. Was aus GitHub nicht messbar ist

| Größe | Status | Grund |
|---|---|---|
| Review-Wartezeit, Review-Dauer | **nicht messbar** | Unabhängige Reviews laufen über Subagenten, nicht als GitHub-Reviews; PR-Beschreibungen enthalten keine Zeitstempel dazu. Ab jetzt über die optionale Ereignisdatei (Abschnitt 9). |
| Korrekturrunden nach Review | **nicht messbar** (Proxy: Commits nach Anlage, siehe Abschnitt 1; Proxy 2: 263 Commits seit 2026-11-01 mit Review-/Befund-Wörtern, am häufigsten IMP-2 11, WP-19.0 10, IMP-1 8, WP-19 8, WP-16 7, SI-P6 6) | Der erste „FIX-NEEDED“ lässt sich aus Commits nicht ableiten; Betreffzeilen nennen nur teilweise Runden („nach drei Opus-Review-Runden“ WP-16c, „fünfter Opus-Delta-Review“ WP-19.0). |
| Merge-Konflikte je PR (`mergeable = CONFLICTING`) | **nicht messbar** | GitHub liefert den Zustand nur für offene PRs, nachträglich nicht. Proxy aus Git: siehe Abschnitt 5. |
| Leerlauf Betreiber vs. Agent | **nicht messbar** | Aus Merge-Zeitstempeln nicht trennbar; Merges verteilen sich über alle 24 Stunden UTC (Agenten laufen nachts). Qualitativ: Klasse C der `BEREITSCHAFTSANALYSE-2026-11-12.md` ist Betreiberwartezeit, Klasse A/V Agentenvorrat. |
| Meldungen „wartet auf eigene Hintergrundarbeit“ (Benachrichtigungsrauschen) | **nicht messbar** | Sitzungsprotokolle der Agenten sind dieser Auswertung nicht zugänglich; im Repository gibt es keine Spur. |
| Tatsächlich genutztes Modell je PR | **nicht messbar** | Es gibt kein Feld dafür; `work-packages.json` führt nur das **geplante** Modell. |
| Kollisionen „Branch gehört anderem Worktree“ | **nicht messbar** | Lokaler Git-Zustand, nicht im Repository; belegt ist nur der Lease-Mechanismus (95 Erneuerungs-Commits seit 11-10). |

## 5. Wiederkehrende Fehlerklassen (Evidenz, soweit vorhanden)

| # | Klasse | Evidenz | Lage |
|---|---|---|---|
| 1 | `package.json`-Kettenkonflikte | Git-Betreffzeilen: 5 „Kettenvereinigung/package.json: Kette“ und 9 „Merge … mit Auflösung“ seit 11-10; Einzelfälle: IMP-2, IMP-3, IMP-4 (11-09), Koordination (11-10), „Kette ordnen“ zweimal (11-13); `werkzeug/package-kette-vereinigen.cjs` existiert dafür. Proxy, kein Vollzähler. | Wächter in `prozess-wachen.test.js` (Eindeutigkeit, Kettenende, Zeilenenden); Ursache (eine Zeile für 170 Glieder) bleibt, siehe Maßnahme 5/E3 |
| 2 | Zeit-/uhrabhängige Tests | QS-2 (#246), QS-3, `fix/fachpruefung-datumsabhaengig` (11-04), Audit Zeitlogik (UTC- gegen Berliner Tag), QS-4. 92 von 361 Testdateien nutzen `Date.now()`/`new Date()` ohne feste Uhr (nicht jede ist ein Fehler). | Neue Dateien durch Wächter gedeckt, Bestand eingefroren |
| 3 | Zufallskollisionen | QS-5 (#285, `account-isolation.test.js`, Literal `"s1$"`). 33 Testdateien enthalten `not.toContain` mit höchstens 3 Zeichen. | wie 2 |
| 4 | CI-Flakes unter Last / Windows | `FLAKE-ACCOUNTANMELDUNG.md` (#126), `schreibhalt`-ELOOP-Wartezeit 80 → 400 ms, „Gegenprobe-Test entflackert“ (WP-28b/2). Eigene Beobachtung dieser Arbeit (ein Lauf, unter paralleler Last, Windows): `sicherung-ablage.test.js` 2 Fehlschläge bei 60-s-Zeitgrenze, `sicherungsschluessel-wiederherstellung.test.js` 1 Fehlschlag. Nicht reproduziert, kein Nachweis für CI. | bekannte Liste in Abschnitt 6 |
| 5 | Geheimnis-Scan | PR #90 und `18d81cf0` (Testmarken in `mail-push-produktion.test.js`), `df359ab5` (Testwert-Freigabe `ip-kuerzel.test.js`); Workflow „Sicherheit“, Schritte „Geheimnisse …“: 3 von 172 fehlgeschlagenen Läufen | Einzelfälle, Wiederholung selten |
| 6 | Veraltete PR-Basen | 25 Commits seit 11-01 der Form „Merge integration/release-v4 in …“ (Proxy: Basis nachgezogen). Nicht je PR ableitbar. | Proxy |
| 7 | Tests mit geteiltem Zustand/Reihenfolge (Stempeluhr) | **nicht messbar** als eigene Klasse; nur die Flake-Fixes aus 4 (Fortschreib-Reihenfolge der Sitzungsaktivität, #126) sind belegt. | nicht messbar |
| 8 | Agent meldet wiederholt „wartet auf eigene Hintergrundarbeit“ | nicht messbar (Abschnitt 4) | – |
| 9 | Worktree-/Branch-Kollisionen | nicht messbar (Abschnitt 4) | – |
| 10 | #273 durch #275 ersetzt (Verlauf im Geheimnis-Scan) | #273 angelegt 09:54 UTC, nach 8 min geschlossen mit dem Kommentar „Ersetzt durch den neuen PR (zusammengefasste Historie, Geheimnisscan)“; #275 am selben Tag 13:00 UTC gemergt, also rund 3 h nach #273. Einzelfall, n = 1. | Einzelfall; Maßnahme 2 (frühe Risikoliste) deckt Historie/Geheimnisse mit ab |

## 6. Prozessmaßnahmen (C), bewertet nach Nutzen, Aufwand, Risiko, Evidenz

Bewertung: **umgesetzt** = in diesem PR, vollständig getestet; **empfohlen** = Vorschlag, wirkt auf Regeln und ist Betreiberentscheidung.

| # | Maßnahme | Nutzen | Aufwand | Risiko | Evidenz | Empfehlung |
|---|---|---|---|---|---|---|
| 1 | Verbindlicher Umsetzungsvertrag vor komplexen Paketen | mittel: macht Review-Klasse und Tests vorab explizit, verhindert Rückfragen | gering (eine Seite, 10 min) | keines für Gates; Gefahr von Formalismus bei kleinen Paketen | 42 PRs mit CI-Fehlschlag, 263 Review-/Befund-Commits; Nutzen für die einzelne Schleife **nicht gemessen** | **umgesetzt als Vorlage** (`UMSETZUNGSVERTRAG-VORLAGE.md`), nur für komplexe Pakete |
| 2 | Frühe Erkennung von Sicherheits-/Datenintegritätsrisiken (Auslöser: `rechte.mjs`, `schutz.mjs`, Auth, Teilweg/Protokoll, historische Daten → Review-Klasse Sicherheit, Opus unabhängig) | hoch für Qualität, kein Durchsatzgewinn | gering | keines | `MODELL-ROUTING.md` deckt es bereits; Opus-Reviews fanden mehrfach „hoch“-Befunde (SI-P6 B1, WP-I13/I15 Befunde 1–12) | **umgesetzt als Abschnitt 5 der Vorlage**; keine neue Regel, nur früher festgelegt |
| 3 | Schnelle lokale Prüfung vor der vollen CI | hoch: 58 % der Fehlschläge der „Prüfung“ lagen an lokal prüfbaren Stellen | gering | falsche Sicherheit, wenn sie als Ersatz der CI gilt | Abschnitt 3, Messung siehe unten | **umgesetzt** (`npm run pruefung:schnell`); ersetzt die volle CI nicht |
| 4 | Frühere Review-Vorbereitung (Reviewer startet auf dem PR-Kopf, während die CI läuft) | potenziell hoch: CI ist 56 % der Durchlaufzeit, Review könnte in dieser Zeit laufen | gering (Ablaufregel) | Review auf einem Kopf, der sich noch ändert; Regel: Reviewer nennt den geprüften Commit (`headRefOid`), nach Nachbesserung nur Delta und Gegenprobe | Review-Wartezeit **nicht messbar**, Nutzen daher nicht belegt | **empfohlen**, Betreiberentscheidung E4; messbar machen über Ereignisdatei, dann nach zwei Wochen prüfen |
| 5 | Gemeinsame Regressionstests für wiederkehrende Fehlerklassen | mittel: fängt Kettenfehler, gemischte Zeilenenden, neue uhr-/kollisionsanfällige Tests | gering | Fehlalarme; deshalb nur neue Dateien, Bestand eingefroren mit Begründung | Klassen 1 bis 3 | **umgesetzt** (`pruefungen/prozess-wachen.test.js`, 14 Tests). Nicht umgesetzt: allgemeines Scannen von Bestandsdateien (92 und 33 Treffer wären eine Fehlalarmflut). |
| 6 | Automatische Auswahl unabhängiger ausführbarer Pakete | mittel: Koordinator sieht Vorrat und Konfliktzonen | gering (Auflistung) | Heuristik für Betreiberblockade ist Textmuster | 13 ausführbar, 34 per Textmuster ausgeschlossen | **umgesetzt als Liste im Dashboard** (nur Anzeige, keine Zuweisung) |
| 7 | Weniger administrative PRs (SSOT je Tag/Welle statt je PR) | hoch: 45 von 173 gemergten PRs (26 %) sind SSOT, je Median 19,1 min CI | gering | Drift zwischen Code und SSOT größer; Nachvollziehbarkeit je PR leidet, wenn Belege fehlen | 45 SSOT-PRs; `ssot-nach-integration.mjs` existiert | **empfohlen, Betreiberentscheidung E5** (ändert Prozess, schwächt kein Gate): SSOT je Welle, `werkzeug/ssot-nach-integration.mjs` und `ssot-abgleich.mjs` bleiben Pflicht, Abgleich vor jedem Release |
| 8 | Priorisierung nach kritischem Release-Pfad statt Paketzahl | hoch für Zeit bis G1 | gering | keines | `STAGING-PLAN-V4.md` 8.3: rechtliche Kette dominiert | **empfohlen**: Auflistungen sortieren nach „liegt auf dem kritischen Pfad (P1, P5, P6, P8, P12, E-32, WP-36, E-18)“ vor Paketzahl; kein Schemawechsel nötig, das Feld `prio` genügt; Entscheidung E6 |

**Schnellprüfung, gemessen.** Ein Lauf von `npm run pruefung:schnell` auf dieser Windows-Maschine am 2026-11-13, **während andere Agentenläufe parallel liefen** (n = 1, Zeiten daher mit Streuung): Lint nur geänderter Dateien 44,5 s, Typen 57,3 s, CI-Abdeckung 21,3 s, Verdrahtung 46,8 s, ACC45-Status 39,1 s, Dokumentation 14,2 s, Prozesswächter 34,9 s, Tests der Änderungen (5 Dateien) 88,5 s, **gesamt 347 s**. Ein erster Versuch mit vollem `eslint .` brauchte allein 126,6 s für den Lint (gesamt über 250 s bis zum ersten Abbruch); die Verdrahtungsprüfung scheiterte dort an der vitest-Standardzeitgrenze von 5 s unter Last, deshalb setzt das Werkzeug `--testTimeout=120000`. **Nicht gemessen:** ein lokaler Lauf der vollen Kette `npm run pruefung` (170 Skripte) und der Vergleich mit der CI auf derselben Maschine. Die CI braucht für einen grünen Lauf Median 21,1 min (11-13, Linux-Läufer); ein Zeitgewinn pro PR lässt sich daraus nicht berechnen, belegt ist nur: die Schnellprüfung deckt die Schritte ab, an denen 58 % der Fehlschläge lagen, und kostet rund 6 Minuten statt eines verlorenen CI-Laufs von rund 20 Minuten.
Bekannte umgebungsabhängige Tests (nur Hinweis, keine Ausnahme, keine Auslassung in der CI): `pruefungen/sicherung-ablage.test.js` und `pruefungen/sicherungsschluessel-wiederherstellung.test.js` (60-s-Zeitgrenzen, siehe Abschnitt 5, Klasse 4). `vitest --changed` wählt bei geänderter `package.json` alle 362 Testdateien (gemessen: sonst 2); `pruefung:schnell` ignoriert deshalb `package.json`, Lockfile, Workflow und `docs/` als Auslöser.
Grenze: Tests, die Dateien nur zur Laufzeit lesen, hängen nicht im Importgraphen und werden nicht erkannt. Die volle CI auf dem exakten Commit bleibt vor jedem Merge Pflicht.

**Ungenutzte Hebel mit Messbelegen (alle Gate-berührend, nicht umgesetzt):**
- CI in parallele Jobs aufteilen (Matrix) oder Gruppen bilden: größter Hebel gegen die Laufzeit (Abschnitt 3, Punkt 1). Ändert Namen der Pflichtprüfungen, Branch-Schutz ist Betreiberaufgabe, Entscheidung E2.
- `push`-Trigger auf Zweige ohne PR begrenzen: halbiert Laufzeitminuten, nicht die Wartezeit (E1).

## 7. Modellrouting-Bewertung

**Bestehende Regel** (`MODELL-ROUTING.md`): Opus für kritische Architektur, Sicherheit, Datenintegrität, Nebenläufigkeit und **unabhängige Reviews sicherheits-/datenschutzkritischer Änderungen**; Sonnet für normale Entwicklung, Standardtests, begrenzte Fixes; Haiku nur für klar mechanische Aufgaben.

**Evidenz.**
- Geplantes Modell in `work-packages.json` (202 Pakete): opus 68, sonnet 78, „sonnet + opus-review“ 14, haiku 3, übrige gemischt oder leer (35 ohne Angabe). Das ist die **Planung**; tatsächlich genutzte Modelle sind **nicht messbar**.
- Pakete mit Plan `opus` ohne erkennbaren Sicherheits-/Daten-/Rechtebezug im Titel (Textmuster, Proxy): 16 von 68, darunter Branchenmodule (WP-19.2, 19.3, 19.6, 19.9), WP-I11, WP-I16, WP-24. Ob dort Opus nötig war, ist aus den Daten **nicht entscheidbar**; die Modul-Pakete laufen laut Regel bei Sonnet, wenn kein Sicherheits-/Datenintegritätsanteil besteht.
- Nachbesserungen nach unabhängigen Opus-Reviews: WP-16c (drei Runden), WP-19.0 (fünf Delta-Reviews, PR #82), WP-I13/I15 (Befunde 1–12, Delta-Review 1–12), SI-P6 (Befunde B1–B4, hoch), SI-P1 (Re-Review), IMP-2 (Review #123, Nachreview, `imp-2-fix6`). Wer die Erstfassung schrieb, ist aus den Commits nicht ablesbar; **ob Sonnet-Ausgaben Nacharbeit brauchten, ist nicht messbar**. Belegt ist nur: die unabhängigen Opus-Reviews haben wiederholt echte Befunde der Schwere „hoch“ in sicherheitsrelevanten Paketen gefunden.
- Beobachtete Agentenkosten (Meldungen „wartet auf eigene Hintergrundarbeit“, Wiederaufnahme großer Kontexte): nicht messbar. Regel zur Kontextdisziplin steht bereits in `MODELL-ROUTING.md` und in der Speicherregel „frische Delta-Agenten“.

**Empfehlung (konkret, kein Herabstufen sicherheitskritischer Reviews):**
1. Unabhängige Reviews der Klasse Sicherheit/Datenintegrität bleiben **ausnahmslos Opus** und unabhängig vom Autor.
2. Autor-Modell nach Vertrag (Vorlage, Abschnitt 5) vor Beginn festlegen; im PR-Text festhalten („Autor: Sonnet, Review: Opus“), damit „tatsächlich genutztes Modell“ künftig aus der PR-Beschreibung zählbar ist (kostenfrei, kein Werkzeug nötig).
3. Delta-Reviews nach Nachbesserung auf dem Modell der Erstprüfung, aber mit frischem Agenten und nur dem Delta.
4. Haiku nur für Suche, Zusammenfassung, Doku-Klassifizierung und mechanische Umbenennungen, nie für Review oder Rechtelogik.
5. Nach vier Wochen Datenerhebung (PR-Text mit Autor/Review-Modell, Ereignisdatei) Sonnet-Anteil bei normalen Paketen und Korrekturrunden je Modell vergleichen, dann erst über Anpassung entscheiden. Heute reicht die Evidenz nicht für eine Umstellung.

## 8. Entscheidungen des Betreibers (alle optional, nichts davon ist umgesetzt)

| Nr. | Frage | Empfehlung |
|---|---|---|
| E1 | `push`-Trigger auf Zweige ohne offenen PR begrenzen (Laufzeitminuten halbieren). Berührt `pruefung.yml`-Trigger, nicht den Prüfumfang. | prüfen, nur wenn die erforderlichen Prüfungen am PR unverändert laufen |
| E2 | CI-Laufzeit: `timeout-minutes` (25) wird bald erreicht (Maximum erfolgreicher Läufe 23,7 min). Kurzfristig Timeout anheben und mittelfristig die Kette in parallele Jobs teilen. Berührt Namen der Pflichtprüfungen und damit den Branch-Schutz. | **dringend** (Messwert 1,3 min Reserve) |
| E3 | Kette `pruefung` in einer Zeile mit 170 Gliedern: Konfliktquelle. Struktur ändern (z. B. mehrere Gruppen-Skripte). | mit E2 zusammen planen |
| E4 | Review auf dem PR-Kopf beginnen, solange die CI läuft (Maßnahme 4). | ja, mit Messung über die Ereignisdatei |
| E5 | SSOT-Aktualisierung je Welle statt je PR (Maßnahme 7). | ja, Abgleich vor Release als Pflicht |
| E6 | Reihenfolge nach kritischem Pfad statt Paketzahl (Maßnahme 8). | ja |

## 9. Werkzeug und Messung ab jetzt

- `node werkzeug/durchsatz.mjs` erzeugt Markdown und schreibt `docs/acc45/DURCHSATZ-DASHBOARD.md` (Block `AUTO` mit Zeitstempel und Basis-Commit); `--json` liefert JSON; `--nicht-schreiben`, `--aktualisieren`, `--cache <Ordner>`. Nur lesende `gh`-Aufrufe, ein erster Lauf braucht etwa 530 Abfragen (danach Zwischenspeicher für beendete PRs).
- **Ereignisdatei** `docs/acc45/durchsatz-ereignisse.json` (JSON-Zeilen, eine Zeile je Ereignis, keine personenbezogenen Daten, Notiz höchstens 200 Zeichen, E-Mail-Adressen werden abgelehnt):
  `{"ts":"2026-11-13T10:00:00.000Z","pr":285,"art":"review-start","notiz":"Opus, unabhängig"}`. Arten: `review-start`, `review-ende`, `korrekturrunde`, `fehler-nachtraeglich`.
  Eintrag: `node werkzeug/durchsatz.mjs ereignis --pr N --art review-start|review-ende|korrekturrunde|fehler-nachtraeglich --notiz "…"`. Review-Dauer = `review-start` bis nächstes `review-ende` je PR.
- **Ausführbar-Definition** (Proxy): Status READY, IN_PROGRESS oder BLOCKED; alle Abhängigkeiten INTEGRATED/DONE; kein offener PR im Feld `pr`; Notiz oder Akzeptanz nennt keine Betreiber-/Staging-/Extern-Blockade (Textmuster `BETREIBER_MUSTER` im Werkzeug).
- Tests: `npm run pruefung:durchsatz` (reine Rechenfunktionen mit Fixtures, kein Netz) und Prozess-Wächter, in `package.json` und `pruefung.yml` verdrahtet; `npm run pruefung:ci-abdeckung` besteht.
