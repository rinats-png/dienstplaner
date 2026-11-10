# ACC45 – Status

Stand der Prosa: 2026-11-03 (Tag 2, Abend). **Alle Zahlen, Status und Statusstufen** stehen im erzeugten Block unten
und kommen ausschließlich aus [`work-packages.json`](work-packages.json) (einzige Quelle). Gesamtplan, kritische Pfade,
Wellen und Zeitprognosen: [`GESAMTPLAN.md`](GESAMTPLAN.md). Graph: [`DEPENDENCIES.md`](DEPENDENCIES.md).

Stränge: `acc45` (Audit-Pakete WP-01…WP-47, WP-42a), `folge` (Folgepakete aus Reviews: WP-07b, 14c, 16b, 24b, 27c, 28b,
47b, S1), `wp19` (WP-19.0…19.13, [`WP19-MODULPLAN.md`](WP19-MODULPLAN.md)), `intelligence` (WP-I1…I37,
[`INTELLIGENCE-ENTWICKLUNGSPLAN.md`](INTELLIGENCE-ENTWICKLUNGSPLAN.md)), `extern` (E-1…E-28 nach
[`EXTERNE-ABNAHMEN-UEBERGABE.md`](EXTERNE-ABNAHMEN-UEBERGABE.md), dazu E-17a Pentest-Vorlauf, E-21i Freigabe Intelligence,
E-24i Intelligence-Piloten).

Statusstufen je Paket: implementiert · lokal getestet · unabhängig reviewt · integriert (nur bei Merge in
`integration/centric-complete`) · Staging geprüft · fachlich/rechtlich freigegeben · produktiv. Werte `true`, `false`
oder `"teilweise"`, jeweils mit Beleg (PR, Commit, Nachweis). „Geplant“, „vorbereitet“ oder „spezifiziert“ ist nie
„fertig“.

<!-- AUTO:BEGIN -->
Erzeugt aus `docs/acc45/work-packages.json` (Schema 2) mit `node werkzeug/acc45-backlog.mjs status-schreiben` — nicht von Hand ändern.

**Pakete gesamt:** 188 · BLOCKED 83 · READY 16 · IN_PROGRESS 7 · REVIEW 9 · INTEGRATED 70 · DONE 3

| Strang | Pakete | BLOCKED | READY | IN_PROGRESS | REVIEW | INTEGRATED | DONE | offener Aufwand PT |
|---|---|---|---|---|---|---|---|---|
| ACC45 | 88 | 22 | 0 | 5 | 5 | 54 | 2 | 55,4–87,05 |
| WP-19-Module | 15 | 14 | 0 | 0 | 1 | 0 | 0 | 66,8–104,2 |
| Intelligence | 40 | 28 | 0 | 0 | 0 | 12 | 0 | 219,5–387 |
| Folgepakete | 10 | 1 | 0 | 2 | 3 | 4 | 0 | 5,1–10,1 |
| Extern/Entscheidungen | 35 | 18 | 16 | 0 | 0 | 0 | 1 | 20,35–46,1 |

Offener Entwicklungsaufwand (ohne extern, ohne bedingtes WP-I35): **346,8–588,35 PT**. Integrierte Pakete zählen nicht mehr mit (bis 2026-11-03 zählten sie bis DONE weiter); was ihnen fehlt, steht als Statusstufe und in den externen Paketen.

**Kritische Pfade** (offener Aufwand, Mitte der Spanne maßgeblich):

- gemeinsam: WP-I4 → WP-I5 → WP-I7 → WP-I8 → WP-I9 → WP-I34 → WP-I37 = **54–97 PT**
- ohne Intelligence: WP-19.0 → WP-19.1 → WP-19.2 → WP-19.3 → WP-19.13 → WP-42a → WP-42 = **24,8–38,7 PT**
- ACC45: WP-16 → WP-48 = **16,5–27,5 PT**
- Folgepakete: WP-PILOT = **2–4 PT**
- WP-19: WP-19.0 → WP-19.1 → WP-19.2 → WP-19.3 → WP-19.13 = **20,8–32,2 PT**
- Intelligence: WP-I4 → WP-I5 → WP-I7 → WP-I8 → WP-I9 → WP-I34 → WP-I37 = **54–97 PT**

### In Arbeit / Review

