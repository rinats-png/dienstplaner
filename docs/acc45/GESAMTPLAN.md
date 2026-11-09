# Gesamtplan – ACC45, WP-19, Intelligence, Folgepakete, externe Abnahmen

Stand der Prosa: 2026-11-03. Alle Zahlen in den Blöcken `AUTO` sind aus [`work-packages.json`](work-packages.json)
erzeugt (`node werkzeug/acc45-backlog.mjs status-schreiben`) und werden in CI gegen die Quelle geprüft
(`pruefungen/acc45-status.test.js`). Die Prosa erklärt Rechnung, Annahmen und Grenzen; sie nennt bewusst keine Zahlen,
die sich mit dem Backlog ändern.

## 1. Eine Quelle

- **Quelle:** `docs/acc45/work-packages.json`, Schema 2. Je Paket: `id`, `titel`, `strang`, `prio`, `aufwandPT {min,max}`,
  optional `restPT` (Rest bei laufenden Paketen), `wartezeitAT` (nur extern), `abhaengigkeiten`, `status`
  (BLOCKED · READY · IN_PROGRESS · REVIEW · INTEGRATED · DONE), sieben `stufen` mit `wert` (`true`/`false`/`"teilweise"`)
  und `beleg`, `branch`, `agent`, `modell`, `konfliktzonen`, `pr`, `nachweis`, `akzeptanz`, `tests`, `dateien`, `notiz`.
  Oben in der Datei: `annahmen` (Prognoseparameter und Durchsatzmessung) und erzeugte Kopfzahlen.
- **Erzeugt:** `DEPENDENCIES.md` (vollständig), AUTO-Blöcke in `STATUS.md`, in dieser Datei, in `ROADMAP.md` und in
  `../ROADMAP.md` (dort nur Zahlen und Verweise; Prosa bleibt).
- **Geprüft:** Schema, unbekannte Abhängigkeiten, Zyklen, Konfliktzonen, Ehrlichkeitsregeln (INTEGRATED nur mit Stufe
  `integriert = true` samt Beleg; `produktiv = true` nur bei DONE; jede erreichte Stufe mit Beleg; READY nur mit erfüllten
  Abhängigkeiten) und dass jede erzeugte Datei Zeichen für Zeichen zur Quelle passt.
- **Werkzeug:** `status-schreiben`, `pruefen`, `bereit [--alle]`, `brief <id>`, `fortschritt`, `kritischer-pfad [strang]`,
  `prognose`, `lokal` (siehe `AGENTS.md`). Das frühere Array `P` wird nur noch aus der JSON erzeugt (lesend, kompatibel).

## 2. Kennzahlen und kritische Pfade

<!-- AUTO:BEGIN kennzahlen -->
Erzeugt aus `docs/acc45/work-packages.json` (Schema 2) mit `node werkzeug/acc45-backlog.mjs status-schreiben` — nicht von Hand ändern.

**Pakete gesamt:** 160 · BLOCKED 79 · READY 26 · IN_PROGRESS 4 · REVIEW 10 · INTEGRATED 38 · DONE 3

| Strang | Pakete | BLOCKED | READY | IN_PROGRESS | REVIEW | INTEGRATED | DONE | offener Aufwand PT |
|---|---|---|---|---|---|---|---|---|
| ACC45 | 63 | 14 | 5 | 2 | 5 | 35 | 2 | 62,4–97,7 |
| WP-19-Module | 15 | 14 | 0 | 0 | 1 | 0 | 0 | 66,8–104,2 |
| Intelligence | 37 | 32 | 3 | 0 | 1 | 1 | 0 | 280,4–491,8 |
| Folgepakete | 10 | 1 | 2 | 2 | 3 | 2 | 0 | 8,6–17,1 |
| Extern/Entscheidungen | 35 | 18 | 16 | 0 | 0 | 0 | 1 | 20,35–46,1 |

