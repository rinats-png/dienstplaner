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
| Integrationen seit 2026-11-06 (Abend), alle mit Opus-Review vor Merge | WP-39 Schritte 1–3 (App.jsx-Aufteilung, ≈65 Ansichten ausgelagert), WP-I3/I6/I12 (Regelbaukasten erweitert, Planungsreife, Rechenkern), Kleinpakete inkl. WP-47b-Korrektur (Sperre je Person statt je Raum), WP-40 (Barrierefreiheit), WP-15 (Selbstauskunft) und WP-32d (Pflicht-2FA Betreiber), WP-16c/14c/16b/07b (Stempelkette, Monatsabschluss-Korrekturen; Opus fand u. a. Vier-Augen-Umgehung über `vorschau`-Flag, behoben). Restrisiken WP-16c L1–L7 im Nachweis `docs/acc45/wp16c-nachweis.md`. Neue Oberflächen `monatskorrektur.jsx`, `selbstauskunft.jsx` sind noch nicht in `App.jsx` eingehängt (Snippets in den Nachweisen) und nicht im Browser geprüft. |
| **Vollregression Ebene B** (Kopf `594f32c`) | 235 Testdateien: 230 grün, 6937 Tests grün, 15 rot in 5 Dateien — **alle bekannt umgebungsbedingt**, keine neue Regression: `ablage` (3, Windows-Rechte/Umbenennen), `selbsttest` („Erster Aufbau unter 500 ms“, Zeitgrenze), `server` SIGTERM (Windows), `wiederherstellen-ui` (3, vorbestehend), `zugaenge-anlegen` (7, braucht `jq`). HTTP-Läufe: rechte 147/147, zeiterfassung 42/42, verwaltungswege 16/16, vollausgabe 12/12, betreiber-sicht 13/13, sicht-planung-leitung 19/19. |
| **Rolle `kunde` abgelöst** (Betreiberentscheidung 2026-11-07) | **umgesetzt, im Review** (`7f84933`): keine Vorgabe `kunde` bei fehlender Rolle (`/einrichten`, `/api/zugaenge`: 400), `kunde` nicht mehr vergebbar, Demo bleibt `demo: true` + ausdrückliche Rolle (keine neue Rolle nötig), Umstellungswerkzeug `werkzeug/kunde-abloesen.mjs` (Standard nur Bericht; `--ausfuehren` stellt nur aktive Demo-`kunde` auf `leitung`, Betreiberzugang wird nachgeprüft), Wachbuch „Kunde“ → `Auftraggeber`. Tests `kunde-abloesung.test.js` (+ angepasste Bestandstests), HTTP-Läufe unverändert grün, Build ok. Ausführung auf Produktion nur nach Freigabe: Freigabepaket D.2. |
| **Demo-Rollenwähler über `demo`, Migration vorbereitet** (Betreiberentscheidung D.3, 2026-11-07) | **umgesetzt**: `demo` in /api/demo, /api/anmelden (Demokonto), /api/bestand; Rollenwähler im Client über `zugang.demo`; Code-Anmeldung eines Demokontos = Demo-Sitzung (keine Verwaltungswege); Werkzeug mit Betreiber-Nachweis; Tests `demo-rollenwaehler`, `demozugang` 37/37; Migration nur auf Kopie als Bericht, `--ausfuehren` und Entfernung von `kunde` warten auf Freigabe (Freigabepaket D.3) |
| **Browserproben auf `daa8e46`** (2026-11-07) | tour-etag 16/16, ablaeufe 12/12 (Edge, Wegwerfdaten); Vollregression 6956 grün, 19 rot = bekannte Umgebungsreds (ablage, selbsttest, server SIGTERM, wiederherstellen-ui, zugaenge-anlegen/jq) plus mail-push-produktion nur unter Volllast (einzeln grün). Rollenwähler-Browserprobe und Demo-Sweeps 1280/375/320 noch offen |
| **WP-16c/WP-15 Oberflächen eingebunden** (`7cee8ea`) | Monatskorrektur + Selbstauskunft-Freigabe in Nachsehen › Abrechnungsdaten › Stempelbefunde (Leitung/Planung), Selbstauskunft-Status in Meine Schichten und Smartphone-Tab Mein Plan; Lohnexport-/Korrektur-Aktionen nutzen `serverstandNachladen` statt `upd` (behebt falschen Konfliktdialog nach Lohnexport); Tests 10 neu + 154 Bestand grün, Browserprobe einbindung 18/18, tour-etag 16/16, ablaeufe 12/12. Offen: Differenzfreigabe durch zweite Person im Browser, Opus-Review der Lohnexport-Änderung |
| **Beschleunigungsprüfung** (2026-11-07, rein lesend) | codebase-memory-mcp einziger Kandidat (nachrangiger isolierter A/B-Versuch vorgemerkt, `--skip-config`); TokenEconomizer, Serena (GPL), laya-codex, parallel-cc, superpowers verworfen; GitNexus nicht nutzbar (Noncommercial). Gemessen: 100 Commits/21 % Review-Nacharbeit seit 05.11., Vollregression >9,5 min; Zeitverluste je Faktor nicht gemessen. Keine Einführung |
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