| Paket | Status | Branch | Notiz |
|---|---|---|---|
| WP-09 Kette B nach main | IN_PROGRESS | `integration/centric-complete` | Integrationsbranch steht (65c1188 ff.). Offen: Staging-Abnahme (E-1), Merge nach main, Produktiv-Deploy nach Freigabe. Abhängigkeiten auf WP-09 gelten als reine Livegang-Reihenfolge. |
| WP-15 Selbstauskunft mit Freigabe und Stempelabgleich | REVIEW | `acc45/time/wp15-selbstauskunft-mit-freigabe-` | Abhängigkeit WP-14 integriert; Status von BLOCKED auf READY nachgeführt. Stand 2026-11-09: Code steht im Integrationsbranch, aber per Direkt-Merge ohne PR. Status daher REVIEW statt INTEGRATED, bis ein Merge-PR-Beleg nachgetragen oder der Koordinator entschieden hat. |
| WP-16 Pausen und Monatsabschluss | REVIEW | `acc45/time/wp16-pausen-und-monatsabschluss` | Kopf 1e1aac1. Teilumfang: Pausen, Monatsabschluss, vorläufiger Schutz (Wiederöffnen nach bestätigtem Lohnexport abgelehnt) — nur Zwischenlösung. Abnahmefähig erst mit WP-16c (P0). Folgepaket WP-16b (ältere Spur-Zeilen nennen den Tag). |
| WP-19 Branchenpakete (12 Module) | IN_PROGRESS | `acc45/frontend/wp19-branchenpakete` | Sammelpaket: aufgeteilt in WP-19.0 … WP-19.13 (WP19-MODULPLAN.md). Server-Teilumfang von sechs Modulen integriert (#44, #49), alle Module in der Registry „geplant“ (nicht einschaltbar). |
| WP-21 Smartphone/Tablet für alle Rollen | IN_PROGRESS | `acc45/frontend/wp21-smartphone-tablet-fur-alle-r` | Stand (automatisch): INTEGRATED nach #183. Stand 2026-11-10: Teil 1 integriert (#183), siehe docs/acc45/WP-21-GERAETEMATRIX.md. Offen: Querformat und echte Geräte, Bedienabläufe (Stempeln, Plan freigeben, Tag öffnen, Übergabe, Krankmeldung), Kartenansicht nach Betreiberentscheidung wp40-Frage 6, Schnellfilter Mein Plan, Rollen und Rechte, Tastatur-/Vorlesesoftwareprobe, Hinweis Für Tablet und Rechner ausgelegt ansichtsweise zurücknehmen. |
| WP-33 Testinfrastruktur (vollständige Sammelprüfung, Playwright, axe) | REVIEW | `acc45/qa/wp33-testinfrastruktur` | Branch seit 2026-11-02 19:03 unverändert, kein Review dokumentiert, nicht integriert; muss auf den heutigen Integrationsstand (≈ 40 Merges später) nachgezogen werden. |
| WP-40 Barrierefreiheit WCAG 2.2 AA | REVIEW | `acc45/frontend/wp40-barrierefreiheit-wcag-2-2-aa` | Stand 2026-11-09: REVIEW. Quelltext-Prüfung bestanden, Browser-Abnahme offen (Reflow 1.4.10, Zielgröße 2.5.8, Fokus 2.4.11, Fehlertext 3.3.1). |
| WP-16c Monatsabschluss: Korrekturrevisionen nach bestätigtem Lohnexport (Revision, Differenz, Korrekturexport, Freigabe, Audit) | REVIEW | `acc45/time/wp16c-korrekturrevisionen` | P0-Produktionsblocker (Betreiberentscheidung 2026-11-03), Sicherheitsklasse kritisch (Opus). Der Schutz in WP-16 (Wiederöffnen nach bestätigtem Lohnexport abgelehnt, Aktion „Lohnexport bestätigen“) ist nur Zwischenlösung; WP-16 ist erst mit WP-16c abnahmefähig. Rechtliche/buchhalterische Detailanforderungen: E-29. SCHÄTZUNG. |
| WP-14c Stempel-/Korrekturkette: Folgebefunde F2, F4–F8 aus dem WP-14b-Delta-Review | REVIEW | `acc45/time/wp14c-folgebefunde` | SCHÄTZUNG (nicht gemessen). F8 setzt WP-16 (pauseZuLang) voraus. |
| WP-16b Spur: ältere Spur-Zeilen nennen noch den Tag (Datenschutz nach WP-14b M1) | REVIEW | `acc45/time/wp16b-spur-tag` | SCHÄTZUNG. |
| WP-28b Lasttest-Befund 6: Sicherung bricht unter Last mit ENOENT ab (Wiederholung greift nicht); Auswertung des Nachlaufs S2/S5 | IN_PROGRESS | `acc45/infra/wp28b-nachlauf` | NICHT ERLEDIGT, fail-closed Teilfix (PR #100). Unter Dauerlast gelingt die Sicherung weiterhin nicht zuverlässig (ca. 17 Schreibvorgänge/s auf 3000 Dateien: 1 von 14; mit der Vorgabe-Ruhezeit von 1 s schon bei 8/s keine). Die Ruhezeit senkt das Risiko halber Mehrdatei-Transaktionen in der Sicherung, garantiert aber keine transaktionsübergreifende Konsistenz. Offen: (1) Nachlauf S2/S5 (E-20, Handstart durch den Betreiber); (2) nach Reparatur der CI-Basis (PR #102 / fix/ci-baseline) die blockierten Prüfungen nachholen: Docker-Bildbau, Betrieb-Sicherung-Ende-zu-Ende, die Fachprüfungen hinter dem Typen-Schritt; (3) Folgepaket WP-28c (koordinierter Schreib-Halt). |
| WP-07b Stempel-Sonderfall „500 nach Speicherung“ (clientEventId, sechs Szenarien) | REVIEW | `acc45/time/wp07b-500-nach-speicherung` | SCHÄTZUNG; Konfliktzone Stempelpfade: nicht gleichzeitig mit WP-14c/WP-19.7/WP-19.6. |
| WP-19.0 WP-19 Kern-Nacharbeit (Aktivierung, Mitbestimmungsbestätigung, Regelwerte, Einhängepunkte) | REVIEW | `acc45/frontend/wp19-0-modulkern` | Basis des Kerns (Registry, Katalog, Andockpunkte) integriert in #44; offen ist die Nacharbeit aus Abschnitt 13. Kopf 59079b5, CI grün, Opus-Review läuft (Stand: implementiert/lokal getestet). |
| WP-PILOT Pilotbetriebe A (Pflege) und B (Sicherheitsdienst): Erhebung, synthetische Testszenarien, Datenschutzrahmen | IN_PROGRESS | `acc45/docs/pilot-erhebung` | SCHÄTZUNG (nicht gemessen). Nur Doku und synthetische Testdaten-Definitionen; Seed-Umsetzung der Datensätze SD-P/SD-S fehlt noch (Anschluss an WP-S1). Echtdaten erst nach Erfüllung aller Voraussetzungen der Stufe 3 im Datenschutzrahmen; externe Punkte (AVV, Pilotvereinbarung, Mitbestimmung) offen. Szenarien mit Modul-Voraussetzung erst nach Einschaltbarkeit der WP-19-Module ausführbar. |
| IMP-6 Schichtmodelle und Schichtzyklen: mehrere Modelle, unterschiedliche Zykluslängen, bestehende Validierungen | IN_PROGRESS | `–` | Freigabe Punkt 5. Ressourcenlimits fachlich begründet, nicht als Geschäftsregel. Stand 2026-11-10: Bibliothek integriert (#185), siehe docs/acc45/IMP-6-NACHWEIS.md. Offen: Schreiben in den Bestand (mehrere Modelle je Person brauchen eine Datenmodell-Entscheidung), Verdrahtung in /api/import und Oberfläche. |
| OPT-4 SI-P4 Option 4: zweiter Faktor (TOTP) direkt für Benutzerkonten, Zielarchitektur | IN_PROGRESS | `–` | Genehmigt und priorisiert 2026-11-09. Langfristige Zielarchitektur. Die Konto-Wiederherstellung (WR-9) hängt davon ab und zählt ihren Aufwand separat. Stand 2026-11-10: Teilumfang integriert (#182), siehe docs/acc45/OPT-4-WR-2-LUECKEN.md; Migration bestehender Konten offen. |

### Bereit zum Start (16)

WP-34 (acc45, 1–1,5 PT) · WP-I4 (intelligence, 8–14 PT) · WP-I16 (intelligence, 8–14 PT) · WP-I19 (intelligence, 16–28 PT) · WP-I20 (intelligence, 16–28 PT) · WP-I22 (intelligence, 8–14 PT) · WP-I23 (intelligence, 4–7 PT) · WP-I24 (intelligence, 5–9 PT) · WP-I29 (intelligence, 18–30 PT) · WP-I30 (intelligence, 4–8 PT) · WP-I31 (intelligence, 9–15 PT) · SI-P6b (acc45, 1,5–3 PT) · IMP-8 (acc45, 2–3 PT) · IMP-10 (acc45, 0,5–1 PT) · WR-3 (acc45, 2,5 PT) · WP-I12c (intelligence, 0,5–1 PT)

### Integriert in `integration/centric-complete` (70)

| Paket | Beleg (PR, Merge-Commit) | Review |
|---|---|---|
| WP-02 Schreibserialisierung je Raum, kein Stempelverlust | #24 (3722719) | Agent F: Auflagen → Freigabe |
| WP-03 Rücksprung nur über verifizierte Digests, R0 | #22 (e748c70), #23 (a063925) | Agent F: Auflagen → Freigabe |
| WP-04 Automatische verschlüsselte Offsite-Sicherung | #21 (5fd2696) | Agent F: Auflagen → Freigabe |
| WP-05 Überwachung und Alarme | #34 (0ccf2ae), #37 (6570858) | Agent F: Ablehnung → Nachprüfung → Freigabe |
| WP-06 Stempel-Integrität (Originale unveränderlich, Korrekturereignisse) | #47 (b3707d8), #51 (d5fccbd) | Review mit Auflagen; Nachtrag 06b (#51) |
| WP-07 Offline-Stempeln (clientEventId, Idempotenz, Sync) | #58 (7e7b6e4) | Review (Ablehnung → Nachbesserung) laut Nachweis |
| WP-10 Kette A Basis (#7) auf B portieren, Datenmodell d.1–d.5 | #31 (b32880c) | Agent F: Auflagen → Nachprüfung → integrierbar mit Auflagen |
| WP-11 Regelregister (#6) portieren, eine Schutzprüfung | #31 (b32880c), #35 (b84de34), #39 (85337ac) | Agent F: Freigabe der Nachträge (#35, #39) |
| WP-12 Integrationsabnahme A+B | #43 (9d0ff51), #46 (7cacbf7) | Abnahmeprüfungen im Repo; 12b Regressionstest 409 |
| WP-13 Stempeln ohne Plan, ungeplante Dienste im Ist | #51 (d5fccbd) | Review laut Nachweis |
| WP-14 Korrekturworkflow Leitung/SV, Korrekturantrag | #52 (442527b), #66 (92a3b97) | Review abgelehnt → Nachbesserung; Opus-Delta-Review → Nachtrag 14b (#66) |
| WP-17 Stempelkonflikt-Retry, Serverdatum | #47 (b3707d8) | Review (Ablehnung → Nachbesserung) laut Nachweis |
| WP-18 Zugänge: personengebundene Codes, Konto-UI, Einladungen | PR #132 in integration/release-v4 gemergt | PR #131 in integration/release-v4 gemergt nach Review |
| WP-20 Einsatzorte je Dienst, Geo-Modi, Außendienst | #56 (dd72a10) | Review laut Nachweis |
| WP-22 Fachprüfungen auf dem Server, org.edit | #41 (cc19eb4), #45 (ca8c4bc), #54 (53b986a) | Review; Nachträge 22b (#45, #54) |
| WP-23 Entwürfe nicht an Beschäftigte ausliefern | #53 (b6ee1cf), #64 (f2428aa) | Review abgelehnt → Nachbesserung; 23b (#64) |
| WP-24 Kalender-Feed live und gebunden | #59 (741c844) | Nachprüfung abgeschlossen vor Merge |
| WP-25 Wiederherstellen in der Oberfläche | #50 (a7d4020) | Review mit Nachbesserung |
| WP-26 DSGVO serverseitig (Art. 15, Löschlauf, Ausdünnung) | #40 (9abf988) | Agent F: Ablehnung (2c1aa8e) → H1–H3 → Nachprüfung „integrierbar mit Auflagen“ → N-1…N-4 (7e6a4bb) umgesetzt; Freigabe nach den N-Auflagen nicht dokumentiert |
| WP-27 Betriebsrat-Auswertung aggregiert, reduzierte Sichten | #57 (65e4e58), #65 (59b4ac2) | Review; Opus-Nachprüfung → 27b (#65) |
| WP-28 Lasttest und Skalierungsentscheid | #60 (10f1ca4) | Review laut Nachweis |
| WP-29 Geo-Spezifikationsreste | #63 (764b1ab) | Review laut Nachweis |
| WP-31 Deploy-Automatisierung mit Freigabe | #32 (4300f8d), #42 (d2d3f7a) | Agent F: Auflagen → Nachprüfung → Freigabe; 31b (#42) |
| WP-32 Lieferkette, Infrastruktur, Betreiber-2FA | #30 (bb5ade8), #32 (4300f8d) | Agent F: Auflagen → Freigabe (32b, 32c) |
| WP-35 Darstellungsbefunde | PR #176 in integration/release-v4 | PR #176 in integration/release-v4 |
| WP-37 PWA-Feinschliff | #62 (9d4f383) | Review laut Nachweis |
| WP-38 Toter Code, eine Planrechnung | PR #143 in integration/release-v4 | PR #143 in integration/release-v4 |
| WP-39 App.jsx modularisieren | PR #128 in integration/release-v4 gemergt | PR #128 in integration/release-v4 gemergt |
| WP-41 Betriebs- und Nutzerdokumentation | #42 (d2d3f7a) | Review mit Auflagen |
| WP-43 Personaldaten-Filter vollständig (Matrix ↔ Code, tagesgenau) | #25 (eb5fc98), #26 (f5bec0d) | Agent F: Auflagen → Freigabe (N1 #26) |
| WP-45 Atomarer Mehrdatei-Schreibvorgang (Journal), Kontovereinzelung | #29 (60818c0), #33 (737c453), #36 (efdde6b), #38 (57717df) | Agent F: 45b Ablehnung → vier Nachprüfungen → Freigabe |
| WP-46 Bremse fail-closed, gleitendes Fenster, Notbremse Zugangscode | #27 (56c73d0), #28 (336788a) | Agent F: Auflagen → Freigabe |
| WP-47 Bremsen: Lastgrenzen Stempeln und Anmeldung (je Person, je Raum, je Code) | #55 (2afab0c), #61 (006b036) | Review laut Nachweis; Flake-Fix #61 |
| WP-32d Betreiber-2FA verpflichtend vor produktivem Betrieb mit echtem Betreiberzugriff | PR #141 in integration/release-v4 | PR #141 in integration/release-v4 |
| WP-27c Betriebsrat-Auswertung: Nachtrag (Aufräumen von−2, ungeplanter Dienst sperrt Gesamtzeile, Rufbereitschaft im Ist, Test Weiterleitung) | PR #150 in integration/release-v4 | PR #150 in integration/release-v4 |
| WP-47b Lesebremse nach Bestandsgröße, eigene Feed-Bremse und Zwischenspeicher je Raum/Stand | PR #151 in integration/release-v4 | PR #151 in integration/release-v4 |
| WP-28c Konsistente Sicherung unter Dauerlast: kurzer, befristeter, koordinierter Schreib-Halt im Server (Folge zu WP-28b/2) | #110 (42e83da) in integration/release-v4 | Opus-Review, Befunde behoben |
| WP-S1 Staging-Vorbereitung (Agent): Smoke, Testdaten, Abnahme-Checkliste 3.1–3.4 | PR #119 gemergt in integration/release-v4 (CI grün) | – |
| WP-I2 Live-Prüfung Schichtfolge-Editor | PR #152 in integration/release-v4 | PR #152 in integration/release-v4 |
| WP-I3 Regelbaukasten vervollständigen (8 Regelarten) | PR #108 in integration/release-v4 (gemergt 2026-11-07) | PR #108 in integration/release-v4 (gemergt 2026-11-07) |
| WP-I6 Planungsreife | PR #138 in integration/release-v4 | PR #138 in integration/release-v4 |
| WP-I10 Architekturabgleich Spezifikation auf heutigen Stack | PR #70 in integration/release-v4 | – |
| WP-I11 Faktenpaket-Vertrag (Positivliste, Alias) | #86 (intelligence/wp-i11-integration) | Opus-Sicherheitsreview + Delta-Review (2 Runden) |
| WP-I12 Decision Engine (Extraktion aus App.jsx) | Kern 4d553280 (Direkt-Merge 2026-11-06, kein PR) liegt in integration/release-v4; Koordinator-Entscheidung 2026-11-10: Beleg über Commit, Gleichheits- und Golden-Tests (pruefungen/engine-rechenkern.test.js, engine-golden, engine-paketliste, engine-einsatz) grün in der CI des Integrationskopfs, Teilpakete WP-I12a (#174) und WP-I12b (#140) mit PR und Review integriert. | – |
| WP-I13 Gateway, Attrappe, Router, Prüfer | PR #146 in integration/release-v4 | PR #146 in integration/release-v4 |
| WP-I14 Fingerprint, Ergebnis-Speicher, Decision Context | PR #159 in integration/release-v4 | PR #159 in integration/release-v4 |
| WP-I15 Kostenschutz, Limits, Deadline, degradierter Modus | PR #158 in integration/release-v4 | PR #158 in integration/release-v4 |
| WP-I17 Intelligence-Oberfläche Grundlage | PR #154 in integration/release-v4 | PR #154 in integration/release-v4 |
| SI-P1 Sicherungsschlüssel an Ersteller binden und mit Austritt/Sperre widerrufen (Befund P1, mittel) | #107 (e5ada4e) in integration/release-v4 | Zwei unabhängige Opus-Reviews (SI-P1/P2), Befunde behoben |
| SI-P2 Code-Sitzung endet, wenn die Person den Betrieb verlässt (Befund P2, mittel) | #107 (e5ada4e) in integration/release-v4 | Zwei unabhängige Opus-Reviews (SI-P1/P2) |
| SI-P3 Mailversand aus Test- und Demoräumen begrenzen (Befund P3, mittel) | #109 (e58f163) in integration/release-v4 | Opus-Review, Regression (Betreibervorlagen als selbstAngelegt) behoben |
| SI-P4 Zweiter Faktor für Leitung, Planung und Kunde (Befund P4, mittel) | PR #124 in integration/release-v4 gemergt | PR #124 in integration/release-v4 gemergt |
| SI-P5 Matrixzeilen und Negativ-Sonden für die festgeschriebenen Lücken (Befund P5, niedrig) | PR #136 in integration/release-v4 | PR #136 in integration/release-v4 |
| SI-P6 Betreiber-Leitungscodes nur mit frischer Anmeldung und frischem zweiten Faktor (Befund P6, HOCH) | #111 (e4a75e4) in integration/release-v4 | Vier unabhängige Opus-Reviews (inkl. Befund B1 hoch: Betreibercode in /einrichten, behoben) |
| SI-P7 Herkunftssperre trifft keine gültigen Codes; IPv6 nach /64 (Befund P7, mittel) | #113 (8678cf6) in integration/release-v4 | Drei unabhängige Opus-Reviews; hoher Race-Befund (parallele Anfragen), mittlere Befunde (Zählerausfall, Antwort-Orakel, Kartenüberlauf) behoben |
| SI-P8 Alle fremden Actions per Commit-SHA pinnen (Befund P8, mittel) | PR #98 (Merge-Beleg), Commits 4f1654b, 6733b47, a587df8 in integration/release-v4 | Unabhängiger Review plus Nach-Review, alle Befunde (mittel und niedrig) behoben und getestet |
| SI-P9 Workflow-Härtung: Checkout-Token nicht speichern, Berechtigungen nur lesend (Befund P8-Restpunkte 1+2, mittel) | PR #114 in integration/release-v4 | PR #114 in integration/release-v4 |
| IMP-0 Importpaket: Festlegung von Format, Vertrag und Grenzen (Freigabe 2026-11-09) | PR #121 in integration/release-v4; Vertrag docs/acc45/IMPORT-VERTRAG.md im Integrationsbranch | PR #121 in integration/release-v4; Vertrag docs/acc45/IMPORT-VERTRAG.md im Integrationsbranch |
| IMP-1 Bestandsfehler Import: Dubletten, Personalnummer speichern, keine erfundene E-Mail, Datum nicht still ersetzen | PR #130 in integration/release-v4 gemergt | Review d6c92e0 plus Nachbesserung, integriert PR #130 in integration/release-v4 gemergt |
| IMP-2 Parser: SheetJS CE 0.20.3 (Herstellerdistribution) lokal, Prüfsumme, Lizenz, Grenzen, ZIP-Schutz | PR #123 in integration/release-v4 | PR #123 in integration/release-v4 |
| IMP-3 Endpunkt /api/import: Rollen, Mandant, Wiederholschutz, atomare Übernahme, Protokoll ohne Personendaten | PR #142 in integration/release-v4 | PR #142 in integration/release-v4 |
| IMP-4 Personalimport mit Vorschau: Neu / Aktualisieren (ausdrücklich) / Überspringen / Konflikt klären | PR #137 in integration/release-v4 | PR #137 in integration/release-v4 |
| IMP-5 Organisationseinheiten: Teams, Standorte, Qualifikationen; neue nur mit org.edit | PR #187 in integration/release-v4 | PR #187 in integration/release-v4 |
| IMP-9 KI-Schnittstelle (austauschbar, ohne Aktivierung): strukturierte Ergebnisse, Unsicherheiten, Validierungsfehler | PR #187 in integration/release-v4 | PR #187 in integration/release-v4 |
| OPT-1 SI-P4 Option 1: sichere Ersteinrichtung für neu angelegte Betriebe (einmalig, befristet, keine Klartext-Mail) | PR #179 in integration/release-v4 | PR #179 in integration/release-v4 |
| OPT-1-F Anmeldeweg für Leitungskonten nach Ersteinrichtung (Folgepaket zu OPT-1): Passwort plus zweiter Faktor, ohne Umgehung der Authentifizierung | PR #179 in integration/release-v4 | PR #179 in integration/release-v4 |
| WR-1 Kontowiederherstellung: Kern (zehn Codes, Speicherung scrypt, Verteilung ohne Verzerrung) | PR #167 in integration/release-v4 (Kern: zehn Codes, scrypt, Verteilung) | PR #167 in integration/release-v4 (Kern: zehn Codes, scrypt, Verteilung) |
| WR-2 Kontowiederherstellung: Neugenerierung über alle Eingänge (nur nach vollständiger Authentifizierung) | PR #182 in integration/release-v4 | PR #182 in integration/release-v4 |
| WP-I12a Decision Engine Rest: Near-Miss, ersatzVorschlaege, hindernisBefunde (Frage 7; je Teil höchstens 15 Funktionen) | PR #174 in integration/release-v4 | PR #174 in integration/release-v4 |
| WP-I12b Decision Engine: Paketliste und Regelkennung serverseitig (Fragen 1 und 6) | PR #140 in integration/release-v4 | PR #140 in integration/release-v4 |

### Statusstufen

✓ belegt · T teilweise (z. B. nur Server-Teilumfang) · – nicht erreicht oder nicht belegt. „Staging“, „Freigabe“ und
„prod.“ stehen nur mit Beleg auf ✓. Gezeigt sind alle Pakete mit mindestens einer erreichten Stufe; alle übrigen
66 offenen Entwicklungspakete stehen auf allen Stufen auf „–“.

| Paket | Status | impl. | lokal | Review | integr. | Staging | Freigabe | prod. |
|---|---|---|---|---|---|---|---|---|
| WP-01 | DONE | ✓ | ✓ | ✓ | ✓ | – | – | ✓ |
| WP-02 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-03 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-04 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-05 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-06 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-07 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-08 | DONE | ✓ | – | – | – | – | – | ✓ |
| WP-09 | IN_PROGRESS | T | – | – | – | – | – | – |
| WP-10 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-11 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-12 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-13 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-14 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-15 | REVIEW | ✓ | – | – | – | – | – | – |
| WP-16 | REVIEW | ✓ | ✓ | T | – | – | – | – |
| WP-17 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-18 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-20 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-21 | IN_PROGRESS | ✓ | ✓ | ✓ | – | – | – | – |
| WP-22 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-23 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-24 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-25 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-26 | INTEGRATED | ✓ | ✓ | T | ✓ | – | – | – |
| WP-27 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-28 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-29 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-31 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-32 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-33 | REVIEW | ✓ | T | – | – | – | – | – |
| WP-35 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-37 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-38 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-39 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-40 | REVIEW | ✓ | – | ✓ | – | – | – | – |
| WP-41 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-43 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-45 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-46 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-47 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-32d | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-27c | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-47b | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-28b | IN_PROGRESS | T | T | T | T | – | – | – |
| WP-28c | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-S1 | INTEGRATED | ✓ | ✓ | – | ✓ | – | – | – |
| WP-19.1 | BLOCKED | T | T | T | T | – | – | – |
| WP-19.4 | BLOCKED | T | T | T | T | – | – | – |
| WP-19.7 | BLOCKED | T | T | T | T | – | – | – |
| WP-19.10 | BLOCKED | T | T | T | T | – | – | – |
| WP-19.11 | BLOCKED | T | T | T | T | – | – | – |
| WP-19.12 | BLOCKED | T | T | T | T | – | – | – |
| WP-I2 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-I3 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-I6 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-I10 | INTEGRATED | ✓ | ✓ | – | ✓ | – | – | – |
| WP-I11 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-I12 | INTEGRATED | ✓ | ✓ | – | ✓ | – | – | – |
| WP-I13 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-I14 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-I15 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-I17 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| SI-P1 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| SI-P2 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| SI-P3 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| SI-P4 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| SI-P5 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| SI-P6 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| SI-P7 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| SI-P8 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| SI-P9 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| IMP-0 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| IMP-1 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| IMP-2 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| IMP-3 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| IMP-4 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| IMP-5 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| IMP-6 | IN_PROGRESS | ✓ | ✓ | ✓ | – | – | – | – |
| IMP-9 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| OPT-1 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| OPT-1-F | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| OPT-4 | IN_PROGRESS | ✓ | ✓ | ✓ | – | – | – | – |
| WR-1 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WR-2 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-I12a | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-I12b | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
<!-- AUTO:END -->

## Klärungen und Widersprüche (2026-11-03)

- **WP-26** stand hier bis heute als „Review abgelehnt … nicht integriert“. Das war veraltet: Ablehnung auf 2c1aa8e →
  H1–H3 umgesetzt → Nachprüfung „integrierbar mit Auflagen“ → N-1…N-4 umgesetzt (7e6a4bb) → Merge #40 (9abf988,
  2026-11-03 07:15). Belege: [`wp26-nachweis.md`](wp26-nachweis.md), `git log origin/integration/centric-complete`.
  Offen bleibt nur, dass eine dokumentierte Freigabe *nach* den N-Auflagen im Nachweis fehlt. Damit ist auch Q-10 aus
  `WP19-MODULPLAN.md` beantwortet.
- **Drei Zählungen liefen auseinander:** `work-packages.json` (zuletzt erzeugt vor WP-47: 46 Pakete, 17 INTEGRATED),
  Array `P` im Werkzeug (47 Pakete, 29 INTEGRATED) und diese Datei (46 Pakete, 25 INTEGRATED, „READY: WP-06, WP-30“,
  WP-24/WP-28 „in Arbeit“, obwohl #59/#60 gemergt waren). Ursache: drei Stellen von Hand gepflegt. Jetzt: eine Quelle,
  eine Prüfung (`pruefungen/acc45-status.test.js`) im CI-Gate.
- **Risiken-Liste veraltet:** WP-11-Fehlalarm (#35), WP-45b-Nachprüfung (#33/#36/#38) und WP-26 waren als „in Arbeit“
  geführt, sind aber integriert. WP-31 „Deploy startet bei Sicherungsfehler gesperrten Altstand“ steht als „Korrektur in
  Arbeit“, die alte Merge-Tabelle als „Freigabe“; ein Nachweis fehlt im Repo → zu klären (Notiz bei WP-31).
- **WP-05** ist integriert, seine Abhängigkeit WP-30 (Mail/Push) nicht; der externe Alarmweg fehlt (E-8).
- **WP-12** ist integriert (Abnahmeprüfungen im Repo), die Akzeptanz „Testplan 3.1–3.4 auf Staging“ aber nicht erfüllt
  (E-1). Commit 3f6f7c8 auf `acc45/qa/wp12b-409-test` ist nicht integriert.
- **WP-33** steht seit 2026-11-02 19:03 auf REVIEW, ohne dokumentiertes Review und ohne Integration; der Branch liegt
  rund 40 Merges hinter dem Integrationsstand.
- **Offener Aufwand neu definiert:** bisher zählten integrierte Pakete bis DONE mit (165,5 PT). Jetzt zählt nur offene
  Entwicklung; was integrierten Paketen bis zur Produktion fehlt, steht als Statusstufe und in den Paketen `E-*`.
- **WP-19** war mit 25 PT geführt; der Modulplan schätzt 63–98 PT (WP-19.0…19.13). **Intelligence** war „kein
  ACC45-Paket“ und nicht in der JSON; jetzt eigener Strang mit eigener Summe, ohne die ACC45-Zahlen zu verändern.

## Gefundene und behobene Fehler (Auswahl, alle mit Test rot → grün)

- Stille Datenverluste bei gleichzeitigen Schreibvorgängen (bis 131 von 200 Stempeln im Lasttest) → behoben.
- Unlesbare Monatsdatei wurde beim nächsten Schreiben gelöscht → behoben.
- Löschlauf, Provisionierung und Kontenpflege ohne Sperre → behoben.
- Sensibles Personenfeld ging an Rollen ohne Berechtigung und war überschreibbar → behoben.
- Bereichssicht der Schichtverantwortung nicht tagesgenau → behoben.
- R0-Abschaltung konnte fälschlich Erfolg melden → behoben.
- Leere Sicherung hätte als Erfolg gegolten → behoben.
- Löschlauf ohne Fristprüfung (Server-Hänger, gesetzlich aufzubewahrende Zeiten löschbar) → behoben (WP-26, #40).

## Offene Risiken (je mit Paket)

- Nachträgliche Korrektur abgeschlossener, bereits exportierter Monate nur über die Zwischenlösung (Wiederöffnen gesperrt)
  → WP-16c (P0), E-29.
- Stempel „500 nach Speicherung“ unter langsamer Platte: Wiederholung könnte doppelt stempeln → WP-07b.
- Stempel-/Korrekturkette: Folgebefunde F2, F4–F8 → WP-14c. Monatsabschluss und Pausen erst im Review → WP-16.
- Lesebremse schützt große Bestände nicht; Feed liest den vollen Bestand → WP-47b.
- Altfeeds ohne Herkunft, Passwortwechsel widerruft Feeds nicht → WP-24b (Entscheidung bis 2026-12-01, E-21).
- Ältere Spur-Zeilen nennen den Tag → WP-16b.
- WP-31-Befund (Altstand nach Sicherungsfehler) ohne Nachweis im Repo → klären.

## Offene Nutzerfreigaben und -entscheidungen

Als Pakete geführt (Strang `extern`, Nummern der Übergabeliste): E-21 (fachliche Entscheidungen vor dem Release),
E-21i (Freigabe Intelligence-Block), E-15 (Code-Rotation Z1–Z7), dazu die übrigen Abnahmen. Einzelheiten:

1. WP-09: Merge des Integrationsstands nach `main` und Produktiv-Deploy (nach Staging-Abnahme E-1).
2. Isolierte VPS-Proben (WP-03 Rücksprung A→B→A, WP-04 Restore auf dem VPS) → E-14, E-7.
3. WP-04: Speicherziel, Verwahrung des restic-Passworts, Alarmdienst → E-7, E-8.
4. WP-03-Einführung: Migration der Produktions-`.env`, gesperrte Bilder samt Tags entfernen → E-13.
5. WP-44 (A9): Ablauf Z1–Z7 → E-15.
6. Fachlich: 120-Tage-Horizont der Server-Nachrechnung; Archiv Bestätigungsprotokoll; sperren oder warnen (Ruhezeit,
   Qualifikation, keineNacht, maxDiensteWoche, keinAlleindienst); `zuschlaege` als Lohnbestandteil? Eigene Bank-/Lohndaten
   für Beschäftigte sichtbar (Art. 15)? `rolleSeit`/`rolleVerlauf` für MA/BR/SV? Sondereinsätze tagesgenau bestätigen;
   WP-14b N2 Vier-Augen, M4 24-h-Einsatz; WP-24 Passwortwechsel/Feeds → E-21.
7. Externe Gates: Pentest beauftragen (E-17a/E-17), iPhone/Tablet (E-3, E-5), Rechtstexte (E-18), Fachnachweise je
   Branchenmodul (E-22), Mitbestimmung (E-19).

### Bewusst zurückgestellt (Nutzerentscheidung 2026-11-03, vor dem Produktiv-Release erneut vorlegen)

- **Mindestbesetzung / PpUGV:** warnen mit Bestätigung oder sperren. Vorläufig umgesetzt: warnen.
- **Alarmweg (WP-05):** externer Uptime-Check und interner Webhook-Kanal. Bis dahin `CENTRIC_ALARM_WEBHOOK` leer, Alarme nur im Log.
- **Einrichtungen:** GitHub-Umgebung `produktion`; Deploy-Skripte und Forced-Command-Schlüssel auf dem Server; `CENTRIC_VERTRAUTE_PROXYS` (Pflicht vor dem nächsten Produktiv-Deploy); WP-30 Mail und Push; alte Netlify-Site; Pflicht-2FA für Betreibercodes.

### Entschieden (2026-11-03)

- Einwilligung/Genehmigung nach MuSchG an der Person erfassbar.
- Planung darf die Einrichtung bearbeiten (Dienstarten, Zeiten, Mindestbesetzung, Vorlagen).
- Lange Dienste (> 10 h) automatisch erlaubt, nur Hinweis.
- Jugendschutz-Schalter „mehrschichtig“ auch für die Planung.
- **P0-Blocker WP-16c:** Korrekturrevisionen eines Monatsabschlusses nach bestätigtem Lohnexport (Revision 1 bleibt,
  neue Revision mit Zeitpunkt/Berechtigtem/Grund/Differenz, Korrekturexport, möglichst zweite Freigabe, keine starre Frist).
  Der Schutz in WP-16 ist nur Zwischenlösung; WP-16 ist erst mit WP-16c abnahmefähig. Externe Prüfung: E-29.
- **Mail/Push (WP-30, E-9) und Betreiber-2FA-Pflicht (WP-32d, E-10)** sind Produktionsblocker.
- **Geo** bleibt Pflichtumfang, wird aber erst nach Echtgerätetest E-4 produktiv aktiviert.
- WP-19: 50 Produktentscheidungen ([`WP19-PRODUKTENTSCHEIDUNGEN-2026-11-03.md`](WP19-PRODUKTENTSCHEIDUNGEN-2026-11-03.md)).

## WP-19 – Module

Pläne: [`WP19-MODULPLAN.md`](WP19-MODULPLAN.md) (Pakete WP-19.0…19.13) und
[`WP19-OFFENE-FACHNACHWEISE.md`](WP19-OFFENE-FACHNACHWEISE.md) (Prüfvorbehalte, Blocker → E-22). Statusstufen je Modul
stehen im erzeugten Block (Zeilen WP-19.x; „T“ = nur Server-Teilumfang). Alle zwölf Module stehen in der Registry auf
`geplant` (nicht einschaltbar) – keines gilt als geliefert.

## CENTRIC Intelligence – eigener Strang

Abgleich: [`INTELLIGENCE-ABGLEICH.md`](INTELLIGENCE-ABGLEICH.md) · Plan: [`INTELLIGENCE-ENTWICKLUNGSPLAN.md`](INTELLIGENCE-ENTWICKLUNGSPLAN.md).
Pakete WP-I1…WP-I37 stehen im Strang `intelligence` der JSON mit eigener Summe; der Plan ist ein Vorschlag zur Freigabe
(E-21i), nichts ist begonnen. Intelligence blockiert keinen ACC45-Schritt.

**Ehrliche Statuszahl, F1–F18 (Funktionskatalog Fassung 7), Abgleich gegen den Code:**

| Klasse | Funktionen |
|---|---|
| 1 vollständig implementiert | **0 von 18** |
| 2 teilweise implementiert (nur deterministischer Kern, ohne KI) | **3 von 18** (F2, F3, F7/F7A) |
| 3 nur spezifiziert | **11 von 18** (F1, F4, F5, F6, F8, F9, F10, F11, F12, F14, F15) |
| 4 noch gar nicht umgesetzt (nur Konzept) | **4 von 18** (F13, F16, F17, F18) |

Kein Gateway, kein Modell, kein Anbieter-Zugang im Code.

## Release-Risiken

- Personaldaten-Filter in Produktion erst mit dem Integrationsstand (bis dahin keine echten Beschäftigtendaten).
- WP-19-Module ohne Fachnachweise (E-22) nur im Hinweisbetrieb; Blocker in `WP19-OFFENE-FACHNACHWEISE.md`.
- Echte Geräte (E-2…E-6) und externer Pentest (E-17) sind nicht von Agenten erbringbar.
- Konfliktzone `src/App.jsx` begrenzt die Parallelität über alle Stränge (siehe `GESAMTPLAN.md`).
