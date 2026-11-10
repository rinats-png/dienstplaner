# Wiederaufnahmepunkt CENTRIC (Stand 2026-11-10 09:10 UTC, Hauptchat aktiv)

> Dieses Dokument ersetzt den Stand vom 09.11. (Nachtübergabe). Wer noch von "Hauptchat beendet" oder
> "Integrationskopf 744a2f68 / 38fc7d0" ausgeht, arbeitet mit veralteten Angaben.

## Koordinationsregel (verbindlich, Stand 2026-11-10, Lease-Werkzeug in der Integration seit #170)
- Schreibender Koordinator ist, wer die Lease im Branch `koordination/lease` hält. Werkzeug: `node werkzeug/koordination.mjs status|uebernehmen|erneuern|freigeben|pruefen|push --halter H [--epoche N]`. Jede Änderung ist ein Commit ohne Force; Git lehnt gleichzeitige Änderungen ab (Compare-and-Swap). Zwei Schreiber sind damit ausgeschlossen, **sofern Branch-Schutz gesetzt ist (siehe unten)**.
- **`--epoche N` ist Pflicht** bei `erneuern`, `freigeben`, `pruefen`, `push` und bei Verlängerung über `uebernehmen`. Ältere Aufrufe ohne Epoche (zum Beispiel in Cloud-Aufgaben-Anweisungen) werden abgelehnt (Exit 1). Aktuelle Epoche: `node werkzeug/koordination.mjs status`.
- `push` (Arbeits-Branch plus Lease atomar) darf nie auf `main`, `master`, `integration/*`, `release/*`, `koordination/*` zielen. Integration läuft ausschließlich über PRs (`gh pr merge --match-head-commit`).
- Unlesbare oder beschädigte Lease (kein JSON-Objekt, kaputtes `freigegeben_am`) ist fail-closed, Exit 4. Ein gelöschter Lease-Branch zählt als "keine Lease" mit Epoche 1: Nach einem unerklärten Epochensprung nach unten nicht weiterarbeiten.
- Gültigkeit 90 Minuten (höchstens 240). Jeder Lauf erneuert am Anfang und vor jedem Push; ohne `pruefen`-Exit 0 keine schreibende Arbeit. Der Halter gilt 2 Minuten vor Ablauf als abgelaufen, Fremde übernehmen frühestens 2 Minuten nach Ablauf.
- Übernahme nur bei fehlender, freigegebener oder abgelaufener Lease und mit ausdrücklicher `--uebergabe` (Beleg). Eine gültige fremde Lease wird nie überschrieben.
- Der Hauptchat ist bevorzugter Koordinator. Die Cloud-Aufgabe (Nachtkoordination) übernimmt nur bei abgelaufener oder freigegebener Lease und gibt sie bei Rückkehr des Hauptchats kontrolliert frei (Arbeit sichern, `freigeben --epoche N`).
- Niemals zwei Schreiber. Kein Merge nach `main`, kein produktives Deployment ohne Betreiberfreigabe.
- **Lease-Verlauf:** 2026-11-10 05:45Z `cloud-nachtaufgabe` (Epoche 1, Betreiber-Anweisung, Hauptchat hatte die Schleife beendet gemeldet), zuletzt erneuert 06:39Z, ohne Freigabe abgelaufen 08:39Z; Cloud-Aufgabe 08:32Z laut Betreiber ohne Änderungen. 09:05Z `hauptchat` übernimmt (Epoche 2, Vorgänger `cloud-nachtaufgabe`), Belegtext in `lease.json`. Integrationskopf bei Übernahme 67dd4426.

## Branch-Schutz fehlt: Lease ist bis dahin nur kooperativ (Betreiberaufgabe, prioritär)
- Belegt am 2026-11-10 (`node werkzeug/branchschutz-pruefen.mjs`, Exit 1): `koordination/lease`, `integration/release-v4` und `main` haben weder klassischen Schutz noch Rulesets. Force-Push und Löschen sind erlaubt.
- Konkrete Einstellungen, Pflicht-Checks, nötige Rechte, gefahrloser Test, Lease-Erhalt und Notausstieg: `docs/acc45/BETREIBER-BRANCHSCHUTZ.md`. Setzen durch den Betreiber; Claude ändert keine GitHub-Berechtigungen.
- Die Lease gilt erst als verlässlicher Schutz gegen parallele Koordinatoren, wenn der Prüfer Exit 0 liefert und der Wirkungstest bestanden ist.

