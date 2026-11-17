# QS-ZEIT: zeitabhängige Tests (Stand 2026-11-15)

Eigenständiger QS-Befund, nicht durch PR #304 verursacht. Betreiberentscheidung 2026-11-15: Testdaten und Zeitsteuerung
deterministisch auf eine gemeinsame Zeitbasis für Browser, Server und Seeds; die Ruhezeitregel (11 h, § 5 ArbZG) wird
nicht abgeschwächt; nur nachgewiesene Ausfälle werden behoben, alles Übrige bleibt Liste.

## 1. Behobene Ausfälle (nachgewiesen)

### 1.1 `pruefungen/geo.test.js` (Priorität 1)

- **Befund:** Startet die Datei kurz vor Berliner Mitternacht (z. B. 22:59:50Z = 23:59:50 Berlin), scheitern 9 von 62
  Fällen (Zeilen 693, 702, 726, 785, 793, 812, 823, 835, 849 im Stand vor der Behebung). `beforeAll` setzte `HEUTE`
  einmal; `minutenSicher` wartete bis zu 11 s auf einen Minutenwechsel, die Anfragen liefen danach am neuen Berliner
  Tag, der Test erwartete den alten. Nachgestellt mit TZ=UTC und `vi.setSystemTime`: Start 22:59:50Z → 9 rot (auch auf
  9131960f vor #301, also nicht durch #301 verursacht); 23:30Z, 23:59:50Z, 2026-11-15T12:00Z → 62/62.
- **Kein Produktfehler:** Server und Oberfläche nutzen den Berliner Tag (`stempelZiel` in
  `server/lib/zeiterfassung.mjs`, `src/stempelvorgang.js` über `betriebstag`). Kein Sicherheits- oder Datenbefund.
- **Behebung (nur Test):** Die ganze Datei läuft unter fester Uhr (`vi.useFakeTimers({ toFake: ["Date"] })`,
  `CENTRIC_PRUEF_UHR`, Vorgabe 2026-11-14 10:00 Berlin). `minutenSicher` wartet nicht mehr, sondern prüft, dass die Uhr
  steht. Der Test mit wechselnden festen Uhren kehrt danach auf die feste Uhr zurück statt auf die echte. Keine
  Zusicherung entfernt oder gelockert.
- **Regression:** `npm run pruefung:geo-uhren` (`pruefungen/geo-uhren.mjs`) führt die Datei zusätzlich unter
  2026-11-14T22:59:50Z und 2026-11-14T23:30Z mit TZ=UTC aus (lokal je 62/62); in CI im Schritt „QS-ZEIT“.

### 1.2 Browserabnahme B8 (`e2e/abnahme-b-ablaeufe.spec.mjs`, Priorität 1)

- **Befund:** CI `browser-abnahme` auf integration/release-v4 (df534301, Lauf 43650443252, 2026-11-15):
  `PUT /api/bestand` → 403 „Einteilung am 2026-11-18 nicht möglich: Ruhezeit unter 11 Stunden“. Am 2026-11-14 grün.
- **Ursache (nachgestellt mit `fachpruefungUebermittlung` und `demobestand()` unter fester Uhr):** B8 trägt am Tag
  „heute + 3“ einen Frühdienst (06:00) für die erste aktive Beschäftigte des Demo-Betriebs Nordwacht ein. Deren
  Schichtfolge hängt am Kalender (Vorlage v5, Anker `montag(Jahr-01-01)` = 2025-12-29, 35-Tage-Zyklus, Gruppe 1):
  11-17 S, 11-18 S, 11-19 S, 11-20 frei, 11-21 N. Basis 11-14 → Tag 11-17, Vortag 11-16 frei → angenommen.
  Basis 11-15 → Tag 11-18, Vortag 11-17 Spätdienst bis 22:00 → 8 h Ruhezeit → zu Recht gesperrt. Ergebnisse je
  Basistag: 11-10 rot, 11-11 rot, 11-12/13/14 grün, 11-15/16/17 rot — kein Wochentags-, sondern ein Zykluseffekt.
- **Behebung:** gemeinsame Zeitbasis `e2e/zeitbasis.mjs` (Abnahmezeitpunkt 2026-11-14 10:00 Berlin, Betriebstag nach
  `server/lib/betriebszeit.mjs`):
  - Server: `e2e/uhr-vorlauf.mjs` per `node --import`, nur für den Testserver aus `e2e/global-setup.mjs`; versetzt `Date`
    um den Versatz (Uhr läuft ab dem Abnahmezeitpunkt weiter); bricht unter `NODE_ENV=production` ab.
  - Browser: dieselbe Funktion `uhrVersetzen` als Init-Skript (`e2e/hilfen.mjs`, zweite Seiten in B8, Einrichtung in
    `global-setup.mjs` — dort entsteht der Demo-Bestand im Browser, also auf demselben Tag).
  - Testcode: `abnahmeHeute()`/`jetzt()` statt `new Date()` (Abnahme A und B).
  - Kein `page.clock`: Dessen `install` ersetzt auch Zeitgeber und `performance.now`; der Versatz hält Zeitgeber, Netz und
    Wartezeiten echt und ist mit der Serveruhr identisch.
- **Gegenprobe (neu, nicht abgeschwächt):** „B8 Gegenprobe“ trägt Abnahmetag + 4 Spätdienst und + 5 Frühdienst ein und
  erwartet 403 mit „Einteilung am … nicht möglich: Ruhezeit unter 11 Stunden.“ und unveränderte Abweichungen.
  `pruefungen/qs-b8-zeitbasis.test.js` (`npm run pruefung:qs-zeitbasis`) hält ohne Browser fest: Ursache (Basis 11-15
  sperrt), B8 positiv auf der Zeitbasis, Gegenprobe sperrt mit der Ruhezeitmeldung, und `uhrVersetzen` versetzt nur „jetzt“.
- **Nicht lokal gelaufen:** Playwright ist auf dem Arbeitsrechner nicht installiert (Speicherengpass); die Browserjobs
  prüft die CI (`browser-abnahme`).
- **Staging-Gate (erledigt, QS-B8-2026-11-15):** Gegen einen fremden Container (`E2E_EXTERN_ADMIN`) lässt sich die Uhr nicht
  stellen; Versatz 0, echte Uhr. B8 rechnet den Krankheitstag deshalb nicht mehr (`heute + 3`), sondern SUCHT ihn
  (`e2e/dienstsuche.mjs`): Ausgang ist der Berliner Betriebstag des Zielservers (lokal die Zeitbasis, extern der Kopf `Date`
  der Serverantwort, nicht die Uhr des Testrechners); ab Betriebstag + 3 wird der Frühdienst über `PUT /api/bestand` probiert, nur die
  Ruhezeitsperre führt zum nächsten Tag (höchstens 45 Tage, mehr als der 35-Tage-Zyklus), jede andere Abweisung bricht ab. Die 11-h-Regel
  ist unberührt. Die Gegenprobe rechnet ebenfalls vom Betriebstag des Zielservers. `pruefungen/qs-b8-dienstsuche.test.js` (in
  `npm run pruefung:qs-zeitbasis`): 183 Fälle unter festen Uhren (40 Basistage × 4 Tageszeiten inkl. 22:59–23:59Z, beide
  Zeitumstellungen, Monats-/Jahres-/Schaltjahrwechsel) — immer ein Tag gefunden, angenommen, Vortag-Spätdienst bleibt gesperrt;
  `qs-b8-zeitbasis.test.js` zusätzlich: Gegenprobe an allen 40 Basistagen gesperrt, Bestand unverändert. Nur die Browserschritte
  prüft die CI (Playwright lokal nicht gelaufen).

## 2. Liste der übrigen zeitabhängigen Tests (nicht geändert)

Suche über `e2e/*.spec.mjs`, `e2e/global-setup.mjs`, `pruefungen/**` nach `new Date()`, `Date.now()`, `heute()`,
`heuteBerlin()`, `toISOString().slice(0, 10)`, `getDay()` und relativen Seeds; Dateien mit fester Uhr oder `// zeit-ok:`
ausgenommen. Geprüft wurde, ob ein Tag einmal festgehalten und später gegen die Serveruhr verglichen wird. Keiner der
folgenden Fälle ist bisher als Ausfall belegt; Priorität nach Wahrscheinlichkeit und Folge.

| Datei:Zeile | Risiko | Evidenz | Priorität | Fix-Vorschlag |
|---|---|---|---|---|
| `pruefungen/korrekturworkflow.test.js:65`, `pruefungen/korrektur-nachtrag.test.js:76`, `pruefungen/geo-einsatzorte-handler.test.js:57`, `pruefungen/geo-spezifikation-handler.test.js:56` | gleiches Muster wie geo.test.js: `HEUTE = Z.heuteBerlin()` einmal in `beforeAll`, danach Stempel-/Korrekturhandler mit echter Serveruhr | scheitert, wenn der Dateilauf 00:00 Berlin (23:00Z Winter, 22:00Z Sommer) überspannt; ohne Wartezeiten seltener als geo (Laufzeit wenige Sekunden) | 2 | `uhrFest()` wie in geo.test.js; Grenzuhrlauf über `geo-uhren.mjs`-Muster |
| `pruefungen/zeiterfassung.test.js:21`, `pruefungen/nachpruefung-wp11.test.js:38`, `pruefungen/rb2-krankmeldung.test.js:43`, `pruefungen/rb4-krankmeldung-benachrichtigung.test.js:52`, `pruefungen/imp6-mehrfachmodelle.test.js:41`, `pruefungen/stempel-fachpruefung.test.js:104`, `pruefungen/abnahme-a-b.test.js:129` | `HEUTE` beim Laden der Datei; Serverwege rechnen „heute“ selbst | wie oben (Mitternacht Berlin während des Laufs); imp6 zusätzlich Monatswechsel über `monat(n)` aus `HEUTE` (konsistent, solange `HEUTE` nicht veraltet) | 2 | feste Uhr je Datei (`vi.setSystemTime`), Tag aus derselben Uhr |
| `pruefungen/stempeln.test.js:211`, `pruefungen/korrekturworkflow.test.js:261` | Spur-Präfix aus dem UTC-Tag des Tests; Server schreibt die Spur unter `jetzt.toISOString().slice(0, 10)` (`server/lib/schutz.mjs:1184`) | Zählungen scheitern, wenn Schreiben und Lesen 00:00 UTC (01:00 Berlin) überspannen; sonst konsistent | 3 | Präfix aus derselben festen Uhr oder beide Tage lesen |
| `pruefungen/geo-einsatzorte-handler.test.js:114`, `:271` | UTC-Tag des Tests gegen Serverzeitstempel (`ortGeaendertAm`, `geoModusGeaendertAm`) | scheitert nur, wenn 00:00 UTC zwischen Sammeln (Zeile 271 im describe-Körper) und Anfrage liegt | 3 | feste Uhr |
| `pruefungen/kalender-feed-autoritaet.test.js:110` | `gestern` = jetzt − 2 Tage (UTC) gegen Berliner Austrittstag | 1 Tag Puffer; praktisch stabil | 4 | `tagePlus(heuteBerlin(), -2)` |
| `pruefungen/browser/geraete-wp21-ablaeufe.mjs:36` | `HEUTE = heute()` nach Gerätezeit (Läufer in UTC) gegen Berliner Servertag | 23:00–24:00Z (Winter) bzw. 22:00–24:00Z (Sommer) Vortag statt Berliner Tag → „kein Zugang (zu wenige Beschäftigte mit Dienst heute)“ | 3 | Berliner Tag (`betriebstag`) oder Zeitbasis wie e2e |
| `pruefungen/browser/v4-abnahme.mjs:467` | Berichtsdatum als UTC-Tag | nur Anzeige im Bericht | 5 | Berliner Tag |
| `e2e/abnahme-b-ablaeufe.spec.mjs` B7/Stempeluhr, `e2e/abnahme-a-ablauf.spec.mjs:20` | vorher echte Uhr; jetzt Zeitbasis | Mitternachtsfenster entfällt (Lauf beginnt 10:00 Berlin) | erledigt | — |
| `e2e/global-setup.mjs` / `e2e/abnahme-b-ablaeufe.spec.mjs` B8 (Staging-Gate, `E2E_EXTERN_ADMIN`) | fremder Container ohne stellbare Uhr: Versatz 0, echte Uhr | war: B8 konnte an Zyklustagen wie 2026-11-15 403 bekommen | erledigt | Tagsuche statt `heute + 3` (siehe 1.2); übrige Specs (`abnahme-a-ablauf`: `dienstSicherstellen` sucht schon; B7/B10: Berliner Tag des Laufs, kein Ruhezeitbezug) ohne nachweisbaren Ausfall, unverändert |
| `pruefungen/prozess-wachen.test.js` (`uhrBefund`) | Wächter prüft je Datei: ein einziges `useFakeTimers` befreit die ganze Datei | geo.test.js hatte eine feste Uhr nur in einem Test und fiel deshalb nicht auf | 3 | Prüfung je `describe`/je Fundstelle oder Markierung `zeit-ok:` je Zeile verlangen |

Weitere Dateien der eingefrorenen Bestandsliste (`pruefungen/prozess-wachen-bestand.json`, 92 Einträge) nutzen
`Date.now()`/`new Date()` überwiegend für Kennungen, Laufzeiten, Ablaufzeitpunkte mit großem Puffer oder relative Tage
ohne Vergleich gegen einen später berechneten Servertag; dort ist kein Ausfallmuster erkennbar.

## 3. ZEIT-P2: Restbefunde heute() / ankerMontag / Wanduhr → Zeitpunkt (Stand 2026-11-15)

- **P2 `heute()` (`server/lib/engine/zeit.mjs`)** und **P3 `ankerMontag` (`server/lib/leerbetrieb.mjs`)**: auf
  integration/release-v4 bereits umgestellt (`betriebstag`, `montagDerWoche` aus `server/lib/betriebszeit.mjs`, WP-ZEIT T1);
  Test `pruefungen/betriebstag.test.js` mit Zonenmatrix. Nachgeprüft: Mutation (UTC-Datum bzw. Ortszeit statt Betriebstag)
  lässt 22 Fälle in TZ=UTC, America/Los_Angeles und Pacific/Auckland scheitern.
- **Erledigt:** Der lokale Berlin-Hilfsbau in `server/lib/isteinfrieren.mjs` (`BERLIN_FORMAT`, `berlinVersatz`) ist entfallen;
  die Abbildung Wanduhr → Zeitpunkt steht als `zeitpunktAusWanduhr` in `betriebszeit.mjs` (gleiche Auflösung: Frühjahrslücke
  nach vorn, doppelte Herbststunde die spätere). `isteinfrieren.berlinZeitpunkt` delegiert; Verhalten unverändert
  (`pruefungen/zeit-e-zuschlaege-dst.test.js` unverändert grün).
- **Offen (nicht Teil dieses Pakets, kein Verhaltensfehler, nur Doppelimplementierung):** lokale Berlin-Tagesformeln in
  `server/lib/erstleitung.mjs:107`, `server/lib/paketstand.mjs:127`, `server/lib/planfreigabe.mjs:32/37` (`sv-SE`/`en-GB` mit
  `timeZone: "Europe/Berlin"`) sowie `server/lib/zeiterfassung.mjs` (`berlinZeitpunkt(datum, "HH:MM")`, `heuteBerlin`).
  Sie liefern dasselbe Ergebnis wie `betriebstag`; Zusammenführung bei Gelegenheit, mit Golden-Vergleich je Stelle.

## 4. ZEIT-P4: Uhrzeit-Kollision Fixture-Stempel gegen Server-Stempel „jetzt“ (Stand 2026-11-17)

**Behoben (nachgewiesen, CI):** `pruefungen/dsgvo-server.test.js`, „Art. 15: GET /api/auskunft“. Der Test stempelt über
`POST /api/stempeln` (Serverzeit) und erwartet, dass der Fixture-Stempel von b1 („07:00“) nicht in der Auskunft von a1 steht.
Läuft der Test genau in der Minute 07:00 Berlin (CI zwischen 06:00 und 06:59 UTC, im Sommer 05:00 UTC), trägt der eigene Stempel
von a1 ebenfalls „07:00“, und `a.stempel.some(start === "07:00")` ist zu Unrecht wahr. Fix: feste Uhr nur für diesen Block
(`vi.useFakeTimers({ toFake: ["Date"] })`, 2026-10-06 10:30 UTC = 12:30 Berlin, fern von „07:00“, Mitternacht und Umstellung);
`HEUTE` leitet sich aus derselben festen Uhr ab. Erwartung unverändert. `CENTRIC_TEST_UHR` (ISO-Zeit) setzt die feste Uhr für
Gegenproben; Vorgabe ist der feste Wert.

Beleg (TZ=UTC, Uhr per Setup-Datei gefälscht): ursprüngliche Datei bei 2026-11-10 06:00 UTC rot, bei 06:10 und 05:30 UTC grün;
gehärtete Datei bei 06:00, 06:10, 05:30 UTC grün. Gegenprobe der Härtung: `CENTRIC_TEST_UHR=2026-11-10T06:00:00Z` macht die
gehärtete Datei erwartungsgemäß rot (Kollisionsminute), 06:30 und 06:59 grün.

**Weitere Kandidaten (nicht geändert, kein Ausfall nachgewiesen), nach Priorität:**

1. P2 `pruefungen/stempeln.test.js`, `datenintegritaet.test.js`, `stempelpuffer.test.js`, `wp07b-stempel-500.test.js`,
   `geo-*-handler.test.js`: rufen `/api/stempeln` bzw. Handler ohne eigene Uhr auf; Fixture-Zeiten stehen auf festen Tagen
   (2026-11-xx), Vergleiche gegen Wanduhrzeit des Laufs nur, wo „heute“ (`HEUTE`) gestempelt und `start` verglichen wird.
   Prüfen: jede Stelle mit `start` gegen Literal bei Stempel „jetzt“; bei Treffer wie hier feste Uhr.
2. P3 `schichtverantwortung.test.js`, `zeiterfassung.test.js`, `wp48-rundweg.test.js`: Fixtures mit festen Zeiten, reine
   Funktionsaufrufe, keine Serverzeit-Stempel in Erwartungen gefunden; nur beobachten.
3. P3 Tests mit `new Date()`/`Date.now()` ohne fake Timer (Spitzenreiter `import-parser.test.js` 28, `sicherungsschluessel-
   ersteller.test.js` 11, `em6-rollback-codes.test.js` 11, `stempel-integritaet.test.js` 10, `koordination.test.js` 9):
   Häufigkeit ist kein Befund; je Datei prüfen, ob eine Erwartung am Wochentag, der Stunde oder der Zone hängt.
4. Allgemeine Regel: Tests, die den Server „jetzt“ stempeln lassen, frieren `Date` ein (`toFake: ["Date"]`), statt Fixtures an
   die Tageszeit anzupassen.
