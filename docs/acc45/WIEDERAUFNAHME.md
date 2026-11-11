# Wiederaufnahmepunkt CENTRIC (Stand 2026-11-11 ca. 03:40 UTC, Hauptchat aktiv, Lease Epoche 6)

> Dieses Dokument ersetzt den Stand vom 09.11. (Nachtübergabe). Wer noch von "Hauptchat beendet" oder
> "Integrationskopf 744a2f68 / 38fc7d0" ausgeht, arbeitet mit veralteten Angaben.

## Nachtlauf-Zusatz 2 (2026-11-11 ca. 01:45Z, geplanter Cloud-Lauf)
- Integrationskopf: ecfa1ef (Merge #193). Lease `cloud-nachtaufgabe`, Epoche 4 (Vorgaenger Epoche 3, freigegeben 00:33Z). Keine neuen Arbeits-PRs, keine schreibenden Agenten. Offene PRs unveraendert (Entwuerfe #175, #177, #104, aeltere Doku-/Security-PRs).
- Branch-Regel eingehalten: Arbeitsbranch von `origin/integration/release-v4`, Ziel-PR gegen `integration/release-v4`.
- Vorpruefung der Pakete WR-4, WR-5, WR-6 (Befund, keine Neuimplementierung):
  - **WR-5**: T14 bis T18 und T20 sind durch die WR-3-Pruefungen (`kontowiederherstellung-kern.test.js`, `-http.test.js`) bereits abgedeckt (Einmaligkeit, Wiederverwendung, Bremse, Gleichzeitigkeit, Mandantentrennung, Rollenpruefung, J.2f Rollenverlust, Protokoll ohne Geheimnisse). Es fehlt nur **T19** (Kennzeichen `betreiberprozess` bei weniger als zwei Berechtigten, D8 403): im Code nicht vorhanden, haengt an der Betreiberentscheidung I.5 (alleiniges Betreiberkonto). WR-5 ist damit bis zu I.5 nicht sinnvoll als eigenes Paket zu vergeben; kein Blindtest ohne Spezifikation.
  - **WR-4**: verlangt eine Zweitfreigabe fuer `werkzeug/betreiber-2fa-zuruecksetzen.mjs`. Die Art der Zweitfreigabe (zweiter personengebundener Betreiberzugang oder externe Instanz, Vorlage I.6) ist Betreiberentscheidung. Eine selbst erfundene Zweitfreigabe in einem Sicherheitswerkzeug wird nicht gebaut. Das Werkzeug bleibt unveraendert (nur Test/Staging, nicht fuer Produktion freigegeben).
  - **WR-6** (Oberflaeche): haengt nur an WR-3, ist unabhaengig von I.5 und der naechste ausfuehrbare Arbeitspaket-Kandidat (`src/`, daten.mjs-Konfliktzone beachten, Schalter `CENTRIC_KONTOWIEDERHERSTELLUNG` aus). Nicht in diesem kurzen Lauf begonnen.
- **Betreiberentscheidungen, die den kritischen Pfad Kontowiederherstellung blockieren:** I.5/I.6 (Zweitfreigabe, alleiniges Betreiberkonto) fuer WR-4, WR-5(T19), WR-BETREIBER.
- Branch-Schutz fuer `koordination/lease`, `integration/release-v4`, `main` weiterhin Betreiberaufgabe (siehe oben); ohne ihn bleibt die Lease kooperativ.

## Nachtlauf-Zusatz (2026-11-10 ca. 23:40Z, geplanter Cloud-Lauf)
- Integrationskopf: cf01a40 (Merge #191 WR-3, #192 WP-21 Teil 2). Lease: `cloud-nachtaufgabe`, Epoche 3 (Vorgaenger hauptchat, Epoche 2 seit 21:56Z abgelaufen). Hauptchat uebernimmt bei Rueckkehr nur nach `freigeben --epoche 3`.
- Offene Arbeits-PRs: keine neuen. Entwuerfe #175, #177, #104 unveraendert (Betreiberentscheidung). Keine schreibenden Agenten aktiv.
- SSOT: Belege fuer #191 (WR-3) und #192 (WP-21) nachgefuehrt, Status unveraendert (WR-3 BLOCKED, WP-21 IN_PROGRESS, Statuspflege liegt beim Koordinator nach Review). 
- Naechste ausfuehrbare Pakete: WR-4, WR-5, WR-6 (Abhaengigkeit WR-3 integriert; Schalter ausgeliefert aus). Vor Start Status in der SSOT pruefen.
- Automatische Fortsetzung: dieser Lauf ist ein geplanter Cloud-Task; weitere Laeufe nur lesend/Statuspflege, solange die Lease nicht eindeutig bei diesem Halter liegt.

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
- Integration: `integration/release-v4`, Kopf 5d0b867b (Merge #194, 2026-11-11 02:56Z; davor #193, #191 = cf01a404). Die Liste der gemergten PRs steht in `git log --merges origin/integration/release-v4`.
- `main`: 0423eeac. Kein Design-Release nach main ohne Betreiberfreigabe.
- V4-Staging: `public/sw.js` hat auf der Integration `FASSUNG = "__CENTRIC_BUILD__"` (Platzhalter), auf `main` `"v4"`; die frühere Angabe "v5" war falsch. Betreiber bestätigt, welcher Stand angenommen wird (siehe `docs/acc45/STAGING-ABNAHME-V4.md`).

## Offene PRs (Stand 2026-11-10 ca. 15:10Z)
- #175 OPT-1-F, gestapelte ältere Variante (Draft): durch #179 ersetzt. Das Schließen wurde vom Berechtigungssystem verweigert; **Entscheidung beim Betreiber** (schließen oder stehen lassen). Kein Inhalt geht verloren (Branch `acc45/opt-1-f-anmeldeweg` bleibt).
- #177 WP-I4 (Draft): Betriebsrat-Sicht wartet auf Betreiberfreigabe (neue Lesesicht auf interne Vorgaben, § 87 BetrVG offen).
- Alle übrigen Integrations-PRs dieser Sitzung (#166, #170, #172, #174, #178 bis #194) sind gemergt, siehe unten.
- #139 WP-I12c (planKennzahlen, Spanne). Hold, Betreiberentscheidung zur Spanne-Definition.
- #129, #127, #115, #97, #96, #94, #92, #91, #18, #17, #16, #15, #7, #6: ältere Doku-, Feature- und Security-PRs gegen Basen außerhalb der Integration. Vor dem Schließen prüfen, ob Inhalt in der Integration steht (ssot-belege, Commit-Suche). Nicht blind schließen.
- #168 (ccr-…, Cloud-Session): fremd, nicht anfassen.
- #104 "[NICHT INTEGRIEREN]": Referenz, nicht mergen.

## Abgeschlossen in dieser Sitzung (gemergt)
#123 #130 #131 #132 #133 #134 #136 #137 #138 #140 #141 #142 #143 #144 #145 #146 #147 #148 #149 #150 #151 #152 #153 #154 #155 #156 #157 #158 #159 #160 #161 #162 #163 #165 #166 #167 #169 #170 #171 #172 #173 #174 #176 #178 #179 #180 #181 #182 #183 #184 #185 #186 #187 #188 #189 #190 #191 #192
(#189 WIEDERAUFNAHME und Merge-Helfer, #190 WP-I12 auf INTEGRATED (Koordinator-Entscheidung nur für dieses Paket), #191 WR-3 Verlust-Schnittstelle (ausgeliefert aus), #192 WP-21 Teil 2, #169 SSOT-Belege, #170 atomare Lease und REST-Abgleich, #171 SSOT-Abgleich REST-Ausweichweg, #172 Doku Legal-Teil A, #173 V4-Abnahme-Checkliste, #174 WP-I12a Rechenkern, #176 WP-35 Darstellung, #178 V4-Staging-Voraussetzungen, #179 OPT-1-F inklusive OPT-1/#166, #180 Branchschutz-Prüfer und Betreiberanleitung, #181 und #184 und #188 SSOT-Nachführung, #182 OPT-4 (Teilumfang) und WR-2, #183 WP-21 Teil 1, #185 IMP-6 Bibliothek, #186 CI-Abdeckung samt Wächter, #187 IMP-5 und IMP-9.)

Stand der Pakete dazu: WR-3 INTEGRATED (Funktion aus), WP-21 IN_PROGRESS (Teil 1 und 2), IMP-6 IN_PROGRESS (Bibliothek, nicht in `/api/import` verdrahtet, kein Schreiben in den Bestand), OPT-4 IN_PROGRESS (Migration bestehender Leitungskonten offen), WR-2, IMP-5, IMP-9, OPT-1, OPT-1-F, WP-I12a, WP-35 INTEGRATED. SI-P6b bleibt bis zur Betreiber-Spezifikation gesperrt.

Hinweise aus den unabhängigen Reviews (nicht blockierend):
- #191 (WR-3), **vor dem Einschalten von `CENTRIC_KONTOWIEDERHERSTELLUNG=1`**: (1) Verfahrensvorgabe ins Betriebshandbuch, dass die Leitung die Personalnummer aus den eigenen Unterlagen über die geprüfte Person nachschlägt und sie sich nie vom Antragsteller nennen lässt (die Nummer ist nicht geheim, die Bindung hilft nur so); (2) Regel für Personen ohne Personalnummer (heute kann ihr Konto nie wiederhergestellt werden, fail-closed); (3) Benachrichtigung des Trägers (I.11); (4) Eröffnungszähler `vl:` nach erfolgreicher Eröffnung entlasten oder Ablehnungen einer einzelnen Leitung anders begrenzen; (5) Betreiberentscheidungen I.2, I.3, I.10, I.12, J.5. Siehe `docs/acc45/WR-3-NACHWEIS.md`.
- #192 (WP-21 Teil 2), Betreiberentscheidungen zu Rechten: (a) `plan.publish` fehlt im Server-Rechtekatalog (`server/lib/rechte.mjs`), die Schaltfläche "Plan freigeben" ist deshalb für niemanden sichtbar; Recht aufnehmen oder Client auf ein vorhandenes Recht umstellen; (b) Krankmeldung der Schichtverantwortung an Diensttagen wird vom Server abgewiesen: Schaltfläche ausblenden oder Recht klären.
- #182 (OPT-4/WR-2), Betrieb: (a) `/zustand` muss beschreibbar sein (uid 1000), sonst 503 bei Faktoraktivierung und Wiederherstellungscode-Anmeldung; (b) nach dem Deploy sind alle Wiederherstellungscodes ohne Epoche ungültig, bis die Inhaber neu erzeugen; (c) jede Epochen-Rotation macht alle Codes ungültig, ohne Benachrichtigung (E3); (d) bis WR-3..9 gibt es keinen Rückweg für Inhaber, die Telefon und Codes verlieren; (e) `NODE_ENV=production` Pflicht (development/test schaltet die Epochenbindung ab). Checkliste: `docs/acc45/RELEASE-GATES-R1-R2-R3.md`, `docs/BETRIEBSHANDBUCH.md` Abschnitt 4. Betreiberentscheidungen E1 bis E4 (Migration bestehender Leitungskonten, Altformat ohne Epoche, Benachrichtigung nach Vollwiederherstellung, Nachtrag `faktorPflicht` für ältere Codes) in `docs/acc45/OPT-4-WR-2-LUECKEN.md`.
- #187 (IMP-9): Der Port ist nirgends verdrahtet. Vor jeder Verdrahtung oder E-25/E-26-Aktivierung IMPORT-VERTRAG §13 und die Allowlist-Garantie (Überschriften nur als kanonischer Feldname, sonst `Spalte N`) erneut prüfen.
- #186: Neue `pruefung:*`-Skripte müssen als Schritt in `.github/workflows/pruefung.yml` stehen, sonst schlägt der Wächter `pruefung:ci-abdeckung` fehl; Ausnahmen nur mit Grund in `pruefungen/ci-abdeckung-ausnahmen.json`.
- #174 (WP-I12a): Die Aussage "ohne `ausfaelle` byte-identisch" gilt nicht allgemein. `rechnen()` liefert jetzt zu jedem Ruhezeitbefund einen `ruhezeit.ist`-Fakt; `gegenrechnen` prüft kandidat.* und `ruhezeit.ist` strenger (fail-closed). Vor Verdrahtung in eine Route (WP-I20): Obergrenze für Personenzahl bei der Ersatzsuche, Definition von `ruhezeit.ist` (mit/ohne Zeitumstellung) vereinheitlichen, Golden um Ruhezeit-/Folgegrenzen erweitern.
- #178: Dokument nennt Basis-Zahlen (1103 Commits, App.jsx 2066 Zeilen), die inzwischen veraltet sind; die Skripte laufen nur manuell.

## Abhängigkeiten und Betreiberfreigaben
- E-25: AVV, Zero-Data-Retention, Drittland, DSFA, Mitbestimmung. Voraussetzung für jede produktive KI-Freigabe.
- Monatsbudget gegen Verbrauch (WP-I15) vor Verdrahtung eines Anbieters.
- Browser-Abnahmen: WP-40 (Reflow, Zielgröße, Fokus, Fehlertext 3.3.1), WP-I2 (Schichtfolge), WP-I17 (Intelligence-Antwort).
- **Branch-Schutz setzen (prioritär):** `docs/acc45/BETREIBER-BRANCHSCHUTZ.md`. Ohne ihn ist die Lease nur kooperativ.
- OPT-1 / OPT-1-F: Entschieden am 2026-11-10 (Option A: Ersteinrichtungscode aus #166, kein E-Mail-Weg, keine allgemeine Betreiberfreischaltung). Umgesetzt und integriert mit #179 (inklusive #166). Betrieblich offen: `werkzeug/testbetrieb-anlegen.mjs` ist nicht im Docker-Image und läuft auf dem Host bei gestopptem Server (Aufnahme ins Image ist eine Infra-Entscheidung).
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
- Stand 2026-11-10 ca. 15:10Z: Keine schreibenden Agenten aktiv; alle gemeldeten Agenten haben berichtet. Cloud-Sitzungen waren idle.
- Merge-Konflikte: Die lange `pruefung`-Zeile in `package.json` kollidiert bei jedem parallelen PR. Lösung ohne Handarbeit: Zeile der Integration nehmen und eigene Skripte am Ende anhängen (`node werkzeug/package-kette-vereinigen.cjs` im Worktree mitten im Merge: vereinigt beide Seiten per `&&`, bricht bei Blöcken mit mehr als einer Zeile je Seite ab).
- Hintergrund-Watcher (Merge bei grün) sind an die Sitzung gebunden und enden mit ihr. Der neue Koordinator startet sie neu, falls nötig.
- Worktrees: viele Agenten-Worktrees unter `.claude/worktrees/`. Nur Worktrees mit ungesicherten Änderungen prüfen (`git status --porcelain`), bevor man sie entfernt. Nicht blind löschen.
