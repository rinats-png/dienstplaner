# ACC45 – Status

Stand: 2026-11-03 (Tag 2)

## Überblick

| | |
|---|---|
| Pakete gesamt | 46 (42 aus dem Audit + WP-43 Personaldaten-Filter, WP-44 Code-Rotation, WP-45 atomares Schreiben, WP-46 Bremse fail-closed) |
| DONE | 2 (WP-01 H8+ produktiv, WP-08) |
| INTEGRATED | 11 (WP-02, 03, 04, 05, 10, 11, 31, 32, 43, 45, 46) + Nachträge WP-05b, WP-11 (Jugendschutz, U1), WP-32c, WP-45b/c – im Integrationsstand, Abnahme in Produktion steht aus |
| IN_PROGRESS / REVIEW | WP-17, WP-22, WP-26, WP-41, WP-09; WP-11 MuSchG-Einwilligung (Auflagen), WP-45d; WP-33 Review pausiert |
| BLOCKED / READY | 27 / 2 (READY: WP-06, WP-30) |
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
| `f5bec0d` (#26) | WP-43 Nachtrag N1 | Agent F |
| `56c73d0` (#27), `336788a` (#28) | WP-46 Bremse fail-closed, Nachtrag | Agent F: Auflagen → Freigabe |
| `60818c0` (#29) | WP-45 atomares Schreiben (Journal) | Agent F: Auflagen → Freigabe |
| `bb5ade8` (#30) | WP-32 + WP-32b Lieferkette, Betreiber-2FA, vertrauenswürdige Proxys | Agent F: Auflagen → Freigabe |
| `4300f8d` (#32) | WP-31 Deploy-Automatisierung + WP-32c Betreiber-2FA | Agent F: Auflagen → Nachprüfung → Freigabe |
| `737c453` (#33), `efdde6b` (#36) | WP-45b/c Rückweg bei unlesbarer Datei | Agent F: Ablehnung → vier Nachprüfungen → Freigabe |
| `0ccf2ae` (#34), `6570858` (#37) | WP-05/05b Überwachung und Alarme | Agent F: Ablehnung → Nachprüfung → Freigabe |
| `b84de34` (#35) | WP-11-Nachtrag: JArbSchG § 14 Abs. 2, Löschschutz Dienstarten, neue Personen nachgerechnet | Agent F: Freigabe |
| `b32880c` (#31) | WP-10 Kette A Basis + WP-11 Regelregister, eine Schutzprüfung, Server-Durchsetzung | Agent F: Auflagen → Nachprüfung → integrierbar mit Auflagen (JArbSchG-Ausnahmen, MuSchG-Einwilligung vor Release) |

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
- WP-43 N1: Konten/Monatswerte für Personen mit Versetzung „nicht verfügbar“ (Funktion) – behoben (#26).
- WP-11: harter Fehlalarm JArbSchG (Spätdienst bis 21 Uhr für über 16-Jährige) – Korrektur in Arbeit, Release-Blocker.
- WP-26 (Review abgelehnt): Löschlauf ohne Fristprüfung (Server-Hänger, gesetzlich aufzubewahrende Zeiten löschbar) – Korrektur in Arbeit, nicht integriert.
- WP-45b (Review abgelehnt, nachgebessert): Rückhol-Werkzeug konnte still Daten verlieren – Nachprüfung läuft.
- WP-31: Deploy konnte bei Sicherungsfehler gesperrten Altstand wieder starten – Korrektur in Arbeit.

## Offene Nutzerfreigaben und -entscheidungen

1. WP-09: Merge des Integrationsstands nach `main` und Produktiv-Deploy (nach Staging-Abnahme).
2. Isolierte VPS-Proben (WP-03 Rücksprung A→B→A, WP-04 Restore auf dem VPS).
3. WP-04: Speicherziel, Verwahrung des restic-Passworts, Alarmdienst.
4. WP-03-Einführung: Migration der Produktions-`.env`, gesperrte Bilder samt Tags entfernen.
5. WP-44 (A9): Ablauf Z1–Z7.
6. Fachlich: Einwilligung/Genehmigung MuSchG (sonst harte Sperre 20–6 Uhr und sonntags); 120-Tage-Horizont der Server-Nachrechnung; Archiv Bestätigungsprotokoll; sperren oder warnen (Ruhezeit, Qualifikation, keineNacht, maxDiensteWoche, keinAlleindienst).
   Weiter fachlich: `zuschlaege` als Lohnbestandteil? Eigene Bank-/Lohndaten für Beschäftigte sichtbar (Art. 15)? `rolleSeit`/`rolleVerlauf` für MA/BR/SV? Sondereinsätze tagesgenau (umgesetzt) bestätigen.
7. Externe Gates: Pentest beauftragen, iPhone/Tablet, Rechtstext-Inhalte, Kriterien je Branchenpaket.

## Release-Risiken

- Personaldaten-Filter in Produktion erst mit dem Integrationsstand (bis dahin keine echten Beschäftigtendaten).
- WP-19 (25 PT) ohne fachliche Kriterien nicht abnahmefähig.
- Echte Geräte und externer Pentest sind nicht von Agenten erbringbar.
