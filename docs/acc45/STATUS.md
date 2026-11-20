# ACC45 – Status

Stand der Prosa: 2026-11-03 (Tag 2, Abend). **Alle Zahlen, Status und Statusstufen** stehen im erzeugten Block unten
und kommen ausschließlich aus [`work-packages.json`](work-packages.json) (einzige Quelle). Gesamtplan, kritische Pfade,
Wellen und Zeitprognosen: [`GESAMTPLAN.md`](GESAMTPLAN.md). Graph: [`DEPENDENCIES.md`](DEPENDENCIES.md).

Stränge: `acc45` (Audit-Pakete WP-01…WP-47, WP-42a), `folge` (Folgepakete aus Reviews: WP-07b, 14c, 16b, 24b, 27c, 28b,
47b, S1), `wp19` (WP-19.0…19.13, [`WP19-MODULPLAN.md`](WP19-MODULPLAN.md)), `intelligence` (WP-I1…I37,
[`INTELLIGENCE-ENTWICKLUNGSPLAN.md`](INTELLIGENCE-ENTWICKLUNGSPLAN.md)), `extern` (E-1…E-28 nach
[`EXTERNE-ABNAHMEN-UEBERGABE.md`](EXTERNE-ABNAHMEN-UEBERGABE.md), dazu E-17a Pentest-Vorlauf, E-21i Freigabe Intelligence,
E-24i Intelligence-Piloten).

Statusstufen je Paket: implementiert · lokal getestet · unabhängig reviewt · integriert (nur bei Merge in
`integration/centric-complete`) · Staging geprüft · fachlich/rechtlich freigegeben · produktiv. Werte `true`, `false`
oder `"teilweise"`, jeweils mit Beleg (PR, Commit, Nachweis). „Geplant“, „vorbereitet“ oder „spezifiziert“ ist nie
„fertig“.

<!-- AUTO:BEGIN -->
Erzeugt aus `docs/acc45/work-packages.json` (Schema 2) mit `node werkzeug/acc45-backlog.mjs status-schreiben` — nicht von Hand ändern.

**Pakete gesamt:** 232 · BLOCKED 89 · READY 17 · IN_PROGRESS 18 · REVIEW 8 · INTEGRATED 97 · DONE 3

| Strang | Pakete | BLOCKED | READY | IN_PROGRESS | REVIEW | INTEGRATED | DONE | offener Aufwand PT |
|---|---|---|---|---|---|---|---|---|
| ACC45 | 118 | 27 | 0 | 7 | 4 | 78 | 2 | 61,3–104,75 |
| WP-19-Module | 15 | 13 | 0 | 1 | 0 | 1 | 0 | 64,5–100,5 |
| Intelligence | 40 | 20 | 0 | 7 | 0 | 13 | 0 | 181–320 |
| Folgepakete | 24 | 11 | 1 | 3 | 4 | 5 | 0 | 26,2–46,3 |
| Extern/Entscheidungen | 35 | 18 | 16 | 0 | 0 | 0 | 1 | 20,35–46,1 |

Offener Entwicklungsaufwand (ohne extern, ohne bedingtes WP-I35): **333–571,55 PT**. Integrierte Pakete zählen nicht mehr mit (bis 2026-11-03 zählten sie bis DONE weiter); was ihnen fehlt, steht als Statusstufe und in den externen Paketen.

**Kritische Pfade** (offener Aufwand, Mitte der Spanne maßgeblich):

- gemeinsam: WP-I4 → WP-I5 → WP-I7 → WP-I8 → WP-I9 → WP-I34 → WP-I37 = **50–90 PT**
- ohne Intelligence: WP-19.1 → WP-19.2 → WP-19.3 → WP-19.13 → WP-42a → WP-42 = **22,5–35 PT**
- ACC45: WP-21 → WP-42a → WP-42 = **14–20 PT**
- Folgepakete: V4-1 → V4-2 → V4-3a → V4-3b → V4-6 = **9–16 PT**
- WP-19: WP-19.1 → WP-19.2 → WP-19.3 → WP-19.13 = **18,5–28,5 PT**
- Intelligence: WP-I4 → WP-I5 → WP-I7 → WP-I8 → WP-I9 → WP-I34 → WP-I37 = **50–90 PT**

### In Arbeit / Review

