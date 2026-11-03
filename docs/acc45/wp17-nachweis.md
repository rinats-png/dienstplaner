# WP-17 Stempelkonflikt, Serverdatum — Nachweis

Branch `acc45/time/wp17-serverdatum`, Basis `origin/acc45/security/wp45-atomares-schreiben` (bad4a71).
Grundlage: `docs/GEO-ZEITERFASSUNG-SPEZIFIKATION.md` (Branch `docs/geo-zeiterfassung-spezifikation`), Abschnitte
B5, B6 und B7. Die Läufe fanden lokal statt (Windows 11, Node 24.18).

## Regel (server/lib/zeiterfassung.mjs, `stempelZiel`)

Den Tag bestimmt der Server aus seiner Uhr in Europe/Berlin. Eine Zeitzone je Betrieb gibt es im Bestand noch nicht.

- **Beginn:** Gestempelt wird auf heute. Läuft noch ein offener Beginn von gestern, der höchstens 20 h zurückliegt
  (Nachtdienst), antwortet der Server mit 409 `STEMPEL_SCHON_EINGESTEMPELT` (B5 „doppelter Start“).
- **Ende:** Das Ende gehört zum offenen Vorgang.
  - Gibt es einen Eintrag von heute, gilt dieser Tag.
  - Sonst gilt ein offener Beginn von gestern, wenn er höchstens 20 h zurückliegt. Dann bekommt der Eintrag
    `endeDatum` = heute, und die Erfassung wird geschrieben.
  - Sonst kommt das Ende auf heute, markiert als `START_FEHLT`; der alte Vorgang bleibt für die Korrektur offen
    (B6.3).
  - Schickt das Gerät ausdrücklich das Datum eines veralteten offenen Beginns, wird das Ende wie bisher an diesen
    Beginn gehängt und als `START_VERALTET` markiert.
- **Zeitumstellung:** Datum und Abstand werden aus dem eindeutigen Zeitpunkt berechnet (`heuteBerlin`, `startAm`).
- **Gerätedatum (`datum`):**
  - Es dient nur noch der Plausibilität und darf fehlen.
  - Ist es da, muss es heute sein, mit 2 min Spiel um Mitternacht (B7). Beim Ende darf es auch der Tag eines offenen
    Beginns von gestern sein.
  - Jedes andere Datum wird mit 400 `STEMPEL_DATUM_UNPASSEND` und einer klaren Meldung abgelehnt; ein ungültiges
    Format mit 400 `STEMPEL_DATUM_UNGUELTIG`. Früher wurde es übernommen oder mit 422 abgelehnt.
  - Abweichung von der Spezifikation B7 („Feld wird ignoriert“): Laut Auftrag wird ein unpassendes Datum abgelehnt,
    nicht ignoriert.
- **Antwort:** Das Feld `datum` nennt den Tag, den der Server gewählt hat.

`src/stempelvorgang.js` musste nur im Kommentar angepasst werden. Die Oberfläche schickt beim Beginn das heutige Datum
und beim Ende den Tag eines offenen Beginns von gestern (höchstens 20 h); das passt zur neuen Regel.

## Tests

`pruefungen/serverdatum.test.js` (9 Tests, Serverzeit über `vi.setSystemTime`) wurde gegen bad4a71 gelaufen:
**9/9 rot**.

| Fall | vorher (bad4a71) | nachher |
|---|---|---|
| Beginn ohne Gerätedatum | 400 „Kein gültiges Datum“ | 200, heute |
| 25.10. 00:30 MESZ, ohne Datum / Gerät in UTC schickt 24.10. | 400 | 200 auf 25.10. / 400 |
| Gerätedatum gestern bei geplantem Nachtdienst | **200, auf gestern gestempelt** | 400, nichts gestempelt |
| Gerätedatum morgen | 422 | 400 mit Meldung |
| Nachtdienst 22:00 → 06:00, Ende mit dem Datum des neuen Tags | **auf dem neuen Tag als START_FEHLT** | beim Beginn, Erfassung, `endeDatum` |
| Zweites Einstempeln während des offenen Nachtdiensts | 400 (kein Datum) | 409 |
| Zeitumstellung 25.10.: 22:00 MESZ → 05:30 MEZ | **auf dem 25.10.** | beim 24.10., 8,5 h |
| Vergessenes Ausstempeln (28 h) | 400 (kein Datum) | heute, START_FEHLT, alter Vorgang offen |
| 20 gleichzeitige Stempel (B5) | 20 × 400 | 20 × 200 |

