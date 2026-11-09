# Wiederaufnahmepunkt CENTRIC (Stand 2026-11-09, Nachtübergabe)

## Koordinationsregel (verbindlich)
- Der ursprüngliche Hauptchat (CENTRIC, lokale CLI-Sitzung) bleibt dauerhaft der primäre Entwicklungskoordinator. Sein autonomer Release-Auftrag bleibt bestehen.
- Die geplante Cloud-Aufgabe (stündlich, Minute 32) ist ergänzend: Nacht- und Wiederaufnahmekoordination. Sie übernimmt Entwicklung nur vorübergehend bei ausdrücklich dokumentierter Übergabe, und diese Übergabe gilt nur bis der Hauptchat wieder aktiv ist.
- Der Hauptchat übernimmt nach einem Abgleich des Repository-Zustands wieder die primäre Koordination.
- Niemals zwei gleichzeitig schreibende Hauptkoordinatoren. Keine doppelte Bearbeitung bereits integrierter Pakete. Kein Verlust laufender Agentenarbeit. Keine Reduzierung des Funktionsumfangs.
- Kein Merge nach `main`, kein produktives Deployment ohne ausdrückliche Freigabe des Betreibers.
- Abgleich-Stand dieses Dokuments: Hauptchat wieder aktiv am 2026-11-09 nach 19:50 (Repository-Zustand geprüft: Integrationskopf 744a2f68, #169 Kopf e015368 mit Folgepaket OPT-1-F; kein fremder Schreibvorgang auf #169 nach 18:44).

## Abweichungen zu docs/WIEDERAUFNAHME.md (Cloud-PR #168, nicht von dieser Sitzung geändert)
Dieses Dokument (`docs/acc45/WIEDERAUFNAHME.md`) ist für den Acc45-Strang maßgeblich. PR #168 enthält eine parallele Übergabe mit folgenden veralteten Aussagen, die NICHT befolgt werden dürfen:
- „#166 integrieren“: falsch. #166 (OPT-1) bleibt gesperrt, bis ein funktionsfähiger regulärer Anmeldeweg für Leitungskonten belegt ist (Review, Kommentar am PR). Das Folgepaket OPT-1-F ist in der SSOT aufgenommen.
- „#164 offen“: falsch. #164 ist geschlossen und durch #169 ersetzt.
- „111 Pflichtpakete, SSOT-Stand 04.11.“: veraltet. Maßgeblich ist `work-packages.json` im Integrationsbranch plus Abgleich über `werkzeug/ssot-belege.mjs`.
- „Koordinator mit Freigabe-Befugnis“ als Nachtkoordinator: die Freigabe liegt beim Betreiber, nicht bei der Nachtaufgabe.
Empfehlung an den Betreiber: #168 entweder auf den Stand dieses Dokuments bringen oder schließen. Dieses Dokument wird nicht gegen #168 zusammengeführt, weil #168 nicht von dieser Sitzung stammt.

## Aktueller Hinweis zur Übergabe
Die Übergabe der Nacht ist beendet. Der Hauptchat ist wieder primär. Vor Schreibvorgängen des Hauptchats prüfen, ob die Cloud-Aufgabe gerade schreibt (offene PRs, Branch-Köpfe).

Verbindlich bleiben: kein Merge nach `main` und kein produktives Deployment ohne ausdrückliche Zustimmung des Betreibers; keine Tests abschwächen; keine Geheimnisse ausgeben; der autonome Release-Auftrag bleibt bestehen.

## Integrationsstand
- Integration: `integration/release-v4`, Kopf 744a2f68 (nach #167). Die Liste der gemergten PRs steht in `git log --merges origin/integration/release-v4`.
- `main`: 0423eeac. Kein Design-Release nach main ohne Betreiberfreigabe.

## Offene PRs (Stand Übergabe)
- #169 SSOT-Belege neu auf Integrationsstand (SI-P9, IMP-0, WR-1 auf INTEGRATED; WP-40 auf REVIEW; drei PR-Belege; Werkzeuge). CI läuft. Vorgänger #164 geschlossen.
- #166 OPT-1 Ersteinrichtung. NICHT integrieren: kein funktionsfähiger regulärer Anmeldeweg für Leitungskonten nach der Einrichtung (Review, Kommentar am PR). Betreiberentscheidung nötig: Anmeldeweg bauen oder zurückstellen.
- #139 WP-I12c (planKennzahlen, Spanne). Hold, Betreiberentscheidung zur Spanne-Definition.
- #129, #127, #115, #97, #96, #94, #92, #91, #18, #17, #16, #15, #7, #6: ältere Doku-, Feature- und Security-PRs gegen Basen außerhalb der Integration. Vor dem Schließen prüfen, ob Inhalt in der Integration steht (ssot-belege, Commit-Suche). Nicht blind schließen.
- #168 (ccr-…, Cloud-Session): fremd, nicht anfassen.
- #104 "[NICHT INTEGRIEREN]": Referenz, nicht mergen.

## Abgeschlossen in dieser Sitzung (gemergt)
#123 #130 #131 #132 #133 #134 #136 #137 #138 #140 #141 #142 #143 #144 #145 #146 #147 #148 #149 #150 #151 #152 #153 #154 #155 #156 #157 #158 #159 #160 #161 #162 #163 #165 #167

## Abhängigkeiten und Betreiberfreigaben
- E-25: AVV, Zero-Data-Retention, Drittland, DSFA, Mitbestimmung. Voraussetzung für jede produktive KI-Freigabe.
- Monatsbudget gegen Verbrauch (WP-I15) vor Verdrahtung eines Anbieters.
- Browser-Abnahmen: WP-40 (Reflow, Zielgröße, Fokus, Fehlertext 3.3.1), WP-I2 (Schichtfolge), WP-I17 (Intelligence-Antwort).
- OPT-1: Anmeldeweg für Leitungskonten.
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
5. Nicht eigenmächtig: #166 integrieren, Design nach main, produktive Deployments, Statusänderungen an DONE-Paketen, Schließen fremder PRs.

## Agenten und Hintergrund
- Zum Übergabezeitpunkt liefen keine schreibenden Implementierungs-Agenten mehr; alle gemeldeten Agenten haben ihren Bericht abgegeben.
- Hintergrund-Watcher (Merge bei grün) sind an die Sitzung gebunden und enden mit ihr. Der neue Koordinator startet sie neu, falls nötig.
- Worktrees: viele Agenten-Worktrees unter `.claude/worktrees/`. Nur Worktrees mit ungesicherten Änderungen prüfen (`git status --porcelain`), bevor man sie entfernt. Nicht blind löschen.