Offener Entwicklungsaufwand (ohne extern, ohne bedingtes WP-I35): **418,2–710,8 PT**. Integrierte Pakete zählen nicht mehr mit (bis 2026-11-03 zählten sie bis DONE weiter); was ihnen fehlt, steht als Statusstufe und in den externen Paketen.

**Kritische Pfade** (offener Aufwand, Mitte der Spanne maßgeblich):

- gemeinsam: WP-I10 → WP-I12 → WP-I13 → WP-I17 → WP-I19 → WP-I27 → WP-I37 = **75,4–129,8 PT**
- ohne Intelligence: WP-19.0 → WP-19.1 → WP-19.2 → WP-19.3 → WP-19.13 → WP-42a → WP-42 = **24,8–38,7 PT**
- ACC45: WP-16 → WP-48 = **16,5–27,5 PT**
- Folgepakete: WP-47b = **2–4 PT**
- WP-19: WP-19.0 → WP-19.1 → WP-19.2 → WP-19.3 → WP-19.13 = **20,8–32,2 PT**
- Intelligence: WP-I10 → WP-I12 → WP-I13 → WP-I17 → WP-I19 → WP-I27 → WP-I37 = **75,4–129,8 PT**
<!-- AUTO:END kennzahlen -->

## 3. Abhängigkeitsgraph (Überblick)

Der vollständige Graph aller offenen Pakete steht als Mermaid in [`DEPENDENCIES.md`](DEPENDENCIES.md). Auf Strang-Ebene:

```
 ACC45 (integriert: Daten, Rechte, Zeit, Geo, Betrieb)
   │
   ├─ WP-16 (Review) ──┬─ WP-14c, WP-07b, WP-16b (Stempelpfade, nacheinander)
   │                   ├─ WP-19.7 Geteilter Dienst ─ WP-19.6 Bereitschaft ─┐
   │                   └─ WP-19.3 Objektbericht ────────────────────────────┤
   ├─ WP-19.0 Kern ─┬─ 19.1 ─ 19.2 Wachbuch ─ 19.3 ─────────────────────────┤
   │                ├─ 19.4 ─ 19.5 / 19.8 ─ 19.9                            ├─ 19.13 Abnahme ─┐
   │                └─ 19.10 ─ 19.11 · 19.12 ────────────────────────────────┘                 │
   ├─ WP-39 App.jsx modularisieren ─ WP-21 Smartphone ─ WP-35 / WP-40 ──────────────────────────┤
   ├─ WP-15, WP-33, WP-38, Folgepakete ───────────────────────────────────────────────────────────┤
   │   (WP-18 ← WP-30 ← E-9 Mail/Push: kein Release-Blocker)                                      ▼
   │                                       WP-42a Release-Kandidat ─► E-16 ─► E-1 Staging (eingefrorener Stand)
   │                                                                   ├─► E-2…E-6 Geräte, Viewports, Offline, Geo
   │                                       E-17a Pentest-Vorlauf ──────┴─► E-17 Pentest
   │  E-7 Restore, E-8 Alarm, E-11/E-12 Deploy-Gates, E-13 ─► E-14 Rücksprung, E-15 Codes,          ▼
   │  E-18 Rechtstexte (← WP-36), E-21 Entscheidungen, E-22 Fachnachweise WP-19 ───────────► WP-42 Endabnahme
   │                                                                                 ─► E-23 Deploy ─► E-24 Pilot
 E-21i Freigabe Intelligence ─► Block K (I1–I9) · Block P (I10–I17) ─► Block 2/2b/3 (I18–I36) ─► WP-I37
          E-25 Anbieter/AVV ─► I18, I27 · E-26 DSFA ─► I27 · E-27 KI-VO ─► I34 · E-28 Muster-BV ─► I37
          E-24i Intelligence-Piloten (← E-24) ─► I21
```

## 4. Ressourcen, Konfliktzonen, Parallelität

- **Laptop:** 4 logische Kerne, ≈ 6 GB frei. Höchstens 3–4 gleichzeitige Entwicklungsagenten, Tests lokal nur einzeln
  (`werkzeug/test-kurz.mjs --sperre`), Vollregression nur in CI.