### Integrationsstand 2026-11-06 (Abend)
- **WP-19 Branchenmodule:** alle sechs fehlenden Module (Wachbuch, Objektbericht, Bereitschaft, Funktionsdienst, Rotation, Pflegequalifikation) mit Server-, Ansichts- und Rechteteil in `integration/release-v4` gemergt (`abe3e15`), Status je Modul bleibt `geplant` (Abnahme/Fachnachweis fehlt, Schreiben fail-closed geschlossen). Opus-Review der Rechte: 9 Befunde behoben (u. a. Art.-17-Löschweg, rückdatierte Einträge, Modulschalter, Rotationslöschung), `rolle kunde` und Anonymisierung nur dokumentiert (Freigabepaket D/D.1, `wp19-offene-fragen-agent.md`). Nachweis nach Merge: HTTP-Läufe rechte 147/147, sicht-planung-leitung 19/19, vollausgabe 12/12, betreiber-sicht 13/13, schutzmerkmale-sicht 10/10, verwaltungswege 16/16; 835 Tests in 7 Dateien grün; Build und Lint grün; Browser-Abläufe 12/12.
- **Intelligence-Gateway** (`feature/intelligence-gateway`, noch nicht gemergt): nur Attrappe, nirgends verdrahtet, Live-Anbindung wirft immer. WP-I13/I14/I15/I17 mit Nachweisen; drei unabhängige Opus-Review-Runden (Runde 2: 12 Befunde, 3 davon fail-open, behoben; Runde 3: 1 hoch, 9 mittel/niedrig in Behebung). Merge in den Integrationsbranch nach der Behebung.
- **WP-39** (`feature/wp39-app-aufteilung`): läuft; Nachweis folgt in `docs/acc45/wp39-nachweis.md`.
- Mobil/V4: Querscroll-, Kontrast- und Tour-Befunde bis auf „Verteilung 320 px (26 px)“ behoben.

