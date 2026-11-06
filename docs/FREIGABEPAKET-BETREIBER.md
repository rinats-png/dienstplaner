# Freigabepaket für den Betreiber (ein Dokument, Stand 2026-11-06)

Fasst zusammen, was nur der Betreiber entscheiden oder veranlassen kann. Keine Freigabe gilt als erteilt. Quellen: `docs/acc45/BETREIBER-AUFGABEN-WEIHNACHTEN.md` (vollständige Liste, Annahmen der Durchlaufzeiten), `docs/STATUS-FERTIGSTELLUNG.md`, `docs/acc45/wpI-offene-fragen.md`, `docs/acc45/wp19-offene-fragen-agent.md`. Die Entwicklung läuft ohne diese Punkte weiter; sie bestimmen aber den kritischen Pfad.

## A. Sofort anstoßen (Wartezeit extern, bestimmt den Gesamttermin)
| ID | Was | Warum jetzt |
|---|---|---|
| E-17a | Pentest: Anbieter anfragen, beauftragen (Scope: `docs/acc45/extern/PENTEST-SCOPE.md`) | Spätester Start laut Plan bereits überschritten; Kosten (Angebot nötig) |
| E-22 | WP-19-Fachnachweise FN-01…FN-34 (Kanzlei/Fachberater) | Branchenmodule bleiben ohne Nachweis auf „geplant“ |
| E-32 | Betriebsdienstleister und AV-Verträge (Hoster, Mail, Uptime/Alarm, Backup-Ziel) | Voraussetzung für Mail/Push und Intelligence |
| E-9 | Mail/Push: Anbieter, Zugang, VAPID, DNS SPF/DKIM | Code ist integriert, Betrieb fehlt |
| E-25 / E-26 | Intelligence: Anbieterwahl, AV-Vertrag, Zero-Data-Retention, Drittland; DSFA | ohne beides keine echten Anbieteraufrufe; Gateway ist bis dahin Attrappe |
| E-3 | iOS-Gerät und Tablet für die Gerätetests | Pflichtgeräte des Testplans |
| E-15 | Code-Rotation Z1–Z7 (WP-44) | Sicherheitsmaßnahme, nur Betreiber |

## B. VPS-Gates für die Produktionsfreigabe (nur auf dem Server lösbar)
- **B1** Caddy-Basic-Auth weist den `Authorization: Bearer` der App ab: IP-Freigabe statt Basic Auth oder `/api/*` ausnehmen, damit eingeloggte Browsertests auf Staging laufen.
- **B2** Staging-Probe Punkt 7/9 per Plan in `docs/RC-2026-11-05-ABNAHME-7-9.md` (schreibt nur `ppg-gate-a`, Aufräumen danach).
- **B4/B5** Datenisolation Staging/Produktion und Backup-Wiederherstellung auf dem VPS belegen (`docs/acc45/extern/RESTORE-ABNAHME-PLAN.md`).
- Rollback vorbereiten (`ruecksprung.sh` auf `0b192927…`), Eintrag in `deploy/FREIGEGEBENE-IMAGES.md` nach bestandener Abnahme.

## C. Entscheidungen, die ich nicht treffen darf
1. Merge nach `main` und Produktivdeployment (erst nach Staging-Abnahme des gemeinsamen Release-Kandidaten).
2. Intelligence live: Anbieter, laufende Kosten, Übermittlung personenbezogener Daten; bis dahin nur Attrappe.
3. Aufbewahrungsfristen und Löschung (Wachbuch WB-3; Aufbewahrungslauf bleibt im Vorschau-Modus), Rechtetabellen der neuen Module (WB-2, RO-3), Ruhezeit/Opt-out (BD-5, BD-6), Versetzungsregel (RO-1), Besetzungswerte Pflege (PQ-1).
4. Spezifikationslücken Intelligence (14 Punkte in `wpI-offene-fragen.md`), u. a. Limit für Beschäftigte, Satzbausteinkatalog, Liste verbotener Merkmale.
5. Pilotstart (E-24) und Pilotbetriebe.
