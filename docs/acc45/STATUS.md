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

**Pakete gesamt:** 157 · BLOCKED 81 · READY 29 · IN_PROGRESS 4 · REVIEW 4 · INTEGRATED 36 · DONE 3

| Strang | Pakete | BLOCKED | READY | IN_PROGRESS | REVIEW | INTEGRATED | DONE | offener Aufwand PT |
|---|---|---|---|---|---|---|---|---|
| ACC45 | 60 | 13 | 7 | 2 | 2 | 34 | 2 | 70–110,5 |
| WP-19-Module | 15 | 14 | 0 | 0 | 1 | 0 | 0 | 66,8–104,2 |
| Intelligence | 37 | 32 | 3 | 0 | 1 | 1 | 0 | 280,4–491,8 |
| Folgepakete | 10 | 4 | 3 | 2 | 0 | 1 | 0 | 14–27,5 |
| Extern/Entscheidungen | 35 | 18 | 16 | 0 | 0 | 0 | 1 | 20,35–46,1 |

Offener Entwicklungsaufwand (ohne extern, ohne bedingtes WP-I35): **431,2–734 PT**. Integrierte Pakete zählen nicht mehr mit (bis 2026-11-03 zählten sie bis DONE weiter); was ihnen fehlt, steht als Statusstufe und in den externen Paketen.

**Kritische Pfade** (offener Aufwand, Mitte der Spanne maßgeblich):

- gemeinsam: WP-I10 → WP-I12 → WP-I13 → WP-I17 → WP-I19 → WP-I27 → WP-I37 = **75,4–129,8 PT**
- ohne Intelligence: WP-19.0 → WP-19.1 → WP-19.2 → WP-19.3 → WP-19.13 → WP-42a → WP-42 = **24,8–38,7 PT**
- ACC45: WP-16 → WP-48 = **16,5–27,5 PT**
- Folgepakete: WP-S1 → WP-PILOT = **3–6 PT**
- WP-19: WP-19.0 → WP-19.1 → WP-19.2 → WP-19.3 → WP-19.13 = **20,8–32,2 PT**
- Intelligence: WP-I10 → WP-I12 → WP-I13 → WP-I17 → WP-I19 → WP-I27 → WP-I37 = **75,4–129,8 PT**

### In Arbeit / Review

