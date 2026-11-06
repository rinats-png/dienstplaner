# CENTRIC Fertigstellung: fortlaufender Status

Einziger Arbeits- und Statusstand. Stand 2026-11-06. Bestehende Nachweise bleiben gültig und werden nicht wiederholt.

## Erledigt und belegt
| Bereich | Nachweis |
|---|---|
| RC `rc-2026-11-05` (`265d575`, Index-Digest `sha256:98556e64…f0da`) | CI Lauf 42000936348 grün; Label = Commit; auf Staging installiert, `healthy` (Betreiberangabe) |
| P0 Sitzung ohne Rolle (#93) und Social-Vorschau (#95) | im RC; 32 Tests, HTTP-Rechte 147/147 |
| Staging-Gate | Smoke 51/51, Aufräumen 18/18 (Betreiber, VPS); lokal auf RC-Code identisch |
| Abnahmepunkte 5 und 6 | im Smoke (alle Rollen; E1-Datenschutz) |
| Abnahmepunkte 7 und 9 | lokal 50/51 (`docs/RC-2026-11-05-ABNAHME-7-9.md`); Befund B-9-1 offen |
| PWA und Außenhülle auf Staging | Manifest, Service Worker, Offline-Hülle, 320 bis 1440 px, TLS, Köpfe, `og:`-Tags |
| Migrationsprobe lokal | Sicherung `20261102T155042Z` (Manifest-Prüfsumme stimmt) als Wegwerfkopie: `ablage-pruefen` ohne Befund; 1 Raum `demo-schau` (3 Betriebe, 191 Personen), 9 Zugangscodes, davon 0 ohne Rolle, 0 Mitgliedschaften; RC liest den Bestand, unveränderter Schreibzyklus 200, Bestandsdaten vorher und nachher identisch (Prüfsumme gleich) |
| Datenformat Produktion zu RC | Bestandsversion unverändert (9); Schlüsselräume `kern:`/`scherbe:`/`stand:` existieren schon in `274bfa0`; neue Schlüssel (`verwalter:`, `zweifaktor:`, `zustell*`, `feedperson:`, `brist:`) sind additiv |

## Integrationsbranch `integration/release-v4` (lokal und auf origin, kein Merge nach main)
Basis: `integration/centric-complete` (= RC `265d575`) plus V4 Phase 1 (#91) plus V4 Phase 2 (#92) plus Änderungen unten. Gemeinsamer Release-Kandidat folgt nach Abschluss der V4-Arbeit.

| Paket | Stand |
|---|---|
| **B-9-1 ETag-Pflicht** (Entscheidung Betreiber 2026-11-06) | **erledigt.** `PUT /api/bestand` ohne ETag auf vorhandenem Bestand: 409 `konflikt` mit aktuellem Stand; Erstanlage ohne ETag bleibt möglich; interne Lese-Ändern-Schreiben-Abläufe unberührt. Test `pruefungen/etag-pflicht.test.js` (8, davon 3 vor dem Fix rot). Regression: 49 betroffene Testdateien grün (1145 Tests), alle HTTP-Läufe `serverlauf` grün (rechte 147/147; mandanten, sicherung(en), zeiterfassung, zustellung-rechte, geo u. a.). `pruefungen/rechte.mjs` sendet nun den ETag. |
| V4 `pruefung.jsx` | **erledigt:** Die Datei ist die Selbsttest-Fixture, kein UI. Ihre Stilkopie `bauStyles` (263 Zeilen, 17 Hex-Werte, nie aufgerufen) war toter Code und ist entfernt. Verbleibende Hex-Werte dort sind Beispieldaten und Druckvorlagen (Rechnung, Handbuch). `selbsttest` bleibt rot nur wegen „Erster Aufbau unter 500 ms“ (Zeitprüfung dieser Maschine, schon vor den Änderungen rot). |
| V4 Fund: Geführte Tour überdeckt Dialoge | **offen.** Die Tour (`role=dialog`, z-Index 90) liegt gleichauf mit `.sheet-back` (90) und verdeckt die Schaltfläche „Hinzufügen“ im Dialog „Person hinzufügen“ (belegt per `elementFromPoint`). Besteht schon im RC. Ein einfaches Anheben des z-Index von `.sheet-back` wirkt nicht (Stapelkontext). Lösung: Tour ausblenden, solange ein Dialog offen ist, oder Dialoge außerhalb des Stapelkontexts rendern. |
| V4 Ladezustände, übrige Oberflächen | **offen** (nächster Schritt: Fund oben, dann Ladezustände, dann Bereich für Bereich mit Funktions- und Rechteprüfung) |
| PR #96, A25, Konsolidierung auf `main` | nach V4 und gemeinsamem RC |

## Tatsächliche Blocker
- **B1** Caddy-Basic-Auth weist den `Authorization: Bearer` der App zurück; angemeldete Browsertests über HTTPS auf Staging gehen so nicht. Lösung nur auf dem VPS (Betreiber): IP-Freigabe statt Basic Auth oder Ausnahme für `/api/*`.
- **B2** Staging-Probe für Punkt 7/9 muss auf dem VPS laufen (Plan im Abnahmedokument; schreibt nur `ppg-gate-a`).
- **B4/B5** Datenisolation und Backup-Wiederherstellung auf dem VPS nicht abschließend belegt (Betreiber).

## Noch notwendige Release-Gates
Staging-Probe Punkt 7/9 ausgeführt und aufgeräumt; Backup-Wiederherstellung belegt; Rollback vorbereitet (`ruecksprung.sh` auf `0b192927…`); V4 integriert und im Browser abgenommen; Eintrag in `FREIGEGEBENE-IMAGES.md`; ausdrückliche Produktionsfreigabe.
