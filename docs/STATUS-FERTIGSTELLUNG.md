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
| V4 Tour/Dialog | **erledigt** (`bfcc6ea`, `ef17f06`): Tour blendet sich bei offenem `aria-modal`-Dialog aus (Zustand bleibt), kommt danach zurück; auf Telefon/Tablet sitzt sie über der Unterleiste statt die Navigation zu verdecken. Test `pruefungen/tour-dialog.test.js`, Browserprobe `pruefungen/browser/tour-etag.mjs` 16/16 |
| ETag im Browser | **belegt** (Browserprobe 16/16): Oberfläche sendet bei jedem Speichern den ganzzahligen ETag (alle PUT 200), Person landet serverseitig; Fremdänderung per API → Oberfläche bekommt 409 und zeigt „Gleichzeitig bearbeitet“, Fremdänderung bleibt erhalten |
| Unabhängiges Review ETag (Subagent, Opus) | keine Umgehung, kein zusätzlicher Datenabfluss im 409, keine weiteren blinden Schreibwege. Umgesetzt: ETag muss ganzzahlig sein (`0`, `[]`, `{}`, `"05"` usw. → 409), 8 neue Testfälle, `etag-pflicht.test.js` 16/16. Offen: Rollenfilter-Test des 409 und Nebenläufigkeitstest (niedrig) |
| V4 Oberflächen / Zustände | **läuft.** Bereichs-Sweep `pruefungen/browser/bereiche.mjs` (alle Navigationsziele je Rolle, 1280/768/375/320 px, hell/dunkel: Seitenfehler, Querscroll, „Lädt …“-Hänger, Kontrast, Touchziele). Behoben bisher: NaN-/TypeError-Abstürze (Zahlenformate, Kontoblatt, Liniendiagramm), Betreiberkonsole ohne Betreiberblock, Dunkelmodus-Kontrast Einheitenfarben, Seitenleiste aktiver Eintrag (1,1:1), Touchziele. Lade-/Leerzustände sind in der App durchgängig vorhanden (`Laden`, `Leer`), Sicherungsliste auf `Laden` umgestellt |
| PR #96, A25, Konsolidierung auf `main` | nach V4 und gemeinsamem RC |

## Tatsächliche Blocker
- **B1** Caddy-Basic-Auth weist den `Authorization: Bearer` der App zurück; angemeldete Browsertests über HTTPS auf Staging gehen so nicht. Lösung nur auf dem VPS (Betreiber): IP-Freigabe statt Basic Auth oder Ausnahme für `/api/*`.
- **B2** Staging-Probe für Punkt 7/9 muss auf dem VPS laufen (Plan im Abnahmedokument; schreibt nur `ppg-gate-a`).
- **B4/B5** Datenisolation und Backup-Wiederherstellung auf dem VPS nicht abschließend belegt (Betreiber).

## Noch notwendige Release-Gates
Staging-Probe Punkt 7/9 ausgeführt und aufgeräumt; Backup-Wiederherstellung belegt; Rollback vorbereitet (`ruecksprung.sh` auf `0b192927…`); V4 integriert und im Browser abgenommen; Eintrag in `FREIGEGEBENE-IMAGES.md`; ausdrückliche Produktionsfreigabe.

## Gesamtumfang und Prognose (Stand 2026-11-06, ersetzt die frühere Angabe „66 %“)
Die frühere Zahl „66 %“ bezog sich nur auf **Release-Kandidat plus V4**. Für den ursprünglichen Gesamtumfang gilt (Quellen: `docs/acc45/MACHBARKEIT-2026-12-24.md`, `docs/acc45/GESAMTPLAN.md`, `docs/acc45/work-packages.json` mit 155 Paketen, Stand 04.11., seither nicht nachgeführt):

