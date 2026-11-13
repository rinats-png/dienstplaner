# WP-48-GB: Öffnen des Plans schreibt nicht

Stand: 2026-11-13. Grundlage: integration/release-v4 (2f55d243). Befund aus WP-33 (`docs/acc45/WP-33-PLAYWRIGHT-AXE.md`,
Nebenbefund): Mehrere Sitzungen verschiedener Rollen öffnen denselben Betrieb, niemand gibt etwas ein, und eine sieht den
Dialog „Gleichzeitig bearbeitet“ (`src/ansichten/speicherlage.jsx`). Der Dialog erscheint nur nach einer 409-Antwort auf
`PUT /api/bestand` (`src/speicher.js`, `onKonflikt`). Das bloße Öffnen hat also geschrieben.

## 1. Alle Wege, die nach dem Laden ohne Eingabe schreiben

Geprüft wurden alle Effekte in `src/` (`useEffect` mit `setDb`, `akt.*`, `SP.schreib`) und alle Schreibwege in `src/speicher.js`.

| Weg | Wo | Schreibt beim Öffnen? | Bewertung |
| --- | --- | --- | --- |
| Speicher-Effekt (verzögert, 1,2 s) | `App.jsx`, `useEffect([db])` | nur wenn sich das Abbild (ohne `stand`, `session`, Schlüssel sortiert) vom zuletzt geschriebenen/geladenen unterscheidet; nie für den Betriebsrat | korrekt; der erste Bestand ist das Ausgangsabbild |
| **Tour-Selbststart** | `App.jsx`, Effekt an `sitz` | **ja**, beim ersten Öffnen jeder Person ohne Tourzustand: `tour: { offen: true, schritt: 0 }` an der eigenen Person | **Ursache 1** — überflüssig, die Darstellung entscheidet ohnehin über `tourStartet()`; Schritt ist ohne Angabe 0 |
| **Urlaubshinweis** | `App.jsx`, Effekt an `db`, `sitz` | **ja**, ab Oktober für jede Person mit Resturlaub und ohne Hinweis im Jahr; läuft in **jeder** Sitzung mit vollem Schreibumfang (Leitung **und** Planung) | **Ursache 2** — echte Änderung (Pflicht des Arbeitgebers), aber zwei Sitzungen erzeugen sie gleichzeitig |
| Migration | `App.jsx`, Laden | nur wenn `migriere()` Schritte hatte (ältere Fassung); sofort, ohne `onKonflikt` | einmalig je Fassung, deterministisch; keine Dialoggefahr |
| Erste Person im leeren Betrieb | `App.jsx`, Laden | nein (wird Teil des ersten Bestands, geschrieben mit der nächsten Änderung) | unverändert |
| Stempel (Senden, Puffer) | `speicher.js` `stempelSenden` | eigener Endpunkt `POST /api/stempeln`; danach wird der Serverstand samt ETag nachgeladen (`stempelUebernehmen`) | kein PUT, kein Konflikt |
| Monatsabschluss/Serverwege | `serverstandNachladen` | lädt nach, schreibt nicht | unverändert |
| Vertragsstand (Betreiber) | `onServerstand` | nur nach einem eigenen PUT | unverändert |
| Zustellung | `zustellungAnstossen` | nur nach einem gelungenen PUT, eigener Endpunkt | unverändert |
| Heartbeat/Lebendigkeit | Server | kein Schreiben des Bestands | — |

Der Server gleicht im Drei-Wege-Abgleich je Segment ab (`server/lib/bestand.mjs`, `bestandSchreibenGesperrt`): Monate
getrennt, der **Kern** (Personen, Mitteilungen, Einstellungen …) als ein Stück. Zwei Sitzungen, die vom selben Stand aus
beide den Kern ändern, ergeben für die zweite einen 409 — auch wenn die eine nur ihre Tour und die andere nur Hinweise
geschrieben hat.

## 2. Reproduktion (echter Handler)

`pruefungen/wp48-gb-oeffnen.test.js` führt zwei Sitzungen (Planung, Leitung) gegen `server/funktionen/daten.mjs` so, wie
`App.jsx` sie führt (laden, Abbild merken, automatische Läufe, Speicher-Effekt, Konfliktbehandlung):