- **Ein Agent je Konfliktzone** (Dateibesitz, `AGENTS.md`): `src/App.jsx`, `server/funktionen/daten.mjs`,
  `server/lib/rechte.mjs`, `server/lib/sicht.mjs`, `package.json`, `server/lib/stempelintegritaet.mjs`. Jedes Paket führt
  seine Zonen im Feld `konfliktzonen`; die Ablaufsimulation startet nie zwei Pakete mit gemeinsamer Zone.
- **`App.jsx` ist der Engpass aller Stränge.** Rund die Hälfte der offenen Intelligence-Pakete, WP-19.0/19.12 und
  WP-15/18/21/35/38/39/40 berühren sie. WP-39 (Modularisierung) früh zu ziehen ist der größte Einzelhebel; nur das
  optimistische Szenario nimmt an, dass danach Arbeiten an verschiedenen Ansichten parallel laufen können.
- **Stempelpfade** (`daten.mjs`, `stempelintegritaet.mjs`): WP-16 → WP-14c / WP-07b / WP-16b → WP-19.7 → WP-19.6
  nacheinander.
- **Agenten arbeiten nur in aktiven Sitzungen.** Ein Arbeitstag (AT) ist ein Tag mit aktiver Koordinator-Sitzung.

## 5. Wellen (Ablaufsimulation, realistisches Szenario, Umfang C)

Erzeugt aus der Simulation in Abschnitt 7: Startwoche je Paket bei 3 Agenten, einer Zone je Agent und Vorrang für die
längste Restkette. Externe Pakete belegen keinen Agenten; sie starten, sobald ihre Abhängigkeiten erfüllt sind
(Annahme: Beauftragung sofort am Tag 1). Vorrang: ACC45, Folgepakete und WP-19 vor Intelligence (Intelligence blockiert
ACC45 nie), darin die längste Restkette.