| Paket | Status | Branch | Notiz |
|---|---|---|---|
| WP-09 Kette B nach main | IN_PROGRESS | `integration/centric-complete` | Integrationsbranch steht (65c1188 ff.). Offen: Staging-Abnahme (E-1), Merge nach main, Produktiv-Deploy nach Freigabe. Abhängigkeiten auf WP-09 gelten als reine Livegang-Reihenfolge. |
| WP-16 Pausen und Monatsabschluss | REVIEW | `acc45/time/wp16-pausen-und-monatsabschluss` | Kopf 1e1aac1. Teilumfang: Pausen, Monatsabschluss, vorläufiger Schutz (Wiederöffnen nach bestätigtem Lohnexport abgelehnt) — nur Zwischenlösung. Abnahmefähig erst mit WP-16c (P0). Folgepaket WP-16b (ältere Spur-Zeilen nennen den Tag). |
| WP-19 Branchenpakete (12 Module) | IN_PROGRESS | `acc45/frontend/wp19-branchenpakete` | Sammelpaket: aufgeteilt in WP-19.0 … WP-19.13 (WP19-MODULPLAN.md). Server-Teilumfang von sechs Modulen integriert (#44, #49), alle Module in der Registry „geplant“ (nicht einschaltbar). |
| WP-33 Testinfrastruktur (vollständige Sammelprüfung, Playwright, axe) | REVIEW | `acc45/qa/wp33-testinfrastruktur` | Branch seit 2026-11-02 19:03 unverändert, kein Review dokumentiert, nicht integriert; muss auf den heutigen Integrationsstand (≈ 40 Merges später) nachgezogen werden. |
| WP-28b Lasttest-Befund 6: Sicherung bricht unter Last mit ENOENT ab (Wiederholung greift nicht); Auswertung des Nachlaufs S2/S5 | IN_PROGRESS | `acc45/infra/wp28b-nachlauf` | NICHT ERLEDIGT, fail-closed Teilfix (PR #100). Unter Dauerlast gelingt die Sicherung weiterhin nicht zuverlässig (ca. 17 Schreibvorgänge/s auf 3000 Dateien: 1 von 14; mit der Vorgabe-Ruhezeit von 1 s schon bei 8/s keine). Die Ruhezeit senkt das Risiko halber Mehrdatei-Transaktionen in der Sicherung, garantiert aber keine transaktionsübergreifende Konsistenz. Offen: (1) Nachlauf S2/S5 (E-20, Handstart durch den Betreiber); (2) nach Reparatur der CI-Basis (PR #102 / fix/ci-baseline) die blockierten Prüfungen nachholen: Docker-Bildbau, Betrieb-Sicherung-Ende-zu-Ende, die Fachprüfungen hinter dem Typen-Schritt; (3) Folgepaket WP-28c (koordinierter Schreib-Halt). |
| WP-19.0 WP-19 Kern-Nacharbeit (Aktivierung, Mitbestimmungsbestätigung, Regelwerte, Einhängepunkte) | REVIEW | `acc45/frontend/wp19-0-modulkern` | Basis des Kerns (Registry, Katalog, Andockpunkte) integriert in #44; offen ist die Nacharbeit aus Abschnitt 13. Kopf 59079b5, CI grün, Opus-Review läuft (Stand: implementiert/lokal getestet). |
| WP-I10 Architekturabgleich Spezifikation auf heutigen Stack | REVIEW | `intelligence/wp-i10-architekturabgleich` | SCHÄTZUNG laut Plan (nicht belegt); Plan ist Vorschlag zur Freigabe (E-21i). |
| WP-PILOT Pilotbetriebe A (Pflege) und B (Sicherheitsdienst): Erhebung, synthetische Testszenarien, Datenschutzrahmen | IN_PROGRESS | `acc45/docs/pilot-erhebung` | SCHÄTZUNG (nicht gemessen). Nur Doku und synthetische Testdaten-Definitionen; Seed-Umsetzung der Datensätze SD-P/SD-S fehlt noch (Anschluss an WP-S1). Echtdaten erst nach Erfüllung aller Voraussetzungen der Stufe 3 im Datenschutzrahmen; externe Punkte (AVV, Pilotvereinbarung, Mitbestimmung) offen. Szenarien mit Modul-Voraussetzung erst nach Einschaltbarkeit der WP-19-Module ausführbar. |

### Bereit zum Start (15)

WP-15 (acc45, 3–4,5 PT) · WP-34 (acc45, 1–1,5 PT) · WP-38 (acc45, 2–3 PT) · WP-39 (acc45, 4–5,5 PT) · WP-32d (acc45, 1–2 PT) · WP-27c (folge, 1,5–3 PT) · WP-47b (folge, 2–4 PT) · WP-S1 (folge, 1–2 PT) · WP-I2 (intelligence, 3–6 PT) · WP-I3 (intelligence, 8–14 PT) · WP-I6 (intelligence, 3–5 PT) · SI-P4 (acc45, 3–5 PT) · SI-P5 (acc45, 1–2 PT) · SI-P8 (acc45, 0,5–1 PT) · SI-P6b (acc45, 1,5–3 PT)

### Integriert in `integration/centric-complete` (36)

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
| WP-37 PWA-Feinschliff | #62 (9d4f383) | Review laut Nachweis |
| WP-41 Betriebs- und Nutzerdokumentation | #42 (d2d3f7a) | Review mit Auflagen |
| WP-43 Personaldaten-Filter vollständig (Matrix ↔ Code, tagesgenau) | #25 (eb5fc98), #26 (f5bec0d) | Agent F: Auflagen → Freigabe (N1 #26) |
| WP-45 Atomarer Mehrdatei-Schreibvorgang (Journal), Kontovereinzelung | #29 (60818c0), #33 (737c453), #36 (efdde6b), #38 (57717df) | Agent F: 45b Ablehnung → vier Nachprüfungen → Freigabe |
| WP-46 Bremse fail-closed, gleitendes Fenster, Notbremse Zugangscode | #27 (56c73d0), #28 (336788a) | Agent F: Auflagen → Freigabe |
| WP-47 Bremsen: Lastgrenzen Stempeln und Anmeldung (je Person, je Raum, je Code) | #55 (2afab0c), #61 (006b036) | Review laut Nachweis; Flake-Fix #61 |
| WP-28c Konsistente Sicherung unter Dauerlast: kurzer, befristeter, koordinierter Schreib-Halt im Server (Folge zu WP-28b/2) | #110 (42e83da) in integration/release-v4 | Opus-Review, Befunde behoben |
| WP-I11 Faktenpaket-Vertrag (Positivliste, Alias) | #86 (intelligence/wp-i11-integration) | Opus-Sicherheitsreview + Delta-Review (2 Runden) |
| SI-P1 Sicherungsschlüssel an Ersteller binden und mit Austritt/Sperre widerrufen (Befund P1, mittel) | #107 (e5ada4e) in integration/release-v4 | Zwei unabhängige Opus-Reviews (SI-P1/P2), Befunde behoben |
| SI-P2 Code-Sitzung endet, wenn die Person den Betrieb verlässt (Befund P2, mittel) | #107 (e5ada4e) in integration/release-v4 | Zwei unabhängige Opus-Reviews (SI-P1/P2) |
| SI-P3 Mailversand aus Test- und Demoräumen begrenzen (Befund P3, mittel) | #109 (e58f163) in integration/release-v4 | Opus-Review, Regression (Betreibervorlagen als selbstAngelegt) behoben |
| SI-P6 Betreiber-Leitungscodes nur mit frischer Anmeldung und frischem zweiten Faktor (Befund P6, HOCH) | #111 (e4a75e4) in integration/release-v4 | Vier unabhängige Opus-Reviews (inkl. Befund B1 hoch: Betreibercode in /einrichten, behoben) |
| SI-P7 Herkunftssperre trifft keine gültigen Codes; IPv6 nach /64 (Befund P7, mittel) | #113 (8678cf6) in integration/release-v4 | Drei unabhängige Opus-Reviews; hoher Race-Befund (parallele Anfragen), mittlere Befunde (Zählerausfall, Antwort-Orakel, Kartenüberlauf) behoben |

### Statusstufen

✓ belegt · T teilweise (z. B. nur Server-Teilumfang) · – nicht erreicht oder nicht belegt. „Staging“, „Freigabe“ und
„prod.“ stehen nur mit Beleg auf ✓. Gezeigt sind alle Pakete mit mindestens einer erreichten Stufe; alle übrigen
73 offenen Entwicklungspakete stehen auf allen Stufen auf „–“.

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
| WP-16 | REVIEW | ✓ | ✓ | T | – | – | – | – |
| WP-17 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-20 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
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
| WP-37 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-41 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-43 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-45 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-46 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-47 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-28b | IN_PROGRESS | T | T | T | T | – | – | – |
| WP-28c | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| WP-19.1 | BLOCKED | T | T | T | T | – | – | – |
| WP-19.4 | BLOCKED | T | T | T | T | – | – | – |
| WP-19.7 | BLOCKED | T | T | T | T | – | – | – |
| WP-19.10 | BLOCKED | T | T | T | T | – | – | – |
| WP-19.11 | BLOCKED | T | T | T | T | – | – | – |
| WP-19.12 | BLOCKED | T | T | T | T | – | – | – |
| WP-I10 | REVIEW | ✓ | – | – | – | – | – | – |
| WP-I11 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| SI-P1 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| SI-P2 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| SI-P3 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| SI-P6 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
| SI-P7 | INTEGRATED | ✓ | ✓ | ✓ | ✓ | – | – | – |
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
