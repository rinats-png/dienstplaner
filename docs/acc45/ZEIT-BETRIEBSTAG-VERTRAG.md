# WP-ZEIT — Betriebstag und Zeitzone: Analyse und Umsetzungsvertrag

**Status:** Phase 1 (Analyse + verbindlicher Umsetzungsvertrag). Nur Dokumentation, kein Produktionscode.
**Stand des Codes:** `origin/integration/release-v4` @ `c8be9e25` (Merge PR #294). Alle Fundstellen `Datei:Zeile` beziehen sich auf diesen Stand.
**Auslöser:** Betreiberentscheidung 2026-11-14 (verbindlich) und Befund P2: `src/stempelvorgang.js:120-137` wählt den Stempeltag nach dem Gerätedatum, der Server stempelt auf den Berliner Tag. E2E B7 schlug auf CI (UTC, 00:02 Berlin) fehl; PR #294 hat das nur testseitig behoben (`e2e/abnahme-b-ablaeufe.spec.mjs:118-123`, `:335-340`: `timezoneId: "Europe/Berlin"`).
**Ergänzung 2026-11-14 (Betreiber, verbindlich):** drei Zeitbegriffe streng getrennt (§ 1), Entscheidung Datensatz-Schnappschuss vs. versionierter Verlauf (§ 5), Regel gegen rückwirkende Zonenwechsel (§ 5.4), zusätzliche Regressionstests (§ 9).

Kennzeichnung: **[V]** im Code verifiziert, **[A]** Annahme / nicht im Code verifizierbar (z. B. Laufzeitumgebung), **[E]** Entscheidung des Betreibers nötig (§ 11).

---

## 0. Kurzfassung

1. **Der Server ist schon weitgehend richtig.** `/api/stempeln` bestimmt den Tag seit WP-17 aus der eigenen Uhr in Europe/Berlin, ignoriert das Gerätedatum (nur Plausibilität, Markierung `GERAETEDATUM_ABWEICHEND`), speichert eindeutige UTC-Zeitpunkte (`startAm`/`endeAm`) und prüft Offline-Ereignisse gegen den Eingang (`server/lib/zeiterfassung.mjs:220-316`, `:367-486`; `server/funktionen/daten.mjs:1796-2105`) **[V]**.
2. **Die Oberfläche ist es nicht.** Ihr „heute" ist der Rechnertag des Geräts (`server/lib/engine/zeit.mjs:17` → `src/lib/datum.js:10`), und `stempelVorgang` rechnet damit „gestern/heute" (`src/stempelvorgang.js:120-136`), mischt das aber mit Berliner Zeitpunkten (`startZuordenbar`, `nachtdienstOffen`, `mitVorlaeufigen`). Folge: Ein Gerät außerhalb von Europe/Berlin sieht um Mitternacht den falschen Vorgang („Einstempeln" statt „Ausstempeln") **[V]**. Dazu ein Dutzend weiterer Stellen, die den Gerätetag für Anzeige und Angebote nutzen (§ 3).
3. **Die Zeitzone ist nirgends Einstellung, sondern an drei Stellen fest verdrahtet** (`zeiterfassung.mjs:62-64`, `planfreigabe.mjs:31-33`, `paketstand.mjs:126-127`) plus Anzeige- und Exportstellen. Die Sommerzeitrechnung (`server/lib/regelwerk.mjs:126-190`) kennt nur die EU-Regel auf der MEZ-Wanduhrachse — eine Zeitzone außerhalb der MEZ-Gruppe wäre heute fachlich falsch gerechnet **[V]**.
4. **Was fehlt:** ein explizites Zeitmodell am Datensatz (Version, Zone, Kalendertage, Eingang auch bei Online-Stempeln), eine geräteunabhängige Oberfläche, eine nachvollziehbare Plausibilitätsregel mit Begründungscodes und gemessener Abweichung, Tests in fremden Gerätezeitzonen, und ein Vertrag, der Altdaten nie neu deutet.
5. **Nebenbefunde:** (a) Sonn-/Feiertagszuschläge ignorieren die Zeitumstellung (`server/lib/isteinfrieren.mjs:209-230`, `tagesanteile`) — in der Herbstnacht Sa→So eine Stunde Sonntagszuschlag zu wenig, im Frühjahr eine zu viel **[V]**. (b) Server-seitige Aufrufe von `heute()` ohne `mitTagesdatum` nutzen die Prozesszeitzone (Container ohne `TZ` → vermutlich UTC) **[V/A]**. (c) Protokoll-Zeitstempel werden als lokale Anzeige-Texte ohne Zone gespeichert (`toLocaleString("de-DE")` in Server- und Client-Code) **[V]**.

**Umfang:** 62 Fundstellen in 41 Dateien (Tabelle § 3). **Aufwand gesamt:** 9–15 Personentage (§ 10).

---

## 1. Begriffe — drei Zeitbegriffe, streng getrennt (verbindlich)

| Begriff | Bedeutung | Feld(er) heute | Feld(er) Zeitmodell 2 | Quelle |
|---|---|---|---|---|
| **EREIGNISZEITPUNKT** | Eindeutiger UTC-Zeitpunkt, zu dem die Person gestempelt hat. Offline: der (berichtigte) Zeitpunkt des Geräts beim Drücken, nie der Eingang. | `startAm`, `endeAm` (ISO, UTC, `daten.mjs:1983-1985`); Rohwert Gerät nur offline in `offlineStart.geraetAm` / `offlineEnde.geraetAm` (`zeiterfassung.mjs:480-484`) | `startAm`/`endeAm` (unverändert, maßgeblich) + `zeitStart`/`zeitEnde` = `{ geraetAm, gesendetAm, eingegangenAm, quelle, versatzMs, plaus }` | Online: Server-Eingang (≤ 60 s nach Drücken, `ONLINE_FENSTER_MS`, `zeiterfassung.mjs:409`); offline: `erfasstAm` des Geräts, um den gemessenen Uhrversatz berichtigt, nie in der Zukunft (`:451-486`) |
| **EINGANGSZEITPUNKT** (`eingegangenAm`) | Serveruhr beim Eintreffen der Anfrage. **Nie** gleichgesetzt mit dem Ereigniszeitpunkt; getrennt gespeichert. | Nur offline: `offlineX.eingangAm`; online nicht gespeichert (`daten.mjs:1809`, `eingang` wird verworfen) | `zeitStart.eingegangenAm` / `zeitEnde.eingegangenAm` — immer | `new Date()` beim Eintreffen, vor der Raumsperre (`daten.mjs:1809`) |
| **BETRIEBLICHER KALENDERTAG** | Kalenderdatum des Ereigniszeitpunkts in der Betriebszeitzone, **die zum Ereigniszeitpunkt galt**. | implizit: Beginn = Schlüsseltag; Ende = `endeDatum`, falls ≠ Schlüsseltag (`daten.mjs:1989`), sonst Schlüsseltag | `startKalendertag`, `endeKalendertag` (immer gesetzt, `JJJJ-MM-TT`) | `betriebstag(ereigniszeitpunkt, zone)` |
| **ZUGEORDNETER SCHICHTTAG** | Der Diensttag, zu dem der Stempel gehört. Nachtdienst 22:00 an D bis 06:00 an D+1 → Schichttag D. | Schlüsselteil `personId|JJJJ-MM-TT` in `einstempeln`, `erfassung`, `istEingefroren` | unverändert der Schlüsselteil — **kein** redundantes Feld (eine Wahrheit) | `stempelZiel` (`zeiterfassung.mjs:278-316`) |

Dazu die **Wanduhrzeit** `start`/`ende` (`HH:MM` in der Betriebszeitzone, auf die Minute abgeschnitten, `uhrzeitBerlin`, `zeiterfassung.mjs:110-112`): abgeleitete Anzeige- und Rechengröße für Konto, Pausen, Zuschläge. Sie ist in der Herbstnacht mehrdeutig; eindeutig ist nur der Ereigniszeitpunkt.

**Invarianten (verbindlich, je als Test, § 9 T-INV):**
- I1 `startKalendertag === betriebstag(startAm, zeitzone)` und `endeKalendertag === betriebstag(endeAm, zeitzone)` zum Schreibzeitpunkt.
- I2 `start === wanduhr(startAm, zeitzone)` (Minute abgeschnitten), ebenso Ende.
- I3 `startKalendertag === Schichttag` (ein Beginn gehört immer zum Tag, an dem er liegt — `stempelZiel` Zweig `art === "start"`, `zeiterfassung.mjs:290-295`).
- I4 `endeKalendertag ∈ {Schichttag, Schichttag + 1}`; sonst ist der Stempel nicht zugeordnet worden (Fall B6.3: eigenes `START_FEHLT`).
- I5 `eingegangenAm ≥ startAm` bzw. `≥ endeAm` (nie in der Zukunft; `zeiterfassung.mjs:477`).
- I6 Abgeleitete Felder (Kalendertage, Wanduhrzeiten, Schichttag) werden **beim Schreiben** festgelegt und danach **nie** aus dem Zeitpunkt neu berechnet — auch nicht nach einer tzdata-Aktualisierung oder einem Zonenwechsel.

### 1.1 Welcher Datenweg nutzt welchen Begriff (Ist und Soll)

| Datenweg | Ereigniszeitpunkt | Kalendertag | Schichttag | Fundstelle |
|---|---|---|---|---|
| Zuordnung beim Stempeln (Beginn/Ende, Nachtdienst, 20-h-Grenze) | ja (Abstand, „jetzt") | ja (heute/gestern) | Ergebnis | `zeiterfassung.mjs:278-316`, `:125-136` |
| Idempotenz Offline-Ereignis | — | ja (Suchfenster) | ja (Schlüssel) | `zeiterfassung.mjs:492-504` |
| Monatsabschluss (Monatszugehörigkeit, Sperre, Prüfsumme) | — | — | **ja** (Monat des Schichttags) | `monatsabschluss.mjs:212-229`, `:257-275`; `daten.mjs:1917` |
| Pausen (Pflicht, zu lang) | gemessene Dauer (`dauerMin`) | — | ja (Tag für `bruttoAm`) | `daten.mjs:2024-2043`; `zeitregeln.mjs:44-47` |
| Dauer / Konto / Lohn | nur Prüfung (`gemesseneDauerMin`, `ZEITUMSTELLUNG`) | — | ja + Wanduhr `HH:MM` mit `dauerAm` | `istdaten.mjs:239-262`, `:299-304`; `regelwerk.mjs:179-190` |
| Zuschläge Nacht | — | — | ja + Wanduhr, Sommerzeit über `uhrversatz` | `isteinfrieren.mjs:202-207` |
| Zuschläge Sonntag/Feiertag/Samstag | — | **ja** (Teilung an Mitternacht der Wanduhr) | ja (Monat) | `isteinfrieren.mjs:209-230` |
| Korrekturen / Anträge | Prüfung „Ende nicht in der Zukunft" | — | ja (Schlüssel) | `korrekturworkflow.mjs:69-70`; `stempelintegritaet.mjs` |
| Selbstauskunft | — | ja (heute, 14 Tage zurück) | ja | `zeiterfassung.mjs:160-201`; `selbstauskunft.mjs:60-78` |
| Exporte (Lohnausgabe/DATEV, Zuschläge-CSV) | — | — | ja (Monat, eingefroren) | `monatsabschluss.mjs:643`; `src/app/aktionen/ausgaben.js:60-67` |
| Auskunft Art. 15 | alle Felder roh | alle | alle | `auskunft.mjs:238-239` |
| Planung / Plan-Ist-Abgleich | — | — | ja (Plantag = Schichttag) | `fachpruefung.mjs` `dienstAm`; `zeiterfassung.mjs:142-145` |
| Prüffall (Stempelbefunde) | Abweichungen (Versatz, Alter) | — | ja (Monat der Liste) | `istdaten.mjs:106-150`; `daten.mjs:2053-2058` |
| Aufbewahrung / Löschlauf | — | — | ja (Schlüsseltag gegen „heute") | `datenschutzlauf.mjs:157`; `stempelintegritaet.mjs` (Löschpflicht) |

---

## 2. Ist-Zustand: Datenmodell und Schnittstelle

### 2.1 Datensätze [V]
- `m.einstempeln["personId|JJJJ-MM-TT"]` — Original, unveränderlich (`stempelintegritaet.mjs:1-47`): `start`, `startAm`, `ende`, `endeAm`, `endeDatum?`, `ereignisStart?`/`ereignisEnde?` (Client-Ereigniskennung), `offlineStart?`/`offlineEnde?` = `{ offline, geraetAm, gesendetAm, eingangAm, versatzMs, zeitAm }`, Geo-Felder, `pause?`, `markierungen?`, `konfliktGrund?`, angehängt `korrekturen[]`, `antraege[]` (`daten.mjs:1982-1994`, `:2059`).
- `m.erfassung["personId|JJJJ-MM-TT"]` — abgeleitete Ist-Zeit `{ start, ende, bestaetigt, grund, pause?, ungeplant? }` mit `HH:MM`-Wanduhr (`daten.mjs:2081-2105`).
- `m.istEingefroren` — eingefrorenes Ist abgeschlossener Monate, Schlüssel `…|JJJJ-MM[-TT]` (`isteinfrieren.mjs:1-33`).
- `m.monatsabschluss[JJJJ-MM].abgewiesen[]` — nicht gespeicherte Stempel in abgeschlossene Monate `{ personId, datum, art, zeit, zeitAm, offline, ereignis, am }` (`monatsabschluss.mjs:36-38`; `daten.mjs:1919-1920`).
- Ältere Einträge haben keine `startAm` (`zeiterfassung.mjs:81-86`), und **vor WP-17 bestimmte das Gerät den Tag** (`zeiterfassung.mjs:222-228`). Altbestand ist also nicht einheitlich: Teile tragen den Gerätetag als Schlüssel. Ein Erkennungsmerkmal der Epoche gibt es nicht zuverlässig **[A]** — darum gilt für alle Altdaten: Schlüsseltag ist maßgeblich, so wie gespeichert (§ 6).

### 2.2 Schnittstelle Client → Server [V]
`POST /api/stempeln`, Rumpf aus `src/stempelpuffer.js:257-264` (`rumpfFuer`): `art`, `datum` (Gerätevorschlag, nur Plausibilität), `clientEventId` (UUID v4), `erfasstAm` (Geräteuhr, ISO UTC), `gesendetAm` (Geräteuhr beim Senden), `offline` (`navigator.onLine === false` beim Erfassen, `src/speicher.js:320-321`, oder Netzausfall beim Senden, `stempelpuffer.js:215`), `inhaber`, `lat/lon/accuracy` oder `positionGrund`, `pause`. **Keine** Zeitzone des Geräts, **kein** monotoner Hinweis, **kein** letzter Serverkontakt. Antwort: `datum` (Schichttag vom Server), `zeit`, `eintrag`, `erfassung`, `markierungen` — die Oberfläche spiegelt unter dem Servertag (`src/App.jsx:1526`, `stempelSchluessel`, `src/stempelvorgang.js:146-147`).

---

## 3. Fundstellentabelle (a)

Spalte „Basis": **G** = Gerätezeitzone, **P** = Prozesszeitzone des Servers, **B** = Europe/Berlin fest verdrahtet, **U** = UTC, **—** = zonenfrei (reiner Tagesstring / Zeitpunkt).
Spalte „Wirkung": **P1** fachlich falsche Werte möglich, **P2** falsche Anzeige/Angebot, **P3** Anzeige/Protokoll uneinheitlich, **ok** richtig (nur zentralisieren).

### 3.1 Oberfläche (src/)

| # | Ort | Was | Basis | Wirkung | Änderung |
|---|---|---|---|---|---|
| Z01 | `src/stempelvorgang.js:120-137` | `stempelVorgang`: gestern/heute aus übergebenem `heute`; offen/veraltet/nachtEnde | G (Tag) + B (Zeitpunkte) | **P2 Auslöser**: falscher Vorgang um Mitternacht | `heute` aus `betriebstag(jetzt, zone)` innen ableiten; Parameter nur noch für Tests |
| Z02 | `server/lib/engine/zeit.mjs:17` | `heute()` = `iso(new Date())` | G (Client) / P (Server) | P2 überall in der Oberfläche | `heute()` = `betriebstag(Date.now(), zoneDesBetriebs)`; Zone beim Laden der Sitzung setzen, Rückfall Europe/Berlin |
| Z03 | `src/lib/datum.js:10`, `:14-15` | Weiterreichung `heute`; `zeitpunktText` mit B | G / B | ok/P3 | Zone aus Betrieb statt fest |
| Z04 | `src/ansichten/stempeluhr.jsx:52`, `:73` | Vorgang mit `heute()`; „Einstempeln" mit `heute()` | G | P2 | wie Z01; `datum` nur Vorschlag |
| Z05 | `src/ansichten/mobil.jsx:93`, `:97`, `:210` | dito, mobile Stempelfläche | G | P2 | wie Z01 |
| Z06 | `src/ansichten/tagesstart.jsx:18-19`; `src/ansichten/prioritaeten.jsx:31`, `:40`; `src/lib/fachlogik.js:2261`, `:2270` | Vorgang/Karten „heute" | G | P2 | wie Z01 |
| Z07 | `src/stempelvorgang.js:22-41` | `mitVorlaeufigen`: vorläufige Stempel unter `heuteBerlin(erfasstAm)` | B | ok (aber fest) | Zone aus Betrieb |
| Z08 | `src/stempelvorgang.js:146-147` | Spiegelschlüssel, Rückfall auf Gerätedatum | G (nur Rückfall) | ok | Rückfall entfällt, wenn Server immer `datum` liefert |
| Z09 | `src/stempelpuffer.js:120-136` | `erfassen`: `erfasstAm` = Geräteuhr UTC; `datum` = Gerätevorschlag | U (Zeitpunkt) / G (Tag) | ok | zusätzlich `monotonMs`, `letzterKontaktAm` erfassen (§ 7) |
| Z10 | `src/stempelpuffer.js:257-264` | `rumpfFuer` — API-Vertrag | U | ok | Felder ergänzen (§ 4.3); `datum` bleibt optional |
| Z11 | `src/speicher.js:313-323` | `stempelErfassen`, Offline-Erkennung | — | ok | Serverkontakt (Date-Kopf letzter 2xx) merken |
| Z12 | `src/App.jsx:1526` | Spiegeln unter Servertag | — | ok | — |
| Z13 | `src/ansichten/stempelpuffer.jsx:27` | Anzeige `erfasstAm` ohne `timeZone` | G | P3 (andere Uhrzeit als Server) | Betriebszone |
| Z14 | `src/ansichten/monatsabschluss.jsx:32` | „laufender Monat" = `heute()` | G | P2 (Knopf an/aus; Server prüft B, `monatsabschluss.mjs:395`) | Betriebstag |
| Z15 | `src/ansichten/meineschichten.jsx:36-38`, `:176-178` | Tage, offene Erfassung gestern | G | P2 (Selbstauskunft angeboten, Server `heuteBerlin` lehnt ab) | Betriebstag |
| Z16 | `src/ansichten/korrekturen.jsx:68`, `:202` | `d0`; Anzeige `wann` ohne Zone | G | P2/P3 | Betriebstag/-zone |
| Z17 | `src/App.jsx:1444-1448`; `src/app/aktionen/plan.js:58`, `:146-148`, `:163`, `:428`, `:439`; `assistenz.js:29-182`; `begleitung.js:43-80`; `stammdaten.js:119-143`; `branchen.js:146`; `ausschreibung.js:84`; `src/lib/zustellung.js:107` | gespeicherte Protokoll-/Freigabe-Zeit als `toLocaleString("de-DE")` | G | P3, **persistiert ohne Zone** | ab ZEIT-E zusätzlich ISO-`am`; Alttexte nie umdeuten |
| Z18 | `src/module/kern.jsx:47` | `heuteTag` = `toISOString().slice(0,10)` | U | P2 (Modulansicht 00–01/02 Uhr Vortag) | Betriebstag |
| Z19 | `src/pruefung.jsx:50-59` | eigene Kopie `heute()` | G | [A] Nutzung prüfen | Betriebstag oder entfernen |
| Z20 | `src/lib/verlustweg.js:192-196`; `src/sicherungen-ui.js:41` | Anzeige B | B | ok (Betreiberanzeige) | bleibt Betreiberzone |

### 3.2 Server (server/)

| # | Ort | Was | Basis | Wirkung | Änderung |
|---|---|---|---|---|---|
| Z21 | `server/lib/zeiterfassung.mjs:62-64` | `heuteBerlin` (57 Aufrufe in 14 Dateien) | B | ok (fest) | `betriebstag(jetzt, zone)`; `heuteBerlin` bleibt als Alias mit Zone B |
| Z22 | `zeiterfassung.mjs:89-107` | `berlinVersatz`, `berlinZeitpunkt` (Wanduhr → Zeitpunkt; doppelte Herbststunde → spätere, Kommentar `:83-86`) | B | ok; Frühjahrslücke [A] nicht getestet | `zeitpunktAusWanduhr(tag, uhr, zone, {mehrdeutig})` |
| Z23 | `zeiterfassung.mjs:110-112` | `uhrzeitBerlin` | B | ok | Zone-Parameter |
| Z24 | `zeiterfassung.mjs:125-136` | `offenSeitMinuten`/`startZuordenbar` (Zeitpunkt, Rückfall Tag+Uhr) | — / B | ok | Rückfall mit Zone des Datensatzes |
| Z25 | `zeiterfassung.mjs:278-316` | `stempelZiel`: Schichttag, Gerätedatum ±2 min | B | ok | Zone des Betriebs zum Ereigniszeitpunkt |
| Z26 | `zeiterfassung.mjs:324-332` | `nachtdienstOffen` | B | ok | Zone |
| Z27 | `zeiterfassung.mjs:408-486` | `stempelEreignis`: Online-Fenster 60 s, Toleranz 5 min, max. 48 h, nie Zukunft | U | ok | um Plausibilitätsgründe/Hinweise erweitern (§ 7) |
| Z28 | `zeiterfassung.mjs:426-435` | `offlineVerspaetet` 15 min, Schalter `offlineStempelVertrauen` | U | ok | — |
| Z29 | `zeiterfassung.mjs:492-504` | Idempotenz-Suchfenster 14 Tage | — | ok | — |
| Z30 | `zeiterfassung.mjs:160-201` | `selbstauskunftPruefen` (heute B, 14 Tage) | B | ok | Zone |
| Z31 | `server/funktionen/daten.mjs:1809` | `eingang = new Date()` | U | **Lücke**: online nicht gespeichert | `zeitX.eingegangenAm` immer |
| Z32 | `daten.mjs:1865`, `:1881-1888` | Idempotenz-Tage; Klemmen Offline-Ende auf Beginn (≤ 5 min) | B | ok | Zone |
| Z33 | `daten.mjs:1889-1905` | `heute`, `zeit`, `stempelZiel` | B | ok | Zone + Version (§ 5) |
| Z34 | `daten.mjs:1917-1934` | Abschlusssperre nach Monat des Schichttags; `abgewiesen` | — | ok | `abgewiesen` um `zeitzonenVersion` ergänzen |
| Z35 | `daten.mjs:1982-1994` | Datensatzfelder | B/U | ok | Zeitmodell-2-Felder (§ 4) |
| Z36 | `daten.mjs:1999-2016` | `dauerMin`, `LANGER_DIENST`, `DAUER_NULL`, `ZEITUMSTELLUNG` | U/B | ok | `uhrDauerAbweichend` mit Zone |
| Z37 | `daten.mjs:2024-2043` | Pause, `PAUSE_ZU_LANG`, `regelHinweise` | B (über `bruttoAm`) | ok | — |
| Z38 | `daten.mjs:2053-2058`, `:2081-2105` | Prüffall-Ableitung, `erfassung` | — | ok | neue Plausibilitätscodes einhängen (§ 7.4) |
| Z39 | `daten.mjs:1277`, `:1440`, `:2228`, `:2401-2404` | `heuteBerlin()` für Auswertung, Löschlauf, Abschluss | B | ok | Zone |
| Z40 | `server/lib/regelwerk.mjs:132-190` | `letzterSonntag`/`uhrsprung`/`uhrversatz`/`dauerAm`/`bruttoAm`: **EU-Regel, MEZ-Wanduhr fest** | B (implizit) | ok für MEZ-Zonen; **falsch für alle anderen** | Bindung an Zonengruppe (E1); allgemeine tz-Rechnung nur mit E1-Option c |
| Z41 | `regelwerk.mjs:233-241` | `ruhezeitStunden` | B implizit | ok | — |
| Z42 | `server/lib/zeitregeln.mjs:44-62`, `:86-139` | `pauseZuLang`, `uhrDauerAbweichend`, `regelHinweise` (Nachbartage = Schichttage) | B implizit | ok | — |
| Z43 | `server/lib/istdaten.mjs:239-262`, `:269-278` | `istZeitFuer`/`pruefZeitFuer` (Schichttag, Wanduhr) | — | ok | Zeitmodell lesen (§ 6.2) |
| Z44 | `istdaten.mjs:299-304` | `gemesseneDauerMin` (Zeitpunkte) | U | ok | — |
| Z45 | `istdaten.mjs:145-150` | Prüffälle je Monat des Schichttags | — | ok | — |
| Z46 | `server/lib/isteinfrieren.mjs:202-207` | `nachtAnteilAm` mit Sommerzeit | B implizit | ok | — |
| Z47 | `isteinfrieren.mjs:209-230` | `tagesanteile`/`zuschlagTagAddieren`: Teilung an Wanduhr-Mitternacht **ohne Zeitumstellung** | B implizit | **P1 Nebenbefund**: So-/Feiertagsstunden ±1 h in den Umstellungsnächten | Minuten je Kalendertag mit `uhrversatz`; `RECHEN_STAND` 2 → 3 (`lohnrechnung.mjs:32`); nur offene Monate |
| Z48 | `isteinfrieren.mjs:186-188`; `server/lib/feiertage.mjs:9-41` | Feiertage je Bundesland (Tagesstring) | — | ok (deutsch) | bei E1-Option c: Land/Kalender |
| Z49 | `server/lib/monatsabschluss.mjs:212-229`, `:288-293`, `:368-370`, `:392-395` | Monat des Schichttags; `istAbdruck` über **alle** Felder; Monatsletzter offen; Abschluss erst nach Monatsende (B) | — / B | ok | Abdruck-Regel § 6.3 beachten |
| Z50 | `server/lib/korrekturworkflow.mjs:69-70` | Antrag: Ende nicht in der Zukunft (`berlinZeitpunkt`) | B | ok | Zone des Datensatzes |
| Z51 | `server/lib/selbstauskunft.mjs:60`, `:74`, `:115` | `berlinTag`, `endeDatum`-Abgleich | B | ok | Zone; v2: `endeKalendertag` |
| Z52 | `server/lib/stempelintegritaet.mjs:13-16`, `:175-195` | Original unveränderlich, generischer Feldvergleich | — | ok | neue Felder nur bei Anlage schreibbar (§ 6.3) |
| Z53 | `server/lib/planfreigabe.mjs:31-40` | `laufenderTag`, `sekundenBisTageswechsel` (Kopie) | B | ok (fest) | zentrales Modul |
| Z54 | `server/lib/paketstand.mjs:110-127` | `paketTag` (Abrechnungstag, Kopie) | B | ok | **bleibt Betreiberzone** (Abrechnung, G9) — nicht Betriebszone |
| Z55 | `server/funktionen/kalender.mjs:292-315` | ICS `TZID=Europe/Berlin`, `VTIMEZONE` fest | B | ok für B | Zone des Betriebs (nur MEZ-Gruppe, E1) |
| Z56 | `server/lib/engine/zeit.mjs:17` serverseitig ohne `mitTagesdatum`: `engine/plan.mjs:255`, `:258`; `engine/einsatz.mjs:120`; `server/lib/provisionierung.mjs:203` | Qualifikationsgültigkeit, Befunde, Eintritt der Leitungsperson | **P** (Container ohne `TZ`, `Dockerfile:60-64`, `deploy/compose.yml` ohne `TZ` → vermutlich UTC [A]) | P2: zwischen 00:00 und 01:00/02:00 Berlin Vortag | Betriebstag übergeben |
| Z57 | `server/lib/rechte.mjs:1899`; `bestaetigungen.mjs:149`, `:186`, `:206`, `:244`; `mitteilungen.mjs:148`; `sicherungen.mjs:212` | gespeicherte `zeit` als `toLocaleString("de-DE")` | **P** | P3 (persistiert, Zone unklar) | `timeZone` angeben; ISO daneben vorhanden (`erstellt`) |
| Z58 | `rechte.mjs:2222` | Dienstbuch-Uhrzeit B | B | ok | Zone |
| Z59 | `server/lib/auskunft.mjs:238-239` | Art.-15-Auskunft: Stempel und Ist roh | — | ok | neue Felder erscheinen (eigene Daten; Texte § 7.6) |
| Z60 | `server/lib/arbeitssitzung.mjs:422`, `:455`, `:600`, `:702`; `einladungen.mjs:320`, `:560`; `schutzdurchsetzung.mjs:254`, `:279`; `rechte.mjs:678`, `:1201`, `:1533`; `datenschutzlauf.mjs:157`; `server/funktionen/import.mjs:131`; `kalender.mjs:122`, `:378` | Berliner Tag für Eintritt/Austritt, Schichtkontext, Fachprüfung, Löschfrist, Import, Feed | B | ok | Zone |
| Z61 | `server/lib/modul-geteilterdienst.mjs:15-20` | Stempelmodell: **ein** Paar je Schichttag; zwei Abschnitte nicht angebunden | — | Grenze (Doppeldienst) | § 8.2 |
| Z62 | `server/lib/modul-bereichsplan.mjs:33` u. a. Module | `imFenster` mit `Date.now()` ± 2 Jahre | U | ok (grob) | — |

### 3.3 Tests, die die heutige Regel festschreiben [V]

| Test | Was | Bewertung / Änderung |
|---|---|---|
| `e2e/abnahme-b-ablaeufe.spec.mjs:118-123`, `:335-340` | `timezoneId: "Europe/Berlin"` — Umgehung des Befunds | Bleibt als ein Projekt; **zusätzlich** dieselben Abläufe in `UTC`, `America/New_York`, `Asia/Tokyo` (§ 9). Kein Abschwächen: die Pins werden erst entfernt bzw. vervielfacht, wenn ZEIT-C grün ist |
| `pruefungen/geo.test.js:178-333` | `stempelVorgang(m, p, heute, jetzt)` mit explizitem `heute` | bleibt gültig (Tag wird übergeben); neu: Fälle ohne `heute` mit fremder Prozesszone (§ 9 T-CL) |
| `pruefungen/stempel-oberflaeche.test.js:25-56` | W2/W3: Servertag-Schlüssel, nachtEnde | bleibt |
| `pruefungen/nachtdienst-ohne-einstempeln.test.js`, `stempelpuffer.test.js` | Vorgang, vorläufige Stempel | bleibt; plus Gerätezone-Varianten |
| `pruefungen/zeiterfassung.test.js:300-323`, `pruefungen/serverdatum.test.js` | Servertag, `GERAETEDATUM_ABWEICHEND`, DST-Nächte | bleibt unverändert (Regressionsanker mit Zone B) |

Es gibt **keinen** Test, der die Gerätedatum-Regel als *gewollt* festschreibt; die Regel ist ein Restzustand aus WP-I12 (`engine/zeit.mjs:1-10`: „Im Client ist das der Rechnertag, genau wie vorher").

---

## 4. Zielmodell — Datenmodell (verbindlich)

### 4.1 Betriebseinstellung und Zeitzonenverlauf
- `m.zeitzonenVerlauf`: **anhängende** Liste, mindestens ein Eintrag, nie geändert oder gelöscht:
  `{ version: 1, zone: "Europe/Berlin", gueltigAb: "<ISO UTC>", eingetragenAm: "<ISO UTC>", durchRolle: "leitung"|"kunde"|"system", protokollRef: "<Kennung des Protokolleintrags>", art: "anlage"|"wechsel"|"storno", stornoVon?: <version> }`.
  Keine Person, kein Name: Wer es war, steht im bestehenden Protokoll (sichtbar mit `audit.view`), verknüpft über `protokollRef`.
- Fehlt der Verlauf (Altbestand), gilt implizit `{ version: 1, zone: "Europe/Berlin", gueltigAb: -∞, art: "anlage", durchRolle: "system" }`. Er wird beim ersten Schreiben eines Zeitmodell-2-Stempels **einmalig** als Anlage-Eintrag geschrieben (kein Umschreiben anderer Daten).
- `zoneZum(m, zeitpunkt)` = letzter nicht stornierter Eintrag mit `gueltigAb ≤ zeitpunkt`.
- Validierung: IANA-Name, ≤ 64 Zeichen, `^[A-Za-z_]+(/[A-Za-z0-9_+\-]+){1,2}$`, muss von `Intl.DateTimeFormat` angenommen werden **und** in der Positivliste stehen (E1; Vorschlag Phase 1: nur `Europe/Berlin`). Verlauf ≤ 50 Einträge.
- Rechte: **keine neuen**. Ändern nur mit `org.edit` (Leitung, Kundenrolle — `rechte.mjs:58-66`, gleiches Muster wie `offlineStempelVertrauen`, `rechte.mjs:925-946`), über einen eigenen Serverweg (`/api/betrieb-zeitzone`), nie über das allgemeine Speichern: PUT behält den gespeicherten Verlauf (wie `OFFLINE_SCHALTER`). Betriebsrat, Beschäftigte, Schichtverantwortung, Planung: lesen nur die aktuelle Zone (für die Anzeige), nicht den Verlauf mit Protokollbezug.

### 4.2 Stempel-Datensatz Zeitmodell 2 (Obermenge von Zeitmodell 1)
Zusätzlich zu allen heutigen Feldern, **mit unveränderter Bedeutung** der heutigen Felder (`start`, `startAm`, `ende`, `endeAm`, `endeDatum` nur wenn ≠ Schichttag, `offlineStart/Ende` wie bisher):

```
zeitmodell: 2,
zeitzone: "Europe/Berlin",          // Schnappschuss, maßgeblich für diesen Datensatz
zeitzonenVersion: 1,                // Querverweis in m.zeitzonenVerlauf
startKalendertag: "JJJJ-MM-TT",     // beim Beginn gesetzt
endeKalendertag:  "JJJJ-MM-TT",     // beim Ende gesetzt, immer (auch wenn = Schichttag)
zeitStart: { quelle, geraetAm, gesendetAm, eingegangenAm, versatzMs, monotonAbweichungMs?, plaus },
zeitEnde:  { … wie zeitStart … }
```
- `quelle`: `"eingang"` (online, Serveruhr), `"geraet"` (offline, Geräteuhr innerhalb Toleranz), `"geraet_berichtigt"` (um Versatz berichtigt), `"eingang_ersatz"` (Gerätezeit unlesbar).
- `plaus`: `{ stufe: "unauffaellig"|"pruefen", gruende: ["ZUKUNFT", …], deltaMs: <Zahl|null> }` (§ 7).
- Das **Ende eines Vorgangs nutzt die Zone des Datensatzes** (`zeitzone` vom Beginn), nicht die beim Ende geltende — ein Datensatz hat genau eine Zone. Ein Ende ohne Beginn (`START_FEHLT`) bekommt die Zone zum Ereigniszeitpunkt des Endes.
- `m.erfassung[k]` bekommt **keine** neuen Felder (Rechenweg unverändert; die Zone liest der Rechner über den Stempel oder den Verlauf).
- `monatsabschluss[..].abgewiesen[]` bekommt `zeitzonenVersion`.

### 4.3 Schnittstelle (Erweiterung, abwärtskompatibel)
Rumpf zusätzlich, alle optional: `monotonMs` (ms seit letztem Serverkontakt nach `performance.now()`, nur innerhalb derselben Seitensitzung), `letzterKontaktAm` (ISO; die vom Server im letzten erfolgreichen Antwortkopf `Date` gemeldete Zeit — vom Server stammend, nicht von der Geräteuhr). **Nicht** gesendet wird die Gerätezeitzone (Datensparsamkeit; eine abweichende Gerätezone ist nicht auffällig, Regel 6). Der Server nimmt fehlende Felder hin (alte Bundles), wertet dann nur die bisherigen Prüfungen.
Antwort zusätzlich: `betriebstag` (heute in Betriebszone), `zeitzone` — damit die Oberfläche ohne Rechnerzone auskommt.

---

## 5. Zeitzonenversion — Entscheidung und Regeln (verbindlich)

### 5.1 Vergleich
| Kriterium | (A) Schnappschuss am Datensatz | (B) nur versionierter Verlauf | (C) Hybrid: Schnappschuss + Versionsnummer + Verlauf |
|---|---|---|---|
| Speicher | +~45 Byte je Stempel | +~200 Byte je Betrieb | +~60 Byte je Stempel + Verlauf |
| Manipulationsschutz | Teil des unveränderlichen Originals (`stempelintegritaet.mjs`), in `istAbdruck` | Verlauf zentral; ein PUT-Fehler oder eine Wiederherstellung verändert die Deutung **aller** Stempel | beides; Abweichung Schnappschuss ↔ Verlauf ist erkennbar (Integritätsbefund) |
| Altdaten | keine Felder → implizit Zeitmodell 1 / Berlin | implizite Version 1 | wie A |
| Reproduzierbarkeit Export | aus dem Datensatz allein | nur mit vollständigem Verlauf | aus dem Datensatz allein |
| Rückwirkungsrisiko | keines (Datensatz trägt seine Zone) | hoch: ein falscher `gueltigAb` deutet Stempel um | keines |
| Rücksprung auf `274bfa0` | altes Bild ignoriert unbekannte Felder; Vergleich generisch → verlustfrei bei Zone B | altes Bild kennt Verlauf nicht → harmlos bei Zone B | wie A |
| Datenschutz | keine Personendaten | keine, wenn ohne Person | keine (Person nur im Protokoll) |
| Nachvollziehbarkeit von Wechseln | nicht ersichtlich, wann/warum | ja | ja |

### 5.2 Entscheidung (bindend): **Hybrid (C)**
Jeder Zeitmodell-2-Stempel trägt `zeitzone` (maßgeblich) und `zeitzonenVersion`; der Betrieb führt `zeitzonenVerlauf` nur anhängend. Für das Lesen eines Datensatzes gilt ausschließlich sein Schnappschuss; der Verlauf bestimmt nur die Zone **neuer** Stempel und dient Prüfung und Nachweis. Weichen Schnappschuss und Verlauf (Version → Zone) voneinander ab, ist das ein Integritätsbefund für die Leitung — nie eine stille Umdeutung.

### 5.3 Unveränderlichkeit des Verlaufs
- Nur der Serverweg schreibt; PUT übernimmt den gespeicherten Verlauf (Muster `offlineSchalterZusammen`). Ein mitgeschickter abweichender Verlauf → 403 mit Protokolleintrag „abgewiesen".
- Anhängen nur am Ende, `version` streng +1, `eingetragenAm` vom Server; Storno ist ein neuer Eintrag (`art: "storno"`), nie ein Entfernen.
- Der Verlauf gehört zu den Ist-relevanten Feldern der Wiederherstellung: Beim Wiederherstellen bleibt der heutige Verlauf, wenn der wiederhergestellte kürzer ist (analog `monatsabschluss.mjs:21-22`).

### 5.4 Regel gegen rückwirkende Wechsel (bindend)
1. Ein Wechsel wirkt **nur vorwärts**: `gueltigAb > eingetragenAm`. Bestehende Datensätze behalten ihre Zone (Schnappschuss) — für immer.
2. **Abgeschlossene und revisionierte Monate**: gespeicherte Schichttage, Kalendertage, Wanduhrzeiten, eingefrorenes Ist und Exportzeilen sind maßgeblich und unveränderlich (bestehende Sperren `monatsabschluss.mjs:7-22`, Freeze `isteinfrieren.mjs`). Ein Zonenwechsel ändert dort nichts, auch keinen Abdruck.
3. **Offener Zeitraum**: bereits gespeicherte Stempel behalten ihre Zone; eine Neuberechnung geschieht nur über den bestehenden Korrekturweg (Ereignis am Stempel mit vorher/nachher, Wer, Wann, Grund — WP-06) bzw. die Korrekturrevision (WP-16c).
4. Zeitpunkt des Inkrafttretens — Optionen:
   - (a) sofort: einfachster Weg, aber ein Monat mit zwei Zonen; Nachtdienste in der Wechselnacht.
   - (b) **nur zum nächsten Monatsersten 00:00 (alte Zone)**, Eintrag mindestens 24 h vorher; offene Vorgänge über die Grenze behalten ihre Zone (Datensatzregel 4.2). → **Empfehlung.**
   - (c) nur, wenn kein offener Monat und kein offener Stempel existiert: praktisch nie erfüllbar im Schichtbetrieb.
5. Ein geplanter Wechsel lässt sich bis `gueltigAb` stornieren (Storno-Eintrag).
6. Protokoll: jeder Wechsel, jedes Storno, jede Abweisung ins Betriebsprotokoll (`protokoll("schreiben", …)`), Spur ohne Personenbezug.
7. Keine neuen Rechte (§ 4.1).

---

## 6. Rückwärtsverträglichkeit und Migration (verbindlich)

### 6.1 Keine Migration gespeicherter Stempel
Es wird **nichts** umgerechnet, nachgetragen oder überschrieben. Gründe: Regel 7 der Betreiberentscheidung; `stempelintegritaet.mjs` verbietet neue Originalfelder an bestehenden Stempeln; jedes neue Feld änderte `istAbdruck` (`monatsabschluss.mjs:279-293`) abgeschlossener Monate.

### 6.2 Leser
- `zeitmodellVon(e) = e && e.zeitmodell === 2 ? 2 : 1`.
- Zeitmodell 1: Schichttag = Schlüssel, Wanduhr `start`/`ende` in Europe/Berlin, `startAm`/`endeAm` optional, Ende-Kalendertag = `endeDatum ?? Schlüsseltag`. **Auch wenn der Schlüsseltag aus der Zeit vor WP-17 vom Gerät stammt**, gilt er wie gespeichert. Leser leiten für Zeitmodell 1 **nie** einen Kalendertag aus `startAm` neu ab und schreiben nie zurück.
- Zeitmodell 2: Felder wie gespeichert; Zone = `e.zeitzone`.
- Unbekanntes Zeitmodell (> 2): fail-closed — Anzeige „nicht lesbar", kein Rechnen, Befund für die Leitung.

### 6.3 Schreiber
- Neue Felder nur bei **Anlage** des Beginns bzw. beim Ende im selben Schreibvorgang (wie heute `ereignisEnde`/`offlineEnde`, `daten.mjs:1990-1994`).
- Gemischte Datensätze sind verboten: Ein Ende an einen Zeitmodell-1-Beginn wird wie heute geschrieben, ohne `zeitmodell`, `zeitEnde` oder `endeKalendertag`; der Datensatz bleibt vollständig Zeitmodell 1 (verbindlich, Test T-LEG-3).
- Zeitmodell 2 schreibt alle heutigen Felder weiter mit identischer Bedeutung → altes Bild und alte Leser rechnen identisch.

### 6.4 Rücksprung auf `274bfa0` (aktives Produktionsbild laut `deploy/FREIGEGEBENE-IMAGES.md:37`)
- Verlustfrei, **solange jede Zone Europe/Berlin ist**: Das alte Bild liest `start/ende/startAm/endeAm/endeDatum` wie bisher, ignoriert Zusatzfelder; der Integritätsvergleich ist generisch und akzeptiert Kopien mit den gespeicherten Werten (`stempelintegritaet.mjs:183-185`); `istAbdruck` bleibt gleich, weil sich keine Werte ändern.
- Stempel, die das alte Bild nach dem Rücksprung schreibt, sind Zeitmodell 1 — korrekt.
- **Sperre:** `deploy/ruecksprung.sh` (bzw. die Abgleichprüfung) muss den Rücksprung verweigern, wenn ein Betrieb eine Zone ≠ Europe/Berlin hat oder hatte (Verlauf). Mit Positivliste „nur Europe/Berlin" (E1 a) tritt das nie ein.
- [A] Ob das alte Bundle beim PUT Felder unbekannter Herkunft unverändert mitsendet, ist durch die generische Kopie wahrscheinlich, aber vor Freigabe in T-RB-1 zu belegen.

### 6.5 Schalter
Server-Umgebungsschalter `CENTRIC_ZEITMODELL` (`1` = heutiges Schreiben, `2` = Zeitmodell 2), Vorgabe in Produktion `1` bis zur Abnahme; Leser verstehen immer beide. Die Oberflächen-Korrektur (ZEIT-C) braucht keinen Schalter (keine Datenwirkung).

---

## 7. Plausibilität der Gerätezeit (c)

### 7.1 Grundsätze
- Technische Plausibilität, keine Verhaltens- oder Leistungsbewertung. Nie Ablehnung eines gültigen Offline-Stempels wegen der Zeit (Datenverlust ist schlimmer als ein Prüffall — wie `zeiterfassung.mjs:400-402`).
- Eine abweichende **Gerätezeitzone** ist nie auffällig (sie wird nicht einmal übertragen).
- Bestehende Prüfungen bleiben und werden nur um Begründungscodes und Messwerte ergänzt.

### 7.2 Regeln (Messgröße → Code → Stufe)
| Code | Bedingung | Schwelle (Vorgabe; Grenzen) | Stufe | heute schon? |
|---|---|---|---|---|
| `VERSATZ` | \|Eingang − gesendetAm\| | > 5 min (`UHR_TOLERANZ_MS`; 1–15 min) | pruefen (berichtigt) | ja (`GERAETEZEIT_ABWEICHEND`) |
| `ZUKUNFT` | berichtigte Ereigniszeit > Eingang | > 5 min (1–15) | pruefen, Zeit = Eingang | ja (in `GERAETEZEIT_ABWEICHEND` aufgegangen) |
| `SEHR_ALT` | Eingang − Ereigniszeit | > 48 h (`OFFLINE_MAX_ALTER_MS`; 24–168 h) | pruefen | ja (`OFFLINE_ALT`) |
| `SPAET` | Eingang − Ereigniszeit, offline | ≥ 15 min (`OFFLINE_SOFORT_MS`), außer Schalter | pruefen | ja (A1) |
| `VOR_KONTAKT` | Ereigniszeit < `letzterKontaktAm` − Toleranz | 2 min (1–10) | pruefen | **neu** — fängt „Uhr zurückgestellt, dann wieder richtig" (Auflage A1) |
| `UHRSPRUNG` | \|(Ereigniszeit − letzterKontaktAm) − monotonMs\| | > 2 min (1–10); nur wenn beide Hinweise da | pruefen | **neu** |
| `REIHENFOLGE` | Ereigniszeit < Zeitpunkt des vorherigen Stempels derselben Person − Toleranz | 1 min (0–5); Klemmen ≤ 5 min bleibt (`daten.mjs:1876-1888`) | pruefen | teilweise (`START_VERALTET`/`DAUER_NULL`) |
| `UNLESBAR` | `erfasstAm` kein Zeitpunkt | — | pruefen, Zeit = Eingang | ja |
| `ZEITUMSTELLUNG` | Uhrzeit-Dauer ≠ gemessene Dauer > 30 min | `UHR_ABWEICHUNG_MINUTEN` | pruefen (nur Korrektur) | ja |
| — | Gerätezone ≠ Betriebszone | — | **nie** | — |

`deltaMs` = die für den ersten Grund gemessene Abweichung (gerundet auf Sekunden). Keine Koordinaten, keine Geräte-ID, kein Freitext.

### 7.3 Speicherort
`zeitStart.plaus` / `zeitEnde.plaus` im Stempel (Teil des unveränderlichen Originals). Für den Prüffall-Weg zusätzlich die vorhandenen `markierungen` (`GERAETEZEIT_ABWEICHEND`, `OFFLINE_ALT`) bzw. **ein** neues Kennzeichen `GERAETEZEIT_PRUEFEN` für die neuen Gründe; `OFFLINE_PRUEF_MARKIERUNGEN` (`zeiterfassung.mjs:414`) wird darum erweitert.

### 7.4 Prüffall-Weg
Wie heute: Eine Ist-Zeit mit Prüfkennzeichen wird `bestaetigt: false`, `grund: "OFFLINE_PRUEFEN: …"` (`daten.mjs:2101-2103`); `zurPruefung` (`istdaten.mjs:106-109`) erkennt sie; bis zur Bestätigung zählt die Planzeit vorläufig mit Hinweis (Regel M-14c-1 / W1, `istdaten.mjs:244-247`); Bestätigen nur mit `staff.edit`, nie die eigene Zeit (`pruefungen/stempel-oberflaeche.test.js:124`); Korrektur als Ereignis. Keine neuen Wege.

### 7.5 Sichtbarkeit (H8+, nicht erweitern)
`plaus` liegt im Stempel → dieselben Regeln wie `einstempeln`: Beschäftigte, Schichtverantwortung und Betriebsrat nur eigene (`server/lib/sicht.mjs:658`, `:1013`); Leitung/Planung alle. Kein neues Sammelfeld, keine Auswertung „Anzahl Auffälligkeiten je Person", keine Spur mit Messwerten (nur Anzahl, wie `spurHinweise`, `zeitregeln.mjs:73-76`).

### 7.6 Was die Person sieht (neutral)
- Stempeluhr nach Quittung: „Gespeichert. Die Leitung bestätigt diese Zeit noch, weil sie ohne Netz erfasst wurde."
- Bei `VOR_KONTAKT`/`UHRSPRUNG`/`ZUKUNFT`/`VERSATZ`: „Gespeichert. Die Uhr dieses Geräts ließ sich nicht sicher zuordnen — die Leitung bestätigt die Zeit."
- Nie „Manipulation", „Verdacht", „Verstoß". Die Leitung sieht Code und Messwert, mit dem Hinweis „technische Plausibilität, kein Vorwurf".

### 7.7 Einstellbarkeit, Mitbestimmung
Vorgaben im Code, Grenzen wie oben; Einstellbarkeit je Betrieb nur nach E4. § 87 Abs. 1 Nr. 6 BetrVG: Die Prüfung ist eine technische Einrichtung, die zur Überwachung geeignet ist — Einsatz im Betrieb mitbestimmungspflichtig; daher E5.

---

## 8. Auswirkungen (d)

### 8.1 Zuordnungsregeln und Randfälle (bindend; Zone Z = Zone des Datensatzes)
| Fall | Ereigniszeitpunkt | Kalendertag | Schichttag | Regel / Fundstelle |
|---|---|---|---|---|
| Beginn 23:59:59 an D | t | D | D | Beginn = Kalendertag (I3) |
| Beginn 00:00:01 an D+1 (Dienst D 22–06 geplant) | t | D+1 | D+1, Kennzeichen `UNGEPLANTER_DIENST` falls dort nichts geplant; Leitung korrigiert Zuordnung (B7) | `zeiterfassung.mjs:233-236` |
| Ende nach Mitternacht, offener Beginn D ≤ 20 h | t | D+1 (`endeKalendertag`) | D | `:296-299`, `daten.mjs:1989` |
| Ende, Beginn D > 20 h alt | t | D+1 | D+1 (`START_FEHLT`), D bekommt `KONFLIKT` | `:300-302`, `daten.mjs:2068-2077` |
| Ende ohne Beginn, Nachtdienst D geplant, ≤ Ende + 4 h | t | D+1 | D (`START_FEHLT`) | `:303-304`, `:324-332` |
| Ende außerhalb jedes Plans | t | heute | heute (`START_FEHLT`) | `:305-306` |
| Frühjahrslücke (2026-03-29 02:00–03:00 gibt es nicht) | eindeutig | eindeutig | wie oben | Wanduhr springt 01:59 → 03:00; Dauer aus Zeitpunkten |
| Herbstüberlappung (2026-10-25 02:00–02:59 zweimal) | eindeutig | eindeutig | wie oben | Wanduhr mehrdeutig → `ZEITUMSTELLUNG`-Prüffall (`daten.mjs:2012-2016`); Leser von Zeitmodell 1 ohne `startAm` nehmen die spätere Stunde (`zeiterfassung.mjs:83-86`) |
| Nachtdienst über die Umstellung | — | D, D+1 | D | Dauer 7 h / 9 h (`regelwerk.mjs:179-190`) |
| Nachtdienst über Monatsgrenze | — | 31., 1. | 31. → Monat des 31. (Konto, Zuschläge, Abschluss) | `monatsabschluss.mjs:212-229`; Abschluss blockiert, solange offen (`:368-370`, `:418`) |
| Nachtdienst über einen Zonenwechsel | — | in Zone des Beginns | D | Datensatzregel § 4.2 |
| Doppeldienst / zweiter Dienst am selben Schichttag | — | — | ein Paar je Schichttag: zweiter Beginn 409 `STEMPEL_SCHON_EINGESTEMPELT`/`AUSGESTEMPELT` | `daten.mjs:1951-1957`; geteilter Dienst nicht angebunden (`modul-geteilterdienst.mjs:15-20`) — **außerhalb WP-ZEIT**, Modell darf es nicht verbauen (Schlüssel bleibt, Abschnitte später) |

### 8.2 Bereiche
- **Monatsabschluss:** Monatszugehörigkeit bleibt Monat des Schichttags. Zeitmodell 2 ändert keine geschlossenen Monate (§ 5.4, § 6.1). `abgewiesen[]` bekommt `zeitzonenVersion`. Abschluss „erst nach Monatsende" mit Betriebstag statt `heuteBerlin` — bei Zone B identisch.
- **Pausen:** unverändert auf Wanduhr + `bruttoAm` des Schichttags; gemessene Dauer aus Zeitpunkten für `PAUSE_UNGUELTIG`.
- **Zuschläge:** Nacht korrekt mit Sommerzeit; Sonntag/Feiertag/Samstag **Befund Z47** (Umstellungsnächte ±1 h). Korrektur nur für offene Monate, `RECHEN_STAND` → 3; abgeschlossene Monate rechnen aus dem Freeze und bleiben byte-gleich. Feiertage bleiben deutsch je Bundesland.
- **Korrekturen:** Korrekturereignis trägt Wanduhrzeiten des Schichttags; neu `zeitzone` des Datensatzes im Ereignis (nur bei Zeitmodell 2). `korrekturworkflow.mjs:69-70` rechnet „Ende nicht in der Zukunft" mit der Zone des Datensatzes.
- **Exporte:** Lohnausgabe/DATEV aus dem Freeze (unverändert); Zuschläge-CSV wie Z47; ICS-Feed mit Betriebszone (`kalender.mjs:292-315`); Art.-15-Auskunft enthält die neuen Felder (eigene Daten) — Feldbeschreibung in die Auskunftserläuterung.
- **Plan-Ist-Abgleich:** Plantag = Schichttag (unverändert); `dienstAm` zonenfrei.
- **Schichtverantwortung:** Sichtregeln unverändert (H8+ Hotfix `f9ab17c6` auf `hotfix/stempel-datenschutz-sv` beachten: SV sieht nur eigene Stempel) — `plaus` erbt das.
- **Geo-Stempel:** Geo-Urteil hängt am Schichttag (`daten.mjs:1940`, `geo.mjs:203`, `:273`) — unverändert; Geodaten nie in `plaus`.

---

## 9. Testmatrix (e)

Art: **V** = vitest gegen echte Handler (`daten()` wie `pruefungen/serverdatum.test.js`) mit `vi.setSystemTime` (nur `Date`); **VC** = vitest Client-Logik mit `process.env.TZ` je Fall (eigener Vitest-Lauf je Zone, da `TZ` beim Start gelesen wird); **PW** = Playwright mit `timezoneId` + `page.clock`; **SV** = Serverlauf mit verschobener Serveruhr (Preload `--import werkzeug/uhr-vorlauf.mjs`, nur `NODE_ENV=test`, analog `werkzeug/betreiber-faktor-vorlauf.mjs`; ein `server/lib/uhr.mjs` gibt es noch nicht, vgl. `zeiterfassung.mjs:28-34`).

### 9.1 Kern
| Kennung | Fall | Art |
|---|---|---|
| T-DST-F1 | 2026-03-29: Beginn 01:50, Ende 03:10 → 20 min gemessen, Wanduhr 01:50/03:10, kein `ZEITUMSTELLUNG` | V |
| T-DST-F2 | 2026-03-28 22:00 → 03-29 06:00 Nachtdienst: 7 h, Nachtzuschlag 7 h, Schichttag 28. | V |
| T-DST-F3 | Wanduhr-Lücke: Korrektur „02:30" am 2026-03-29 → definierte Auflösung (Ablehnung oder 03:30 — im Test festschreiben, Z22 [A]) | V |
| T-DST-H1 | 2026-10-24 22:00 → 10-25 06:00: 9 h; Sonntagsanteil **7 h** (nach Z47-Korrektur; heute 6 h) | V |
| T-DST-H2 | Beginn erste 02:30 (00:30Z), Ende zweite 02:40 (01:40Z): 70 min, `ZEITUMSTELLUNG`-Prüffall | V |
| T-MN-1 | Beginn 23:59:59 Berlin → Schichttag D; 00:00:01 → D+1 | V |
| T-MN-2 | Ende 00:00:01 bei offenem Beginn 22:00 D → Schichttag D, `endeKalendertag` D+1 | V |
| T-GZ-UTC / -NY / -TYO / -KIR | Gerät in `UTC`, `America/New_York`, `Asia/Tokyo`, `Pacific/Kiritimati` (UTC+14): eingestempelt 23:30 Berlin, um 00:02 Berlin zeigt die Stempeluhr „Ausstempeln" (Befund P2); Kiritimati am Folgetag-Gerätedatum, New York am Vortag | VC + PW |
| T-UHR-P1 / -M1 / -T1 | Geräteuhr +1 h, −1 h, +1 Tag, online: Serverzeit maßgeblich, `GERAETEDATUM_ABWEICHEND` nur bei Tag ≠ | V |
| T-UHR-O1 | dasselbe offline: berichtigt (`quelle: geraet_berichtigt`), `VERSATZ`/`ZUKUNFT`, Prüffall | V |
| T-OFF-3T | 3 Tage offline (Beginn, Ende, Beginn, Ende), dann Sync: Ereigniszeiten erhalten, `eingegangenAm` getrennt, `SEHR_ALT`, je Tag richtiger Schichttag, Reihenfolge eingehalten | V + PW (`context.setOffline`, `page.clock`) |
| T-OFF-KONTAKT | Uhr zurückgestellt vor dem Offline-Stempel, vor dem Senden richtig: `VOR_KONTAKT` | V |
| T-OFF-SPRUNG | monotone Zeit passt nicht: `UHRSPRUNG`; ohne Hinweise (neu geladen): kein Kennzeichen | V |
| T-IDEM-1 | dieselbe `clientEventId` zweimal (Antwort verloren), zwei Reiter gleichzeitig: genau ein Stempel, zweite Antwort `wiederholt` | V (vorhanden erweitern) |
| T-IDEM-2 | Wiederholung nach Zonenwechsel: Antwort des ersten, Zone unverändert | V |
| T-ABS-1 | geschlossener Monat: Offline-Stempel hinein → 409, `abgewiesen` mit `zeitzonenVersion`; `istAbdruck` unverändert | V |
| T-ZS-1 | Zuschläge Sa 21:30 → So 07:15, Feiertag 24.→25.12., Monatsgrenze 31.10.→1.11. | V |
| T-EXP-1 | Lohnausgabe/DATEV und Zuschläge-CSV: Inhalt identisch für Zeitmodell-1-Daten vor/nach ZEIT-B | V |
| T-PAUSE-1 | Pause über Mitternacht und in beiden Umstellungsnächten | V |

### 9.2 Zusätzliche Regressionen (Betreiberergänzung)
| Kennung | Fall | Art |
|---|---|---|
| T-INV-1..6 | Invarianten I1–I6 (§ 1) über generierte Stempel (Zufall mit festem Startwert, inkl. DST-Nächte) | V |
| T-INV-7 | Zeitmodell 2 schreibt `start/ende/startAm/endeAm/endeDatum` bitgleich wie Zeitmodell 1 (Parallelrechnung) | V |
| T-ZW-1 | Zonenwechsel Monatsmitte (Option b: zum Monatsersten): geschlossene Monate byte-gleich (Abdruck, Freeze, Exportzeilen), offene Stempel behalten `zeitzonenVersion`, neue Stempel ab `gueltigAb` neue Version | V |
| T-ZW-2 | Wechsel mit `gueltigAb` in der Vergangenheit → abgewiesen; Wechsel ohne `org.edit` (Planung, BR, MA, SV) → 403; PUT mit verändertem Verlauf → 403 + Protokoll | V |
| T-ZW-3 | Zonenwechsel über eine DST-Nacht (Inkrafttreten 2026-11-01 und Gegenprobe 2027-03-28) | V |
| T-ZW-4 | Nachtdienst über das Inkrafttreten: Ende nutzt Zone des Beginns | V |
| T-ZW-5 | Storno vor `gueltigAb`: neuer Eintrag, alter bleibt sichtbar; nach `gueltigAb` kein Storno | V |
| T-HIST-1 | Verlauf nur anhängend: Ändern/Löschen/Umsortieren/Versionslücke über PUT, Wiederherstellen mit kürzerem Verlauf → abgewiesen bzw. heutiger Verlauf bleibt | V |
| T-HIST-2 | Schnappschuss ≠ Verlauf (manipulierte Ablage) → Integritätsbefund, keine Umdeutung | V |
| T-LEG-1 | Zeitmodell-1-Stempel (ohne `startAm`, mit/ohne `endeDatum`) werden nach dem Wechsel exakt wie vorher gelesen; kein Feld hinzugefügt | V |
| T-LEG-2 | Altstempel mit „Gerätetag" vor WP-17 (Schlüssel ≠ Berliner Tag von `startAm`): bleibt beim Schlüsseltag | V |
| T-LEG-3 | Ende an Zeitmodell-1-Beginn: Datensatz bleibt Zeitmodell 1 | V |
| T-EXP-2 | Export-Reproduzierbarkeit: Lohnausgabe, Zuschläge-CSV, Auskunft eines geschlossenen Monats vor und nach Zonenwechsel **bytegleich** (SHA-256) | V |
| T-RB-1 | Rücksprung: Bestand mit Zeitmodell-2-Stempeln (Zone B) mit dem Stand `274bfa0` lesen, stempeln, speichern (Serverlauf mit altem Code aus `git worktree`): kein 403, gleiche Konten, gleicher Abdruck | SV |
| T-RB-2 | Rücksprungsperre greift bei Zone ≠ B im Verlauf | V (Skript) |
| T-PRIV-1 | `plaus`/`zeitX` für BR, SV, MA nur eigene; Spur ohne Messwerte | V (vorhandene Sichttests erweitern) |
| T-CL-1 | Oberfläche ohne `heute`-Parameter: `stempelVorgang` in vier Prozesszonen gleich | VC |
| T-E2E-TZ | Projekte `tz-utc`, `tz-newyork`, `tz-tokyo` für B7 und Stempeluhr, `page.clock` auf 23:58 → 00:02 Berlin | PW |
| T-SRV-TZ | Serverlauf mit `TZ=Pacific/Kiritimati` und `TZ=UTC`: Tage, Abschluss, Qualifikationsgültigkeit (Z56) wie mit `TZ=Europe/Berlin` | SV |

### 9.3 Bestehende Tests, die sich ändern (nie abschwächen)
- `e2e/abnahme-b-ablaeufe.spec.mjs:118-123`, `:335-340`: Der Pin bleibt im Projekt „Berlin"; dieselben Tests laufen **zusätzlich** in fremden Zonen. Begründung: Der Pin hat einen Produktfehler verdeckt; er wird zum Gegenbeweis erweitert, nicht entfernt.
- `pruefungen/zeiterfassung.test.js` / `serverdatum.test.js`: Erwartungen bleiben; neue Felder werden zusätzlich geprüft (`toMatchObject` statt `toEqual` nur dort, wo ein Zeitmodell-2-Datensatz verglichen wird — mit eigener vollständiger Feldprüfung daneben).
- Zuschlagstests für Umstellungsnächte: Erwartung ändert sich mit Z47 (fachlich begründet: wirkliche Stunden); `RECHEN_STAND`-Test 2 → 3.

---

## 10. Umsetzungsplan (f)

| WP | Inhalt | Abhängig | Aufwand | Parallel |
|---|---|---|---|---|
| **ZEIT-A** Zeitbasis | `server/lib/betriebszeit.mjs`: `betriebstag`, `wanduhr`, `zeitpunktAusWanduhr`, `zoneZum`; `heuteBerlin`, `uhrzeitBerlin`, `berlinZeitpunkt`, `laufenderTag` als Aliase; Positivliste. Kein Verhaltenswechsel. | — | 0,5–1 PT | — |
| **ZEIT-C** Oberfläche (Schnellweg, behebt P2) | `heute()` aus Betriebszone; `stempelVorgang` ohne Gerätetag; Anzeigen Z13–Z18; Hinweise `monotonMs`/`letzterKontaktAm` erfassen | A | 1–2 PT | mit B |
| **ZEIT-B** Datenmodell | Zeitmodell 2, `zeitX.eingegangenAm`, Kalendertage, Zonen-Schnappschuss, `zeitzonenVerlauf`, Serverweg Zonenwechsel (hinter E1), Leser beider Modelle, Schalter `CENTRIC_ZEITMODELL`, Rücksprungsperre | A | 2–3 PT | mit C |
| **ZEIT-D** Plausibilität | Gründe/Messwerte, `GERAETEZEIT_PRUEFEN`, Prüffall-Anbindung, neutrale Texte, Leitungsanzeige | B | 1,5–2,5 PT | mit E |
| **ZEIT-E** Auswertungen/Exporte | Z47 Zuschläge DST + `RECHEN_STAND` 3; ICS-Zone; Z56 Server-`heute`; Z57 Protokollzeiten mit Zone; Auskunftserläuterung | A | 1–2 PT | mit D |
| **ZEIT-F** Tests | Matrix § 9, Playwright-Zonenprojekte, Uhr-Vorlauf für Serverläufe, T-RB-1 | B–E | 2–3 PT | teilweise vorziehen |
| **ZEIT-G** Reviews | Opus-Sicherheits-/Datenschutzreview (Ist-Zeiten-Sicht H8+, `plaus`, Verlauf-Unveränderlichkeit, Altdaten); unabhängiger Delta-Review je WP | je WP | 1 PT | — |

**Summe 9–15 PT.** Reihenfolge: A → (B ∥ C) → (D ∥ E) → F-Abschluss → G. C kann nach A allein ausgeliefert werden (keine Datenwirkung) und schließt den Befund P2.

**Review-Punkte:** nach A (keine Verhaltensänderung, Golden-Vergleich), nach B (Datenmodell, Rücksprung, Integrität — Opus), nach D (Datenschutz/Mitbestimmung — Opus), vor Freigabe (Gesamt).

**Risiken:**
1. **Altdaten-Umdeutung** — ein Leser rechnet Kalendertage aus `startAm` neu und verschiebt Altstempel (bes. Gerätetag-Epoche vor WP-17). Gegenmittel: I6, § 6.2, T-LEG-1/2, Golden-Vergleich über einen anonymisierten Bestand.
2. **Abdruck/Abschluss-Brüche** — neue Felder an bestehenden Datensätzen oder eine Rechenänderung (Z47) ändern Prüfsummen bzw. Exporte geschlossener Monate. Gegenmittel: Schreiben nur bei Anlage, Freeze-Pfad unberührt, T-ABS-1, T-EXP-2.
3. **Rücksprung/gemischter Betrieb** — eine Zone ≠ Berlin, dann Rücksprung auf `274bfa0`, rechnet neue Stempel falsch; ebenso eine Zone außerhalb der MEZ-Gruppe mit der fest verdrahteten EU-Sommerzeit (`regelwerk.mjs:126-190`). Gegenmittel: Positivliste nur Europe/Berlin (E1 a), Rücksprungsperre, T-RB-1/2.
Weitere: Fehlalarme der neuen Plausibilitätsregeln (Pilot mit Zählung, Schwellen konservativ); Mitbestimmung (E5); Testlaufzeit durch Zonenprojekte.

**Rollout / Rollback:** Staging mit `CENTRIC_ZEITMODELL=2`; Produktion zuerst ZEIT-A + ZEIT-C (risikoarm), dann B/D mit Schalter 1 → 2 nach Abnahme. Rückweg: Schalter auf 1 (Leser bleiben zweisprachig); Bildrücksprung auf `274bfa0` nur mit grüner Sperre (§ 6.4).

---

## 11. Entscheidungspunkte für den Betreiber

| # | Frage | Optionen | Empfehlung |
|---|---|---|---|
| **E1** | Welche Zeitzonen sind erlaubt? (Wirkung auf historische Daten, Rechnung, Rücksprung) | (a) nur Europe/Berlin — Einstellung sichtbar, fest; (b) MEZ-Gruppe mit EU-Regel (Wien, Zürich, …): rechnerisch identisch, Feiertage weiter deutsch; (c) beliebige IANA-Zone: allgemeine Sommerzeitrechnung, Feiertage je Land — eigenes Paket, +5–8 PT | **(a)** bis Weihnachten/Pilot; (c) nur auf Kundenbedarf |
| **E2** | Wann wird ein Zonenwechsel wirksam? | sofort / nächster Monatserster / nur ohne offene Monate (§ 5.4) | **nächster Monatserster**, ≥ 24 h Vorlauf, stornierbar |
| **E3** | Ereigniszeitpunkt online: Server- oder Geräteuhr? | Serveruhr (heute) / Geräteuhr | **Serveruhr** (≤ 60 s, manipulationsfest); Geräteuhr wird als `geraetAm` mitgespeichert |
| **E4** | Schwellen je Betrieb einstellbar? | nein / ja mit Grenzen (`org.edit`) | **nein** in Phase 1 (nur bestehender Schalter `offlineStempelVertrauen`) |
| **E5** | Mitbestimmung § 87 Abs. 1 Nr. 6 BetrVG für die Plausibilitätsprüfung | Hinweis in Pilotunterlagen / Muster-Betriebsvereinbarungsbaustein / keine Maßnahme | **Baustein + Hinweis**; Festlegung: nur technische Plausibilität, keine personenbezogene Häufigkeitsauswertung, gleiche Aufbewahrung wie Stempel |
| **E6** | Zuschlagskorrektur Umstellungsnächte (Z47) | jetzt mit `RECHEN_STAND` 3 für offene Monate / unverändert lassen | **jetzt**, nur offene Monate; geschlossene Monate bleiben (Freeze) |
| **E7** | Abrechnungstag (`paketTag`) | bleibt Betreiberzone Europe/Berlin / folgt Betriebszone | **bleibt Betreiberzone** (G9, Abrechnung unveränderlich) |
| **E8** | Gerätezeitzone übertragen/speichern? | nein / ja | **nein** (Datensparsamkeit, Regel 6) |

---

## 12. Quellen im Repository
Betreiberentscheidungen: dieser Auftrag (2026-11-14); `docs/acc45/NACHHOLREVIEW-STEMPELKETTE-2026-11-13.md`; Geo-Spezifikation B4–B7 (zitiert in `zeiterfassung.mjs`); WP-06/07/14/16/16c/17/43 (zitiert in den genannten Modulen); `deploy/FREIGEGEBENE-IMAGES.md:37`.
