# Ergänzende Betreiberentscheidung RB-1/RB-2 (2026-11-11)

Quelle: Betreiber, Chat vom 2026-11-11 (nach `ENTSCHEIDUNG-ROLLENRECHTE-2026-11-11.md`). Verbindlich und genehmigt.
Beantwortet die offenen Fragen aus RB-1/RB-2. Umsetzung als Pakete **RB-3**, **RB-4**, **RB-5**.

1. Die Rolle "kunde" erhält auch im Probierraum keine Sonderrechte für "plan.publish" oder die endgültige
   Krankmeldungsbestätigung. Ausschließlich Betriebsleiter und Planer sind dazu berechtigt. Demo-Funktionen sind über
   ausdrücklich zugewiesene Demo-Rollen bereitzustellen. -> **RB-3**
2. Bei Eingang einer Krankmeldung sollen zuständige Planer und Betriebsleiter benachrichtigt werden. Die zuständige
   Schichtverantwortung kann eine sachlich erforderliche Benachrichtigung erhalten. Push und E-Mail enthalten keine
   Gesundheitsdetails. -> **RB-4**
3. Bis zur endgültigen Bestätigung bleibt der veröffentlichte Dienstplan unverändert. Intern wird die betroffene Schicht
   als klärungsbedürftig markiert. CENTRIC darf mögliche Unterbesetzung und Ersatzvorschläge vorbereiten, aber keine
   eigenmächtige Umbesetzung auslösen. -> **RB-5**

## Abgleich mit dem Vorhandenen (2026-11-11, Integrationskopf 0ffb06c7)
- Vorhanden: Zustellung per Mail und Push mit Arten (`server/lib/mitteilungen.mjs` ZUSTELLARTEN, Anbieter hinter
  ausgeschalteten Schaltern, E-9); Ersatzsuche und Unterbesetzungsbefunde (`server/lib/engine/einsatz.mjs`,
  `ersatzfakten.mjs`, `befunde.mjs`); zweistufige Krankmeldung samt dringender In-App-Aufgabe (RB-2).
- Fehlt: eine Zustellart für eingegangene Krankmeldungen ohne Gesundheitsdetails (RB-4); die interne Markierung
  "klärungsbedürftig" an der betroffenen Schicht und die Vorbereitung von Unterbesetzung und Ersatzvorschlägen aus einem
  offenen Fall, ohne den veröffentlichten Plan oder eine Besetzung zu ändern (RB-5); der Entzug der Rechte der Altrolle
  `kunde` (RB-3, ändert den Test `kunde-abloesung`, der heute gleiche Tabelle wie Leitung verlangt).
- Grenzen: keine Aktivierung von Mail oder Push in der Produktion (bestehende Schalter und E-9 bleiben maßgeblich);
  kein automatisches Umbesetzen; keine Gesundheitsdaten in Mail, Push, Betreff oder Protokoll.
