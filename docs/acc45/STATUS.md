# ACC45 – Status

Stand: 2026-11-03 (Tag 2, Nachmittag)

## Überblick

| | |
|---|---|
| Pakete gesamt | 46 (42 aus dem Audit + WP-43 Personaldaten-Filter, WP-44 Code-Rotation, WP-45 atomares Schreiben, WP-46 Bremse fail-closed) |
| DONE | 2 (WP-01 H8+ produktiv, WP-08) |
| INTEGRATED | 25 (WP-02, 03, 04, 05, 06, 07, 10, 11, 12, 13, 14, 17, 20, 22, 23, 25, 26, 27, 31, 32, 41, 43, 45, 46, 47) + Nachträge – im Integrationsstand, Abnahme in Produktion steht aus; WP-19 teilweise |
| IN_PROGRESS / REVIEW | WP-24 (Nachprüfung), WP-28 (Lasttest), WP-19 (weitere Module, warten auf Fachentscheidungen), WP-09 |
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
6. Fachlich: 120-Tage-Horizont der Server-Nachrechnung; Archiv Bestätigungsprotokoll; sperren oder warnen (Ruhezeit, Qualifikation, keineNacht, maxDiensteWoche, keinAlleindienst).
   Weiter fachlich: `zuschlaege` als Lohnbestandteil? Eigene Bank-/Lohndaten für Beschäftigte sichtbar (Art. 15)? `rolleSeit`/`rolleVerlauf` für MA/BR/SV? Sondereinsätze tagesgenau (umgesetzt) bestätigen.
7. Externe Gates: Pentest beauftragen, iPhone/Tablet, Rechtstext-Inhalte, Kriterien je Branchenpaket.

### Bewusst zurückgestellt (Nutzerentscheidung 2026-11-03, vor dem Produktiv-Release erneut vorlegen)

- **Mindestbesetzung / PpUGV:** warnen mit Bestätigung oder sperren. Vorläufig umgesetzt: warnen.
- **Alarmweg (WP-05):** externer Uptime-Check und interner Webhook-Kanal. Bis dahin `CENTRIC_ALARM_WEBHOOK` leer, Alarme nur im Log.
- **Einrichtungen:** GitHub-Umgebung `produktion`; Deploy-Skripte und Forced-Command-Schlüssel auf dem Server; `CENTRIC_VERTRAUTE_PROXYS` (Pflicht vor dem nächsten Produktiv-Deploy); WP-30 Mail und Push; alte Netlify-Site; Pflicht-2FA für Betreibercodes.

### Entschieden (2026-11-03)

- Einwilligung/Genehmigung nach MuSchG an der Person erfassbar.
- Planung darf die Einrichtung bearbeiten (Dienstarten, Zeiten, Mindestbesetzung, Vorlagen).
- Lange Dienste (> 10 h) automatisch erlaubt, nur Hinweis.
- Jugendschutz-Schalter „mehrschichtig“ auch für die Planung.

## WP-19 – Statusstufen je Modul

Stand 2026-11-03. Pläne: [`WP19-MODULPLAN.md`](WP19-MODULPLAN.md) (Stand, Lücken, Pakete WP-19.0–19.13, Aufwand 63–98 PT,
kritischer Pfad) und [`WP19-OFFENE-FACHNACHWEISE.md`](WP19-OFFENE-FACHNACHWEISE.md) (Prüfvorbehalte, Blocker).
Entscheidungen: [`WP19-PRODUKTENTSCHEIDUNGEN-2026-11-03.md`](WP19-PRODUKTENTSCHEIDUNGEN-2026-11-03.md).

Stufen: (1) implementiert · (2) lokal getestet · (3) unabhängig reviewed · (4) integriert · (5) Staging fachlich
geprüft · (6) rechtlich/fachlich freigegeben · (7) produktiv. „T“ = nur Server-Teilumfang (Kernlogik, Schreibweg, Sicht,
Unit-Tests), nicht der entschiedene Gesamtumfang. Alle zwölf Module stehen in der Registry auf `geplant`
(nicht einschaltbar) – keines gilt als geliefert.

| Modul | (1) | (2) | (3) | (4) | (5) | (6) | (7) | Integration |
|---|---|---|---|---|---|---|---|---|
| 1 Posten | T | T | T | T | | | | #49 |
| 2 Wachbuch | | | | | | | | – |
| 3 Objektbericht | | | | | | | | – |
| 4 Bereichsplan | T | T | T | T | | | | #49 |
| 5 Pflegequalifikation | | | | | | | | – |
| 6 Bereitschaftsdienst | | | | | | | | – |
| 7 Geteilter Dienst | T | T | T | T | | | | #49 |
| 8 Funktionsdienst | | | | | | | | – |
| 9 Rotation | | | | | | | | – |
| 10 Anlagen | T | T | T | T | | | | #44 |
| 11 Maschinenqualifikation | T | T | T | T | | | | #44 |
| 12 Kontinuierliche Schichtmodelle | T | T | T | T | | | | #44 |

Gemeinsamer Kern (Registry, Aktivierung, Branchenkatalog, Andockpunkte): Stufen 1–4 (#44). Es fehlen u. a.
Aktivierungsoberfläche, Mitbestimmungsbestätigung (G6), betriebliche Regelwerte mit Metadaten und das Einhängen der
Modul-Oberflächen in `src/App.jsx` (Paket WP-19.0).

## Release-Risiken

- Personaldaten-Filter in Produktion erst mit dem Integrationsstand (bis dahin keine echten Beschäftigtendaten).
- WP-19 (25 PT) ohne fachliche Kriterien nicht abnahmefähig. Seit 2026-11-03 entschieden; Neuschätzung laut
  Modulplan 63–98 PT, Blocker der Produktivfreigabe in `WP19-OFFENE-FACHNACHWEISE.md`.
- Echte Geräte und externer Pentest sind nicht von Agenten erbringbar.