### Integrationsstand 2026-11-07 (kein Merge nach `main`, kein Deployment)
- **CI-Basis repariert (PR #102):** `.dockerignore` blockierte zwei 2FA-Werkzeuge für den Docker-COPY, tsc-Fehler in neun Dateien, ein Kommentar traf das Verbotsmuster, `matrix.mjs` las `MATRIX_STD` noch aus `App.jsx` (liegt in `src/lib/rollen.js`), `wiederherstellen-ui.test` erwartete den alten Ladetext, die Gate-Proben und HTTP-Suiten lieferten den WP-32d-Nachweis nicht. 2FA-Pflicht unverändert. Suite `verwalter` läuft in der CI über `serverlauf` statt gegen das Bild (Bremse 20 Aufrufe je 10 Min. unverändert). Der Docker-Pfad der Gate-Proben ist erst durch die GitHub-CI belegt.
- **Legal-Strang (PR #103):** Rechtstexte bleiben ENTWURF; HMAC-IP-Kürzel, Wachbuch-Löschsperre, Art.-9-Katalog, Regelregister-Fundstellen. Keine Konformitätsbehauptung.
- **IONOS-SMTP-Adapter (PR #101):** gebaut, ausgeschaltet (`CENTRIC_MAIL_WEG=smtp` nötig); keine Aktivierung, kein Live-Test, Tarif-SMTP-Freigabe unbelegt.
- **Betreiberleitfaden (PR #99)** integriert.
- **SI-P1/SI-P2 (PR #105/#106 → #107):** Sicherungsschlüssel überleben weder ihren Ersteller (inkl. ausgetreten/inaktiv/anonym) noch eine vollständige Wiederherstellung (Epoche außerhalb der Ablage in `CENTRIC_ZUSTAND`, Bindung, fail-closed, sofortiges Widerrufen bei neuer Epoche); Code-Sitzung endet bei Betriebsverlassen/Sperre. Zwei Opus-Reviews (Voll- und Delta-Review), Linux-CI inkl. SIGTERM/SIGKILL-Test grün. **Nicht Ende-zu-Ende geprüft:** die Passwortwechsel-Warnung (es gibt noch keinen Passwortwechsel-/Reset-Ablauf; bleibt Pflicht dafür).
- **WP-28c** (Schreib-Halt): Abhängigkeit korrigiert (wartet nicht auf WP-28b, Voraussetzung ist Teilfix PR #100); in Arbeit (Opus, eigener Worktree), noch nicht integriert. WP-28b bleibt offen.
- Integrationsregel: Nur der Hauptorchestrator integriert nach `integration/release-v4`; Cloud-Agenten liefern geprüfte PRs.

### Parallelität und Integrationsdurchsatz (Betreiberanweisung 2026-11-07, vorübergehend)
Ziel ist nicht die Zahl aktiver Agenten, sondern die Zahl vollständig integrierter und geprüfter Pflichtpakete je Woche.
- **Regeln:** höchstens ein zusätzlicher Cloud-Agent entwickelt Neues; der andere pausiert nach sauberer Sicherung und Übergabe; weitgehend fertige PRs werden nicht unterbrochen; nur der Hauptorchestrator integriert nach `integration/release-v4`; keine neuen parallelen Aufgaben an denselben zentralen Dateien; erst Integrationsrückstand abbauen, dann Kapazität wieder freigeben. Sicherheitsarbeit läuft unverändert weiter.
- **Entscheidung nach Arbeitsstand:** Cloud-Agent 2 (SI-P6 ist auf `acc45/sicherheit/si-p6` weit fortgeschritten und bereits intern Opus-geprüft, danach SI-P7) entwickelt weiter. Cloud-Agent 1 (WP-28b/Teilfix integriert, WP-28c läuft lokal als PR #110) pausiert neue Implementierungen. Die lokalen Schreib-Agenten sind auf zwei begrenzt (WP-28c, Verdrahtungsprüfung; Letztere wird erst nach den Sicherheitspaketen integriert).
- **Dateizuständigkeit `server/funktionen/daten.mjs`:** nur Cloud-Agent 2, nacheinander (SI-P6, dann SI-P7). PR #110 (WP-28c) fasst `daten.mjs` nicht an. Integrationsreihenfolge: SI-P6, PR #110, SI-P7, danach das Verdrahtungswerkzeug; jeweils Vollregression auf dem kombinierten Stand.
- **Rekonstruierte Kennzahlen (GitHub, PR #98–#110, nur belastbar soweit aus Commits und Läufen ableitbar; Näherungen):**

| PR | Inhalt | Commits | Dateien | PR→Merge (h) | Commits nach PR-Öffnung | davon CI-Korrektur | davon Review-Nachtrag |
|---|---|---|---|---|---|---|---|
| 98 | Actions per SHA (SI-P8) | 6 | 9 | 1,4 | 2 | 2 | 0 |
| 100 | WP-28b/2 Teilfix | 11 | 12 | 2,7 | 7 | 0 | 1 |
| 101 | IONOS-SMTP | 6 | 10 | 4,4 | 3 | 1 | 0 |
| 102 | CI-Basis | 9 | 17 | 3,5 | 6 | 5 | 0 |
| 103 | Legal | 22 | 45 | 3,5 | 1 | 0 | 0 |
| 105 | SI-P1 | 9 | 17 | 3,8 | 6 | 3 | 3 |
| 106 | SI-P2 | 4 | 9 | 3,3 | 1 | 0 | 0 |
| 107 | SI-P1/P2 + Wiederherstellung | 24 | 41 | 1,5 | 8 | 4 | 2 |
| 108 | WP-I3 | 1 | 2 | 0,2 | 0 | 0 | 0 |
| 109 | SI-P3 | 2 | 10 | 0,7 | 1 | 0 | 1 |

  Befund: Die Hauptkosten waren nicht das Schreiben, sondern (1) verdeckte CI-Basisfehler (PR #102 allein: 5 CI-Korrekturen, 6 Nachträge, alle anderen PRs liefen bis dahin gegen eine rote Basis), (2) Review-Nachträge bei Sicherheits-PRs (SI-P1: drei Nachträge, #107: zwei Opus-Runden), (3) nicht verdrahtete Tests (erst im Linux-Lauf entdeckt, ENOTEMPTY-Fehler), (4) Doku-/Konfigurationsfolgen neuer Umgebungsvariablen (`doku.test`, dreimal). Grenzen der Zahlen: CI-Läufe je Branch enthalten mehrere Workflows je Push und die rote Basis; die reine Entwicklungszeit je Paket ist aus Commit-Zeiten nicht belastbar ableitbar (Mehrfach-Sitzungen, Wartezeiten). Die Erfassung wird für die nächsten 5–10 Pakete (WP-28c, SI-P6, SI-P7, Verdrahtungswerkzeug, …) fortgeführt.

## Integrationsstand 2026-11-08 (Zentralisierung)

**Entscheidung des Betreibers:** Die beiden Cloud-Sitzungen sind eingestellt; Integration, Sicherheitsfreigaben und Backlog liegen allein beim Orchestrator, lokale Subagenten entwickeln parallel nur mit getrennten Dateizuständigkeiten. Kein Merge nach `main`, kein Deployment ohne ausdrückliche Freigabe.

**Seit 2026-11-07 integriert (integration/release-v4):** #107 SI-P1/P2 (Restore invalidiert Sicherungsschlüssel), #108, #109 SI-P3 (Testraum-Mail), #110 WP-28c (Schreib-Halt), #113 SI-P7 (Anmeldesperre, Merge 8678cf6), #111 SI-P6 (Kundenraumschutz, Merge e4a75e4). Jedes sicherheitskritische Paket durchlief mindestens zwei unabhängige Opus-Reviews; CI-Grün wurde nie als Ersatz gewertet.

**Gelernt (Durchsatz/Qualität):**
- Der hohe Race-Befund bei SI-P7 (parallele Anfragen umgingen die harte Sperre) und der hohe Befund B1 bei SI-P6 (Betreibercode in `/einrichten` an einen Kundenraum gebunden) wurden erst durch unabhängige Reviews bzw. den Review der Cloud-Sitzung gefunden — beide waren bei grüner CI vorhanden. B1 hatte ich in meinen eigenen Reviews zunächst nur als niedrigen Freigabepunkt geführt.
- Eine Schutzverschärfung (Kundenanmeldung schließt das Fenster der Ersteinrichtung) brach 19 von 25 HTTP-Prüfgruppen, weil sie nach der ersten Anmeldung weitere Codes im selben Raum anlegten. Die Gruppen laufen nun lokal vor jedem Push (`npm run pruefung:serverlauf`); künftig vor dem Push ausführen.
- Externe Störungen (restic-Download 504) sind von Codefehlern zu trennen: Neustart des Jobs erst nach erfolgreichem Testdownload.

**Offene Entscheidungen des Betreibers (FREIGABEPAKET):** Punkt 7 / SI-P6 M1 (Betreibercodes behalten Lesezugriff, wenn ihr Raum später Kundenraum wird: Empfehlung A = Betreibersitzung ohne /api/bestand auf Kundenräumen); SI-P6b (Zustimmung/Notfall-Wiederherstellung, dringend: bestehende Kundenräume können bis dahin keine neuen Beschäftigten aufnehmen); Betreiber-2FA ist in Produktion schon Pflicht (vor Deploy Faktor einrichten).

**Offene Aufräumpunkte:** `bildersatz.mjs`, `vergleich.mjs`, `pentest.mjs` legen Räume ohne `bestand-anlegen` an (unabhängig von SI-P6 defekt, nicht in CI); PR #112 (Verdrahtungsprüfung) in CI; 29 INTEGRATED/DONE-Pakete mit offenen Remote-Branches.

**Stand 2026-11-08, SI-P9 integriert:** PR #114 (Workflow-Härtung) gemergt in `integration/release-v4` (Merge-Commit `18ce941`), CI 21/21 grün. Backlog SI-P9 auf INTEGRATED mit Review- und Integrationsbeleg. Nebenbefund behoben: instabiler Leck-Test `intelligence-gateway-kern.test.js` (zufällige Auftrags-IDs enthielten „l1“), Ursache und Nachweis in `docs/acc45/SI-P9-NACHWEIS.md`. Offen bleiben Restbefunde 3 bis 5 aus SI-P8 und die Betreiberfreigabe für `deploy.yml` und `betrieb-deploy.yml`.