Beim Test mit 20 gleichzeitigen Stempeln liegt das Rot vorher nur am fehlenden Datum. Die Wiederholung bei Konflikt
(B5) gibt es seit WP-02; der Test prüft, dass das so bleibt.

### Angepasste bestehende Prüfungen

Diese Prüfungen hielten die alte Datumsregel fest:

- **`zeiterfassung.test.js`:** Die Fälle 20–24 prüfen jetzt `stempelZiel` mit fester Serverzeit. Neu sind die Fälle
  offener Beginn innerhalb und außerhalb der 20 h, Mitternachtsspiel, Herbst- und Frühjahrsumstellung sowie ein
  Beginn in der Rückstellnacht.
- **`pruefungen/zeiterfassung.mjs` (HTTP):**
  - „morgen“, „vor fünf Tagen“ und „gestern ohne Nachtdienst“ erwarten jetzt 400 statt 422.
  - „gestern mit Nachtdienst: 200“ ist ersetzt durch zwei Prüfungen: Gerätedatum gestern ohne offenen Beginn → 400;
    Ende ohne Datum → heute, START_FEHLT.
  - Die Protokollprüfung sucht jetzt `STEMPEL_DATUM_UNPASSEND`.

### Regression nachher

- vitest, 18 Dateien: 458/458.
- Serverlauf: zeiterfassung 39/39, geo 14/14, rechte 147/147, schichtverantwortung 25/25.
- `tsc` sauber; eslint 0 Fehler (331 Warnungen wie vorher).

## Offen

- `src/App.jsx`, Rückfallweg nach dem Stempeln (`spiegeln`, nur wenn das Nachladen scheitert): Der lokale Eintrag
  wird dort unter dem Gerätedatum statt unter `erg.datum` abgelegt. Das betrifft nur Fälle, in denen Server und Gerät
  sich im Tag unterscheiden. Gehört dem Agenten, der `App.jsx` bearbeitet: dort `erg.datum` verwenden.
- Eine Zeitzone je Betrieb ist im Bestand nicht vorgesehen; es gilt Europe/Berlin.
- Offline-Ereignisse mit `clientErfasstAm` (B7/B8) gehören zu WP-07.

## Review-Auflagen F1–F4 (Entscheidungen des Integrationsverantwortlichen)

Diese Auflagen ersetzen die oben beschriebene Ablehnung mit 400. Gilt ab dem Commit nach 6a57cff.

| Nr | Regel jetzt | Spezifikation |
|---|---|---|
| F1 | Ende ohne offenen Vorgang: War gestern ein Dienst über Mitternacht geplant, gibt es für gestern noch keinen Stempeleintrag, und ist es jetzt höchstens geplantes Dienstende + **4 h** (`NACHT_TOLERANZ_MS`), dann wird auf **gestern** gestempelt, mit START_FEHLT. Sonst auf heute, START_FEHLT. | Präzisierung zu B5/E10 (Zuordnung eines Endes ohne Start) |
| F2 | Gerätedatum wird **angenommen und ignoriert**; der Tag kommt immer vom Server. Weicht es ab (außerhalb ±2 min um Mitternacht und nicht der vom Server gewählte Tag) oder ist es kein Datum, bekommt der Eintrag die Markierung **`GERAETEDATUM_ABWEICHEND`**. Es gibt **nie** ein 400 deswegen. Ein Beginn mit Gerätedatum gestern landet trotzdem auf heute. | B7 („Feld wird ignoriert“) plus die Markierung als Präzisierung |
| F3 | Ein Ende zu einem offenen Beginn von gestern, der älter als 20 h ist, wird **nie angehängt**, auch nicht mit Gerätedatum gestern. Es entsteht ein eigenes Ende auf dem Server-Tag (START_FEHLT). Der alte Vorgang bekommt die Markierung `KONFLIKT` mit `konfliktGrund: "vorgang_veraltet"` und bleibt offen für die Korrektur. | B6.3 |
| F4 | Ergibt ein Ende mehr als **12 h** (`LANGER_DIENST_MINUTEN`), dann wird die Erfassung mit `bestaetigt: false` geschrieben, mit Markierung `LANGER_DIENST` und einem Grund mit Stundenangabe. Die Leitung muss sie prüfen. Begründung für 12 h: Höchstarbeitszeit nach § 3 ArbZG (10 h) plus 2 h für Pausen und Übergaben. | Präzisierung (in der Spezifikation nicht geregelt) |

