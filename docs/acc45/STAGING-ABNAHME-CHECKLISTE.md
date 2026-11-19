# Staging-Abnahme: Checkliste für den Betreiber (E-1, Testplan 3.1–3.4)

Stand: WP-S1 (Branch `feature/ready-kleinpakete`). Diese Liste ist eine Vorbereitung. Sie führt nichts aus, sie
ersetzt keine Freigabe, und sie ist nicht gegen Staging gelaufen. Die Schritte stammen aus E-1 in
`docs/acc45/EXTERNE-ABNAHMEN-UEBERGABE.md`; dort steht auch, was zu beschreiben und was nicht zu tun ist.

## 0. Vorab (nicht Teil dieser Liste zu erledigen)

- [ ] Staging-Bild des Integrationsstands gebaut, Digest notiert.
- [ ] Sicherung der Staging-Daten angelegt und Wiederherstellung geprüft (`docs/BETRIEB-SICHERUNG.md`).
- [ ] SSH-Tunnel: eigene Freigabe des Betreibers. Staging ist nur über das Docker-Netz erreichbar.
- [ ] Zugangscodes je Rolle im Testbetrieb erzeugt und im Passwortmanager hinterlegt. In Nachweisen nur
      „Testperson Rolle X“ eintragen.
- [ ] Production bleibt unverändert. Vorher/nachher Id, Bild und Start notieren.

## 1. API-Proben (Container, kurzlebiger Probe-Lauf)

Nur im Probe-Container mit `CENTRIC_ADMIN`. Der Verwaltungsschlüssel wird nie ausgegeben.

- [ ] `node /app/werkzeug/staging-smoke.mjs` — Exit 0 (Ergebnis notieren: bestanden/gesamt)
- [ ] `node /app/werkzeug/staging-geo.mjs` — Exit 0
- [ ] `node /app/werkzeug/staging-aufraeumen.mjs` — Exit 0; danach sind `ppg-gate-*` und `ppg-geo` leer
- [ ] Exit 3 bei Altlasten ist ein Abbruch ohne Schreiben: bei Exit 3 zuerst die Lage klären, nicht weiterlaufen

## 2. Testplan 3.1 — Oberfläche je Rolle

Je Rolle (Leitung, Planung, Schichtverantwortung, Beschäftigte, Betriebsrat, Kunde, Betreiber) und je Gerät
(Desktop, Tablet, Telefon, 390 px):

- [ ] Kernaufgaben der Rollentabelle ohne Fehler bedienbar
- [ ] kein Querscrollen
- [ ] Antwortzeit unter 1 s
- [ ] keine Konsolenfehler
- [ ] keine fremden Daten in der API-Antwort

## 3. Testplan 3.2 — Zeiterfassung

- [ ] Ein- und Ausstempeln mit und ohne Plan
- [ ] Tag- und Nachtdienst, auch Nachtdienst nach Mitternacht
- [ ] 20-Stunden-Grenze
- [ ] Integrität: Änderung am Originalstempel wird mit 403 abgewiesen
- [ ] Korrekturantrag
- [ ] Monatsabschluss
- [ ] ungeplante Dienste in Ist, Konto und CSV
- [ ] Stempeluhr mit Standortabfrage

## 4. Testplan 3.3 — Datenschutz

- [ ] Nur die eigenen Daten je Rolle in der API-Antwort
- [ ] Entwürfe erscheinen nicht bei Beschäftigten
- [ ] Auskunft nach Art. 15 vollständig, einschließlich Stempel
- [ ] Löschlauf wie vorgesehen
- [ ] Kalender-Feed wird bei Sperre widerrufen
- [ ] Betriebsrat-Auswertung unter der Mindestgruppe zeigt keinen Personenbezug

## 5. Testplan 3.4 — Integration A+B

- [ ] Rundreise je neues Feld und Rolle: `bestaetigungen`, `beschaeftigungsmodell`, `stundenGrenzeMonat`, `hinweise`
- [ ] Warnen statt Sperren: Verstoß → Bestätigung → Protokoll → Mitteilung an die Leitung

## 6. Weitere Punkte aus E-1 (Browser, Konten)

- [ ] Service Worker
- [ ] Altbestände `stg-alpha` / `stg-beta`
- [ ] Konto-Anmeldung E-Mail/Passwort (von den Proben nicht abgedeckt)
- [ ] Befunde-Reiter und Schalter-Dialog

## 7. Abschluss

- [ ] Ergebnistabelle je Punkt: bestanden / Befund / offen, mit Testperson-Rolle, nie mit Zugangsdaten
- [ ] Staging nach der Abnahme auf den vorherigen Stand zurückstellen, oder bewusst stehen lassen und notieren
- [ ] Die Abnahme ist keine Freigabe für Production. Die Freigabe trifft der Betreiber.
