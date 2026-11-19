# Betreiberentscheidung zu Rollenrechten (2026-11-11)

Quelle: Betreiber, Chat vom 2026-11-11. Verbindlich und genehmigt. Sie beantwortet die zwei Rechte-Befunde aus
WP-21 Teil 2 (`docs/acc45/WP-21-GERAETEMATRIX.md` Abschnitt 9). Umsetzung als Pakete **RB-1** und **RB-2**.

## 1. Verbindliche Dienstplanveröffentlichung (`plan.publish`)
- Ausschließlich Betriebsleiter und Planer dürfen Dienstpläne verbindlich veröffentlichen.
- Andere Rollen erhalten dadurch keine zusätzlichen Veröffentlichungsrechte.
- Serverseitige Rollenprüfung und Negativtests sind erforderlich.

## 2. Krankmeldungen
- Die Schichtverantwortung darf eingehende Krankmeldungen entgegennehmen und vorläufig bestätigen.
- Die endgültige Bestätigung darf ausschließlich durch Planer oder Betriebsleiter erfolgen.
- Eine vorläufige Bestätigung darf keinen endgültigen Status auslösen.
- Beide Schritte müssen nachvollziehbar protokolliert werden.
- Berechtigungen sind serverseitig zu prüfen und durch Positiv- und Negativtests abzusichern.

## Auslegung der Umsetzung (konservativ, im Zweifel enger)
- "Betriebsleiter" ist die Rolle `leitung`, "Planer" die Rolle `planer`. Alle übrigen Rollen (Subplaner, Mitarbeiter,
  Betriebsrat, Schichtverantwortung, Betreiber) erhalten `plan.publish` nicht. Der Datenraum zum Ausprobieren (Rolle
  `kunde`) erhielt es in der ersten Umsetzung (RB-1) nur, wenn er fachlich die Leitung war. **Überholt:** Die Ergänzung vom
  2026-11-11 (`ENTSCHEIDUNG-RB-ERGAENZUNG-2026-11-11.md`, Punkt 1) entscheidet, dass `kunde` auch im Probierraum weder
  `plan.publish` noch die endgültige Krankmeldungsbestätigung erhält; umgesetzt mit RB-3 (#206).
- Die Schichtverantwortung ist eine Funktion einer Person (Schichtverantwortung am Tag), keine Rolle der Rechtematrix.
  Das Recht zur vorläufigen Bestätigung hängt daran, nicht an einer Rolle, und gilt nur für Krankmeldungen.
- Vorläufig bedeutet: keine Änderung am endgültigen Status, keine Folgewirkung (Plan, Abrechnung, Zeiten, Ersatzsuche),
  die an "bestätigt" hängt.
- Kein neues Zugriffsrecht außer den hier genehmigten.