<!-- AUTO:BEGIN wellen -->
| Welle (5 AT) | ab | Entwicklung (Start, Modell, Konfliktzonen) | extern / Entscheidungen (Start) |
|---|---|---|---|
| 1 | 2026-11-04 | SI-P4 (opus; App.jsx, daten.mjs) · SI-P5 (opus) · WP-33 (sonnet; package.json) · SI-P9 (opus) · WP-18 (opus; App.jsx, rechte.mjs, daten.mjs) · WP-32d (opus) · WP-09 (opus) · WP-27c (opus) · WP-28b (sonnet) · WP-34 (sonnet) · WP-16 (opus; App.jsx, daten.mjs, stempelintegritaet.mjs, package.json) · WP-44 (opus) · WP-I10 (sonnet) · WP-16c (opus; App.jsx, daten.mjs, stempelintegritaet.mjs) · WP-I3 (sonnet) · WP-19.0 (opus; App.jsx, rechte.mjs, sicht.mjs) · WP-19.7 (opus; daten.mjs, stempelintegritaet.mjs) · WP-19.1 (sonnet + opus-review) · WP-19.4 (sonnet + opus-review) · WP-19.2 (opus; rechte.mjs) · WP-39 (sonnet; App.jsx) · WP-19.8 (sonnet) | E-15 · E-17a · E-19 · E-20 · E-21 · E-22 · E-30 · E-31 · E-32 · E-9 · E-12 · E-13 · E-25 · E-26 · E-27 · E-28 · E-7 · E-10 · E-11 · E-16 · E-14 · E-29 |
| 2 | 2026-11-11 | WP-19.6 (opus; daten.mjs) · WP-21 (sonnet; App.jsx) · WP-19.9 (opus; sicht.mjs, rechte.mjs) · WP-19.3 (opus) · WP-19.10 (sonnet) · WP-19.5 (sonnet + opus-review) · WP-19.11 (sonnet) · WP-19.12 (sonnet; App.jsx) · WP-07b (opus; daten.mjs, stempelintegritaet.mjs) · WP-40 (sonnet; App.jsx) · WP-19.13 (opus (Rechte/Daten) / sonnet) · WP-16b (opus; daten.mjs) · WP-24b (opus) · WP-30 (sonnet) · WP-15 (opus; App.jsx, daten.mjs) · WP-19.R (sonnet + opus-review) · WP-I1 (sonnet + opus-review) · WP-14c (opus; App.jsx, daten.mjs) | E-8 |
| 3 | 2026-11-18 | WP-35 (sonnet; App.jsx) · WP-47b (opus; daten.mjs) · SI-P6b (opus; daten.mjs) · WP-38 (sonnet; App.jsx) · WP-42a (opus) · WP-48 (opus; daten.mjs, rechte.mjs, App.jsx, stempelintegritaet.mjs) · WP-36 (sonnet) · WP-I12 (sonnet; App.jsx) | E-1 · E-18 · E-2 · E-3 · E-4 · E-5 · E-6 |
| 4 | 2026-11-25 | WP-I13 (sonnet + opus-review) · WP-I4 (sonnet + opus-review; App.jsx, rechte.mjs) · WP-I5 (sonnet; App.jsx) | – |
| 5 | 2026-12-02 | WP-I6 (sonnet; App.jsx) · WP-I15 (sonnet + opus-review) · WP-I31 (sonnet + opus-review) · WP-I17 (sonnet; App.jsx) · WP-I7 (sonnet) · WP-I19 (sonnet + opus-review; App.jsx) · WP-I25 (sonnet) · WP-I14 (sonnet + opus-review) | E-17 |
| 6 | 2026-12-09 | WP-I23 (haiku + sonnet) · WP-I16 (opus; App.jsx, rechte.mjs) · WP-I20 (sonnet + opus-review; App.jsx) | – |
| 7 | 2026-12-16 | WP-PILOT (sonnet) · WP-I8 (sonnet; App.jsx) · WP-42 (opus) · WP-I26 (sonnet) · WP-I28 (sonnet; App.jsx) | E-23 |
| 8 | 2026-12-23 | WP-I29 (sonnet; App.jsx) · WP-I18 (sonnet) · WP-I27 (opus) | E-24 |
| 9 | 2027-01-05 | WP-I9 (sonnet + opus-review; App.jsx) · WP-I22 (sonnet; App.jsx) · WP-I34 (sonnet + opus-review) · WP-I33 (sonnet; App.jsx) | – |
| 10 | 2027-01-12 | WP-I24 (sonnet; App.jsx) · WP-I32 (sonnet; App.jsx) · WP-I36 (sonnet; App.jsx) · WP-I30 (sonnet; App.jsx) | E-24i |
| 11 | 2027-01-19 | WP-I2 (sonnet; App.jsx) | – |
| 18 | 2027-03-09 | WP-I21 (sonnet) · WP-I37 (opus (Review) / sonnet) | – |
<!-- AUTO:END wellen -->

## 6. Modellrouting und Engpässe

**Modell je Paket** steht im Feld `modell` (Spalte „Modell“ in `DEPENDENCIES.md`), nach
[`MODELL-ROUTING.md`](MODELL-ROUTING.md): Opus für serverseitige Sicherheit, Datenintegrität, Stempel-/Offline-Pfade,
Rechte und Art. 9 sowie für unabhängige Reviews solcher Änderungen (WP-07b, 14c, 16b, 24b, 27c, 47b, WP-19.0/2/3/6/7/9,
WP-I11, I16, I27, WP-42a); Sonnet für Oberfläche, Module ohne Rechteanteil, Werkzeuge, Doku (mit Opus-Review, wo
`sonnet + opus-review` steht); Haiku nur für Recherche (WP-I23).

**Engpässe**, die keine Agentenzahl auflöst:

1. **Nutzerentscheidungen:** E-21 (warnen/sperren, Mindestbesetzung, Alarmweg, Vier-Augen, Feeds, JArbSchG/MuSchG-Auflagen;
   WP-24b braucht den Stichtag bis 2026-12-01), E-21i (Freigabe des Intelligence-Blocks; ohne sie startet kein WP-I),
   E-15 (Code-Rotation, P0), E-9 (Mail/Push fürs erste Release?).
2. **Externe Stellen:** Pentest-Anbieter (E-17a/E-17 — in der realistischen Rechnung der Treiber von C1), Kanzlei
   (E-18 Rechtstexte, E-19 Mitbestimmung, E-25…E-28 Intelligence), Fachberater/Tarif (E-22), Pilotbetrieb (E-24),
   Intelligence-Piloten (E-24i, setzen Produktion voraus), Geräte (E-3 iPhone/Tablet beschaffen).
3. **Betreiberhandlungen auf VPS/GitHub/DNS:** E-7, E-8, E-10…E-14, E-16, E-20 — kurz, aber nur mit Freigabe;
   E-13 → E-14 → E-23 in fester Reihenfolge.
4. **Konfliktzone `App.jsx`** (Abschnitt 4) und die serielle Stempelkette.
5. **Review-Schleifen:** In der Messung hatte fast jedes Paket Auflagen, rund jedes dritte eine Ablehnung
   (Abschnitt 7.1). Das Probleme-Szenario rechnet deshalb mit Aufschlag.
6. **P0-Blocker aus Betreiberentscheidungen (2026-11-03):** WP-16c (Korrekturrevisionen nach bestätigtem Lohnexport;
   WP-16 ist erst damit abnahmefähig) mit externer Prüfung E-29 (Kanzlei/Steuerberatung/Lohnbüro); WP-32d (Betreiber-2FA
   Pflicht) mit E-10; WP-30 Mail/Push mit E-9. Alle hängen über WP-42a/WP-42 vor der Produktionsfreigabe. Geo bleibt
   Pflichtumfang, wird aber erst nach E-4 (Echtgeräte) aktiviert — Blocker für die Aktivierung, nicht für den Code.
   Die Kette WP-16 → WP-16c → E-29 → WP-42 hat in der realistischen Rechnung rund eine Woche Puffer zum Pentest-Pfad; sie
   wird zum Treiber, wenn die externe Prüfung (E-29) länger als etwa 27 AT braucht oder spät angefragt wird.
7. **Produktentscheidung offen:** WP-42 hängt an WP-19. Ein ACC45-Release mit Modulen auf „geplant“ (nicht einschaltbar)
   wäre technisch möglich und würde C1 deutlich verkürzen — das ist eine Nutzerentscheidung, keine Annahme dieses Plans.

## 7. Zeitprognosen

### 7.1 Gemessener Durchsatz (Git-Historie)

Gemessen mit `git log origin/integration/centric-complete --first-parent --merges` und
`gh pr list --state merged --base integration/centric-complete`, Werte in `annahmen.messung` der Quelle:

