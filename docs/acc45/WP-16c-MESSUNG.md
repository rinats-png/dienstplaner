# WP-16c Teil: Messung des Korrekturpfads

Stand: 2026-11-12. Gemessen auf der Windows-Entwicklermaschine (Node v24.18.0, win32), **Bibliothek ohne HTTP**, synthetische
Daten ohne Personendaten. Alle Zahlen sind Messwerte einer einzelnen Ausführung, **keine Hochrechnung**; andere Hardware
(VPS) wurde nicht gemessen. Lohn-/DATEV-Fachdetails bleiben bei E-29 (Betreiber/extern) und sind nicht Gegenstand.

## Was gemessen wird

Befehl für die volle Matrix (60/150/400 Personen x 12/24/36 Monate, rund 15 Minuten, Speicher bis 8 GB zugelassen):

    node --max-old-space-size=8192 werkzeug/wp16c-messung.mjs            # alle neun Zellen
    node werkzeug/wp16c-messung.mjs --personen 60 --monate 12 --json     # eine Zelle mit Rohwerten

Gerüst und Daten stammen aus `werkzeug/wp16-messung.mjs` (8 Einheiten, Schichtzyklus F F S S N N, Ist je Diensttag, dazu
Zuschläge Nacht/Samstag/Sonntag/Feiertag, damit Lohnzeilen entstehen, und eine zweite Leitung für die Freigabe).
Je Zelle: alle Monate abschließen, jüngsten Monat als Lohnexport bestätigen (Revision 1), dann

1. Runde 1: `korrekturBeginnen` -> Plan-Änderung bei rund 5 % der Personen (ein Nachtdienst entfällt) -> Abschluss ohne
   Freigabe (muss 409 KORREKTUR_FREIGABE_ERFORDERLICH liefern) -> `korrekturFreigeben` (zweite Person, mit Prüfsumme der
   Differenz) -> Abschluss (Revision 2) -> Korrekturexport bestätigen;
2. Runde 2: dasselbe (Revision 3);
3. Runde 3: Beginnen -> Änderung -> `korrekturVerwerfen` -> Änderung zurücknehmen -> Abschluss (Differenz leer, Revision 4).

Geprüft (jede Verletzung wird als Befund ausgegeben): Differenz gleich neue minus exportierte Zeilen je Personalnummer und
Lohnart (unabhängig nachgerechnet); Revision 1 + alle Korrekturexporte gleich volle Zeilen der letzten Revision;
Korrekturzeilen gekennzeichnet; Revisionen lückenlos 1..n und Revision 1 unverändert; Verlauf kompakt (höchstens 20
Ereignisse nach drei Runden); Reproduzierbarkeit (freezeStatus, Prüfsumme, gleiche Eingabe liefert bytegleiches Ergebnis);
keine stille Null (jede Person im jüngsten und im ältesten Monat hat Ist-Stunden oder Abwesenheit, und fehlt sie in den
Lohnzeilen, hat sie einen Freeze-Eintrag).

## Ergebnisse (ms je Schritt; Befunde: in allen neun Zellen keine)

Spalten Runde 1 / Runde 2: beginnen / freigeben / abschließen / Export bestätigen.

| Personen | Monate | alle Monate abschließen | Export R1 | Runde 1 (ms) | Runde 2 (ms) | verwerfen | Diff-Zeilen R2, R3 |
|---:|---:|---:|---:|---|---|---:|---|
| 60 | 12 | 10414 | 495 | 1146/515/566/327 | 825/587/697/344 | 1 | 3, 6 |
| 60 | 24 | 23426 | 1014 | 1641/1287/1040/867 | 1480/1155/1024/808 | 0 | 3, 6 |
| 60 | 36 | 43323 | 1135 | 1998/1820/1637/1245 | 1949/1369/1351/1065 | 0 | 3, 6 |
| 150 | 12 | 21154 | 1100 | 1913/1349/1338/731 | 1414/1412/1144/624 | 0 | 10, 13 |
| 150 | 24 | 31778 | 1524 | 2303/1877/2402/1352 | 2905/2299/2837/1429 | 0 | 10, 13 |
| 150 | 36 | 103742 | 2286 | 3959/3047/3813/2733 | 5956/3219/2982/2222 | 0 | 10, 13 |
| 400 | 12 | 61446 | 4032 | 6496/6111/5115/3183 | 6792/4408/5038/3094 | 0 | 24, 32 |
| 400 | 24 | 155820 | 5898 | 11862/8622/8826/5900 | 11959/8785/10238/7118 | 1 | 24, 32 |
| 400 | 36 | 276150 | 9598 | 15212/12192/10937/9850 | 15102/9808/8787/8110 | 1 | 24, 32 |