| Größe | Wert | Beleg |
|---|---|---|
| Restaufwand optimistisch / realistisch / pessimistisch | 424 / ≈ 650 / ≈ 970 PT | MACHBARKEIT Z. 18, 134: 573 PT Mitte, ×1,14 bzw. ×1,35 für Nacharbeit; Nacharbeitsquote 35 % = 16 von 46 Merges (Z. 94) |
| Pflichtpakete (SSOT) | 155: 37 erledigt/integriert (36 Entwicklung, 1 extern), 7 in Arbeit/Review, 111 offen, davon 80 `BLOCKED` | work-packages.json; Status seit 04.11. veraltet (WP-16/30/48/19.0b dort noch alt) |
| Fortschritt Gesamtumfang | ≈ 22 % nach PT, ≈ 24 % nach Paketen | Teilumfänge nicht angerechnet |
| größter offener Block | Intelligence/KI: 37 Pakete, ≈ 69 % des Restaufwands, im Code nur Faktenpaket WP-I11, kein Gateway, kein Anbieteraufruf | `git log --all -S anthropic`: 0 Treffer |
| Branchenmodule WP-19 | 6 von 12 mit Code, 6 nur im Katalog | `src/module/*`, `server/lib/modul-*` |
| extern | 34 von 35 Nachweisen offen (Kanzlei, Pentest, Verträge, Gerätetests, Pilotabnahmen) | acc45 E-1…E-32 |
| Kapazität | dokumentiert 3 Agenten × 6 PT/Tag = 90 PT/Woche; gemessen nur 2 Tage lang (KW45), seither 0 SSOT-Pakete; Konfliktzone `App.jsx` 47 % des Restaufwands | MACHBARKEIT Z. 15, 56, 72, 213–215 |
| Termine (Produktionsreife Gesamtumfang) | optimistisch 21.01.2027, realistisch 17.03.2027, pessimistisch 07.06.2027 | GESAMTPLAN §7.3 Variante C; kritischer Pfad ist extern (Pilot → Intelligence-Pilot E-24i → Kanzlei/Pentest), nicht der Entwicklungsdurchsatz |

Die Prognose „6 bis 7 Arbeitstage“ betrifft nur RC plus V4 (rund 10 % des Gesamtumfangs). Der Termin März 2027 ist damit weder überholt noch erreicht: Der Fortschritt seit dem 04.11. lag ausschließlich in RC, V4 und ETag-Fix, nicht in den SSOT-Paketen. Es gibt keine dokumentierte Entscheidung, Intelligence, die 6 fehlenden Module, WP-16c, WP-18, WP-21 oder WP-39 aus dem Pflichtumfang zu nehmen. Nicht einzeln geprüft: G9 N-A…N-F und die 50 WP-19-Entscheidungen.

### Prognose unter der Beschleunigungsstrategie (2026-11-06, bedingt, nicht gemessen)
Korrektur: Der Plan (591 PT / 92 Arbeitstage bis 17.03.2027) impliziert ≈ 32 PT/Woche, nicht 60. Die zuvor genannten 60 PT/Woche waren eine Annahme.

| | konservativ | realistisch | ambitioniert |
|---|---|---|---|
| Durchsatz PT/Woche (Annahme) | 40 | 65 | 90 |
| Nacharbeitsquote | 35 % | 25–30 % | ≈ 20 % |
| Entwicklungsdauer | ≈ 16 Wo | ≈ 10 Wo | ≈ 6 Wo |
| Termin 100 % | um 10.03.2027 | Ende Feb. bis Anfang März 2027 | Mitte Feb. 2027 |
| Gewinn gegenüber 17.03. | ≈ 1 Wo | 2–3 Wo | 4–5 Wo |

Ende Januar 2027 unwahrscheinlich, Ende Februar möglich. Der kritische Pfad ist extern (Pilot A ab 24.12. → Intelligence-Pilot E-24i, Kanzlei, Pentest, Betreiber-Gates B1/B2/B4/B5). Die Untergrenze von ≈ 6 Wochen nach Pilotstart ist eine Schätzung, nicht belegt.

Laufende Agenten (Worktrees, je eigener Branch, nur Push auf den eigenen Branch): `feature/intelligence-gateway` (Sonnet, nur Mock-Anbieter, kein Netz), `feature/branchenmodule-wp19` (Haiku, 6 fehlende Module). Routing ist manuell je Agentenauftrag; Dauerleistung, Rate-Limits und Kosten sind nicht nachgewiesen. Der Qualitätsvergleich Haiku/Sonnet/Opus entsteht aus diesen Aufträgen.