**Präzisierung zu F3, Beginn am selben Tag:** Liegt ein offener Beginn von heute über 20 h zurück (Beginn kurz nach
Mitternacht, Ende am späten Abend), gibt es keinen zweiten Schlüssel, denn der Server-Tag ist derselbe. Dann bleibt
es beim bisherigen Verhalten: Das Ende kommt an den Vorgang, markiert als `START_VERALTET` und ohne Erfassung.

**Auswirkung von F4 auf die Ist-Stunden:** `src/istdaten.js` (`istZeitFuer`) rechnet eine unbestätigte Erfassung wie
eine fehlende, also mit der **Planzeit**. Ein langer, ungeprüfter Dienst zählt deshalb mit der geplanten Dauer, bis
die Leitung bestätigt oder korrigiert. Für diesen Fall „nicht verfügbar/prüfen“ anzuzeigen statt der Planzeit,
erfordert eine Änderung an `src/istdaten.js` und an der Anzeige in `App.jsx`: Dort wird `std` summiert, und `null`
ist dafür nicht vorbereitet. Beides liegt außerhalb dieses Pakets. **Folgepunkt** für den Agenten, der `App.jsx` und
`istdaten` bearbeitet: Erfassung mit `bestaetigt: false` und Grund `LANGER_DIENST…` als „prüfen“ ausweisen.

**Oberfläche:** `src/stempelvorgang.js` hat Anzeigetexte für `KONFLIKT`, `GERAETEDATUM_ABWEICHEND` und
`LANGER_DIENST` bekommen. `src/speicher.js` bleibt unverändert, weil es kein 400 wegen des Datums mehr gibt.

### Tests

Auf 6a57cff liefen `serverdatum.test.js` und `zeiterfassung.test.js`: **20 rot**.

- Die neuen HTTP-Fälle sind aus dem gemeinten Grund rot:
  - F2: 400 statt 200 mit Markierung.
  - F3: Das Ende wurde an den veralteten Beginn gehängt (START_VERALTET), es entstand kein KONFLIKT.
  - F1: Das Ende kam auf heute.
  - F4: `bestaetigt: true`.
- Die Unit-Tests zu `stempelZiel` sind außerdem wegen der neuen Rückgabeform rot.

Nachher: 12 vitest-Dateien **296/296**; Serverlauf zeiterfassung 38/38, geo 14/14, rechte 147/147,
schichtverantwortung 25/25; eslint 0 Fehler; `tsc` sauber.

Angepasste bestehende Prüfungen:

- **`geo.test.js`:** 20-Stunden-Grenze bei 19:59 und 20:00 jetzt „zugeordnet, zur Prüfung (LANGER_DIENST)“; die Fälle
  24 h und `startAm` jetzt „eigenes Ende + KONFLIKT“. Der Fall „offener Beginn gestern 21:57“ ist von der Uhrzeit des
  Prüflaufs abhängig; beide Ausgänge werden geprüft.
- **`pruefungen/geo.mjs`:** „Beginn vor 24 h“ jetzt nach B6.3.
- **`pruefungen/zeiterfassung.mjs`:**
  - Gerätedatum morgen, vor fünf Tagen oder gestern ergibt nie einen Stempel an jenem Tag. Weil heute schon gestempelt
    ist, antwortet der Server mit 409.
  - Ende ohne offenen Beginn: 200 mit START_FEHLT, auf heute oder (F1, abhängig von der Uhrzeit) auf gestern.

## Review-Auflagen W1–W4 und Integrationsstand (H8+)

Der Branch enthält jetzt `origin/integration/centric-complete` (Merge 895e00d, u. a. H8+ f9ab17c, ec76973, cdaf74f,
f9b2ee7). Konflikte in `package.json` gelöst; `istdaten.js`, `rechte.mjs`, `App.jsx` ohne Verlust der H8+-Invarianten
(SV/BR keine fremden Stempel/Ist-Zeiten; Ist unter Rollenschutz „nicht verfügbar“ statt Planzeit).

- **W1 Langer Dienst:** Grenze `langerDienstGrenze` = geplante Dauer der Dienstart + 2 h (über Mitternacht, 24-h-Dienst),
  ohne Plan 12 h. Ein geplanter 12-h-Dienst mit kurzem Überhang wird bestätigt. Ein Fall über der Grenze bleibt
  `bestaetigt: false` — nicht still: `istZeitFuer` liefert Planzeit mit `zurPruefung: true`, die Stempelbefunde listen
  „Ist-Zeiten zur Prüfung“ mit „Bestätigen“ (nur `plan.edit.unit` oder `staff.edit`; Vermerk im Protokoll).