- **A** alter Ablauf (Tour-Selbststart + Urlaubshinweis, Konflikt immer Dialog): zwei PUT ohne Eingabe, die Leitung
  bekommt 409 „Gleichzeitig bearbeitet“.
- **A2** alter Ablauf, nichts fällig (Juni): schon der Tour-Selbststart allein erzeugt zwei PUT und den 409.

## 3. Behebung

1. **Tour-Selbststart schreibt nicht mehr.** Der Effekt ist entfallen. Die Tour startet wie bisher über die Darstellung
   (`tourStartet()` in `App.jsx` bei `TourLeiste`); geschrieben wird der Tourzustand erst durch eine Handlung der Person
   (`tourSchritt`, `tourSchliessen`, `tourEinklappen`, `tourBeenden`, `tourStarten`).
2. **Urlaubshinweis bleibt, Konflikt nur des automatischen Laufs wird still aufgelöst.** Die Rechnung steht in
   `src/app/oeffnen.js` (`urlaubshinweiseAnwenden`, Text unverändert). Der erzeugte Stand wird als „automatisch“
   vermerkt. Scheitert genau dieser Schreibvorgang mit 409 und hat die Person seitdem nichts geändert
   (`automatikKonfliktLoesen`), übernimmt die Sitzung den Stand aus der 409-Antwort (den ETag dazu hat `speicher.js`
   bereits übernommen) und prüft den Lauf einmal neu — meist stehen die Hinweise schon da, von der anderen Sitzung. Kein
   Dialog, keine doppelten Mitteilungen.
3. **Entscheidungslogik prüfbar.** `abbildVon` und die Schreibentscheidung (`schreibAbbild`, inkl. Betriebsrat) stehen
   unverändert in `src/app/oeffnen.js`; `App.jsx` benutzt sie.

Nicht geändert: Rechte (RB-1..RB-5, `kunde`), die Rollenzusammenführung im einen Speicherweg (`server/lib/rechte.mjs`),
Teilweg (`CENTRIC_TEILSPEICHERUNG`, die Oberfläche nutzt ihn nicht), ETag und Drei-Wege-Abgleich, Protokoll des Servers,
der Konfliktdialog für echte Änderungen.

## 4. Nachweis

`npm run pruefung:wp48-gb-oeffnen` (in der Kette `pruefung` vor `wcag-wp40`, im Workflow `pruefung.yml`):

- **B** beide untätig, nichts fällig (auch Betriebsrat): **0 PUT**, kein Dialog, ETag unverändert; die Tour startet
  trotzdem (`tourStartet()` = wahr, kein Tourzustand an der Person).
- **C** Hinweis fällig, Leitung und Planung öffnen gleichzeitig: ein gelungener und ein abgewiesener PUT, der still
  übernommen wird; kein Dialog; je Person genau ein Hinweis, `urlaubshinweis` gesetzt; beide Sitzungen auf demselben
  Stand; erneutes Öffnen schreibt nichts.
- **D/D2** echte gleichzeitige Änderungen (auch Automatiklauf plus eigene Änderung im selben Zug) bleiben 409 mit Dialog.
- **E** Verdrahtung in `App.jsx`.

Rot vorher: Mit dem alten `App.jsx` und der alten Konfliktbehandlung (immer Dialog) schlagen C, D3 und E fehl
(„Leitung: kein Dialog: expected { status: 409 … } to be null“; Tourzustand im Effekt gefunden).

## 5. Offene Fragen (Produktentscheidung)

1. Soll der Urlaubshinweis **serverseitig** entstehen (täglicher Lauf, unabhängig davon, wer öffnet), statt beim Öffnen
   durch Leitung oder Planung? Heute hängt die Pflichtmitteilung daran, dass im Herbst jemand mit vollem Schreibumfang
   die Anwendung öffnet.
2. Soll ihn nur **eine** Rolle auslösen (z. B. Leitung) oder nur auf ausdrückliche Handlung („Hinweise jetzt
   verschicken“)? Bis zur Entscheidung bleibt das bisherige Verhalten (Leitung und Planung, automatisch).
3. Die Meldung „N Hinweise zum Resturlaub verschickt.“ erscheint auch in der Sitzung, deren Schreibvorgang still durch
   den der anderen ersetzt wurde (die Hinweise sind dann von der anderen Sitzung). Genügt das, oder soll die Meldung
   erst nach dem gelungenen Speichern erscheinen?