- **Zeitraum:** 2026-11-02 16:51 (Merge #20, H8+) bis 2026-11-03 18:26 (Merge #66) = 2 Arbeitstage mit rund 22 Stunden
  Commit-Aktivität (11-02 16–24 Uhr, 11-03 05–19 Uhr; Agenten liefen auch nachts in der Sitzung).
- **Merges in die Integration:** 46 PRs (#21–#66). Davon 30 Erstlieferungen von Paketen (inkl. #48 Werkzeuge) und
  **16 reine Nacharbeiten** nach Reviews (Nachträge b/c/d, Flake-Fix) = **35 %**; drei weitere Erstlieferungen enthielten
  bereits Nachträge (#32, #42, #51).
- **Integriert:** 29 ACC45-Pakete plus der Server-Teilumfang von sechs WP-19-Modulen, zusammen **92 PT** nominal
  (alte Einzelwerte). Ohne WP-10/11, die über Wochen vorbereiteten Code aus #6/#7 portierten: **82 PT in 2 AT ≈ 41 PT je AT**.
- **Review-Schleifen:** von 28 Nachweisen nennen 19 Auflagen und 10 eine Ablehnung mit Nachbesserung.
- **Latenz** erster eigener Commit → Merge: Median 2,3 h, 75 % unter 5,1 h (ohne #20/#31). Das unterschätzt die
  Bearbeitungszeit, weil Agenten oft erst am Ende committen; ein Paket mit Review und Nachtrag brauchte typisch einen
  halben bis ganzen AT (WP-14 → 14b, WP-26, WP-16).
- **Verzerrung nach oben:** Die ersten Pakete waren klar umrissen (P0, Server, wenig `App.jsx`), teils vorbereitet; die
  Restarbeit liegt stärker in `App.jsx`, in neuen Algorithmen (WP-I7/I8/I12/I19/I20) und hängt an Entscheidungen.

### 7.2 Rechnung

Je Szenario wird der Ablauf mit den Paketen der Quelle **simuliert** (keine Schätzung nach Paketanzahl):

1. **Rest-PT je Paket** aus `aufwandPT` (optimistisch `min`, realistisch Mitte, Probleme `max` × 1,25 Nacharbeit);
   laufende Pakete mit `restPT` oder Anteil (IN_PROGRESS 0,5, REVIEW 0,2); integrierte Pakete 0. Die Spannen der
   ACC45-Altpakete sind Altwert bis +35 % (gemessene Nacharbeitsquote), WP-19 und Intelligence übernehmen die Spannen
   ihrer Pläne (dort ist ein Review-Anteil enthalten).
2. **Dauer je Entwicklungspaket** in AT = max(Mindestdauer, Rest-PT ÷ PT je Agent und AT). Die Mindestdauer bildet die
   Review-Schleife ab (ein Paket wird nicht schneller als ein Review-Durchgang integriert).
3. **Kapazität:** optimistisch 4 Agenten × 10 PT ≈ gemessene 41 PT/AT; realistisch 3 × 6 = 18 PT/AT (Abschläge für
   kürzere Sitzungstage, `App.jsx`-Serialisierung, schwierigere Pakete); Probleme 3 × 3,5 = 10,5 PT/AT.
4. **Ablauf:** Listenplanung — sobald Abhängigkeiten erfüllt sind und ein Agent frei ist, startet ein Paket, sofern
   keine seiner Konfliktzonen belegt ist; Vorrang haben ACC45, Folgepakete und WP-19 vor Intelligence, darin die
   längste Restkette. Die **Treiberkette** unter jeder Tabelle zeigt rückwärts, worauf das letzte Paket gewartet hat. WP-09 zählt nur als Livegang-Reihenfolge.
5. **Extern:** Pakete `E-*` belegen keinen Agenten und dauern ihre `wartezeitAT` (min / Mitte / max). Ihr eigener
   `aufwandPT` ist Begleitaufwand (Betreiber), nicht Entwicklungszeit, und steht nicht in der Rest-PT-Spalte.
6. **Kalender:** Tag 1 = 2026-11-04, Arbeitstage Mo–Fr ohne bundesweite Feiertage (Liste in `annahmen.feiertage`).

Zur Kontrolle steht neben der Simulation die **Untergrenze Arbeit ÷ Kapazität**; die Simulation liegt darüber, wenn
Abhängigkeiten oder Konfliktzonen die Agenten nicht auslasten.

### 7.3 Ergebnis

<!-- AUTO:BEGIN prognose -->
**A – ACC45-Backlog (WP-01…WP-47 + Folgepakete, ohne WP-19-Module, ohne Intelligence, ohne Release WP-42/42a)**

| Szenario | Rest-PT (Entwicklung) | Untergrenze Arbeit ÷ Kapazität | Simulierte Dauer | fertig am |
|---|---|---|---|---|
| optimistisch | 67 | 1,7 AT | **5 AT** | **2026-11-10** |
| realistisch | 87,6 | 4,9 AT | **12 AT** | **2026-11-19** |
| bei Problemen | 135,4 | 12,9 AT | **29 AT** | **2026-12-14** |

Treiberkette A (realistisch): WP-38 (wartet auf Zone App.jsx)

**B – Technische Vollumsetzung (ACC45 + WP-19 + Intelligence, integriert und reviewt, ohne externe Freigaben, ohne Rollout WP-42)**

| Szenario | Rest-PT (Entwicklung) | Untergrenze Arbeit ÷ Kapazität | Simulierte Dauer | fertig am |
|---|---|---|---|---|
| optimistisch | 415,2 | 10,4 AT | **13 AT** | **2026-11-20** |
| realistisch | 560,7 | 31,2 AT | **52 AT** | **2027-01-20** |
| bei Problemen | 882,9 | 84,1 AT | **138 AT** | **2027-05-26** |

Treiberkette B (realistisch): WP-I2 (wartet auf Zone App.jsx) → WP-I37

**C – Produktionsreife (B + externe Abnahmen, Freigaben und Wartezeiten, Rollout)**

| Szenario | Rest-PT (Entwicklung) | Untergrenze Arbeit ÷ Kapazität | Simulierte Dauer | fertig am |
|---|---|---|---|---|
| optimistisch | 418,2 | 10,5 AT | **53 AT** | **2027-01-21** |
| realistisch | 564,5 | 31,4 AT | **92 AT** | **2027-03-17** |
| bei Problemen | 888,5 | 84,6 AT | **143 AT** | **2027-06-02** |

| Szenario | Produktiv-Deploy (E-23) | C1: ACC45 + WP-19 produktionsreif (Pilot E-24 bestanden) | C2: Intelligence produktionsreif (WP-I37) |
|---|---|---|---|
| optimistisch | 22 AT → 2026-12-03 | 32 AT → 2026-12-17 | 53 AT → 2027-01-21 |
| realistisch | 36 AT → 2026-12-23 | 49 AT → 2027-01-15 | 92 AT → 2027-03-17 |
| bei Problemen | 60 AT → 2027-02-01 | 75 AT → 2027-02-22 | 143 AT → 2027-06-02 |

Treiberkette C1 (realistisch): E-32 → WP-36 → E-18 → WP-42 → E-23 → E-24

Treiberkette C2 (realistisch): E-32 → WP-36 → E-18 → WP-42 → E-23 → E-24 → E-24i → WP-I21 → WP-I37

| Parameter | optimistisch | realistisch | bei Problemen |
|---|---|---|---|
| gleichzeitige Entwicklungsagenten | 4 | 3 | 3 |
| PT-Äquivalent je Agent und Arbeitstag | 10 | 6 | 3,5 |
| Kapazität PT je Arbeitstag | 40 | 18 | 10,5 |
| Mindestdauer je Paket (Review-Schleife) | 0,25 AT | 0,5 AT | 1 AT |
| PT aus der Spanne | min | Mitte | max |
| Aufschlag Nacharbeit | × 1 | × 1 | × 1,25 |
| externe Wartezeit aus der Spanne | min | Mitte | max |
| App.jsx nach WP-39 frei | ja | nein | nein |

Rest-Anteil laufender Pakete ohne eigenes `restPT`: IN_PROGRESS 0,5, REVIEW 0,2. Tag 1 = 2026-11-04; Arbeitstage Mo–Fr ohne 2026-12-24, 2026-12-25, 2026-12-31, 2027-01-01, 2027-03-26, 2027-03-29, 2027-05-06, 2027-05-17, 2027-10-03, 2027-12-24.
<!-- AUTO:END prognose -->

**Lesart.** A ist reine Entwicklungszeit für den bisherigen ACC45-Backlog samt Folgepaketen; Pakete, die auf
Betreiberhandlungen warten (WP-30, WP-36, WP-44), sind darin nur mit ihrem Agentenanteil enthalten. B enthält
Intelligence-Pakete, die real ohne externe Voraussetzungen nicht fertig werden (WP-I18 ohne Anbieterzugang, WP-I21 ohne
Pilotdaten, WP-I27 ohne DSFA); B ist für diese Pakete eine Untergrenze. C trennt den **Produktiv-Deploy** (E-23), **C1** (ACC45 + WP-19
produktionsreif: Pilot E-24 zwei Wochen ohne P0/P1 bestanden) und **C2** (Intelligence produktionsreif, WP-I37). C2
wartet auf Intelligence-Piloten (E-24i), die eine laufende Produktion voraussetzen. In der realistischen Rechnung
bestimmt der **Pentest-Vorlauf** (E-17a → E-17) den Deploy-Termin, nicht die Entwicklung: den Anbieter sofort anfragen
ist der größte Hebel für C1. Zweiter Pfad: WP-16 → WP-16c → E-29 (externe Prüfung der Korrekturrevisionen) → WP-42.
Intelligence-Branches dürfen laut Plan erst nach dem ACC45-Release in den Integrationsstand; die Simulation lässt ihre
Entwicklung vorher laufen.

### 7.4 Annahmen und Unsicherheiten

- **Entwicklungszeit und Wartezeit sind getrennt:** Die Rest-PT-Spalte enthält nur Entwicklung; externe Wartezeiten
  sind Annahmen je Paket `E-*` (`wartezeitAT`) und laufen parallel zur Entwicklung, sobald beauftragt. Jede Woche
  späterer Beauftragung (Pentest, Kanzlei, Anbieter, Fachfreigaben) verschiebt C1/C2 um bis zu eine Woche.
- **Externe Pakete** folgen der Nummerierung von [`EXTERNE-ABNAHMEN-UEBERGABE.md`](EXTERNE-ABNAHMEN-UEBERGABE.md)
  (E-1…E-28); ergänzt sind E-17a (Pentest-Vorlauf als Teil von E-17), E-21i (Freigabe Intelligence) und E-24i
  (Intelligence-Piloten). Die Übergabeliste nennt Arbeitsdauern, keine Wartezeiten; die `wartezeitAT` sind Annahmen
  dieses Plans (Pentest-Vorlauf 10–30 AT, Durchführung bis Nachprüfung 5–15 AT; Kanzlei 10–60 AT; Fachnachweise
  15–45 AT; Pilot E-24 10–15 AT; Intelligence-Piloten 20–60 AT). Nicht als Release-Abhängigkeit modelliert sind die
  Einträge ohne Blocker (E-9, E-10, E-20) und die bedingte E-19 (Mitbestimmung); die bedingte E-16 steht vorsorglich vor E-1.
- **PT-Schätzungen** der Folgepakete sind eigene Schätzungen dieses Plans; WP-19 und Intelligence stammen aus ihren
  Plänen und sind dort als „nicht belegt“ markiert. Größte Einzelunsicherheiten: WP-I7/I8 (Planungsalgorithmus),
  WP-I12 (Extraktion aus `App.jsx`), WP-I19/I20 (reale Altpläne, neue Lösungswege), WP-21 (Gerätematrix).
- **Durchsatz** ist aus zwei Tagen gemessen und nach oben verzerrt (7.1); nach den ersten WP-19-/Intelligence-Paketen neu
  messen und `annahmen.szenarien` anpassen.
- **Sitzungen:** Ohne aktive Koordinator-Sitzung arbeitet kein Agent; jeder ausgefallene AT verschiebt alles um einen AT.
- **Keine Statusschönung:** WP-16 (REVIEW), WP-09 (Staging/main offen), WP-33 (veralteter Branch) und die teilweise
  integrierten WP-19-Module zählen mit ihrem Rest; „geplant“, „vorbereitet“, „spezifiziert“ zählt nie als fertig.
- **Nicht modelliert:** Ausfälle der CI, Flakes (bisher einzeln behoben, `ci-flakes-nachweis.md`), Rebase-Kosten langer
  Branches, Urlaubs- und Krankheitstage des Betreibers.
