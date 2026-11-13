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

**Pakete gesamt:** 201 · BLOCKED 70 · READY 16 · IN_PROGRESS 19 · REVIEW 7 · INTEGRATED 86 · DONE 3

| Strang | Pakete | BLOCKED | READY | IN_PROGRESS | REVIEW | INTEGRATED | DONE | offener Aufwand PT |
|---|---|---|---|---|---|---|---|---|
| ACC45 | 101 | 18 | 0 | 8 | 3 | 70 | 2 | 43,6–69,9 |
| WP-19-Module | 15 | 13 | 0 | 1 | 1 | 0 | 0 | 65,3–101,7 |
| Intelligence | 40 | 20 | 0 | 8 | 0 | 12 | 0 | 179,5–317,5 |
| Folgepakete | 10 | 1 | 0 | 2 | 3 | 4 | 0 | 5,1–10,1 |
| Extern/Entscheidungen | 35 | 18 | 16 | 0 | 0 | 0 | 1 | 20,35–46,1 |

Offener Entwicklungsaufwand (ohne extern, ohne bedingtes WP-I35): **293,5–499,2 PT**. Integrierte Pakete zählen nicht mehr mit (bis 2026-11-03 zählten sie bis DONE weiter); was ihnen fehlt, steht als Statusstufe und in den externen Paketen.

**Kritische Pfade** (offener Aufwand, Mitte der Spanne maßgeblich):

- gemeinsam: WP-I4 → WP-I5 → WP-I7 → WP-I8 → WP-I9 → WP-I34 → WP-I37 = **50–90 PT**
- ohne Intelligence: WP-19.0 → WP-19.1 → WP-19.2 → WP-19.3 → WP-19.13 → WP-42a → WP-42 = **23,3–36,2 PT**
- ACC45: WP-16 → WP-48 = **8,5–14,5 PT**
- Folgepakete: WP-PILOT = **2–4 PT**
- WP-19: WP-19.0 → WP-19.1 → WP-19.2 → WP-19.3 → WP-19.13 = **19,3–29,7 PT**
- Intelligence: WP-I4 → WP-I5 → WP-I7 → WP-I8 → WP-I9 → WP-I34 → WP-I37 = **50–90 PT**

### In Arbeit / Review