| Paket | Status | Branch | Notiz |
|---|---|---|---|
| WP-15 Selbstauskunft mit Freigabe und Stempelabgleich | REVIEW | `acc45/time/wp15-selbstauskunft-mit-freigabe-` | Abhängigkeit WP-14 integriert; Status von BLOCKED auf READY nachgeführt. Stand 2026-11-09: Code steht im Integrationsbranch, aber per Direkt-Merge ohne PR. Status daher REVIEW statt INTEGRATED, bis ein Merge-PR-Beleg nachgetragen oder der Koordinator entschieden hat. Abgleich 2026-11-12 (6c195b66, docs/acc45/BEREITSCHAFTSANALYSE-2026-11-12.md): Code integriert per Direkt-Merge 1c1a27e0 (feature/wp15-wp32d 3c492f3a), Einbindung 7cee8eaf; PR-Beleg fehlt. Offen: Browser-E2E, Selbstfreigabe Einpersonenbetrieb (F15-2, Betreiber). Abgleich 2026-11-13 (docs/acc45/DIREKTMERGE-ABGLEICH-2026-11-13.md, Betreiberentscheidung 2026-11-13 Punkt 2): Direkt-Merge anerkannt (alle fünf Bedingungen belegt, keine PR-Nummer); Status bleibt REVIEW wegen offener Abnahmekriterien. |
| WP-16 Pausen und Monatsabschluss | REVIEW | `acc45/time/wp16-pausen-und-monatsabschluss` | Kopf 1e1aac1. Teilumfang: Pausen, Monatsabschluss, vorläufiger Schutz (Wiederöffnen nach bestätigtem Lohnexport abgelehnt) — nur Zwischenlösung. Abnahmefähig erst mit WP-16c (P0). Folgepaket WP-16b (ältere Spur-Zeilen nennen den Tag). Abgleich 2026-11-12 (6c195b66, docs/acc45/BEREITSCHAFTSANALYSE-2026-11-12.md): Korrektur: WP-16 kam nicht per Direkt-Merge 594f32c, sondern über PR #85 (58432b75); der Nachweis liegt im Integrationsstand. Status bleibt REVIEW bis zur Koordinatorentscheidung (Betreibervorgabe: abnahmefähig erst mit WP-16c, dessen Kern ebenfalls im Code ist). Nachtrag 2026-11-18 (SSOT-Klassifizierung): Die Aussage „Delta-Review läuft“ ist veraltet. Der Status bleibt REVIEW wegen der offenen Entscheidung A-6 (wp16-nachweis.md: Lohnart 1200 Mehrarbeit als Kontostand oder als Delta je Monat, Abstimmung mit dem Lohnbüro) sowie der Betreibervorgabe, dass WP-16 erst mit WP-16c abnahmefähig ist. |
| WP-19 Branchenpakete (12 Module) | IN_PROGRESS | `acc45/frontend/wp19-branchenpakete` | Sammelpaket: aufgeteilt in WP-19.0 … WP-19.13 (WP19-MODULPLAN.md). Server-Teilumfang von sechs Modulen integriert (#44, #49), alle Module in der Registry „geplant“ (nicht einschaltbar). Stand (automatisch): Teilumfang nach #234, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). Stand (automatisch): Teilumfang nach #243, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). Stand (automatisch): Teilumfang nach #244 (Schreibwege der fünf älteren Module bei Status geplant geschlossen), Status bleibt IN_PROGRESS; von Hand korrigiert, weil das Werkzeug das Sammelpaket als INTEGRATED setzte. Stand (automatisch): INTEGRATED nach #247. Stand #249: Teilumfang (Oberfläche der Betriebsmittel und Kompetenzen zeigt bei Status geplant keine Schreibaktionen, WP-19-B5), Status bleibt IN_PROGRESS; von Hand korrigiert, weil das Werkzeug das Sammelpaket als INTEGRATED setzte. Nachtrag 2026-11-18 (SSOT-Klassifizierung): Status von INTEGRATED auf IN_PROGRESS zurückgesetzt (das Werkzeug ssot-nach-integration hatte das Sammelpaket nach #247 erneut auf INTEGRATED gesetzt, im Widerspruch zu dieser Notiz). Alle vier Stufen implementiert, lokalGetestet, reviewt und integriert stehen jetzt ausdrücklich auf „teilweise“, damit das Werkzeug auch PRs ohne „Teil“ im Titel nicht auf INTEGRATED setzt (wie bei WP-48). Stand #359 (72072ab0, 2026-11-18): Nachbesserung WP-19.5 und WP-19.6 (M-PQ1, M-BD2, N-1, N-2, N-BD3) integriert; Module bleiben geplant, kein Statuswechsel des Sammelpakets, Status bleibt IN_PROGRESS. |
| WP-40 Barrierefreiheit WCAG 2.2 AA | IN_PROGRESS | `acc45/frontend/wp40-barrierefreiheit-wcag-2-2-aa` | Stand 2026-11-09: REVIEW. Quelltext-Prüfung bestanden, Browser-Abnahme offen (Reflow 1.4.10, Zielgröße 2.5.8, Fokus 2.4.11, Fehlertext 3.3.1). Abgleich 2026-11-12 (6c195b66, docs/acc45/BEREITSCHAFTSANALYSE-2026-11-12.md): Browser lokal (abnahme-kern.mjs, 6203b0a): 2.5.8 und 3.3.1 ohne Befund; 1.4.10 Leitung 320 px Schublade/Verteilung 26 px Querscroll; 2.4.11 Leitung 320 px Tab-Stopps in geschlossener Schublade — seither visibility:hidden in src/ui/geraete.js, nicht nachgemessen. axe nicht installiert (WP-33). Stand nach #221 (Teil, docs/acc45/WP-40-BEFUNDE.md): 2.4.11 Fokus über scroll-padding behoben, 3.3.1 aria-describedby in Krankmeldung/Antrag, Korrektur nur offener Hinweis. Offen: Mitarbeiter bei 768 px Stempel/Korrektur Zeitüberschreitung (kein vollständiger Neulauf); 1.4.12, Zoom, Screenreader, axe, Safari, echte Geräte. Nachtrag 2026-11-13: PR #272 (Befund A-5, Strang A der Abnahme V4) hat die Rollenauswahl in Personal mit zugänglichem Namen versehen (axe-Regel select-name; src/ansichten/personal.jsx, pruefungen/personal-rollenauswahl-name.test.js). Teilbeitrag zu WP-40; Status unverändert. Nachtrag 2026-11-18: PR #345 (5598c0c8, P2-11a, Option A): Antragszeilen ohne verschachtelte Bedienelemente (nested-interactive); Ausnahme antraege-planer in e2e/axe-ausnahmen.json gestrichen; Browser-axe-Lauf (CI) ist das Gate, lokal nicht gelaufen. Teilbeitrag zu WP-40; Status bleibt IN_PROGRESS. Nachtrag 2026-11-19 (P2-11 Option A, Branch feat/wp40-wcag, PR #389 offen, nicht gemergt): alle 16 verbliebenen axe-Ausnahmen gestrichen, Ursachen im Quelltext behoben (Kontoknopf und Suchknopf der Kopfleiste, Monatsplan-Raster, Wochenliste, Personaleinsatz, Personal, Lagebild: zugänglicher Name enthält den sichtbaren Text; Mein Plan: Karte Zeiten bestätigen ohne Knopf im Knopf, damit auch target-size). Nur Markup/ARIA. Nachweis: pruefungen/wcag-wp40.test.js (P2-11), Playwright axe lokal nur 1024x768; Gate ist der Browser-axe-Lauf der CI an allen acht Viewports. Offen bleiben die übrigen WP-40-Punkte (1.4.12, Zoom, Screenreader, Safari, echte Geräte). Status bleibt IN_PROGRESS. |
| WP-16c Monatsabschluss: Korrekturrevisionen nach bestätigtem Lohnexport (Revision, Differenz, Korrekturexport, Freigabe, Audit) | REVIEW | `acc45/time/wp16c-korrekturrevisionen` | P0-Produktionsblocker (Betreiberentscheidung 2026-11-03), Sicherheitsklasse kritisch (Opus). Der Schutz in WP-16 (Wiederöffnen nach bestätigtem Lohnexport abgelehnt, Aktion „Lohnexport bestätigen“) ist nur Zwischenlösung; WP-16 ist erst mit WP-16c abnahmefähig. Rechtliche/buchhalterische Detailanforderungen: E-29. SCHÄTZUNG. Abgleich 2026-11-12 (6c195b66, docs/acc45/BEREITSCHAFTSANALYSE-2026-11-12.md): Kern im Code (Revisionen, Differenz, Korrekturexport, zweite Freigabe, verwerfen, keine Frist), Direkt-Merge 594f32c3, PR-Beleg fehlt. Lücke: Laufzeitmessung des Korrekturpfads 60/150/400 × 12/24/36 fehlt (wp16c-fragen.md L6; werkzeug/wp16-messung.mjs misst nur Abschluss/Freeze). Offen als Betreiberentscheidung/E-29: Fragen 1, 3, 5, 6, 7, R2, R7, L5. Stand nach #223 (Teil, docs/acc45/WP-16c-MESSUNG.md): Messung des Korrekturpfads 60/150/400 Personen, alle 9 Zellen auf Bibliotheksebene ohne Befund. Nicht gemessen: HTTP-Pfad, Offline-Stempel, Migration, VPS. Beobachtung: reine Ist-Zeit-Änderung ohne Planwirkung ergibt leere Differenz, weil Mehrarbeit nur bei positivem Konto entsteht – fachlich bestätigen. Status unverändert REVIEW. Abgleich 2026-11-13 (docs/acc45/DIREKTMERGE-ABGLEICH-2026-11-13.md, Betreiberentscheidung 2026-11-13 Punkt 2): Direkt-Merge anerkannt (alle fünf Bedingungen belegt, keine PR-Nummer); Status bleibt REVIEW wegen offener Abnahmekriterien. |
| WP-48 Sichere Teilspeicherung (Delta je Segment mit Versionen) und kurze Raumsperre beim Monatsabschluss | IN_PROGRESS | `acc45/docs/wp48-teilspeicherung-entwurf` | Betreiberentscheidung 2026-11-03: P0-Blocker für den vollen Produktivbetrieb. Entwurf erledigt (Dokument und Messskript, Branch acc45/docs/wp48-teilspeicherung-entwurf); Umsetzung in WP-48.1–48.7 und 48.9 laut Dokument, 48.1 und 48.2 können vor der Integration von WP-16 beginnen. (Überholt, Stand 2026-11-17: Status ist IN_PROGRESS; früher BLOCKED statt READY, weil die Prüfung READY nur mit integrierten Abhängigkeiten zulässt und WP-16 auf REVIEW stand.) GET-Fenster (WP-48.8) nicht im Aufwand, eigene Entscheidung. Fortschritt 2026-11-03: WP-48.1 (Prüfnetz: Rundweg je Rolle über den Positivkatalog, Rennen/Konflikte im Speicherkern, Mutantenwerkzeug werkzeug/wp48-mutanten.mjs) und WP-48.2 (Hash-Vermerk mit Lesen alter Text-Vermerke, Lesecache unter der Raumsperre, Segmentschreiber teileSchreiben, Epoche, Vermerk-Aufräumen) umgesetzt auf Branch acc45/backend/wp48-1-2-pruefnetz-speicherkern, ohne PR; Befund für 48.3: gespeicherte abgeleitete Personenfelder brechen die Rundweg-Invariante (Schichtverantwortung 403), siehe WP48-TEILSPEICHERUNG.md Abschnitt 7. Abgleich 2026-11-12 (6c195b66, docs/acc45/BEREITSCHAFTSANALYSE-2026-11-12.md): Korrektur: WP-48.1/48.2 sind nicht „ohne PR“, sondern über PR #87 (acc45/backend/wp48-integration) integriert; teileSchreiben hat im Produktcode keinen Aufrufer. 48.3 ist technisch ausführbar (WP-16 ist über PR #85 im Code), die SSOT sperrt nur formal; 48.4/48.5/48.8 hängen an den Entscheidungen in Abschnitt 6. Stand (automatisch): Teilumfang nach #224, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). Nachtrag 2026-11-13: PR #271 (WP-48-GB, Öffnen schreibt nicht mehr) ist ein Teilbeitrag; das Werkzeug setzte das Sammelpaket fälschlich auf INTEGRATED, von Hand zurückgenommen. Status bleibt IN_PROGRESS. Nachtrag 2026-11-17 (SSOT-Nachtrag KG-8, Abgleich gegen origin/integration/release-v4 @ bfa7a110): Belegt und integriert: 48.1/48.2 (#87), 48.3 Server-Teilweg (#224), WP-48-GB (#271), 48.7 Stufe a hinter ausgeschaltetem Schalter (#322, nicht aktiviert, Messung 60/150/400 × 12/24/36 steht aus). Das Werkzeug ssot-nach-integration würde #322 als INTEGRIERT lesen; das ist für dieses Sammelpaket falsch und wurde nicht übernommen. Status bleibt IN_PROGRESS; reviewt, stagingGeprueft, fachlichFreigegeben, produktiv unverändert nicht belegt. Stand (automatisch): Teilumfang nach #341, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). Stand (automatisch): Teilumfang nach #342, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). Stand (automatisch): Teilumfang nach #346, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). Nachtrag 2026-11-18 (SSOT-Nachtrag): #341 (5e4b23a1) 48.6 Teil: Schreibkette segmentproportional; #342 (5176cb8e) 48.5 Teil 1: Konfliktführung je Zelle/Feld als reine Logik; #346 (b29d780b) 48.4 Teil: Löschlauf-Endpunkt POST /api/loeschlauf (Server). Betreiberentscheidung 2026-11-18: 48.4 und 48.5 grundsätzlich freigegeben (P1-7 a bis e, Option A); produktive irreversible Löschungen und Aktivierung produktiver Schalter bleiben gesondert freigabepflichtig. Status bleibt IN_PROGRESS. Nachtrag 2026-11-18 (SSOT-Nachtrag b): Stand WP-48: Teilumfänge 48.1-48.3, 48.4 (Server #346 + Löschlauf-Knopf #350), 48.5 (Logik #342 + Oberfläche #348), 48.6, 48.7 Stufe a (#322) und Stufe b (#351) integriert; alle Schalter AUS. Offen: 48.8 (GET-Fenster, P1-7 (d) später), 48.9 (Staging-Messung, Phase D), Einschalten (gesonderte Betreiberfreigabe), Voll-PUT-Abschaltung später (P1-7 (c)). Leistungsziele: p95 < 1 s bei 400x36 nicht erreicht (Haltezeit Stufe b 0,77 s erreicht, Event-Loop-Block ca. 17 s nicht erreicht). Status bleibt IN_PROGRESS; stufen.integriert.wert ausdrücklich "teilweise", damit das Werkzeug ssot-nach-integration auch PRs ohne "Teil" im Titel nicht auf INTEGRATED setzt. |
| WP-14c Stempel-/Korrekturkette: Folgebefunde F2, F4–F8 aus dem WP-14b-Delta-Review | REVIEW | `acc45/time/wp14c-folgebefunde` | SCHÄTZUNG (nicht gemessen). F8 setzt WP-16 (pauseZuLang) voraus. Abgleich 2026-11-12 (6c195b66, docs/acc45/BEREITSCHAFTSANALYSE-2026-11-12.md): Code integriert per Direkt-Merge 594f32c3, PR-Beleg fehlt. F6 (ungeplanter 24-h-Einsatz, Fehlstempel verwerfen) bleibt Fachentscheidung (wp16c-fragen.md F6a/F6b). Abgleich 2026-11-13 (docs/acc45/DIREKTMERGE-ABGLEICH-2026-11-13.md, Betreiberentscheidung 2026-11-13 Punkt 2): Direkt-Merge nicht anerkannt: Review nur durch Aussage im Merge-Commit belegt, nachzuholen: Review. Nachholreview 2026-11-13 (docs/acc45/NACHHOLREVIEW-STEMPELKETTE-2026-11-13.md, Abschnitt 4): mit Auflage bestanden, reviewt teilweise. M-14c-1 (Pause gleich Anwesenheit in Altdaten nicht als Prüffall gekennzeichnet) ist nach dem Review im Integrationsbranch behoben (Merge #268, Pause gleich Anwesenheit wird Prüffall); ein Delta-Review der Behebung ist nicht dokumentiert, daher bleibt reviewt teilweise. Offen: F6 (Fachfrage F6a/F6b), Restrisiko F4 bei Altstempeln (N-14c-2), N-14c-3, Staging. Fragen an den Betreiber aus #268: (a) Soll es einen ausdrücklich bestätigten Tag mit 0 h Arbeitszeit (Pause gleich Anwesenheit) geben? (b) Sollen Altdaten-Prüffälle den Monatsabschluss blockieren? Direkt-Merge nach dem Review nicht als vollständig anerkannt, Status bleibt REVIEW. Nachtrag 2026-11-19 (SSOT-Nachtrag #368 bis #370): PR #368 gemergt (Merge 9fd6045f): Kennzeichnung 'zur Prüfung' an vier Stellen, istAbweichungen inhaltlich statt JSON.stringify, negative/zu lange/leere Pausen beim allgemeinen Speichern 422 PAUSE_UNGUELTIG, Altbestand unverändert. Offene Betreiberfrage P2-16 (siehe ENTSCHEIDUNGSLISTE.md). Restrisiken: Eigene Ansichten der Mitarbeiter zeigen die Kennzeichnung nicht; Pause einer Dienstart nicht geprüft; N-1: Korrektur auf Alteintrag mit pause '' übernimmt '' weiter. Status bleibt REVIEW (F6 offen, reviewt weiter teilweise). |
| WP-16b Spur: ältere Spur-Zeilen nennen noch den Tag (Datenschutz nach WP-14b M1) | REVIEW | `acc45/time/wp16b-spur-tag` | SCHÄTZUNG. Abgleich 2026-11-12 (6c195b66, docs/acc45/BEREITSCHAFTSANALYSE-2026-11-12.md): Code integriert per Direkt-Merge 594f32c3, PR-Beleg fehlt. Altzeilen beim Lesen geschwärzt (server/lib/schutz.mjs spurFuerBetreiber); offen nur die Frage, ob die Ablage zusätzlich bereinigt wird (wp16c-fragen.md). Abgleich 2026-11-13 (docs/acc45/DIREKTMERGE-ABGLEICH-2026-11-13.md, Betreiberentscheidung 2026-11-13 Punkt 2): Direkt-Merge nicht anerkannt: Review nur durch Aussage im Merge-Commit belegt, nachzuholen: Review. Nachholreview 2026-11-13 (docs/acc45/NACHHOLREVIEW-STEMPELKETTE-2026-11-13.md, Abschnitt 2): Direkt-Merge anerkannt für den Teilumfang (Bedingungen a bis e belegt), Status bleibt REVIEW; offen: Frage, ob die Ablage zusätzlich bereinigt wird, Staging. Nachtrag 2026-11-18 (SSOT-Klassifizierung): Status REVIEW (laut Nachholreview: keine Statusänderung über REVIEW hinaus). Direkt-Merge 594f32c3 ist anerkannt (Teilumfang, Bedingungen a bis e belegt). Offen: ob die Ablage zusätzlich bereinigt wird (wp16c-fragen.md) und Staging; stagingGeprueft, fachlichFreigegeben, produktiv: nein. |
| WP-28b Lasttest-Befund 6: Sicherung bricht unter Last mit ENOENT ab (Wiederholung greift nicht); Auswertung des Nachlaufs S2/S5 | IN_PROGRESS | `acc45/infra/wp28b-nachlauf` | Stand 2026-11-18 (Abend), maßgeblich vor den folgenden Sätzen: Der Befund 6 (ENOENT-Abbruch) ist seit PR #100 und #110 behoben und mit PR #362 (8895842c) zusätzlich abgesichert (wp28b-sicherung-klammer.test.js, Zustandstest der Klammer des Schreib-Halts mit Mutationen); die Lücke lag in der Prüfung, nicht im Code. Mit Schreib-Halt (WP-28c) liegt die Messung bei 1000 von 1000 bei 105 Schreibvorgängen/s. Offen bleibt: (1) Nachlauf S2/S5 (E-20, Handstart durch den Betreiber), (2) Docker-Bildbau und restic-Ende-zu-Ende in der CI nicht belegt, (3) ohne Schreib-Halt nur ein ruhiges Fenster. Die Akzeptanz (Nachlauf S2/S5 ausgewertet und in wp28-nachweis.md nachgetragen) ist nicht erfüllt, deshalb bleibt der Status IN_PROGRESS. Ältere Fassung der Notiz: NICHT ERLEDIGT, fail-closed Teilfix (PR #100). Unter Dauerlast gelingt die Sicherung ohne Schreib-Halt weiterhin nicht zuverlässig (ca. 17 Schreibvorgänge/s auf 3000 Dateien: 1 von 14; mit der Vorgabe-Ruhezeit von 1 s schon bei 8/s keine). Die Ruhezeit senkt das Risiko halber Mehrdatei-Transaktionen in der Sicherung, garantiert aber keine transaktionsübergreifende Konsistenz. Offen: (1) Nachlauf S2/S5 (E-20, Handstart durch den Betreiber); (2) nach Reparatur der CI-Basis (PR #102 / fix/ci-baseline) die blockierten Prüfungen nachholen: Docker-Bildbau, Betrieb-Sicherung-Ende-zu-Ende, die Fachprüfungen hinter dem Typen-Schritt; (3) Folgepaket WP-28c (koordinierter Schreib-Halt). Nachtrag 2026-11-18 (SSOT-Klassifizierung): Punkt (2) ist überholt oder unsicher: PR #102 (CI-Basis) ist gemergt (2026-11-07, integration/release-v4), die Bedingung „nach Reparatur der CI-Basis“ ist erfüllt; ob die blockierten Prüfungen (Docker-Bildbau, Betrieb-Sicherung-Ende-zu-Ende, Fachprüfungen hinter dem Typen-Schritt) inzwischen nachgeholt wurden, ist nicht belegt. Punkte (1) und (3) unverändert offen. |
| WP-07b Stempel-Sonderfall „500 nach Speicherung“ (clientEventId, sechs Szenarien) | REVIEW | `acc45/time/wp07b-500-nach-speicherung` | SCHÄTZUNG; Konfliktzone Stempelpfade: nicht gleichzeitig mit WP-14c/WP-19.7/WP-19.6. Abgleich 2026-11-12 (6c195b66, docs/acc45/BEREITSCHAFTSANALYSE-2026-11-12.md): Prüfung integriert per Direkt-Merge 594f32c3, PR-Beleg fehlt. Abgleich 2026-11-13 (docs/acc45/DIREKTMERGE-ABGLEICH-2026-11-13.md, Betreiberentscheidung 2026-11-13 Punkt 2): Direkt-Merge nicht anerkannt: Review nur durch Aussage im Merge-Commit belegt, nachzuholen: Review. Nachholreview 2026-11-13 (docs/acc45/NACHHOLREVIEW-STEMPELKETTE-2026-11-13.md, Abschnitt 3): Direkt-Merge anerkannt, Status bleibt REVIEW; offen: echter 500 nach dem Schreiben unter Last (Staging/VPS). Nachtrag 2026-11-18 (SSOT-Klassifizierung): Status REVIEW (laut Nachholreview: kein Paket wird INTEGRATED; Präzedenz WP-15 und WP-16c bleiben REVIEW). Direkt-Merge 594f32c3 ist anerkannt (Teilumfang, Betreiberregel 2026-11-13 Punkt 2). Restpunkt N-07b-1: echter 500 nach dem Schreiben unter Last (Last-500) auf Staging/VPS; stagingGeprueft, fachlichFreigegeben, produktiv: nein. |
| WP-19.13 WP-19 Modulabnahme (E2E, Viewports, Rollenmatrix, Status „vorlaeufig“) | IN_PROGRESS | `acc45/qa/wp19-13-modulabnahme` | Stand (automatisch): Teilumfang nach #243, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). |
| WP-I4 Interne Vorgaben: Verwaltung | IN_PROGRESS | `intelligence/wp-i4-interne-vorgaben-verwalt` | SCHÄTZUNG laut Plan (nicht belegt); Plan ist Vorschlag zur Freigabe (E-21i). Stand (automatisch): Teilumfang nach #256, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). Offene Betreiberfragen: (1) Darf die Planung die Vorgaben lesen und ändern? (2) Welche Betriebsratssicht, falls überhaupt (§ 87 BetrVG, BLOCKED auf Betreiber)? (3) Braucht es ein Protokoll für Löschen/Deaktivieren? (4) Tarif 'pro' = Grenze 25 des Business-Tarifs bestätigen? (5) Muss eine geänderte Vorgabe neu getestet werden (nur die Oberfläche erzwingt, nicht der Server)? Nachtrag 2026-11-18 (SSOT-Klassifizierung): Feld pr um #177 ergänzt (älterer Entwurf „Interne Vorgaben Verwaltung“, offen, nicht gemergt; der gemergte Teil ist #256). |
| WP-I19 Altplan-Übernahme (F7A) | IN_PROGRESS | `intelligence/wp-i19-altplan-ubernahme-f7a` | SCHÄTZUNG laut Plan (nicht belegt); Plan ist Vorschlag zur Freigabe (E-21i). Stand (automatisch): Teilumfang nach #236, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). |
| WP-I20 Ausfall-Vorschlag (F3) | IN_PROGRESS | `intelligence/wp-i20-ausfall-vorschlag-f3` | SCHÄTZUNG laut Plan (nicht belegt); Plan ist Vorschlag zur Freigabe (E-21i). Stand (automatisch): Teilumfang nach #222, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). Offen nach #222 (keine Verhaltensänderung im Rechenkern): Zeitumstellung (DST) bei Ruhezeit in Near-Miss/Spielraum gegenüber Befund als Engine-Frage; HTTP-Einbindung; Gateway-Text; Golden um Ruhezeit-/Folgegrenzen (#174). |
| WP-I24 F15 Änderungsübersicht | IN_PROGRESS | `intelligence/wp-i24-f15-anderungsubersicht` | SCHÄTZUNG laut Plan (nicht belegt); Plan ist Vorschlag zur Freigabe (E-21i). Stand (automatisch): Teilumfang nach #218, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). Offen nach #218 (docs/acc45/wp-i24-nachweis.md): Ablage des Seit-letztem-Besuch-Standes, HTTP-Einbindung von /ki, Sicht für Mitarbeitende, Gateway-Text, aenderung.art in den Rechenkern. PR #233: Browserfähigkeit der Anzeige hergestellt (byteLaenge statt Buffer.byteLength), Einhängepunkte offen (docs/acc45/INTELLIGENCE-UI.md). |
| WP-I29 Batch-Infrastruktur + F4, F11, F12 | IN_PROGRESS | `intelligence/wp-i29-batch-infrastruktur-f4-f` | SCHÄTZUNG laut Plan (nicht belegt); Plan ist Vorschlag zur Freigabe (E-21i). Stand (automatisch): Teilumfang nach #254, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). |
| WP-I30 F5 Nachrichten-Werkstatt | IN_PROGRESS | `intelligence/wp-i30-f5-nachrichten-werkstatt` | SCHÄTZUNG laut Plan (nicht belegt); Plan ist Vorschlag zur Freigabe (E-21i). Stand (automatisch): Teilumfang nach #250, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). |
| WP-I31 F6 Fragen an Daten | IN_PROGRESS | `intelligence/wp-i31-f6-fragen-an-daten` | SCHÄTZUNG laut Plan (nicht belegt); Plan ist Vorschlag zur Freigabe (E-21i). Stand (automatisch): Teilumfang nach #228, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). |
| WP-PILOT Pilotbetriebe A (Pflege) und B (Sicherheitsdienst): Erhebung, synthetische Testszenarien, Datenschutzrahmen | IN_PROGRESS | `acc45/docs/pilot-erhebung` | SCHÄTZUNG (nicht gemessen). Nur Doku und synthetische Testdaten-Definitionen; Seed-Umsetzung der Datensätze SD-P/SD-S: Teil gemergt über PR #229 (63133a5c, „synthetische Seeds SD-P und SD-S“, nur Testumgebung; frühere Aussage „fehlt noch“ überholt). Echtdaten erst nach Erfüllung aller Voraussetzungen der Stufe 3 im Datenschutzrahmen; externe Punkte (AVV, Pilotvereinbarung, Mitbestimmung) offen. Szenarien mit Modul-Voraussetzung erst nach Einschaltbarkeit der WP-19-Module ausführbar. Stand (automatisch): Teilumfang nach #229, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). Nachtrag 2026-11-18 (SSOT-Klassifizierung): #229 ist gemergt. Der Commit 64402880 („Doku: Pilot-Mindestanforderungen je Betriebsform und Betreiberliste Pilot“, 2026-11-03) liegt nur auf origin/acc45/docs/pilot-mindestanforderungen und ist KEIN Vorfahr von integration/release-v4 (verwaist); ob sein Inhalt anderweitig übernommen ist, ist nicht geprüft. |
| IMP-6 Schichtmodelle und Schichtzyklen: mehrere Modelle, unterschiedliche Zykluslängen, bestehende Validierungen | IN_PROGRESS | `–` | Freigabe Punkt 5. Ressourcenlimits fachlich begründet, nicht als Geschäftsregel. Stand 2026-11-10: Bibliothek integriert (#185), siehe docs/acc45/IMP-6-NACHWEIS.md. Offen: Schreiben in den Bestand (mehrere Modelle je Person brauchen eine Datenmodell-Entscheidung), Verdrahtung in /api/import und Oberfläche. Stand 2026-11-12: PR #240 integriert Analyse und Vorschau für art=schichtzyklus in /api/import hinter CENTRIC_IMPORT_AKTIV (aus); nur Vorschau, Übernahme antwortet 422 und schreibt nichts; DoS-Grenzen (10.000 Zeilen je Blatt vor der Berechnung, Zellen über 100 Zeichen ersetzt, Bremse auf Analyse/Vorschau, Bibliothek linear); keine Modell- oder Kopfzeilentexte im Echo; gemeinsame server/lib/bezeichnungen.mjs. Offen: Schreiben der Modelle (Datenmodellentscheidung mehrere Modelle je Person), Arbeitszeitprüfung im Endpunkt, Oberfläche, Analyse-Ergebnis-Cache (Vorschau rechnet Analyse neu: ca. 2,7 s im ungünstigsten Fall an der Grenze). Stand (automatisch): Teilumfang nach #251, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). Betreiberentscheidung 2026-11-13: mehrere Schichtmodelle je Person genehmigt (eindeutige Identität und Gültigkeitszeitraum je Modell, serverseitige Prüfung, eindeutig bestimmbares Modell je Planung, keine stille Auflösung von Überschneidungen, keine rückwirkende Änderung abgeschlossener Pläne, Protokoll der Zuordnungsänderungen, keine stille Migration, kontrollierte Klärung bei fehlender Zuordnung); die Datenmodellentscheidung ist damit getroffen, das Schreiben der Modelle ist zu entwickeln, siehe docs/acc45/ENTSCHEIDUNG-BETREIBER-2026-11-13.md. Stand (automatisch): Teilumfang nach #263, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). Stand 2026-11-13: Teil 2 integriert (#263, Merge ca25fea9): serverseitige Zuordnung mehrerer Modelle je Person (m.schichtmodelle, schichtmodellZuordnungen), Bibliothek schichtzuordnung.mjs, Protokollzeile je Änderung, Zählung der Modellwechsel in der Importvorschau; keine Oberfläche, keine Wirkung auf die Planrechnung, CENTRIC_IMPORT_AKTIV bleibt aus. Offene Betreiberfragen 1 bis 8 (siehe PR #263 und docs/acc45/IMP-6-MEHRFACHMODELLE.md): (1) frühestes Änderungsdatum, morgen oder auch heute; (2) wiedergeöffnete Monate und Korrekturrevision WP-16c; (3) freigegebene Monate: Absage oder Änderung mit Vorlauf; (4) Sicht für Beschäftigte und Betriebsrat; (5) Tage ohne Modell zulässig oder jede Liste offen endend; (6) wann die Modelle in die Planung wirken; (7) Art. 15 DSGVO Auskunft für schichtmodellZuordnungen; (8) /api/wiederherstellen umgeht den historischen Schutz, hingenommen nur, solange die Zuordnungen keine Planwirkung haben. Außerdem offen: Oberfläche als Folgeschritt und Übernahme der Importzuordnungen in den Bestand. Status bleibt IN_PROGRESS, nicht INTEGRATED. Entscheidungsstand 2026-11-14 (Statusstufe entschieden, keine Freigabe zur Produktion): Betreiber hat Q1 bis Q5 aus IMP-6-MEHRFACHMODELLE.md entschieden (Q1 Wechsel frühestens Folgetag; Q2 nie rückwirkend, nur über den Revisionsprozess; Q3 veröffentlichte Zukunftspläne brauchen neue Planfreigabe; Q4 Beschäftigte sehen das eigene Modell, KEINE neuen Leserechte für den Betriebsrat; Q5 Zustand 'kein Schichtmodell' zulässig). Technisch umgesetzt: nein (Regeln noch nicht im Code nachgewiesen), reviewt: nein, integriert: nein, staging-geprüft: nein, fachlich freigegeben: nein, produktiv: nein. Korrektur der Zählung: Die Quelldatei IMP-6-MEHRFACHMODELLE.md hat nur fünf nummerierte Fragen. Die 'Fragen 6 bis 8' stammen aus der Beschreibung von PR #263 (6 Wirkung auf die Planrechnung einschalten, 7 Art. 15 DSGVO Auskunft für schichtmodellZuordnungen, 8 /api/wiederherstellen umgeht den historischen Schutz); sie sind NICHT entschieden und bleiben offen (Q7 und Q8 sind in der Quelldatei Teil von Frage 4 bzw. dem Abschnitt 'Bekannte Grenze'). Offene Prüfung zu Q4: Selbstauskunft nach Art. 15 DSGVO für schichtmodellZuordnungen auf Vollständigkeit prüfen, getrennt zu klären; Leserechte für den Betriebsrat sind nicht freigegeben. Stand 2026-11-19 (SSOT-Nachtrag #368 bis #370): PR #369 gemergt (Merge 8200976a), IMP-6 Teil 1 der Regelumsetzung: Q5 Lücken in der Modellzuordnung zulässig (Zustand 'keine', nie das Betriebsmodell), ungültiger Versatz 'ungueltig', über 55 Grenzfalltests, Differenz alt/neu. Status bleibt IN_PROGRESS, integriert nicht gesetzt (Teil-PR). Vorbedingung vor Punkt 6 (Wirkung auf die Planrechnung): Abweisung 'Modell verkürzt, Versatz >= n'. Offen: PR 2 (Q4, eigenes Modell sichtbar), Übernahme in den Bestand, Oberfläche, Fragen 6 bis 8. Nachtrag 2026-11-19 (g): PR #372 gemergt (Merge-Commit c581f903, Teil 2, Q4: Beschäftigte sehen ihr eigenes Schichtmodell in GET /api/bestand, ohne Wann/Wer/Version; Betriebsrat keine neuen Leserechte; Schreibweg unverändert). Teil-PR, Status bleibt IN_PROGRESS, integriert bleibt false. Offene Abgrenzungen als P2-19 in der Entscheidungsliste (nur (c) liegt beim Betreiber). Weiter offen: Planwirkung (P2-4 Punkt 6) und die Abweisung bei Modellkürzung vor Punkt 6, Oberfläche. Nachtrag 2026-11-19 (h): Vorbedingung vor Punkt 6 umgesetzt (Branch feat/imp6-versatz-vorbedingung, nicht integriert): Modell verkürzt, Zuordnung mit Versatz >= neue Länge -> 422 MODELL_VERKUERZT_VERSATZ, nichts gespeichert, Voll- und Teilweg (server/lib/schichtzuordnung.mjs modellKuerzungFehler, server/funktionen/daten.mjs); Test imp6-mehrfachmodelle Abschnitt 4 umgestellt, 4b neu. Teil-PR, Status bleibt IN_PROGRESS. Weiter offen vor Punkt 6: Punkt 8 (Wiederherstellen), Wächter D2/Differenz D, Oberfläche (Servertext anzeigen). Nachtrag 2026-11-20 (i): Oberfläche Pflege (Branch acc45/imp/imp-6-ui, PR gegen integration/release-v4, nicht integriert): Abschnitt „Schichtmodelle je Person“ unter Schichtfolge nur für (org.edit oder pattern.edit) und staff.edit; Modelle mit beliebiger Zykluslänge 1 bis 1000 anlegen/bearbeiten/entfernen, Zuordnungen je Person (Modell, Gültig ab/bis, Startpunkt), Vorprüfung mit derselben Bibliothek wie der Server (src/lib/schichtmodelle-pflege.js, entwurfPruefen), erste Zuordnung legt die Fortsetzung des Betriebsmodells bis heute sichtbar in den Entwurf; Hinweis „noch ohne Wirkung auf den Dienstplan“. 422 MODELL_VERKUERZT_VERSATZ und die inhaltlichen 403 der Schichtmodelle erscheinen unter „Nicht gespeichert“ als eigene Lage mit dem Text des Servers (src/speicher.js). Keine Planwirkung, keine Anzeige für Beschäftigte (P2-19 (d) unverändert), kein Schalter. Prüfungen: imp6-oberflaeche (Teil von pruefung:imp6-mehrfachmodelle), e2e/imp6-schichtmodelle.spec.mjs; Wächter D2 um die Pflegehilfe erweitert. Neu P2-24 (Sichtbarkeit der Pflege vor der Planwirkung; laufendes Modell ändern). Status bleibt IN_PROGRESS. Nachtrag 2026-11-20 (j): P2-24 entschieden B (Betreiberentscheidung 2026-11-20) und umgesetzt (PR #423): Pflege hinter dem Schalter CENTRIC_SCHICHTMODELL_PFLEGE (Vorgabe aus, nur Anzeige über schichtmodellPflege im GET /api/bestand; Daten bleiben bei AUS und gehen unverändert mit; Server-Schreibweg bewusst unverändert). Folgepunkt 1: inhaltliche 403 der Schichtmodelle mit stabilem Code SCHICHTMODELL_<Prüfcode> (rechte.mjs eine Zeile, daten.mjs reicht code durch), Client nur am Code, ohne Code fail-safe keinRecht. Review-Auflagen #423 A1 (Anzeige-Rechte = feste Matrix des Servers), A2 (echter Server-403 im E2E), H1, H3, H4, H5 umgesetzt. Prüfungen: imp6-oberflaeche (51), imp6-mehrfachmodelle Abschnitt 9, E2E imp6-schichtmodelle S0-S6. Status bleibt IN_PROGRESS. Nachtrag 2026-11-20 (k): Delta-Review #423 umgesetzt: P2-24 geteilt nachgeführt ((a) entschieden B; (b) Versionierung laufender Modelle offen, Kategorie C, gebaut gilt A), Anzeige-Rechte nach der Rolle der Sitzung, lageAm als reine Anzeige festgeschrieben, Teilweg-Prüfung bei Schalter AUS, Hinweis im Betriebshandbuch; Branch mit origin/integration/release-v4 zusammengeführt. Status bleibt IN_PROGRESS. |
| IMP-8 Synthetische Testdateien und Testmatrix (20 Fälle, je Unit/HTTP/E2E) | IN_PROGRESS | `–` | Nur synthetische Daten. Stand 2026-11-12: PR #215 integriert: 20 Fälle auf Unit-Ebene belegt (12 zusätzlich über den echten Handler). Stand 2026-11-19 (PR #409, Branch test/imp8-testmatrix-rest): HTTP-Rest geschlossen, alle 20 Fälle auch über den echten Handler belegt (neu F02, F03, F04, F06, F07, F08, F11, F18), keine Befunde; E2E im Browser für alle 20 weiter offen (Dateiweg per IMPORT_DATEI_AKTIV/CENTRIC_IMPORT_AKTIV aus, Einschalten nur mit Betreiberfreigabe; Textweg-E2E zählt nicht, anderer Codepfad). docs/acc45/IMPORT-PLAN.md existiert im Repo nicht; die 20 Fälle sind aus IMPORT-VERTRAG.md und dem IMP-1-Nachweis rekonstruiert (Herleitung in docs/acc45/IMP-8-TESTMATRIX.md). Die Akzeptanz 'Alle Fälle aus der Anforderungsliste' ist damit nicht gegen eine Betreiberliste geprüft. Status bleibt IN_PROGRESS, bis Betreiber/Koordinator die Fallliste bestätigt. |
| WP-48-GB Lesen des Plans schreibt: Dialog „Gleichzeitig bearbeitet“ beim bloßen Öffnen (Befund aus dem Review von PR #262) | IN_PROGRESS | `–` | Befund aus dem Review von PR #262 (WP-33 Teil 3): Mehrere parallele Sitzungen, die den Plan nur öffnen und nichts eingeben, zeigen den Dialog „Gleichzeitig bearbeitet“; die e2e-Suite läuft deshalb mit workers: 1 als Notlösung (playwright.config.mjs). Der Dialog in src/ansichten/speicherlage.jsx:174 erscheint nach bisherigem Stand nur bei einem Speicherkonflikt, das Öffnen scheint also zu schreiben. Schritt 1 Analyse: welcher Lade- oder Öffnungsweg schreibt (Autospeichern, Herzschlag, Zeitstempel, Migration beim Laden). Schritt 2 Behebung. Bereich WP-48 und WP-16. Keine Produktentscheidung bekannt. Aufwand SCHÄTZUNG. Abhängigkeiten leer; BLOCKED bis zur Zuteilung durch den Koordinator (Strang acc45). Stand 2026-11-13: PR #271 gemergt (bbd5e6e0). Akzeptanz nur teilweise belegt: das Öffnen löst keinen Speichervorgang und keinen Konfliktdialog mehr aus, echte Konflikte werden weiter gemeldet (Prüfung laut PR). NICHT erfüllt: die e2e-Suite läuft weiter mit workers: 1 (playwright.config.mjs; der PR nennt das ausdrücklich). Unabhängiges Review nicht belegt (reviewt false). Offene Produktfragen: (1) Urlaubshinweis serverseitig als täglicher Lauf statt beim Öffnen? (2) nur eine Rolle (Leitung) oder nur auf ausdrückliche Handlung? (3) Meldung 'N Hinweise verschickt' auch in der Sitzung, deren Lauf still ersetzt wurde? Deshalb IN_PROGRESS, nicht INTEGRATED. Nachtrag 2026-11-19 (Branch fix/wp48-gb-lesen-schreibt): erneute Analyse auf 899ce304 — Befund durch #271 behoben, GET /api/bestand liest rein (byte-gleich belegt, Angleichung nur in der Antwort), die Oberfläche schreibt nach dem Laden nichts zurück. Behoben wurde ein Randfall der Migration beim Laden (einziger Pflicht-Schreibvorgang beim Öffnen): ohne onKonflikt übernahm speicher.js beim 409 nur den ETag, die nächste Eingabe überschrieb still eine fremde Änderung; der Betriebsrat schrieb die Migration ohne Recht zurück (403). Jetzt migrationZurueckschreiben (nicht bei Schreibumfang nein) und stille Übernahme des Serverstands nur bei reiner Migration ohne eigene Änderung (sonst Dialog). Nachweis docs/acc45/WP-48-GB-ANALYSE.md Abschnitt 6, pruefungen/wp48-gb-lesen.test.js. workers: 1 und Review weiter offen. Nachtrag 2026-11-19 (SSOT-Nachtrag #360 bis #366): PR #365 gemergt (Merge-Commit c177116f); der Hauptbefund war schon durch #271 behoben, #365 ergänzt den Randfall der Migration beim Laden mit Konfliktbehandlung. Status bleibt IN_PROGRESS, weil die Akzeptanz 'e2e-Suite ohne workers: 1' nicht erfüllt ist (kein echter Lauf ohne die Notlösung). Restliste: (1) echter e2e-Lauf ohne workers: 1; (2) Urlaubs-Erinnerung, Produktfragen (Abschnitt 5, siehe Notiz oben); (3) Folgepaket speicher.js: bei 409 mit wartender Eingabe wird mit übernommenem ETag überschrieben (stille Überschreibung einer fremden Änderung); (4) optionaler Testnachtrag, der aktuell mit anderem stand/session arbeitet; (5) unabhängiges Review weiter nicht belegt (reviewt false). Nachtrag 2026-11-19 (g): PR #374 gemergt (Merge-Commit 1d8aacce): Folgepaket (3) umgesetzt, speicher.js sendet nach einem 409 bis zur Entscheidung nichts mehr (Konfliktsperre, Lage konfliktOffen, ohne Teilweg; Teilweg, Schalter und Speicherschlüssel unverändert); Review-Auflagen M1/M2/N1 erfüllt. Teil-PR, Status bleibt IN_PROGRESS, integriert und reviewt bleiben false. Restrisiko: Wegwischen am Telefon/PWA verwirft gehaltene Eingaben ohne Rückfrage. Neue Betreiberfrage P2-20 (Reichweite von Meinen Stand übernehmen). Weiter offen: workers: 1, Produktfragen, N2 bis N4. Nachtrag 2026-11-19 (h, Branch feat/wp48-gb-rest): Browsernachweis e2e/oeffnen-parallel.spec.mjs: P1 Leitung+Planung gleichzeitig (nur Urlaubshinweis-PUT, kein Dialog), P1 höchstens 2 PUT; P2 sechs Sitzungen (Planung auf zwei getrennten Browser-Kontexten/Geräten, frische Zugänge für Planung/Subplanung/Mitarbeiter, Leitung und Betriebsrat mit Rollenzugang) öffnen und laden gleichzeitig neu: kein schreibender Aufruf außer Anmeldung, kein Dialog, ETag und Inhalt byte-gleich. Reichweite (Review #396): in der CI läuft P1 im Zweig „schon verschickt“, das Rennen aus #271 ist nur im Einzellauf belegt; der Mutant Tour-Selbststart war in der ersten Fassung nur im Einzellauf rot (6 PUT), im Suite-Lauf grün; seit den frischen Zugängen fällt er auch im Suite-Lauf auf (konstruktionsbedingt, nicht erneut gelaufen); für Leitung/Betriebsrat schützt P2 im Suite-Lauf nur vor Schreibpfaden bei jedem Öffnen. Kein weiterer Schreibpfad beim Lesen gefunden, Produktcode unverändert. workers: 1 bleibt aus anderem Grund (schreibende Specs teilen den Demo-Betrieb), Kommentar in playwright.config.mjs angepasst; die Akzeptanz ist im Zweck belegt, wörtlich (Suite ohne workers: 1) nicht, Umformulierung ist Koordinator-/Betreiberentscheidung. Analyse Abschnitt 8. Status bleibt IN_PROGRESS (Produktfragen P2-9, P2-20, Review offen). |
| ABN-A4 Abnahme V4 A-4: Dienstart ohne mindest stürzt die Oberfläche nicht mehr ab (PR #280 gemergt 2026-11-13) | REVIEW | `–` | (Überholt, siehe Nachtrag 2026-11-17 und 2026-11-18) PR #280 offen, angehalten. Regel seit 2026-11-13 geändert: fehlendes mindest bei neuer Dienstart gibt 422, ein ausdrückliches 0 ist zulässig, nur ganze Zahlen, Zahlen als Zeichenfolge werden normalisiert, historisch Fehlendes wird markiert. Wirkung der Regel auf Bestand und Import offen. Entscheidungsstand 2026-11-14 (Statusstufe entschieden, keine Freigabe zur Produktion): Betreiber hat die Fragen Q1 bis Q5 der konsolidierten Vorlage (ENTSCHEIDUNGSVORLAGE-KONSOLIDIERT-2026-11-14.md Abschnitt 6) am 2026-11-14 entschieden: mindest:0 als Kurzform bleibt 422; Weglassen bei bestehender Dienstart lässt den Wert; historische Sicherungen bleiben brauchbar, kein stilles Ergänzen; Bearbeiten historisch fehlender Werte erlaubt und gekennzeichnet; alter Export beim Neuanlegen gibt einen Validierungsfehler, ein Migrationswerkzeug nur mit gesonderter Freigabe. Stufe: entschieden. PR #280 bleibt bis zur Umsetzung dieser Regeln angehalten; technisch umgesetzt, reviewt, integriert, staging-geprüft, fachlich freigegeben, produktiv: nein. Nachtrag 2026-11-17 (SSOT-Nachtrag KG-8, Abgleich gegen origin/integration/release-v4 @ bfa7a110): PR #280 ist MERGED (2026-11-13, Merge bcddf680); die Aussage „offen, angehalten“ ist überholt. Das Datum des Merges liegt vor der Betreiberentscheidung Q1–Q5 (2026-11-14); die Umsetzung von Q1–Q5 im Code ist nicht einzeln nachgewiesen (Nachweis offen). Kein Review belegt (reviewt false). Status bleibt BLOCKED; stagingGeprueft, fachlichFreigegeben, produktiv: nein. Nachtrag 2026-11-18 (SSOT-Klassifizierung): IN_PROGRESS statt BLOCKED. #280 (Merge bcddf680) ist Vorfahr von integration/release-v4, Q1 bis Q5 sind am 2026-11-14 entschieden; es fehlt der Nachweis, dass jede der Entscheidungen im gemergten Code einzeln umgesetzt ist (Tests je Entscheidung, Review). Stufe integriert bleibt „teilweise“. Nachtrag 2026-11-19 (ABN-A4, Branch fix/abn-a4-mindest, Basis 9fd6045f): Tatsächlicher Stand geklärt. Der Absturz ist seit #280 behoben; Q1 bis Q5 (alle Option A bzw. (a), also das gebaute Verhalten) sind im Code umgesetzt und je Entscheidung durch Prüfungen belegt, Q3 (Wiederherstellen ohne mindest-Prüfung, kein stilles Ergänzen) durch eine neue Handlerprüfung in personendaten.test.js; Tabelle in ABNAHME-V4-A4-MINDEST.md §5. Berichtigung: Eine Zahl als Zeichenfolge wird nicht normalisiert; neu oder geändert gesendet ist "2" 422, ein gespeicherter Altwert "2" bleibt byte-gleich und wird als 2 gelesen. Gefundene Restlücke, behoben: Die Besetzungsanzeige (Monatsplan, Wochenliste, Tagesdetail, Lagebild, Zeitachse, Schnellbesetzung, Ersatzliste, Eskalation) zeigte für eine Altdienstart ohne mindest „0/0“ (Ampel ok, ungekennzeichnet) und bei unvollständigem oder unlesbarem mindest „NaN“; jetzt „–“ und „Bedarf nicht festgelegt“ (besetzung.bedarfOffen), Rechnung und Ampel unverändert, gültige Dienstarten bit-gleich (Differenzlauf). Offen: P2-17 (soll fehlender Bedarf die Ampel/Lückenlisten ändern; Voreinstellung nur Kennzeichnung), Review des Nachtrags; staging-geprüft, fachlich freigegeben, produktiv: nein. Nachtrag 2026-11-19 (Review #370, MERGE-MIT-AUFLAGEN): M1 behoben (Kennzeichnung auch bei einzelnem ungültigem Tageswert null/leer/false/Liste/negativ und So-Wert am Feiertag, mindestTagOffen), M2 Testlücke geschlossen (0 an allen Tagen und Posten ohne mindest bleiben ungekennzeichnet); die Abweichung vom Wortlaut 2026-11-13 bei Zahl als Text ist eigene Betreiberfrage P2-18 (Voreinstellung: gebautes Verhalten). Nachtrag 2026-11-19 (SSOT-Nachtrag #368 bis #370, berichtigt): PR #370 gemergt (Merge 87473f12). Code integriert, Absturz seit #280 behoben, Q1-Q5 belegt. Status REVIEW, nicht INTEGRATED: Die Akzeptanz 'Merge mit Review' ist nicht belegt, denn #280 war ein Direktmerge ohne eigenes Review; das Review von #370 deckt die Q1-Q5-Tabelle und die Anzeige-Lücke, nicht den Code von #280, und die Review-Berichte sind Selbstauskunft der Orchestrierung ohne Rohdateien im Repo. Restliste: (1) Review-Nachweis für den Direktmerge #280 (Zusammenfassung: docs/acc45/REVIEW-NACHWEIS-2026-11-19.md; eigenes Review des #280-Codes steht aus); (2) P2-17 (Ampel/Lückenlisten bei fehlendem Bedarf) und P2-18 (Zahl als Text, Wortlaut 2026-11-13) beim Betreiber; (3) krankmeldungen-offen.jsx zeigt weiter x/0; staging-geprüft, fachlich freigegeben, produktiv: nein. |
| WP-ZEIT Betriebstag und Zeitzone: betrieblicher Kalendertag statt Gerätedatum, Zuschläge in den Umstellungsnächten | IN_PROGRESS | `–` | Von Hand angelegt (2026-11-17): bisher kein SSOT-Paket, obwohl PR #296, #301, #303, #315 gemergt sind (BACKLOG-PHASEN.md Abschnitt 7 Punkt 6). Stufe entschieden laut Betreiberentscheidung 2026-11-14 (ENTSCHEIDUNGSLISTE.md); eine Entscheidung ist keine Produktionsfreigabe. Nicht belegt: stagingGeprueft, fachlichFreigegeben, produktiv aktiviert. Betreiberentscheidungen E1 bis E8 am 2026-11-14. Review: Quelle prüfen (reviewt nicht belegt). Verwandt: QS-ZEIT (#305, #309). Priorität, Strang und Aufwand sind eine vorläufige Einordnung nach docs/acc45/BACKLOG-PHASEN.md, vom Betreiber nicht bestätigt; Aufwand ist eine SCHÄTZUNG. Nachtrag 2026-11-18: PR #344 (57d49e3d, P2-12 Teil, Variante B, Schritte 1+2): zentrale Zeitbasis weist unechte Kalendertage ab (kalendertagEcht, UNGUELTIGER_KALENDERTAG; Eingabewege Selbstauskunft, Korrekturantrag, Entscheidung und PUT /api/bestand mit 422, Alteinträge unverändert). Schritt 3 (Abschlusssperre UNVOLLSTAENDIG) nicht begonnen, wartet auf Betreiberentscheidung zu historischen Folgen. Status bleibt IN_PROGRESS. Nachtrag 2026-11-18 (Abend): PR #354 (02a3869a): Client zeigt die Lage kalendertag mit Feld und Bereich, ohne Noch-einmal-senden, mit Sichern und Verwerfen; einzelnes Zurücknehmen bewusst nicht gebaut (Datenverlustrisiko). PR #356 (dfcd8309): Kalendertagsprüfung auch für anfragen von/bis, ausschreibungen datum und Krankmeldungsfälle, Tage ohne Nullen und zuschlagWert (Folgepunkte 2 bis 4 aus den Reviews zu #344); Alteinträge bleiben unverändert speicherbar; die Review-Befunde B1 und B2 (Kapern, Existenzorakel) sind nicht Teil davon und stehen im noch offenen PR #361. PR #357 (a8ce186b): zeitpunktAusWanduhr über eine je Jahr gegen Intl geprüfte Umstellungstabelle (Europe/Berlin, ganze Minuten 2000 bis 2999), Differenzialtest bitgleich; das Ziel am Stück (< 200 ms) ist laut PR weiter nicht erreicht, der Rest liegt in monatsabschluss.mjs und isteinfrieren.mjs. Schritt 3 (Abschlusssperre) unverändert nicht begonnen. Status bleibt IN_PROGRESS. |
| V4-1 V4: Inventar und Screenshot-Baseline (MIGRATION Schritt 2) | IN_PROGRESS | `docs/v4-1-inventar` | Analyse 2026-11-20 (V4-Integrationsstand); PT sind Schätzung der Analyse, nicht belegt. Umsetzung 2026-11-20 (Branch docs/v4-1-inventar, PR gegen integration/release-v4): Inventar 172 Dateien (167 ohne src/v4) mit Zählwerkzeug und Test; Screenshot-Baseline nur als Plan (keine Binärdateien, nicht in CI). Status nach Merge setzt der Koordinator. |
| DEP-1 Abhängigkeit: web-push 4 Migration | REVIEW | `acc45/dep/dep-1-web-push-4` | Quelle: Bewertung offener Dependabot-PRs #400 bis #407 vom 2026-11-20 (nur lesend erhoben, Basis integration/release-v4 @ 105f6c83); Aufwand ist eine SCHÄTZUNG der Bewertung, nicht belegt. Der Dependabot-PR wird nicht geschlossen; Schließen entscheidet der Betreiber. Befund: web-push 4.0.0 hat nur benannte Exporte; server/lib/webpush.mjs:62-64 nutzt webpush.default.setVapidDetails, mit v4 ein TypeError, den das catch still zu {ok:false, klasse:temporaer, fehler:netz} macht (Push würde lautlos nie zugestellt). CI bleibt grün, weil pruefungen/mail-push-anbieter.test.js:23 web-push mit { default: {...} } mockt. pushziel.mjs (Review S1) begründet den Parser-Gleichlauf mit url.parse in 3.6.x; v4 nutzt new URL, Begründung und sicherheit-intern.test.js neu bewerten (SI-01). Neue transitive Abhängigkeit proxy-agent-negotiate 1.1.0 prüfen. Ohne VAPID-Schlüssel endet sendePush vor dem Import (trocken), daher aktuell kein sichtbarer Schaden. Aufwand SCHÄTZUNG 0,5 bis 1 PT plus Sicherheitsreview (Opus). Dependabot-PR #404, nicht mergen (funktionaler Defekt); Schließen entscheidet der Betreiber. |

### Bereit zum Start (1)

DEP-2 (folge, 0,5–1 PT)

### In Arbeit, fortsetzbar (14)

WP-40 (acc45, 1,5–2,25 PT offen) · WP-28b (folge, 0,5–1 PT offen) · WP-I4 (intelligence, 4–7 PT offen) · WP-I19 (intelligence, 8–14 PT offen) · WP-I20 (intelligence, 8–14 PT offen) · WP-I24 (intelligence, 2,5–4,5 PT offen) · WP-I29 (intelligence, 9–15 PT offen) · WP-I30 (intelligence, 2–4 PT offen) · WP-I31 (intelligence, 4,5–7,5 PT offen) · IMP-6 (acc45, 1,5–2,5 PT offen) · IMP-8 (acc45, 1–1,5 PT offen) · WP-48-GB (acc45, 0,5–1,5 PT offen) · WP-ZEIT (acc45, 4,5–7,5 PT offen) · V4-1 (folge, 1–1,5 PT offen)

### Integriert in `integration/centric-complete` (97)

| Paket | Beleg (PR, Merge-Commit) | Review |
|---|---|---|
| WP-02 Schreibserialisierung je Raum, kein Stempelverlust | #24 (3722719) | Agent F: Auflagen → Freigabe |
| WP-03 Rücksprung nur über verifizierte Digests, R0 | #22 (e748c70), #23 (a063925) | Agent F: Auflagen → Freigabe |
| WP-04 Automatische verschlüsselte Offsite-Sicherung | #21 (5fd2696) | Agent F: Auflagen → Freigabe |
| WP-05 Überwachung und Alarme | #34 (0ccf2ae), #37 (6570858) | Agent F: Ablehnung → Nachprüfung → Freigabe |
| WP-06 Stempel-Integrität (Originale unveränderlich, Korrekturereignisse) | #47 (b3707d8), #51 (d5fccbd) | Review mit Auflagen; Nachtrag 06b (#51) |
| WP-07 Offline-Stempeln (clientEventId, Idempotenz, Sync) | #58 (7e7b6e4) | Review (Ablehnung → Nachbesserung) laut Nachweis |
| WP-10 Kette A Basis (#7) auf B portieren, Datenmodell d.1–d.5 | #31 (b32880c) | Agent F: Auflagen → Nachprüfung → integrierbar mit Auflagen |
| WP-11 Regelregister (#6) portieren, eine Schutzprüfung | #31 (b32880c), #35 (b84de34), #39 (85337ac) | Agent F: Freigabe der Nachträge (#35, #39) |
| WP-12 Integrationsabnahme A+B | #43 (9d0ff51), #46 (7cacbf7) | Abnahmeprüfungen im Repo; 12b Regressionstest 409 |
| WP-13 Stempeln ohne Plan, ungeplante Dienste im Ist | #51 (d5fccbd) | Review laut Nachweis |
| WP-14 Korrekturworkflow Leitung/SV, Korrekturantrag | #52 (442527b), #66 (92a3b97) | Review abgelehnt → Nachbesserung; Opus-Delta-Review → Nachtrag 14b (#66) |
| WP-17 Stempelkonflikt-Retry, Serverdatum | #47 (b3707d8) | Review (Ablehnung → Nachbesserung) laut Nachweis |
| WP-18 Zugänge: personengebundene Codes, Konto-UI, Einladungen | PR #132 in integration/release-v4 gemergt | PR #131 in integration/release-v4 gemergt nach Review |
| WP-20 Einsatzorte je Dienst, Geo-Modi, Außendienst | #56 (dd72a10) | Review laut Nachweis |
| WP-22 Fachprüfungen auf dem Server, org.edit | #41 (cc19eb4), #45 (ca8c4bc), #54 (53b986a) | Review; Nachträge 22b (#45, #54) |
| WP-23 Entwürfe nicht an Beschäftigte ausliefern | #53 (b6ee1cf), #64 (f2428aa) | Review abgelehnt → Nachbesserung; 23b (#64) |
| WP-24 Kalender-Feed live und gebunden | #59 (741c844) | Nachprüfung abgeschlossen vor Merge |
| WP-25 Wiederherstellen in der Oberfläche | #50 (a7d4020) | Review mit Nachbesserung |
| WP-26 DSGVO serverseitig (Art. 15, Löschlauf, Ausdünnung) | #40 (9abf988) | Agent F: Ablehnung (2c1aa8e) → H1–H3 → Nachprüfung „integrierbar mit Auflagen“ → N-1…N-4 (7e6a4bb) umgesetzt; Freigabe nach den N-Auflagen nicht dokumentiert |
| WP-27 Betriebsrat-Auswertung aggregiert, reduzierte Sichten | #57 (65e4e58), #65 (59b4ac2) | Review; Opus-Nachprüfung → 27b (#65) |
| WP-28 Lasttest und Skalierungsentscheid | #60 (10f1ca4) | Review laut Nachweis |
| WP-29 Geo-Spezifikationsreste | #63 (764b1ab) | Review laut Nachweis |
| WP-31 Deploy-Automatisierung mit Freigabe | #32 (4300f8d), #42 (d2d3f7a) | Agent F: Auflagen → Nachprüfung → Freigabe; 31b (#42) |
| WP-32 Lieferkette, Infrastruktur, Betreiber-2FA | #30 (bb5ade8), #32 (4300f8d) | Agent F: Auflagen → Freigabe (32b, 32c) |
| WP-33 Testinfrastruktur (vollständige Sammelprüfung, Playwright, axe) | PR #323 in integration/release-v4 | PR #323 in integration/release-v4 |
| WP-35 Darstellungsbefunde | PR #176 in integration/release-v4 | PR #176 in integration/release-v4 |
| WP-37 PWA-Feinschliff | #62 (9d4f383) | Review laut Nachweis |
| WP-38 Toter Code, eine Planrechnung | PR #143 in integration/release-v4 | PR #143 in integration/release-v4 |
| WP-39 App.jsx modularisieren | PR #128 in integration/release-v4 gemergt | PR #128 in integration/release-v4 gemergt |
| WP-41 Betriebs- und Nutzerdokumentation | #42 (d2d3f7a) | Review mit Auflagen |
| WP-43 Personaldaten-Filter vollständig (Matrix ↔ Code, tagesgenau) | #25 (eb5fc98), #26 (f5bec0d) | Agent F: Auflagen → Freigabe (N1 #26) |
| WP-45 Atomarer Mehrdatei-Schreibvorgang (Journal), Kontovereinzelung | #29 (60818c0), #33 (737c453), #36 (efdde6b), #38 (57717df) | Agent F: 45b Ablehnung → vier Nachprüfungen → Freigabe |
| WP-46 Bremse fail-closed, gleitendes Fenster, Notbremse Zugangscode | #27 (56c73d0), #28 (336788a) | Agent F: Auflagen → Freigabe |
| WP-47 Bremsen: Lastgrenzen Stempeln und Anmeldung (je Person, je Raum, je Code) | #55 (2afab0c), #61 (006b036) | Review laut Nachweis; Flake-Fix #61 |
| WP-32d Betreiber-2FA verpflichtend vor produktivem Betrieb mit echtem Betreiberzugriff | PR #141 in integration/release-v4 | PR #141 in integration/release-v4 |
| WP-27c Betriebsrat-Auswertung: Nachtrag (Aufräumen von−2, ungeplanter Dienst sperrt Gesamtzeile, Rufbereitschaft im Ist, Test Weiterleitung) | PR #150 in integration/release-v4 | PR #150 in integration/release-v4 |
| WP-47b Lesebremse nach Bestandsgröße, eigene Feed-Bremse und Zwischenspeicher je Raum/Stand | PR #151 in integration/release-v4 | PR #151 in integration/release-v4 |
| WP-28c Konsistente Sicherung unter Dauerlast: kurzer, befristeter, koordinierter Schreib-Halt im Server (Folge zu WP-28b/2) | #110 (42e83da) in integration/release-v4 | Opus-Review, Befunde behoben |
| WP-S1 Staging-Vorbereitung (Agent): Smoke, Testdaten, Abnahme-Checkliste 3.1–3.4 | PR #119 gemergt in integration/release-v4 (CI grün) | – |
| WP-19.0 WP-19 Kern-Nacharbeit (Aktivierung, Mitbestimmungsbestätigung, Regelwerte, Einhängepunkte) | PR #82 gemergt am 2026-11-04 (Merge a9faf7ef in integration/centric-complete; Kopf 59079b5); beide Commits sind Vorfahren von integration/release-v4 | fünf Opus-Review-Runden (wp19-0-nachweis.md Abschnitte 11–15), PR #82 |
| WP-I2 Live-Prüfung Schichtfolge-Editor | PR #152 in integration/release-v4 | PR #152 in integration/release-v4 |
| WP-I3 Regelbaukasten vervollständigen (8 Regelarten) | PR #108 in integration/release-v4 (gemergt 2026-11-07) | PR #108 in integration/release-v4 (gemergt 2026-11-07) |
| WP-I6 Planungsreife | PR #138 in integration/release-v4 | PR #138 in integration/release-v4 |
| WP-I10 Architekturabgleich Spezifikation auf heutigen Stack | PR #70 in integration/release-v4 | – |
| WP-I11 Faktenpaket-Vertrag (Positivliste, Alias) | #86 (intelligence/wp-i11-integration) | Opus-Sicherheitsreview + Delta-Review (2 Runden) |
| WP-I12 Decision Engine (Extraktion aus App.jsx) | Kern 4d553280 (Direkt-Merge 2026-11-06, kein PR) liegt in integration/release-v4; Koordinator-Entscheidung 2026-11-10: Beleg über Commit, Gleichheits- und Golden-Tests (pruefungen/engine-rechenkern.test.js, engine-golden, engine-paketliste, engine-einsatz) grün in der CI des Integrationskopfs, Teilpakete WP-I12a (#174) und WP-I12b (#140) mit PR und Review integriert. | – |
| WP-I13 Gateway, Attrappe, Router, Prüfer | PR #146 in integration/release-v4 | PR #146 in integration/release-v4 |
| WP-I14 Fingerprint, Ergebnis-Speicher, Decision Context | PR #159 in integration/release-v4 | PR #159 in integration/release-v4 |
| WP-I15 Kostenschutz, Limits, Deadline, degradierter Modus | PR #158 in integration/release-v4 | PR #158 in integration/release-v4 |
| WP-I17 Intelligence-Oberfläche Grundlage | PR #154 in integration/release-v4 | PR #154 in integration/release-v4 |
| SI-P1 Sicherungsschlüssel an Ersteller binden und mit Austritt/Sperre widerrufen (Befund P1, mittel) | #107 (e5ada4e) in integration/release-v4 | Zwei unabhängige Opus-Reviews (SI-P1/P2), Befunde behoben |
| SI-P2 Code-Sitzung endet, wenn die Person den Betrieb verlässt (Befund P2, mittel) | #107 (e5ada4e) in integration/release-v4 | Zwei unabhängige Opus-Reviews (SI-P1/P2) |
| SI-P3 Mailversand aus Test- und Demoräumen begrenzen (Befund P3, mittel) | #109 (e58f163) in integration/release-v4 | Opus-Review, Regression (Betreibervorlagen als selbstAngelegt) behoben |
| SI-P4 Zweiter Faktor für Leitung, Planung und Kunde (Befund P4, mittel) | PR #124 in integration/release-v4 gemergt | PR #124 in integration/release-v4 gemergt |
| SI-P5 Matrixzeilen und Negativ-Sonden für die festgeschriebenen Lücken (Befund P5, niedrig) | PR #136 in integration/release-v4 | PR #136 in integration/release-v4 |
| SI-P6 Betreiber-Leitungscodes nur mit frischer Anmeldung und frischem zweiten Faktor (Befund P6, HOCH) | #111 (e4a75e4) in integration/release-v4 | Vier unabhängige Opus-Reviews (inkl. Befund B1 hoch: Betreibercode in /einrichten, behoben) |
| SI-P7 Herkunftssperre trifft keine gültigen Codes; IPv6 nach /64 (Befund P7, mittel) | #113 (8678cf6) in integration/release-v4 | Drei unabhängige Opus-Reviews; hoher Race-Befund (parallele Anfragen), mittlere Befunde (Zählerausfall, Antwort-Orakel, Kartenüberlauf) behoben |
| SI-P8 Alle fremden Actions per Commit-SHA pinnen (Befund P8, mittel) | PR #98 (Merge-Beleg), Commits 4f1654b, 6733b47, a587df8 in integration/release-v4 | Unabhängiger Review plus Nach-Review, alle Befunde (mittel und niedrig) behoben und getestet |
| SI-P9 Workflow-Härtung: Checkout-Token nicht speichern, Berechtigungen nur lesend (Befund P8-Restpunkte 1+2, mittel) | PR #114 in integration/release-v4 | PR #114 in integration/release-v4 |
| IMP-0 Importpaket: Festlegung von Format, Vertrag und Grenzen (Freigabe 2026-11-09) | PR #121 in integration/release-v4; Vertrag docs/acc45/IMPORT-VERTRAG.md im Integrationsbranch | PR #121 in integration/release-v4; Vertrag docs/acc45/IMPORT-VERTRAG.md im Integrationsbranch |
| IMP-1 Bestandsfehler Import: Dubletten, Personalnummer speichern, keine erfundene E-Mail, Datum nicht still ersetzen | PR #130 in integration/release-v4 gemergt | Review d6c92e0 plus Nachbesserung, integriert PR #130 in integration/release-v4 gemergt |
| IMP-2 Parser: SheetJS CE 0.20.3 (Herstellerdistribution) lokal, Prüfsumme, Lizenz, Grenzen, ZIP-Schutz | PR #123 in integration/release-v4 | PR #123 in integration/release-v4 |
| IMP-3 Endpunkt /api/import: Rollen, Mandant, Wiederholschutz, atomare Übernahme, Protokoll ohne Personendaten | PR #142 in integration/release-v4 | PR #142 in integration/release-v4 |
| IMP-4 Personalimport mit Vorschau: Neu / Aktualisieren (ausdrücklich) / Überspringen / Konflikt klären | PR #137 in integration/release-v4 | PR #137 in integration/release-v4 |
| IMP-5 Organisationseinheiten: Teams, Standorte, Qualifikationen; neue nur mit org.edit | PR #187 in integration/release-v4 | PR #187 in integration/release-v4 |
| IMP-9 KI-Schnittstelle (austauschbar, ohne Aktivierung): strukturierte Ergebnisse, Unsicherheiten, Validierungsfehler | PR #187 in integration/release-v4 | PR #187 in integration/release-v4 |
| IMP-10 Handbuch und Betreiberdoku zum Import | PR #227 in integration/release-v4 | PR #227 in integration/release-v4 |
| IMP-11 Import: Abweichungen UI/Parser/Doku bereinigen (ODS/xlsm im Dateidialog, veralteter Kommentar, Endpunkt-Codes in Vertrag §9) | PR #232 in integration/release-v4 | PR #232 in integration/release-v4 |
| QS-1 Testhygiene: import-personal-e2e prüft die Personalnummer 3002 als Teilzeichenfolge (Zeitstempel-Treffer) | PR #237 in integration/release-v4 | PR #237 in integration/release-v4 |
| QS-2 Zeitabhängige/flaky Tests härten | PR #246 in integration/release-v4 | PR #246 in integration/release-v4 |
| QS-3 Weitere zeitabhängige Prüfungen im Schreib-Halt deterministisch machen | PR #252 in integration/release-v4 | PR #252 in integration/release-v4 |
| OPT-1 SI-P4 Option 1: sichere Ersteinrichtung für neu angelegte Betriebe (einmalig, befristet, keine Klartext-Mail) | PR #179 in integration/release-v4 | PR #179 in integration/release-v4 |
| OPT-1-F Anmeldeweg für Leitungskonten nach Ersteinrichtung (Folgepaket zu OPT-1): Passwort plus zweiter Faktor, ohne Umgehung der Authentifizierung | PR #179 in integration/release-v4 | PR #179 in integration/release-v4 |
| WR-1 Kontowiederherstellung: Kern (zehn Codes, Speicherung scrypt, Verteilung ohne Verzerrung) | PR #167 in integration/release-v4 (Kern: zehn Codes, scrypt, Verteilung) | PR #167 in integration/release-v4 (Kern: zehn Codes, scrypt, Verteilung) |
| WR-2 Kontowiederherstellung: Neugenerierung über alle Eingänge (nur nach vollständiger Authentifizierung) | PR #182 in integration/release-v4 | PR #182 in integration/release-v4 |
| WR-3 Kontowiederherstellung: Verlust-Schnittstelle (Vier-Augen, Freigabe, Token 15 min, Frist 24 h) | PR #191 in integration/release-v4 | PR #191 in integration/release-v4 |
| WR-6 Kontowiederherstellung: Oberfläche (Antrag, Freigabe, Codeanzeige) | PR #198 in integration/release-v4 | PR #198 in integration/release-v4 |
| WP-I12a Decision Engine Rest: Near-Miss, ersatzVorschlaege, hindernisBefunde (Frage 7; je Teil höchstens 15 Funktionen) | PR #174 in integration/release-v4 | PR #174 in integration/release-v4 |
| WP-I12b Decision Engine: Paketliste und Regelkennung serverseitig (Fragen 1 und 6) | PR #140 in integration/release-v4 | PR #140 in integration/release-v4 |
| WP-I12c Decision Engine: planKennzahlen-Korrektur (Frage 4) | PR #355 (Merge 67ac57c0 in integration/release-v4, ersetzt PR #139) | – |
| RB-1 Rollenrecht plan.publish: verbindliche Dienstplanveröffentlichung nur durch Betriebsleiter und Planer | PR #199 in integration/release-v4 | PR #199 in integration/release-v4 |
| RB-2 Krankmeldung zweistufig: Schichtverantwortung bestätigt vorläufig, Planer oder Betriebsleiter endgültig | PR #202 in integration/release-v4 | PR #202 in integration/release-v4 |
| RB-3 Rolle kunde ohne plan.publish und ohne endgültige Krankmeldungsbestätigung; Demo-Funktionen über ausdrücklich zugewiesene Demo-Rollen | PR #206 in integration/release-v4 | PR #206 in integration/release-v4 |
| RB-4 Benachrichtigung bei eingegangener Krankmeldung (Planer, Betriebsleiter, sachlich Schichtverantwortung), Push und E-Mail ohne Gesundheitsdetails | PR #205 in integration/release-v4 | PR #205 in integration/release-v4 |
| RB-5 Offene Krankmeldung: Schicht intern klärungsbedürftig markieren, Unterbesetzung und Ersatzvorschläge vorbereiten, veröffentlichter Plan unverändert, keine eigenmächtige Umbesetzung | PR #207 in integration/release-v4 | PR #207 in integration/release-v4 |
| WP-21-SV Schichtverantwortung: Ansicht Übergabe fehlt in der SV-Navigation, Krankmeldung-Ablauf Timeout auf Smartphone (Befund aus WP-21 Teil 3) | PR #213 in integration/release-v4 | PR #213 in integration/release-v4 |
| WP-19-B4 Modul-Registry: modulAktiv fail-closed; Berichtigung nach Art. 16 vereinheitlichen | PR #247 in integration/release-v4 | PR #247 in integration/release-v4 |
| WP-19-B5 Oberflächen der geplant-Module: Bearbeiten und Löschen bei Status geplant ausblenden | PR #249 in integration/release-v4 | PR #249 in integration/release-v4 |
| ABNAHME-V4 Abnahme V4: Release-Kandidat, lokale Integrationsabnahme (Matrix, Ströme A, B, C) | PR #281 in integration/release-v4 | PR #281 in integration/release-v4 |
| QS-4 geo.test.js: Uhrzeit-abhängige Prüfung deterministisch | PR #283 in integration/release-v4 | PR #283 in integration/release-v4 |
| QS-5 Zufallskollision in account-isolation, betriebsauswahl, einladungen entfernt | PR #285 in integration/release-v4 | PR #285 in integration/release-v4 |
| ABN-B3 B-3: e2e/hilfen.mjs verliert den Nachrichtenbefund unter Windows bei Doppelpunkt im Testtitel | PR #334 in integration/release-v4 | PR #334 in integration/release-v4 |
| QS-6 B7 Offline-Stempel um Mitternacht (Berliner Tag) deterministisch | PR #294 in integration/release-v4 | PR #294 in integration/release-v4 |
| QS-ZEIT Zeitabhängige Tests: geo.test.js und Browserabnahme B8 auf fester Zeitbasis | PR #305 in integration/release-v4 | PR #305 in integration/release-v4 |
| BE-1 Konto-Widerrufbuch: Kontosperren und entzogene Mitgliedschaften überleben jeden Rücksprung | PR #304, #306, #307, #308 und #360 (Merge-Commit 8baa93cc, Passwörter) gemergt, Merge-Commits Vorfahren von integration/release-v4; Sperren, Mitgliedschaften und Passwörter sind damit alle im Code der Integration | PR #304: unabhängiges Diff-Review MERGE-OK mit Auflagen (WIEDERAUFNAHME.md); Auflagen eingearbeitet in PR #307 (Doku) und PR #308 (Code); PR #360 (2026-11-18, zwei unabhängige Opus-Reviews): Sicherheitsreview auf 050e75a0 MERGE-MIT-AUFLAGEN (MITTEL-1, MITTEL-2, Doku-Auflage), Delta-Review der Nachbesserung auf f464531c MERGE-OK nach grüner CI; Berichte nicht als Dateien im Repo, belegt über Merge-Gate-Protokoll und PR-Verlauf Zusammenfassung der Reviews zu #360: docs/acc45/REVIEW-NACHWEIS-2026-11-19.md |
| BE-2 BE-2 Stufe A1: aktiver Konto-Faktor und eingelöste Wiederherstellungscodes überleben jeden Rücksprung | PR #311 in integration/release-v4 (Merge 87cbde26) | – |
| V4-0 V4: Spezifikation übernehmen, V3 als abgelöst kennzeichnen | PR #402 in integration/release-v4 | docs/acc45/REVIEW-NACHWEIS-2026-11-20.md, PR #402: Sonnet MERGEBAR (Selbstauskunft) |

### Statusstufen

✓ belegt · T teilweise (z. B. nur Server-Teilumfang) · – nicht erreicht oder nicht belegt. „Staging“, „Freigabe“ und
„prod.“ stehen nur mit Beleg auf ✓. Gezeigt sind alle Pakete mit mindestens einer erreichten Stufe; alle übrigen
62 offenen Entwicklungspakete stehen auf allen Stufen auf „–“.

| Paket | Status | impl. | lokal | Review | integr. | Staging | Freigabe | prod. |
|---|---|---|---|---|---|---|---|---|
| WP-01 | DONE | ✓ | ✓ | ✓ | ✓ | – | – | ✓ |
| WP-02 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-03 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-04 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-05 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-06 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-07 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-08 | DONE | ✓ | – | – | – | – | – | ✓ |
| WP-09 | BLOCKED | T | – | – | – | – | – | – |
| WP-10 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-11 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-12 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-13 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-14 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-15 | REVIEW | ✓ | ✓ | ✓ | – | – | – | – |
| WP-16 | REVIEW | ✓ | ✓ | T | – | – | – | – |
| WP-17 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-18 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-19 | IN_PROGRESS | T | T | T | T | – | – | – |
| WP-20 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-21 | BLOCKED | ✓ | ✓ | ✓ | – | – | – | – |
| WP-22 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-23 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-24 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-25 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-26 | INTEGRATED | ✓ | ✓ | T | ✓ | – | – | – |
| WP-27 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-28 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-29 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-30 | BLOCKED | ✓ | ✓ | ✓ | T | – | – | – |
| WP-31 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-32 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-33 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-35 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-37 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-38 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-39 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-40 | IN_PROGRESS | ✓ | ✓ | ✓ | – | – | – | – |
| WP-41 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-43 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-45 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-46 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-47 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-16c | REVIEW | ✓ | ✓ | ✓ | – | – | – | – |
| WP-32d | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-48 | IN_PROGRESS | T | T | T | T | – | – | – |
| WP-14c | REVIEW | T | ✓ | T | T | – | – | – |
| WP-27c | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-47b | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-16b | REVIEW | ✓ | ✓ | ✓ | – | – | – | – |
| WP-28b | IN_PROGRESS | T | T | T | T | – | – | – |
| WP-28c | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-07b | REVIEW | ✓ | ✓ | ✓ | – | – | – | – |
| WP-S1 | INTEGRATED | ✓ | ✓ | – | ✓ | – | – | – |
| WP-19.0 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-19.1 | BLOCKED | T | T | T | T | – | – | – |
| WP-19.2 | BLOCKED | T | T | ✓ | – | – | – | – |
| WP-19.3 | BLOCKED | T | T | ✓ | – | – | – | – |
| WP-19.4 | BLOCKED | T | T | T | T | – | – | – |
| WP-19.5 | BLOCKED | T | T | T | T | – | – | – |
| WP-19.6 | BLOCKED | T | T | T | T | – | – | – |
| WP-19.7 | BLOCKED | T | T | T | T | – | – | – |
| WP-19.8 | BLOCKED | T | T | ✓ | – | – | – | – |
| WP-19.9 | BLOCKED | T | T | ✓ | – | – | – | – |
| WP-19.10 | BLOCKED | T | T | T | T | – | – | – |
| WP-19.11 | BLOCKED | T | T | T | T | – | – | – |
| WP-19.12 | BLOCKED | T | T | T | T | – | – | – |
| WP-I2 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-I3 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-I6 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-I10 | INTEGRATED | ✓ | ✓ | – | ✓ | – | – | – |
| WP-I11 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-I12 | INTEGRATED | ✓ | ✓ | – | ✓ | – | – | – |
| WP-I13 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-I14 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-I15 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-I17 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| SI-P1 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| SI-P2 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| SI-P3 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| SI-P4 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| SI-P5 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| SI-P6 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| SI-P7 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| SI-P8 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| SI-P9 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| IMP-0 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| IMP-1 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| IMP-2 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| IMP-3 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| IMP-4 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| IMP-5 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| IMP-6 | IN_PROGRESS | ✓ | ✓ | ✓ | – | – | – | – |
| IMP-8 | IN_PROGRESS | ✓ | ✓ | – | – | – | – | – |
| IMP-9 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| IMP-10 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| IMP-11 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| QS-1 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| QS-2 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| QS-3 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| OPT-1 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| OPT-1-F | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| OPT-4 | BLOCKED | ✓ | ✓ | ✓ | – | – | – | – |
| WR-1 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WR-2 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WR-3 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WR-6 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-I12a | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-I12b | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-I12c | INTEGRATED | ✓ | ✓ | – | ✓ | – | – | – |
| RB-1 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| RB-2 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| RB-3 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| RB-4 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| RB-5 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-21-SV | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-19-B4 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-19-B5 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-48-GB | IN_PROGRESS | ✓ | ✓ | – | – | – | – | – |
| ABNAHME-V4 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-ST1 | BLOCKED | T | T | – | – | – | – | – |
| QS-4 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| QS-5 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| ABN-A3 | BLOCKED | ✓ | ✓ | T | T | – | – | – |
| ABN-A4 | REVIEW | ✓ | ✓ | T | T | – | – | – |
| ABN-B3 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| QS-6 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| QS-ZEIT | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-ZEIT | IN_PROGRESS | T | T | – | T | – | – | – |
| BE-1 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| BE-2 | INTEGRATED | ✓ | ✓ | – | ✓ | – | – | – |
| BE-3 | BLOCKED | T | T | – | T | – | – | – |
| V4-0 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| V4-1 | IN_PROGRESS | T | ✓ | – | – | – | – | – |
| DEP-1 | REVIEW | ✓ | ✓ | – | – | – | – | – |
<!-- AUTO:END -->

## Klärungen und Widersprüche (2026-11-03)

- **WP-26** stand hier bis heute als „Review abgelehnt … nicht integriert“. Das war veraltet: Ablehnung auf 2c1aa8e →
  H1–H3 umgesetzt → Nachprüfung „integrierbar mit Auflagen“ → N-1…N-4 umgesetzt (7e6a4bb) → Merge #40 (9abf988,
  2026-11-03 07:15). Belege: [`wp26-nachweis.md`](wp26-nachweis.md), `git log origin/integration/centric-complete`.
  Offen bleibt nur, dass eine dokumentierte Freigabe *nach* den N-Auflagen im Nachweis fehlt. Damit ist auch Q-10 aus
  `WP19-MODULPLAN.md` beantwortet.
- **Drei Zählungen liefen auseinander:** `work-packages.json` (zuletzt erzeugt vor WP-47: 46 Pakete, 17 INTEGRATED),
  Array `P` im Werkzeug (47 Pakete, 29 INTEGRATED) und diese Datei (46 Pakete, 25 INTEGRATED, „READY: WP-06, WP-30“,
  WP-24/WP-28 „in Arbeit“, obwohl #59/#60 gemergt waren). Ursache: drei Stellen von Hand gepflegt. Jetzt: eine Quelle,
  eine Prüfung (`pruefungen/acc45-status.test.js`) im CI-Gate.
- **Risiken-Liste veraltet:** WP-11-Fehlalarm (#35), WP-45b-Nachprüfung (#33/#36/#38) und WP-26 waren als „in Arbeit“
  geführt, sind aber integriert. WP-31 „Deploy startet bei Sicherungsfehler gesperrten Altstand“ steht als „Korrektur in
  Arbeit“, die alte Merge-Tabelle als „Freigabe“; ein Nachweis fehlt im Repo → zu klären (Notiz bei WP-31).
- **WP-05** ist integriert, seine Abhängigkeit WP-30 (Mail/Push) nicht; der externe Alarmweg fehlt (E-8).
- **WP-12** ist integriert (Abnahmeprüfungen im Repo), die Akzeptanz „Testplan 3.1–3.4 auf Staging“ aber nicht erfüllt
  (E-1). Commit 3f6f7c8 auf `acc45/qa/wp12b-409-test` ist nicht integriert.
- **WP-33** steht seit 2026-11-02 19:03 auf REVIEW, ohne dokumentiertes Review und ohne Integration; der Branch liegt
  rund 40 Merges hinter dem Integrationsstand.
- **Offener Aufwand neu definiert:** bisher zählten integrierte Pakete bis DONE mit (165,5 PT). Jetzt zählt nur offene
  Entwicklung; was integrierten Paketen bis zur Produktion fehlt, steht als Statusstufe und in den Paketen `E-*`.
- **WP-19** war mit 25 PT geführt; der Modulplan schätzt 63–98 PT (WP-19.0…19.13). **Intelligence** war „kein
  ACC45-Paket“ und nicht in der JSON; jetzt eigener Strang mit eigener Summe, ohne die ACC45-Zahlen zu verändern.

## Gefundene und behobene Fehler (Auswahl, alle mit Test rot → grün)

- Stille Datenverluste bei gleichzeitigen Schreibvorgängen (bis 131 von 200 Stempeln im Lasttest) → behoben.
- Unlesbare Monatsdatei wurde beim nächsten Schreiben gelöscht → behoben.
- Löschlauf, Provisionierung und Kontenpflege ohne Sperre → behoben.
- Sensibles Personenfeld ging an Rollen ohne Berechtigung und war überschreibbar → behoben.
- Bereichssicht der Schichtverantwortung nicht tagesgenau → behoben.
- R0-Abschaltung konnte fälschlich Erfolg melden → behoben.
- Leere Sicherung hätte als Erfolg gegolten → behoben.
- Löschlauf ohne Fristprüfung (Server-Hänger, gesetzlich aufzubewahrende Zeiten löschbar) → behoben (WP-26, #40).

## Offene Risiken (je mit Paket)

- Nachträgliche Korrektur abgeschlossener, bereits exportierter Monate nur über die Zwischenlösung (Wiederöffnen gesperrt)
  → WP-16c (P0), E-29.
- Stempel „500 nach Speicherung“ unter langsamer Platte: Wiederholung könnte doppelt stempeln → WP-07b.
- Stempel-/Korrekturkette: Folgebefunde F2, F4–F8 → WP-14c. Monatsabschluss und Pausen erst im Review → WP-16.
- Lesebremse schützt große Bestände nicht; Feed liest den vollen Bestand → WP-47b.
- Altfeeds ohne Herkunft, Passwortwechsel widerruft Feeds nicht → WP-24b (Entscheidung bis 2026-12-01, E-21).
- Ältere Spur-Zeilen nennen den Tag → WP-16b.
- WP-31-Befund (Altstand nach Sicherungsfehler) ohne Nachweis im Repo → klären.

## Offene Nutzerfreigaben und -entscheidungen

Als Pakete geführt (Strang `extern`, Nummern der Übergabeliste): E-21 (fachliche Entscheidungen vor dem Release),
E-21i (Freigabe Intelligence-Block), E-15 (Code-Rotation Z1–Z7), dazu die übrigen Abnahmen. Einzelheiten:

1. WP-09: Merge des Integrationsstands nach `main` und Produktiv-Deploy (nach Staging-Abnahme E-1).
2. Isolierte VPS-Proben (WP-03 Rücksprung A→B→A, WP-04 Restore auf dem VPS) → E-14, E-7.
3. WP-04: Speicherziel, Verwahrung des restic-Passworts, Alarmdienst → E-7, E-8.
4. WP-03-Einführung: Migration der Produktions-`.env`, gesperrte Bilder samt Tags entfernen → E-13.
5. WP-44 (A9): Ablauf Z1–Z7 → E-15.
6. Fachlich: 120-Tage-Horizont der Server-Nachrechnung; Archiv Bestätigungsprotokoll; sperren oder warnen (Ruhezeit,
   Qualifikation, keineNacht, maxDiensteWoche, keinAlleindienst); `zuschlaege` als Lohnbestandteil? Eigene Bank-/Lohndaten
   für Beschäftigte sichtbar (Art. 15)? `rolleSeit`/`rolleVerlauf` für MA/BR/SV? Sondereinsätze tagesgenau bestätigen;
   WP-14b N2 Vier-Augen, M4 24-h-Einsatz; WP-24 Passwortwechsel/Feeds → E-21.
7. Externe Gates: Pentest beauftragen (E-17a/E-17), iPhone/Tablet (E-3, E-5), Rechtstexte (E-18), Fachnachweise je
   Branchenmodul (E-22), Mitbestimmung (E-19).

### Bewusst zurückgestellt (Nutzerentscheidung 2026-11-03, vor dem Produktiv-Release erneut vorlegen)

- **Mindestbesetzung / PpUGV:** warnen mit Bestätigung oder sperren. Vorläufig umgesetzt: warnen.
- **Alarmweg (WP-05):** externer Uptime-Check und interner Webhook-Kanal. Bis dahin `CENTRIC_ALARM_WEBHOOK` leer, Alarme nur im Log.
- **Einrichtungen:** GitHub-Umgebung `produktion`; Deploy-Skripte und Forced-Command-Schlüssel auf dem Server; `CENTRIC_VERTRAUTE_PROXYS` (Pflicht vor dem nächsten Produktiv-Deploy); WP-30 Mail und Push; alte Netlify-Site; Pflicht-2FA für Betreibercodes.

### Entschieden (2026-11-03)

- Einwilligung/Genehmigung nach MuSchG an der Person erfassbar.
- Planung darf die Einrichtung bearbeiten (Dienstarten, Zeiten, Mindestbesetzung, Vorlagen).
- Lange Dienste (> 10 h) automatisch erlaubt, nur Hinweis.
- Jugendschutz-Schalter „mehrschichtig“ auch für die Planung.
- **P0-Blocker WP-16c:** Korrekturrevisionen eines Monatsabschlusses nach bestätigtem Lohnexport (Revision 1 bleibt,
  neue Revision mit Zeitpunkt/Berechtigtem/Grund/Differenz, Korrekturexport, möglichst zweite Freigabe, keine starre Frist).
  Der Schutz in WP-16 ist nur Zwischenlösung; WP-16 ist erst mit WP-16c abnahmefähig. Externe Prüfung: E-29.
- **Mail/Push (WP-30, E-9) und Betreiber-2FA-Pflicht (WP-32d, E-10)** sind Produktionsblocker.
- **Geo** bleibt Pflichtumfang, wird aber erst nach Echtgerätetest E-4 produktiv aktiviert.
- WP-19: 50 Produktentscheidungen ([`WP19-PRODUKTENTSCHEIDUNGEN-2026-11-03.md`](WP19-PRODUKTENTSCHEIDUNGEN-2026-11-03.md)).

## WP-19 – Module

Pläne: [`WP19-MODULPLAN.md`](WP19-MODULPLAN.md) (Pakete WP-19.0…19.13) und
[`WP19-OFFENE-FACHNACHWEISE.md`](WP19-OFFENE-FACHNACHWEISE.md) (Prüfvorbehalte, Blocker → E-22). Statusstufen je Modul
stehen im erzeugten Block (Zeilen WP-19.x; „T“ = nur Server-Teilumfang). Alle zwölf Module stehen in der Registry auf
`geplant` (nicht einschaltbar) – keines gilt als geliefert.

## CENTRIC Intelligence – eigener Strang

Abgleich: [`INTELLIGENCE-ABGLEICH.md`](INTELLIGENCE-ABGLEICH.md) · Plan: [`INTELLIGENCE-ENTWICKLUNGSPLAN.md`](INTELLIGENCE-ENTWICKLUNGSPLAN.md).
Pakete WP-I1…WP-I37 stehen im Strang `intelligence` der JSON mit eigener Summe; der Plan ist ein Vorschlag zur Freigabe
(E-21i), nichts ist begonnen. Intelligence blockiert keinen ACC45-Schritt.

**Ehrliche Statuszahl, F1–F18 (Funktionskatalog Fassung 7), Abgleich gegen den Code:**

| Klasse | Funktionen |
|---|---|
| 1 vollständig implementiert | **0 von 18** |
| 2 teilweise implementiert (nur deterministischer Kern, ohne KI) | **3 von 18** (F2, F3, F7/F7A) |
| 3 nur spezifiziert | **11 von 18** (F1, F4, F5, F6, F8, F9, F10, F11, F12, F14, F15) |
| 4 noch gar nicht umgesetzt (nur Konzept) | **4 von 18** (F13, F16, F17, F18) |

Kein Gateway, kein Modell, kein Anbieter-Zugang im Code.

## Release-Risiken

- Personaldaten-Filter in Produktion erst mit dem Integrationsstand (bis dahin keine echten Beschäftigtendaten).
- WP-19-Module ohne Fachnachweise (E-22) nur im Hinweisbetrieb; Blocker in `WP19-OFFENE-FACHNACHWEISE.md`.
- Echte Geräte (E-2…E-6) und externer Pentest (E-17) sind nicht von Agenten erbringbar.
- Konfliktzone `src/App.jsx` begrenzt die Parallelität über alle Stränge (siehe `GESAMTPLAN.md`).