## Abweichungen zu docs/WIEDERAUFNAHME.md (Cloud-PR #168, nicht von dieser Sitzung geändert)
Dieses Dokument (`docs/acc45/WIEDERAUFNAHME.md`) ist für den Acc45-Strang maßgeblich. PR #168 enthält eine parallele Übergabe mit folgenden veralteten Aussagen, die NICHT befolgt werden dürfen:
- „#166 integrieren“: falsch als eigener Merge. #166 (OPT-1) wird nicht einzeln gemergt. Betreiberentscheidung 2026-11-10 (Option A): Der Ersteinrichtungscode aus #166 wird gemeinsam mit dem Anmeldeweg für Leitungskonten über #179 (OPT-1-F) integriert, sobald dort Review und CI erfüllt sind.
- „#164 offen“: falsch. #164 ist geschlossen und durch #169 ersetzt.
- „111 Pflichtpakete, SSOT-Stand 04.11.“: veraltet. Maßgeblich ist `work-packages.json` im Integrationsbranch plus Abgleich über `werkzeug/ssot-belege.mjs`.
- „Koordinator mit Freigabe-Befugnis“ als Nachtkoordinator: die Freigabe liegt beim Betreiber, nicht bei der Nachtaufgabe.
Empfehlung an den Betreiber: #168 entweder auf den Stand dieses Dokuments bringen oder schließen. Dieses Dokument wird nicht gegen #168 zusammengeführt, weil #168 nicht von dieser Sitzung stammt.

## Aktueller Hinweis zur Übergabe
Die Übergabe der Nacht ist beendet. Der Hauptchat ist aktiv und hält die Lease (Epoche 2, siehe oben). Die Cloud-Aufgabe soll weder auf den Stand vom 09.11. noch auf Aufrufe ohne `--epoche` zurückgreifen: Vor jedem Schreibvorgang `node werkzeug/koordination.mjs status` lesen. Hält ein anderer Halter eine gültige Lease, nichts schreiben.

Verbindlich bleiben: kein Merge nach `main` und kein produktives Deployment ohne ausdrückliche Zustimmung des Betreibers; keine Tests abschwächen; keine Geheimnisse ausgeben; der autonome Release-Auftrag bleibt bestehen.

