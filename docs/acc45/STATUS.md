# ACC45 – Status

Stand: 2026-11-02 (Tag 1, Abend) · Quelle der Zahlen: `docs/acc45/work-packages.json` (Generator `werkzeug/acc45-backlog.mjs`)

## Überblick

| | |
|---|---|
| Pakete gesamt | 46 (42 aus dem Audit + WP-43 Personaldaten-Filter, WP-44 Code-Rotation, WP-45 atomares Schreiben, WP-46 Bremse fail-closed) |
| DONE | 2 (WP-01 H8+ produktiv, WP-08) |
| INTEGRATED | 4 (WP-02, WP-03, WP-04, WP-43) – im Integrationsstand, Abnahme in Produktion steht aus |
| IN_PROGRESS | 4 (WP-33, WP-45, WP-46; WP-09) + Nachtrag WP-43 (N1) |
| BLOCKED / READY | 34 / 2 |
| Offener Aufwand | 165,5 PT (integrierte Pakete zählen bis DONE weiter mit) |
| Kritischer Pfad | WP-02 → WP-09 → WP-10 → WP-11 → WP-22 → WP-19 → WP-42 (48,5 PT); WP-19 aufteilbar |

## Integrationsstand `integration/centric-complete`

| Merge | Inhalt | Review |
|---|---|---|
| `65c1188` | main (H8+) + Kette B | H8+-Invarianten gegen B geprüft |
| `5fd2696` (#21) | WP-04 verschlüsselte Offsite-Sicherung | Agent F: Auflagen → Freigabe |
| `e748c70` (#22), `a063925` (#23) | WP-03 Digest-Rücksprung, R0, Nachtrag | Agent F: Auflagen → Freigabe |
| `3722719` (#24) | WP-02 Schreibserialisierung, kein Stempelverlust, strenges Lesen | Agent F: Auflagen → Freigabe |
| `eb5fc98` (#25) | WP-43 Personaldaten-Filter, Rechtematrix zeilenweise | Agent F: Auflagen → Freigabe (N1 vor Produktion offen) |

Jeder Merge ist mit vollständiger CI grün (Prüfung, Sicherheit, Betriebstests).

## Gefundene und behobene Fehler (Auswahl, alle mit Test rot → grün)

- Stille Datenverluste bei gleichzeitigen Schreibvorgängen (bis 131 von 200 Stempeln im Lasttest) → behoben.
- Unlesbare Monatsdatei wurde beim nächsten Schreiben gelöscht → behoben.
- Löschlauf, Provisionierung und Kontenpflege ohne Sperre → behoben.
- Sensibles Personenfeld ging an Rollen ohne Berechtigung und war überschreibbar → behoben.
- Bereichssicht der Schichtverantwortung nicht tagesgenau → behoben.
- R0-Abschaltung konnte fälschlich Erfolg melden → behoben.
- Leere Sicherung hätte als Erfolg gegolten → behoben.

## Neu erkannte Risiken (eigene Pakete)

- WP-45: Abbruch mitten in einem Mehrdatei-Schreibvorgang kann einen gemischten Stand hinterlassen.
- WP-46: Bremse lässt bei Ablagefehlern durch (fail-open); festes Zählfenster.
- WP-43 N1: Konten/Monatswerte für Personen mit Versetzung „nicht verfügbar“ (Funktion).

## Offene Nutzerfreigaben und -entscheidungen

1. WP-09: Merge des Integrationsstands nach `main` und Produktiv-Deploy (nach Staging-Abnahme).
2. Isolierte VPS-Proben (WP-03 Rücksprung A→B→A, WP-04 Restore auf dem VPS).
3. WP-04: Speicherziel, Verwahrung des restic-Passworts, Alarmdienst.
4. WP-03-Einführung: Migration der Produktions-`.env`, gesperrte Bilder samt Tags entfernen.
5. WP-44 (A9): Ablauf Z1–Z7.
6. Fachlich: `zuschlaege` als Lohnbestandteil? Eigene Bank-/Lohndaten für Beschäftigte sichtbar (Art. 15)? `rolleSeit`/`rolleVerlauf` für MA/BR/SV? Sondereinsätze tagesgenau (umgesetzt) bestätigen.
7. Externe Gates: Pentest beauftragen, iPhone/Tablet, Rechtstext-Inhalte, Kriterien je Branchenpaket.

## Release-Risiken

- Personaldaten-Filter in Produktion erst mit dem Integrationsstand (bis dahin keine echten Beschäftigtendaten).
- WP-19 (25 PT) ohne fachliche Kriterien nicht abnahmefähig.
- Echte Geräte und externer Pentest sind nicht von Agenten erbringbar.