| Paket | Status | Branch | Notiz |
|---|---|---|---|
| WP-09 Kette B nach main | IN_PROGRESS | `integration/centric-complete` | Integrationsbranch steht (65c1188 ff.). Offen: Staging-Abnahme (E-1), Merge nach main, Produktiv-Deploy nach Freigabe. Abhängigkeiten auf WP-09 gelten als reine Livegang-Reihenfolge. |
| WP-15 Selbstauskunft mit Freigabe und Stempelabgleich | REVIEW | `acc45/time/wp15-selbstauskunft-mit-freigabe-` | Abhängigkeit WP-14 integriert; Status von BLOCKED auf READY nachgeführt. Stand 2026-11-09: Code steht im Integrationsbranch, aber per Direkt-Merge ohne PR. Status daher REVIEW statt INTEGRATED, bis ein Merge-PR-Beleg nachgetragen oder der Koordinator entschieden hat. Abgleich 2026-11-12 (6c195b66, docs/acc45/BEREITSCHAFTSANALYSE-2026-11-12.md): Code integriert per Direkt-Merge 1c1a27e0 (feature/wp15-wp32d 3c492f3a), Einbindung 7cee8eaf; PR-Beleg fehlt. Offen: Browser-E2E, Selbstfreigabe Einpersonenbetrieb (F15-2, Betreiber). Abgleich 2026-11-13 (docs/acc45/DIREKTMERGE-ABGLEICH-2026-11-13.md, Betreiberentscheidung 2026-11-13 Punkt 2): Direkt-Merge anerkannt (alle fünf Bedingungen belegt, keine PR-Nummer); Status bleibt REVIEW wegen offener Abnahmekriterien. |
| WP-16 Pausen und Monatsabschluss | REVIEW | `acc45/time/wp16-pausen-und-monatsabschluss` | Kopf 1e1aac1. Teilumfang: Pausen, Monatsabschluss, vorläufiger Schutz (Wiederöffnen nach bestätigtem Lohnexport abgelehnt) — nur Zwischenlösung. Abnahmefähig erst mit WP-16c (P0). Folgepaket WP-16b (ältere Spur-Zeilen nennen den Tag). Abgleich 2026-11-12 (6c195b66, docs/acc45/BEREITSCHAFTSANALYSE-2026-11-12.md): Korrektur: WP-16 kam nicht per Direkt-Merge 594f32c, sondern über PR #85 (58432b75); der Nachweis liegt im Integrationsstand. Status bleibt REVIEW bis zur Koordinatorentscheidung (Betreibervorgabe: abnahmefähig erst mit WP-16c, dessen Kern ebenfalls im Code ist). |
| WP-21 Smartphone/Tablet für alle Rollen | IN_PROGRESS | `acc45/frontend/wp21-smartphone-tablet-fur-alle-r` | Stand (automatisch): INTEGRATED nach #183. Stand 2026-11-10: Teil 1 integriert (#183), siehe docs/acc45/WP-21-GERAETEMATRIX.md. Offen: Querformat und echte Geräte, Bedienabläufe (Stempeln, Plan freigeben, Tag öffnen, Übergabe, Krankmeldung), Kartenansicht nach Betreiberentscheidung wp40-Frage 6, Schnellfilter Mein Plan, Rollen und Rechte, Tastatur-/Vorlesesoftwareprobe, Hinweis Für Tablet und Rechner ausgelegt ansichtsweise zurücknehmen. Stand 2026-11-11: Korrektur der automatischen Nachführung: WP-21 ist nur zum Teil integriert (Teil 1 #183, Teil 2 #192; 274 von 288 Läufen bestanden, docs/acc45/WP-21-GERAETEMATRIX.md Abschnitt 9). Die Rechte-Befunde B16 (plan.publish) und B17 (Krankmeldung der Schichtverantwortung) sind per Betreiberentscheidung vom 2026-11-11 entschieden und mit RB-1 (#199) und RB-2 (#202) umgesetzt. Offen: Kartenansicht (wp40-Frage 6). Offen: echte Geräte, Notch, Textvergrößerung, Dunkel-/Kontrastmodus, Vorlesesoftware, nicht gemessene Ansichten. Stand 2026-11-12: Teil 3 integriert (#211, 35 Render-Prüfungen bei 360/390/768/844x390; Teilmessung in Edge bei 390x844 und 844x390): Leitung Plan freigeben 2/2 (B16 behoben), Leitung/Planung Krankmeldung und Planung Übergabe bestanden. Offen: Schichtverantwortung Übergabe 0/2 (Ansicht fehlt in der SV-Navigation), Schichtverantwortung Krankmeldung 0/2 (Zeitüberschreitung), siehe WP-21-SV. Hinweis „Für Tablet und Rechner ausgelegt“ bleibt unverändert, bis alle 8 Viewports gemessen sind. Kartenansicht weiter blockiert durch wp40-Frage 6. Status bleibt IN_PROGRESS. Stand (automatisch): INTEGRATED nach #213. Stand 2026-11-12: WP-21-SV integriert (#213, Absturz der Startseite bei Nachtdienst von gestern ohne Einstempeln behoben). Die automatische Nachführung hatte WP-21 nach #213 auf INTEGRATED gesetzt; zurückgenommen — WP-21 bleibt IN_PROGRESS (offen: Kartenansicht wp40-Frage 6, echte Geräte, nicht gemessene Viewports, Vorlesesoftware). Stand 2026-11-13: Teil 4 integriert (#258, Merge a5abd89b): alle 8 Viewports sind jetzt durch die Render-Prüfung der CI abgedeckt. Weiterhin offen (ohne Entscheidung oder Gerät nicht ausführbar): Kartenansicht (wp40-Frage 6), echte Geräte (E-5), Textvergrößerung, Vorlesesoftware, manuelle Messung in Edge. Status bleibt IN_PROGRESS. |
| WP-33 Testinfrastruktur (vollständige Sammelprüfung, Playwright, axe) | IN_PROGRESS | `acc45/qa/wp33-testinfrastruktur` | Branch seit 2026-11-02 19:03 unverändert, kein Review dokumentiert, nicht integriert; muss auf den heutigen Integrationsstand (≈ 40 Merges später) nachgezogen werden. Abgleich 2026-11-12 (6c195b66, docs/acc45/BEREITSCHAFTSANALYSE-2026-11-12.md): Von den drei Commits des Branches (3 vor / 1196 hinter) ist 039d62d4 (Sammelkette gegen CI) durch pruefung:verdrahtung und pruefung:ci-abdeckung (#186) inhaltlich abgedeckt; 674d1c04 (Playwright-Suite e2e/, playwright.config.mjs, .github/workflows/e2e.yml, axe) und dc27b7de (Nachweis) fehlen im Integrationsstand. Offener PR #217 (feature/wp33-testinfrastruktur-neu) eines anderen Agenten. Stand nach #217 (Teil, Sammelprüfung: werkzeug/sammelpruefung.mjs, pruefungen/sammelpruefung-bekannt.json, docs/acc45/TESTINFRASTRUKTUR.md): in integration/release-v4, Paket nicht abgeschlossen. Offen: Playwright-e2e- und axe-Suite braucht neue devDependencies (@playwright/test, @axe-core/playwright) – Entscheidung Betreiber/Koordinator. Betreiberentscheidung 2026-11-13: devDependencies @playwright/test und axe-core genehmigt (feste Versionen, Lizenz-/Schwachstellen-/Lieferkettenprüfung, Einbindung in die bestehende CI, keine Prüfung abschwächen, vorhandene Infrastruktur nutzen); die Frage ist beantwortet, siehe docs/acc45/ENTSCHEIDUNG-BETREIBER-2026-11-13.md. Nächster Schritt: Aufnahme in eigenem PR, dann e2e/axe-Suite für WP-21 und WP-40. |
| WP-40 Barrierefreiheit WCAG 2.2 AA | IN_PROGRESS | `acc45/frontend/wp40-barrierefreiheit-wcag-2-2-aa` | Stand 2026-11-09: REVIEW. Quelltext-Prüfung bestanden, Browser-Abnahme offen (Reflow 1.4.10, Zielgröße 2.5.8, Fokus 2.4.11, Fehlertext 3.3.1). Abgleich 2026-11-12 (6c195b66, docs/acc45/BEREITSCHAFTSANALYSE-2026-11-12.md): Browser lokal (abnahme-kern.mjs, 6203b0a): 2.5.8 und 3.3.1 ohne Befund; 1.4.10 Leitung 320 px Schublade/Verteilung 26 px Querscroll; 2.4.11 Leitung 320 px Tab-Stopps in geschlossener Schublade — seither visibility:hidden in src/ui/geraete.js, nicht nachgemessen. axe nicht installiert (WP-33). Stand nach #221 (Teil, docs/acc45/WP-40-BEFUNDE.md): 2.4.11 Fokus über scroll-padding behoben, 3.3.1 aria-describedby in Krankmeldung/Antrag, Korrektur nur offener Hinweis. Offen: Mitarbeiter bei 768 px Stempel/Korrektur Zeitüberschreitung (kein vollständiger Neulauf); 1.4.12, Zoom, Screenreader, axe, Safari, echte Geräte. |
| WP-16c Monatsabschluss: Korrekturrevisionen nach bestätigtem Lohnexport (Revision, Differenz, Korrekturexport, Freigabe, Audit) | REVIEW | `acc45/time/wp16c-korrekturrevisionen` | P0-Produktionsblocker (Betreiberentscheidung 2026-11-03), Sicherheitsklasse kritisch (Opus). Der Schutz in WP-16 (Wiederöffnen nach bestätigtem Lohnexport abgelehnt, Aktion „Lohnexport bestätigen“) ist nur Zwischenlösung; WP-16 ist erst mit WP-16c abnahmefähig. Rechtliche/buchhalterische Detailanforderungen: E-29. SCHÄTZUNG. Abgleich 2026-11-12 (6c195b66, docs/acc45/BEREITSCHAFTSANALYSE-2026-11-12.md): Kern im Code (Revisionen, Differenz, Korrekturexport, zweite Freigabe, verwerfen, keine Frist), Direkt-Merge 594f32c3, PR-Beleg fehlt. Lücke: Laufzeitmessung des Korrekturpfads 60/150/400 × 12/24/36 fehlt (wp16c-fragen.md L6; werkzeug/wp16-messung.mjs misst nur Abschluss/Freeze). Offen als Betreiberentscheidung/E-29: Fragen 1, 3, 5, 6, 7, R2, R7, L5. Stand nach #223 (Teil, docs/acc45/WP-16c-MESSUNG.md): Messung des Korrekturpfads 60/150/400 Personen, alle 9 Zellen auf Bibliotheksebene ohne Befund. Nicht gemessen: HTTP-Pfad, Offline-Stempel, Migration, VPS. Beobachtung: reine Ist-Zeit-Änderung ohne Planwirkung ergibt leere Differenz, weil Mehrarbeit nur bei positivem Konto entsteht – fachlich bestätigen. Status unverändert REVIEW. Abgleich 2026-11-13 (docs/acc45/DIREKTMERGE-ABGLEICH-2026-11-13.md, Betreiberentscheidung 2026-11-13 Punkt 2): Direkt-Merge anerkannt (alle fünf Bedingungen belegt, keine PR-Nummer); Status bleibt REVIEW wegen offener Abnahmekriterien. |
| WP-48 Sichere Teilspeicherung (Delta je Segment mit Versionen) und kurze Raumsperre beim Monatsabschluss | IN_PROGRESS | `acc45/docs/wp48-teilspeicherung-entwurf` | Betreiberentscheidung 2026-11-03: P0-Blocker für den vollen Produktivbetrieb. Entwurf erledigt (Dokument und Messskript, Branch acc45/docs/wp48-teilspeicherung-entwurf); Umsetzung in WP-48.1–48.7 und 48.9 laut Dokument, 48.1 und 48.2 können vor der Integration von WP-16 beginnen. Status BLOCKED statt READY, weil die Prüfung READY nur mit integrierten Abhängigkeiten zulässt (WP-16 steht auf REVIEW). GET-Fenster (WP-48.8) nicht im Aufwand, eigene Entscheidung. Fortschritt 2026-11-03: WP-48.1 (Prüfnetz: Rundweg je Rolle über den Positivkatalog, Rennen/Konflikte im Speicherkern, Mutantenwerkzeug werkzeug/wp48-mutanten.mjs) und WP-48.2 (Hash-Vermerk mit Lesen alter Text-Vermerke, Lesecache unter der Raumsperre, Segmentschreiber teileSchreiben, Epoche, Vermerk-Aufräumen) umgesetzt auf Branch acc45/backend/wp48-1-2-pruefnetz-speicherkern, ohne PR; Befund für 48.3: gespeicherte abgeleitete Personenfelder brechen die Rundweg-Invariante (Schichtverantwortung 403), siehe WP48-TEILSPEICHERUNG.md Abschnitt 7. Abgleich 2026-11-12 (6c195b66, docs/acc45/BEREITSCHAFTSANALYSE-2026-11-12.md): Korrektur: WP-48.1/48.2 sind nicht „ohne PR“, sondern über PR #87 (acc45/backend/wp48-integration) integriert; teileSchreiben hat im Produktcode keinen Aufrufer. 48.3 ist technisch ausführbar (WP-16 ist über PR #85 im Code), die SSOT sperrt nur formal; 48.4/48.5/48.8 hängen an den Entscheidungen in Abschnitt 6. Stand (automatisch): Teilumfang nach #224, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). |
| WP-14c Stempel-/Korrekturkette: Folgebefunde F2, F4–F8 aus dem WP-14b-Delta-Review | REVIEW | `acc45/time/wp14c-folgebefunde` | SCHÄTZUNG (nicht gemessen). F8 setzt WP-16 (pauseZuLang) voraus. Abgleich 2026-11-12 (6c195b66, docs/acc45/BEREITSCHAFTSANALYSE-2026-11-12.md): Code integriert per Direkt-Merge 594f32c3, PR-Beleg fehlt. F6 (ungeplanter 24-h-Einsatz, Fehlstempel verwerfen) bleibt Fachentscheidung (wp16c-fragen.md F6a/F6b). Abgleich 2026-11-13 (docs/acc45/DIREKTMERGE-ABGLEICH-2026-11-13.md, Betreiberentscheidung 2026-11-13 Punkt 2): Direkt-Merge nicht anerkannt: Review nur durch Aussage im Merge-Commit belegt, nachzuholen: Review. |
| WP-16b Spur: ältere Spur-Zeilen nennen noch den Tag (Datenschutz nach WP-14b M1) | REVIEW | `acc45/time/wp16b-spur-tag` | SCHÄTZUNG. Abgleich 2026-11-12 (6c195b66, docs/acc45/BEREITSCHAFTSANALYSE-2026-11-12.md): Code integriert per Direkt-Merge 594f32c3, PR-Beleg fehlt. Altzeilen beim Lesen geschwärzt (server/lib/schutz.mjs spurFuerBetreiber); offen nur die Frage, ob die Ablage zusätzlich bereinigt wird (wp16c-fragen.md). Abgleich 2026-11-13 (docs/acc45/DIREKTMERGE-ABGLEICH-2026-11-13.md, Betreiberentscheidung 2026-11-13 Punkt 2): Direkt-Merge nicht anerkannt: Review nur durch Aussage im Merge-Commit belegt, nachzuholen: Review. |
| WP-28b Lasttest-Befund 6: Sicherung bricht unter Last mit ENOENT ab (Wiederholung greift nicht); Auswertung des Nachlaufs S2/S5 | IN_PROGRESS | `acc45/infra/wp28b-nachlauf` | NICHT ERLEDIGT, fail-closed Teilfix (PR #100). Unter Dauerlast gelingt die Sicherung weiterhin nicht zuverlässig (ca. 17 Schreibvorgänge/s auf 3000 Dateien: 1 von 14; mit der Vorgabe-Ruhezeit von 1 s schon bei 8/s keine). Die Ruhezeit senkt das Risiko halber Mehrdatei-Transaktionen in der Sicherung, garantiert aber keine transaktionsübergreifende Konsistenz. Offen: (1) Nachlauf S2/S5 (E-20, Handstart durch den Betreiber); (2) nach Reparatur der CI-Basis (PR #102 / fix/ci-baseline) die blockierten Prüfungen nachholen: Docker-Bildbau, Betrieb-Sicherung-Ende-zu-Ende, die Fachprüfungen hinter dem Typen-Schritt; (3) Folgepaket WP-28c (koordinierter Schreib-Halt). |
| WP-07b Stempel-Sonderfall „500 nach Speicherung“ (clientEventId, sechs Szenarien) | REVIEW | `acc45/time/wp07b-500-nach-speicherung` | SCHÄTZUNG; Konfliktzone Stempelpfade: nicht gleichzeitig mit WP-14c/WP-19.7/WP-19.6. Abgleich 2026-11-12 (6c195b66, docs/acc45/BEREITSCHAFTSANALYSE-2026-11-12.md): Prüfung integriert per Direkt-Merge 594f32c3, PR-Beleg fehlt. Abgleich 2026-11-13 (docs/acc45/DIREKTMERGE-ABGLEICH-2026-11-13.md, Betreiberentscheidung 2026-11-13 Punkt 2): Direkt-Merge nicht anerkannt: Review nur durch Aussage im Merge-Commit belegt, nachzuholen: Review. |
| WP-19.0 WP-19 Kern-Nacharbeit (Aktivierung, Mitbestimmungsbestätigung, Regelwerte, Einhängepunkte) | REVIEW | `acc45/frontend/wp19-0-modulkern` | Basis des Kerns (Registry, Katalog, Andockpunkte) integriert in #44; offen ist die Nacharbeit aus Abschnitt 13. Kopf 59079b5, CI grün, Opus-Review läuft (Stand: implementiert/lokal getestet). Abgleich 2026-11-12 (6c195b66, docs/acc45/BEREITSCHAFTSANALYSE-2026-11-12.md): Nacharbeit aus Abschnitt 13 vollständig über PR #82 integriert (in integration/centric-complete, Vorfahr von integration/release-v4). Status-Hebung = Koordinatorentscheidung. Fachlich offen: FN-32, FN-33; Folgepaket stammdatenMonate/gruendeMonate. |
| WP-19.13 WP-19 Modulabnahme (E2E, Viewports, Rollenmatrix, Status „vorlaeufig“) | IN_PROGRESS | `acc45/qa/wp19-13-modulabnahme` | Stand (automatisch): Teilumfang nach #243, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). |
| WP-I4 Interne Vorgaben: Verwaltung | IN_PROGRESS | `intelligence/wp-i4-interne-vorgaben-verwalt` | SCHÄTZUNG laut Plan (nicht belegt); Plan ist Vorschlag zur Freigabe (E-21i). Stand (automatisch): Teilumfang nach #256, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). Offene Betreiberfragen: (1) Darf die Planung die Vorgaben lesen und ändern? (2) Welche Betriebsratssicht, falls überhaupt (§ 87 BetrVG, BLOCKED auf Betreiber)? (3) Braucht es ein Protokoll für Löschen/Deaktivieren? (4) Tarif 'pro' = Grenze 25 des Business-Tarifs bestätigen? (5) Muss eine geänderte Vorgabe neu getestet werden (nur die Oberfläche erzwingt, nicht der Server)? |
| WP-I19 Altplan-Übernahme (F7A) | IN_PROGRESS | `intelligence/wp-i19-altplan-ubernahme-f7a` | SCHÄTZUNG laut Plan (nicht belegt); Plan ist Vorschlag zur Freigabe (E-21i). Stand (automatisch): Teilumfang nach #236, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). |
| WP-I20 Ausfall-Vorschlag (F3) | IN_PROGRESS | `intelligence/wp-i20-ausfall-vorschlag-f3` | SCHÄTZUNG laut Plan (nicht belegt); Plan ist Vorschlag zur Freigabe (E-21i). Stand (automatisch): Teilumfang nach #222, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). Offen nach #222 (keine Verhaltensänderung im Rechenkern): Zeitumstellung (DST) bei Ruhezeit in Near-Miss/Spielraum gegenüber Befund als Engine-Frage; HTTP-Einbindung; Gateway-Text; Golden um Ruhezeit-/Folgegrenzen (#174). |
| WP-I23 F9 Hilfe-Assistent | IN_PROGRESS | `intelligence/wp-i23-f9-hilfe-assistent` | SCHÄTZUNG laut Plan (nicht belegt); Plan ist Vorschlag zur Freigabe (E-21i). Stand (automatisch): Teilumfang nach #219, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). Offen nach #219 (25 Hilfetexte, BM25, /api/hilfe/status|frage, Schalter CENTRIC_HILFE_ASSISTENT aus|suche|an): fachliche Freigabe der Korpus-Inhalte; Sichtbarkeit von suche für Piloten; Gesundheitstexte für das Modell gesperrt bestätigen; Gateway-Verdrahtung nach E-25/E-26. PR #233: Browserfähigkeit der Anzeige hergestellt (byteLaenge statt Buffer.byteLength), Einhängepunkte offen (docs/acc45/INTELLIGENCE-UI.md). |
| WP-I24 F15 Änderungsübersicht | IN_PROGRESS | `intelligence/wp-i24-f15-anderungsubersicht` | SCHÄTZUNG laut Plan (nicht belegt); Plan ist Vorschlag zur Freigabe (E-21i). Stand (automatisch): Teilumfang nach #218, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). Offen nach #218 (docs/acc45/wp-i24-nachweis.md): Ablage des Seit-letztem-Besuch-Standes, HTTP-Einbindung von /ki, Sicht für Mitarbeitende, Gateway-Text, aenderung.art in den Rechenkern. PR #233: Browserfähigkeit der Anzeige hergestellt (byteLaenge statt Buffer.byteLength), Einhängepunkte offen (docs/acc45/INTELLIGENCE-UI.md). |
| WP-I29 Batch-Infrastruktur + F4, F11, F12 | IN_PROGRESS | `intelligence/wp-i29-batch-infrastruktur-f4-f` | SCHÄTZUNG laut Plan (nicht belegt); Plan ist Vorschlag zur Freigabe (E-21i). Stand (automatisch): Teilumfang nach #254, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). |
| WP-I30 F5 Nachrichten-Werkstatt | IN_PROGRESS | `intelligence/wp-i30-f5-nachrichten-werkstatt` | SCHÄTZUNG laut Plan (nicht belegt); Plan ist Vorschlag zur Freigabe (E-21i). Stand (automatisch): Teilumfang nach #250, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). |
| WP-I31 F6 Fragen an Daten | IN_PROGRESS | `intelligence/wp-i31-f6-fragen-an-daten` | SCHÄTZUNG laut Plan (nicht belegt); Plan ist Vorschlag zur Freigabe (E-21i). Stand (automatisch): Teilumfang nach #228, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). |
| WP-PILOT Pilotbetriebe A (Pflege) und B (Sicherheitsdienst): Erhebung, synthetische Testszenarien, Datenschutzrahmen | IN_PROGRESS | `acc45/docs/pilot-erhebung` | SCHÄTZUNG (nicht gemessen). Nur Doku und synthetische Testdaten-Definitionen; Seed-Umsetzung der Datensätze SD-P/SD-S fehlt noch (Anschluss an WP-S1). Echtdaten erst nach Erfüllung aller Voraussetzungen der Stufe 3 im Datenschutzrahmen; externe Punkte (AVV, Pilotvereinbarung, Mitbestimmung) offen. Szenarien mit Modul-Voraussetzung erst nach Einschaltbarkeit der WP-19-Module ausführbar. Stand (automatisch): Teilumfang nach #229, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). |
| IMP-6 Schichtmodelle und Schichtzyklen: mehrere Modelle, unterschiedliche Zykluslängen, bestehende Validierungen | IN_PROGRESS | `–` | Freigabe Punkt 5. Ressourcenlimits fachlich begründet, nicht als Geschäftsregel. Stand 2026-11-10: Bibliothek integriert (#185), siehe docs/acc45/IMP-6-NACHWEIS.md. Offen: Schreiben in den Bestand (mehrere Modelle je Person brauchen eine Datenmodell-Entscheidung), Verdrahtung in /api/import und Oberfläche. Stand 2026-11-12: PR #240 integriert Analyse und Vorschau für art=schichtzyklus in /api/import hinter CENTRIC_IMPORT_AKTIV (aus); nur Vorschau, Übernahme antwortet 422 und schreibt nichts; DoS-Grenzen (10.000 Zeilen je Blatt vor der Berechnung, Zellen über 100 Zeichen ersetzt, Bremse auf Analyse/Vorschau, Bibliothek linear); keine Modell- oder Kopfzeilentexte im Echo; gemeinsame server/lib/bezeichnungen.mjs. Offen: Schreiben der Modelle (Datenmodellentscheidung mehrere Modelle je Person), Arbeitszeitprüfung im Endpunkt, Oberfläche, Analyse-Ergebnis-Cache (Vorschau rechnet Analyse neu: ca. 2,7 s im ungünstigsten Fall an der Grenze). Stand (automatisch): Teilumfang nach #251, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil). Betreiberentscheidung 2026-11-13: mehrere Schichtmodelle je Person genehmigt (eindeutige Identität und Gültigkeitszeitraum je Modell, serverseitige Prüfung, eindeutig bestimmbares Modell je Planung, keine stille Auflösung von Überschneidungen, keine rückwirkende Änderung abgeschlossener Pläne, Protokoll der Zuordnungsänderungen, keine stille Migration, kontrollierte Klärung bei fehlender Zuordnung); die Datenmodellentscheidung ist damit getroffen, das Schreiben der Modelle ist zu entwickeln, siehe docs/acc45/ENTSCHEIDUNG-BETREIBER-2026-11-13.md. |
| IMP-8 Synthetische Testdateien und Testmatrix (20 Fälle, je Unit/HTTP/E2E) | IN_PROGRESS | `–` | Nur synthetische Daten. Stand 2026-11-12: PR #215 integriert: 20 Fälle auf Unit-Ebene belegt (12 zusätzlich über den echten Handler), E2E im Browser für alle 20 offen (Oberfläche ausgeschaltet), keine Befunde. docs/acc45/IMPORT-PLAN.md existiert im Repo nicht; die 20 Fälle sind aus IMPORT-VERTRAG.md und dem IMP-1-Nachweis rekonstruiert (Herleitung in docs/acc45/IMP-8-TESTMATRIX.md). Die Akzeptanz 'Alle Fälle aus der Anforderungsliste' ist damit nicht gegen eine Betreiberliste geprüft. Status bleibt IN_PROGRESS, bis Betreiber/Koordinator die Fallliste bestätigt. |
| OPT-4 SI-P4 Option 4: zweiter Faktor (TOTP) direkt für Benutzerkonten, Zielarchitektur | IN_PROGRESS | `–` | Genehmigt und priorisiert 2026-11-09. Langfristige Zielarchitektur. Die Konto-Wiederherstellung (WR-9) hängt davon ab und zählt ihren Aufwand separat. Stand 2026-11-10: Teilumfang integriert (#182), siehe docs/acc45/OPT-4-WR-2-LUECKEN.md; Migration bestehender Konten offen. |

### Bereit zum Start (9)

WP-34 (acc45, 1–1,5 PT) · WP-I16 (intelligence, 8–14 PT) · WP-I22 (intelligence, 8–14 PT) · SI-P6b (acc45, 1,5–3 PT) · OPT-2 (acc45, 0,5–1 PT) · WR-4 (acc45, 1 PT) · WR-5 (acc45, 2 PT) · WP-I12c (intelligence, 0,5–1 PT) · WP-19-B6 (acc45, 0,3–0,5 PT)

### Integriert in `integration/centric-complete` (86)

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
| WP-19 Branchenpakete (12 Module) | PR #247 in integration/release-v4 | PR #247 in integration/release-v4 |
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
| RB-1 Rollenrecht plan.publish: verbindliche Dienstplanveröffentlichung nur durch Betriebsleiter und Planer | PR #199 in integration/release-v4 | PR #199 in integration/release-v4 |
| RB-2 Krankmeldung zweistufig: Schichtverantwortung bestätigt vorläufig, Planer oder Betriebsleiter endgültig | PR #202 in integration/release-v4 | PR #202 in integration/release-v4 |
| RB-3 Rolle kunde ohne plan.publish und ohne endgültige Krankmeldungsbestätigung; Demo-Funktionen über ausdrücklich zugewiesene Demo-Rollen | PR #206 in integration/release-v4 | PR #206 in integration/release-v4 |
| RB-4 Benachrichtigung bei eingegangener Krankmeldung (Planer, Betriebsleiter, sachlich Schichtverantwortung), Push und E-Mail ohne Gesundheitsdetails | PR #205 in integration/release-v4 | PR #205 in integration/release-v4 |
| RB-5 Offene Krankmeldung: Schicht intern klärungsbedürftig markieren, Unterbesetzung und Ersatzvorschläge vorbereiten, veröffentlichter Plan unverändert, keine eigenmächtige Umbesetzung | PR #207 in integration/release-v4 | PR #207 in integration/release-v4 |
| WP-21-SV Schichtverantwortung: Ansicht Übergabe fehlt in der SV-Navigation, Krankmeldung-Ablauf Timeout auf Smartphone (Befund aus WP-21 Teil 3) | PR #213 in integration/release-v4 | PR #213 in integration/release-v4 |
| WP-19-B4 Modul-Registry: modulAktiv fail-closed; Berichtigung nach Art. 16 vereinheitlichen | PR #247 in integration/release-v4 | PR #247 in integration/release-v4 |
| WP-19-B5 Oberflächen der geplant-Module: Bearbeiten und Löschen bei Status geplant ausblenden | PR #249 in integration/release-v4 | PR #249 in integration/release-v4 |

### Statusstufen

✓ belegt · T teilweise (z. B. nur Server-Teilumfang) · – nicht erreicht oder nicht belegt. „Staging“, „Freigabe“ und
„prod.“ stehen nur mit Beleg auf ✓. Gezeigt sind alle Pakete mit mindestens einer erreichten Stufe; alle übrigen
49 offenen Entwicklungspakete stehen auf allen Stufen auf „–“.

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
| WP-09 | IN_PROGRESS | T | – | – | – | – | – | – |
| WP-10 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-11 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-12 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-13 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-14 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-15 | REVIEW | ✓ | ✓ | ✓ | – | – | – | – |
| WP-16 | REVIEW | ✓ | ✓ | T | – | – | – | – |
| WP-17 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-18 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-19 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-20 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-21 | IN_PROGRESS | ✓ | ✓ | ✓ | – | – | – | – |
| WP-22 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-23 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-24 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-25 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-26 | INTEGRATED | ✓ | ✓ | T | ✓ | – | – | – |
| WP-27 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-28 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-29 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-30 | BLOCKED | ✓ | – | T | – | – | – | – |
| WP-31 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-32 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-33 | IN_PROGRESS | ✓ | T | – | – | – | – | – |
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
| WP-48 | IN_PROGRESS | T | T | T | – | – | – | – |
| WP-14c | REVIEW | T | ✓ | ✓ | – | – | – | – |
| WP-27c | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-47b | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-16b | REVIEW | ✓ | ✓ | ✓ | – | – | – | – |
| WP-28b | IN_PROGRESS | T | T | T | T | – | – | – |
| WP-28c | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-07b | REVIEW | ✓ | ✓ | ✓ | – | – | – | – |
| WP-S1 | INTEGRATED | ✓ | ✓ | – | ✓ | – | – | – |
| WP-19.0 | REVIEW | ✓ | ✓ | ✓ | – | – | – | – |
| WP-19.1 | BLOCKED | T | T | T | T | – | – | – |
| WP-19.2 | BLOCKED | T | T | – | – | – | – | – |
| WP-19.3 | BLOCKED | T | T | – | – | – | – | – |
| WP-19.4 | BLOCKED | T | T | T | T | – | – | – |
| WP-19.5 | BLOCKED | T | T | – | – | – | – | – |
| WP-19.6 | BLOCKED | T | T | – | – | – | – | – |
| WP-19.7 | BLOCKED | T | T | T | T | – | – | – |
| WP-19.8 | BLOCKED | T | T | – | – | – | – | – |
| WP-19.9 | BLOCKED | T | T | – | – | – | – | – |
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
| OPT-4 | IN_PROGRESS | ✓ | ✓ | ✓ | – | – | – | – |
| WR-1 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WR-2 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WR-3 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WR-6 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-I12a | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-I12b | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| RB-1 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| RB-2 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| RB-3 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| RB-4 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| RB-5 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-21-SV | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-19-B4 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-19-B5 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
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