- **W2 Lokale Kopie:** Schlüssel nach dem Stempeln ist der Tag vom Server (`stempelSchluessel(pid, erg, datum)`).
- **W3 Oberfläche Nachtdienst:** `stempelVorgang` nutzt dieselbe Regel wie der Server (`nachtdienstOffen`, F1) und
  meldet `nachtEnde`; Stempeluhr und mobile Stempelfläche bieten „Dienstende stempeln“ (gestern) und „Einstempeln“ (heute).
- **W4 Determinismus:** `geo.test.js` „offener Beginn von gestern“ und „20:01 Stunden“ mit festem `startAm`;
  `pruefungen/zeiterfassung.mjs` prüft beide Zweige getrennt (n1 mit Dienst „NL“ 23:59–23:58 gestern → immer gestern;
  h1 ohne Plan → immer heute); F4 mit Plan-12-h-Dienst (`serverdatum.test.js`); F1 in der Sommerzeitnacht 2027
  (`zeiterfassung.test.js`). Neue Datei `stempel-oberflaeche.test.js` läuft in `pruefung:zeiterfassung`.

Rot vorher (Export von a3ade22 per `git archive`, neue Tests hineinkopiert): **9 rot** (7 in
`stempel-oberflaeche.test.js`, W1-Grenze in `zeiterfassung.test.js`, W1-T12 in `serverdatum.test.js`). Die Tests zu
F1-Sommerzeit und die deterministisch gemachten Geo-Fälle sind dort grün (Regel bestand bereits; es ging um Determinismus).

Nachher (lokal, Windows): zeiterfassung, serverdatum, stempel-oberflaeche, geo, istdaten **154/154**;
stempel-datenschutz, stempeln, sicht-schichtverantwortung, sicht, oberflaeche-render **143/143**; Serverlauf
zeiterfassung 39/39, rechte 147/147, schichtverantwortung 25/25, geo 14/14; staging-proben 16/16; `tsc` sauber.
Ein Geo-Serverlauf war einmal 13/14: „keine Rohkoordinate“ fand `410` (= 50 + 360, Probe für ungültige Breite) in
einem zufälligen Millisekundenwert eines Zeitstempels — vorbestehende Zufallsabhängigkeit der Prüfung, nicht WP-17;
Wiederholung 14/14.

## Nachprüfung (fda8deb): Auflagen 1–3

1. **Integrationsstand** erneut hineingemergt (bc58b97). `package.json`: beide Zeilen übernommen — `ablage-pruefen-matrix2`
   (integration) in `pruefung:datenintegritaet`, `serverdatum` und `stempel-oberflaeche` (WP-17) in `pruefung:zeiterfassung`.
2. **W1-Rest — nicht mehr still im Lohn:** `pruefHinweis(m, ym[, personId])` (src/istdaten.js) nennt Monat, Anzahl und
   Fälle, `ZUR_PRUEFUNG_TEXT` = „zur Prüfung, Planzeit vorläufig".
   - `istStunden` zählt die Tage (`zurPruefung`).
   - Abrechnungsdaten (Zuschläge, Freizeitausgleich, Lohnausgabe): Hinweisband mit Anzahl, Monat und „Zur Prüfliste"
     (öffnet Stempelbefunde).
   - Stundenkonto in der Personalakte und „Mein Stundenkonto": betroffene Tage mit Kennzeichnung.
   - Lohnblatt zum Gegenlesen: Abschnitt „ACHTUNG" mit einer Zeile je betroffenem Tag.
   - CSV-Lohnausgabe: Warnung mit den Tagen vor dem Download (Abbruch möglich); das Dateiformat bleibt unverändert.
   - Gesamtexport `erfassung`: Spalte `status` („zur Prüfung, Planzeit vorläufig" / „bestätigt" / „offen").
3. **Bestätigen-Knopf** nur mit `staff.edit` (Leitung, Planung) — nicht für die Schichtverantwortung — und nie für die
   eigene Person.

Rot vorher (Export von fda8deb, neue Tests hineinkopiert): 3 von 11 in `stempel-oberflaeche.test.js` rot; nachher 11/11.