Speichergröße (Byte-Summe von JSON.stringify), Revision 1 -> 4:

| Personen | Monatseintrag des korrigierten Monats (KB) | gesamter Mandant, 12 Monate (MB) | 24 Monate | 36 Monate |
|---:|---|---|---|---|
| 60 | 1 -> 7 -> 13 -> 18 | 1,81 -> 1,82 | 3,60 -> 3,62 | 5,39 -> 5,41 |
| 150 | 1 -> 14 -> 26 -> 37 | 4,52 -> 4,55 | 9,00 -> 9,03 | 13,49 -> 13,52 |
| 400 | 1 -> 32 -> 63 -> 93 | 12,10 -> 12,19 | 24,11 -> 24,19 | 36,13 -> 36,21 |

## Auswertung

- **Korrektheit**: In allen neun Zellen stimmen Differenz, Korrekturexport, Summe über die Revisionen, Revisionsfolge,
  Reproduzierbarkeit und Determinismus; der Abschluss ohne zweite Person wird jedes Mal abgewiesen; nach Verwerfen und
  Zurücknehmen ist die Differenz leer. Keine stille Null im jüngsten und ältesten Monat.
- **Zeit**: Jeder einzelne Schritt wächst etwa linear mit Personen und Monaten (Abschluss 60 x 12: 0,6 s; 400 x 36: 9 bis 11 s).
  Kein quadratischer Sprung erkennbar. Ein einzelner Abschluss oder eine Korrektur bei 400 Personen und 36 Monaten dauert
  also grob 8 bis 15 s in der Bibliothek (ohne HTTP und ohne Lastspitzen); ob das für den Betrieb reicht, ist hier nicht beurteilt.
  Streuung der Werte ist spürbar (eine Ausführung, Maschine nicht isoliert); einzelne Ausreißer (z. B. 150 x 36 alle abschließen)
  nicht untersucht.
- **Speicher**: Jede Revision legt die exportierten Lohnzeilen des Monats kompakt ab (Array je Zeile), also rund 31 KB je
  Revision bei 400 Personen und rund 6 KB bei 60 Personen (linear in Personen, unabhängig von der Monatszahl). Der Verlauf
  bleibt kompakt (11 Ereignisse nach drei Runden). Bezogen auf den Gesamtbestand ist das unter 0,3 %. Die Obergrenze
  REVISIONEN_MAX = 50 begrenzt das Wachstum auf rund 1,6 MB je Monat bei 400 Personen (rechnerische Grenze, nicht gemessen).

## Beobachtungen (kein Defekt, aber festzuhalten)

1. **Reine Ist-Zeit-Änderung ohne Planwirkung gibt keine Lohnzeilen-Differenz.** Die Zuschläge im Freeze stammen aus dem Plan; eine
   geänderte Ist-Zeit verändert nur das Konto, und Mehrarbeit wird nur bei positivem Konto ausgegeben. In der Synthese bleibt
   das Konto negativ. Ergebnis: Abschluss mit Differenz n = 0 (ausdrücklich, Prüfsumme des Abschlusses ändert sich, Revision
   2 mit leerem Korrekturexport). Das ist keine stille Null, aber fachlich zu bestätigen (E-29 / Fachfreigabe): ob Ist-Änderungen
   ohne Zuschlagswirkung für Lohn bewusst keine Korrekturzeile erzeugen. Test: `pruefungen/wp16c-messung.test.js`.
2. Die Messung nutzt die Bibliothek; HTTP-Pfad (daten.mjs, PUT-Grenze RUMPF_MAX 6 MB) wurde für den Korrekturpfad **nicht** gemessen.
   Der gesamte Mandant erreicht bei 400 x 36 bereits 36 MB im Speicher (Bestand der Messung, nicht PUT-Rumpf).

## Befunde

Keine (kein stiller Nullwert, keine nicht reproduzierbare Historie, keine quadratische Zunahme im gemessenen Bereich).

## Nicht gemessen

HTTP/Server-Pfad der Korrekturaktionen, Offline-Stempel während einer laufenden Revision, Migration alter Abschlüsse ohne
Revisionsschema, Änderung historischer Vertrags-/Tarifparameter, Lohnexport-Dateiformat (E-29), VPS-Hardware,
Parallelzugriffe, mehr als drei Revisionen, Korrektur mehrerer Monate gleichzeitig.

## CI

Kleiner Maßstab (12 x 2 und 30 x 3, rund 20 s): `npm run pruefung:wp16c-messung` (`pruefungen/wp16c-messung.test.js`), in
`pruefung` und `.github/workflows/pruefung.yml` verdrahtet.
