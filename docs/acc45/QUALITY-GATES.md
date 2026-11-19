# ACC45 – Quality Gates

| Gate | Auslöser | Inhalt | Werkzeug | Stand |
|---|---|---|---|---|
| G1 | jeder Push | Syntax, Typen (`pruefung:typen`), Lint, alle vitest-Suiten, gitleaks, npm audit, verbotene Muster | `pruefung.yml`, `sicherheit.yml` | aktiv |
| G2 | jeder PR auf `integration/centric-complete` | G1 + HTTP-Prüfungen im frischen Container (`rechte`, `verwalter`, `demo`, `sicherung`, `bremse`) + Rechtematrix + Rundreise + Betriebstests (`betrieb-deploy.yml`, `betrieb-sicherung.yml`) | CI | aktiv; Betriebstests kommen mit WP-03/04 |
| G3 | jede Integration | G2 auf dem Integrationsstand + Renntests (WP-02) + Browser-Regression (Playwright, ab WP-33) + Offline (ab WP-07) | CI + lokal | im Aufbau |
| G4 | vor Release | Sicherheitsabnahme, Last (WP-28), echte Geräte, Backup/Restore, Rücksprung/R0, Produktionskonfiguration, Betriebshandbuch, Funktionsabnahme (Testplan Abschnitt 5), externer Pentest | Abnahmeberichte | offen |

## Regeln

- **Rot vorher, grün nachher:** Jeder Regressionstest für einen Fehler läuft auch auf dem fehlerhaften Stand. Der Nachweis steht im PR.
- **Keine Quelltextsuche statt Ausführung,** wo echtes Verhalten geprüft werden muss.
- **Plattformfehler:** Unter Windows schlagen `ablage` (4), `selbsttest` (500 ms), `server` (SIGTERM) und `zugaenge-anlegen` identisch auf `main` fehl. Maßgeblich ist Linux-CI. Diese Liste wird nicht erweitert, ohne den Nachweis auf `main` zu führen.
- **Status DONE** gilt nur mit allen Akzeptanzkriterien und den nötigen Nachweisstufen (Browser/Gerät, wo gefordert).
- **Öffentliches Repository:** Keine Befunddetails zu offenen Schwachstellen der Produktion, keine Infrastrukturgeheimnisse, keine Zugangscodes in Commits, PRs oder Logs. Sicherheitsunterlagen bleiben lokal.