## Integrationsstand
- Integration: `integration/release-v4`, Kopf 67dd4426 (Merge #170, 2026-11-10 09:04Z; davor 0633a6ae nach #176). Die Liste der gemergten PRs steht in `git log --merges origin/integration/release-v4`.
- `main`: 0423eeac. Kein Design-Release nach main ohne Betreiberfreigabe.
- V4-Staging: `public/sw.js` hat auf der Integration `FASSUNG = "__CENTRIC_BUILD__"` (Platzhalter), auf `main` `"v4"`; die frühere Angabe "v5" war falsch. Betreiber bestätigt, welcher Stand angenommen wird (siehe `docs/acc45/STAGING-ABNAHME-V4.md`).

## Offene PRs (Stand 2026-11-10 09:10Z)
- #179 OPT-1-F (Draft, Kopf 073d9fea, im Fix): Anmeldeweg für Leitungskonten mit zweitem Faktor am Konto und Ersteinrichtungscode aus #166 (Option A). Unabhängiges Opus-Review fand einen Blocker (zweite überlappende Bestätigung löschte den aktiven Faktor); Fix mit Test läuft. Erst nach Fix, Re-Review und grüner CI integrieren. Vorher Befund-2/3-Fixes (Kopf 7f7718db) enthalten.
- #175 OPT-1-F, gestapelte ältere Variante auf #166: durch #179 ersetzt; nach Integration von #179 schließen (Koordinator).
- #166 OPT-1: nicht einzeln mergen (siehe oben); schließt sich mit #179, wenn dessen Inhalt in der Integration liegt, oder wird dann als ersetzt geschlossen.
- #177 WP-I4 (Draft): Betriebsrat-Sicht wartet auf Betreiberfreigabe (neue Lesesicht auf interne Vorgaben, § 87 BetrVG offen).
- #178 V4-Staging-Voraussetzungen, #174 WP-I12a, #172 Doku Legal-Teil A: offen, nach CI-Stand und Review zu entscheiden.
- #139 WP-I12c (planKennzahlen, Spanne). Hold, Betreiberentscheidung zur Spanne-Definition.
- #129, #127, #115, #97, #96, #94, #92, #91, #18, #17, #16, #15, #7, #6: ältere Doku-, Feature- und Security-PRs gegen Basen außerhalb der Integration. Vor dem Schließen prüfen, ob Inhalt in der Integration steht (ssot-belege, Commit-Suche). Nicht blind schließen.
- #168 (ccr-…, Cloud-Session): fremd, nicht anfassen.
- #104 "[NICHT INTEGRIEREN]": Referenz, nicht mergen.

## Abgeschlossen in dieser Sitzung (gemergt)
#123 #130 #131 #132 #133 #134 #136 #137 #138 #140 #141 #142 #143 #144 #145 #146 #147 #148 #149 #150 #151 #152 #153 #154 #155 #156 #157 #158 #159 #160 #161 #162 #163 #165 #167 #169 #170 #171 #173 #176
(#169 SSOT-Belege, #170 atomare Lease und REST-Abgleich, #171 SSOT-Abgleich REST-Ausweichweg, #173 V4-Abnahme-Checkliste, #176 WP-35 Darstellung.)

## Abhängigkeiten und Betreiberfreigaben
- E-25: AVV, Zero-Data-Retention, Drittland, DSFA, Mitbestimmung. Voraussetzung für jede produktive KI-Freigabe.
- Monatsbudget gegen Verbrauch (WP-I15) vor Verdrahtung eines Anbieters.
- Browser-Abnahmen: WP-40 (Reflow, Zielgröße, Fokus, Fehlertext 3.3.1), WP-I2 (Schichtfolge), WP-I17 (Intelligence-Antwort).
- **Branch-Schutz setzen (prioritär):** `docs/acc45/BETREIBER-BRANCHSCHUTZ.md`. Ohne ihn ist die Lease nur kooperativ.
- OPT-1 / OPT-1-F: Entschieden am 2026-11-10 (Option A: Ersteinrichtungscode aus #166, kein E-Mail-Weg, keine allgemeine Betreiberfreischaltung). Umsetzung in #179. Betrieblich offen: `werkzeug/testbetrieb-anlegen.mjs` ist nicht im Docker-Image und läuft auf dem Host bei gestopptem Server (Aufnahme ins Image ist eine Infra-Entscheidung).
- Betreiberentscheidung WP-35: Antwort "bejaht" zu Frage 6 (Kartenansicht statt Tabellenscroll) in `wp40-fragen.md` bestätigen.
- I.7 (Altformat v1 bei WR-1). Stand: Empfehlung umgesetzt, blockiert nicht.
- Fristen KI-Löschlauf (30/90 Tage) und Löschkonzept (#161).
- WP-18 Warteschlangen: P1 bis P5 belegen, Option 1 freigeben, Wiederanlauf festlegen. Option 2 nicht genehmigt.
- Rechtsfragen T-18 bis T-20. `IMPORT_DATEI_AKTIV` bleibt aus.
- Korrekturfälle SSOT: WP-16, WP-28b, IMP-10 (Koordinator). WP-08 (DONE ohne Beleg). WP-I18 bleibt BLOCKED bis Anbindung.

## V4-Design-Release (Befund)
- Kein gezielter Pfad-Merge nach main möglich (Funktionsabhängigkeit, Konflikte in App.jsx, main.jsx, sw.js).
- Port-Branch von main nötig: v4/*, Logo, Icons, Manifest, Anschlüsse von Hand; PWA-Fassung auf "v5" (public/sw.js:41).
- Frühester realistischer Termin: 16.11.2026 (Annahme). Betreiberfreigaben (a) bis (f) siehe Analysebericht im Chat.

## Werkzeuge
- `node werkzeug/ssot-abgleich.mjs`: Abgleich mit gemergten PRs (OK, KORREKTUR, BELEG_FEHLT).
- `node werkzeug/ssot-belege.mjs` (Bericht) und `--anwenden` (schreibt nur belegte PR-Nummern, Status unverändert, liest die Arbeitsdatei).
- `node werkzeug/ssot-nach-integration.mjs <PR> [--schreibe]`: Nachführung nach Integration, Sperre, Dry-Run als Standard.
- Vorprüfungsregel: `docs/acc45/AGENTEN-VORPRUEFUNG.md`.

## Was ein neuer Koordinator gefahrlos übernehmen kann
1. CI-Stand der offenen PRs prüfen, grüne ohne Blocker mergen (Head-Guard: `gh pr merge <n> --merge --match-head-commit <sha>`).
2. Rote Checks diagnostizieren (Logs, Ursache belegen), keine Prüfung abschwächen.
3. SSOT mit den Werkzeugen nachführen. Keine Neuimplementierung wegen fehlendem PR.
4. Unabhängiges Opus-Review vor Merge sicherheitskritischer PRs.
5. Nicht eigenmächtig: #166 einzeln integrieren, Design nach main, produktive Deployments, Statusänderungen an DONE-Paketen, Schließen fremder PRs, Änderung von GitHub-Berechtigungen oder Rulesets.
6. Vor Schreibvorgängen `node werkzeug/koordination.mjs status` und `pruefen --halter H --epoche N`. Textsuch-Prüfungen beachten (zum Beispiel verbietet `pruefungen/anmeldung-http.test.js` bestimmte Wörter im Quelltext von `server/funktionen/daten.mjs`): vor dem Push `npm run pruefung` oder zumindest alle Tests, die Quelltexte lesen.

## Agenten und Hintergrund
- Stand 2026-11-10 09:10Z: Ein schreibender Agent (OPT-1-F-Fix auf #179, Branch `sicherheit/opt-1-f-anmeldeweg`) arbeitet im Auftrag des Hauptchats. Alle anderen gemeldeten Agenten (Review #170, Review #179) haben berichtet. Cloud-Sitzungen waren idle.
- Hintergrund-Watcher (Merge bei grün) sind an die Sitzung gebunden und enden mit ihr. Der neue Koordinator startet sie neu, falls nötig.
- Worktrees: viele Agenten-Worktrees unter `.claude/worktrees/`. Nur Worktrees mit ungesicherten Änderungen prüfen (`git status --porcelain`), bevor man sie entfernt. Nicht blind löschen.
