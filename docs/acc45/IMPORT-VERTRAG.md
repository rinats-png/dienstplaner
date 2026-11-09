# IMPORT-VERTRAG — Parser-Vertrag (IMP-0, Teil Parser; umgesetzt in IMP-2)

Stand: 2026-11-09. Umsetzung: `server/lib/import/parser.mjs` (Schnittstelle), `parser-kern.mjs`, `parser-worker.mjs`.
Prüfung: `pruefungen/import-parser.test.js`, `pruefungen/import-parser-vendor.test.js`.

Der Parser liest eine hochgeladene Tabellendatei und liefert ihren **Rohinhalt**. Er interpretiert nichts: keine Spaltenbedeutung,
keine Datums- oder Zahlenumwandlung von Text, keine Geschäftsregeln. Das ist Aufgabe von IMP-1 und folgenden Schritten.

## 1. Schnittstelle

```js
parseDatei({ buffer, name, grenzen }) → Promise<
    { ok: true,  format, datumssystem?, datumssystemQuelle?, blaetter: [{ name, zeilen: [[zelle, …], …] }], hinweise: [] }
  | { ok: false, code, nachricht } >
```

- `buffer`: `Buffer`/`Uint8Array` mit dem Dateiinhalt. `name`: Dateiname (nur für den Endungs-Hinweis, nie für die Erkennung).
- `grenzen`: optional, überschreibt einzelne Standardgrenzen (Schlüssel siehe 3). Unbekannte oder ungültige Werte werden ignoriert.
  Der Aufrufer (Server-Endpunkt) gibt keine Nutzerwerte durch.
- Rückgabe immer als Promise, nie eine Ausnahme. Bei `ok:false` gibt es **kein Teil-Ergebnis** (kein Feld `blaetter`).
- `nachricht` ist ein verständlicher deutscher Satz, der der Person am Bildschirm gezeigt werden darf. `code` ist stabil und maschinenlesbar.
- Der Parser öffnet keine Netzverbindung, schreibt keine Datei und führt keinen Inhalt der Datei aus.
- `datumssystem` beschreibt das **Ergebnis** und ist bei Arbeitsmappen (`xlsx`, `xls`, `ods`) immer `"1900"` (nach Umrechnung).
  `datumssystemQuelle: "1904"` steht zusätzlich nur bei Mappen im System 1904 (Herkunft, nur zur Information). Bei `csv`/`tsv`
  fehlen beide Felder (Text hat kein Datumssystem). Folgeschritte rechnen **nichts** um. Siehe 6.

## 2. Formate und Erkennung

| `format` | Erkennung (Inhalt, nicht Endung) |
|---|---|
| `xlsx` | ZIP (`PK\x03\x04`) mit `xl/workbook.xml` (auch `.xlsm`) |
| `xls` | OLE2/CFB (`D0 CF 11 E0 A1 B1 1A E1`) mit Tabellenstrom; kein Word/PowerPoint |
| `ods` | ZIP mit Eintrag `mimetype` = `application/vnd.oasis.opendocument.spreadsheet` |
| `csv` / `tsv` | reiner Text (keine NUL-Bytes, < 1 % Steuerzeichen), Trenner `;` `,` Tab automatisch (Tab bei Endung `.tsv`) |

Alles andere ergibt `UNBEKANNTES_FORMAT` oder `NICHT_UNTERSTUETZT` (erkannt, aber nicht gelesen: `.xlsb`, Word-/PowerPoint-/andere ODF-Dateien,
XML/HTML, ZIP64). Weicht die Endung vom erkannten Format ab, wird trotzdem nach Inhalt gelesen und der Hinweis `ENDUNG_ABWEICHEND` gesetzt.
CSV: UTF-8 (BOM wird entfernt); ist der Text kein gültiges UTF-8, wird Windows-1252 angenommen (Hinweis `ZEICHENSATZ_ERSATZ`).
CSV-Anführungszeichen nach RFC 4180 (Trenner und Zeilenumbrüche in Anführungszeichen, `""` als Anführungszeichen). Blattname bei CSV/TSV: `Tabelle1`.

## 3. Grenzen (technische Schutzgrenzen, keine Geschäftsregeln)

| Schlüssel | Standard | Begründung |
|---|---|---|
| `dateiBytes` | 10 MB | Eine Personal-/Dienstetabelle mit 20.000 Zeilen belegt weit weniger; größere Uploads sind fast immer Fehlgriffe oder Angriffe. |
| `entpacktBytes` | 100 MB | Summe der erklärten **und** der tatsächlich entpackten Größen aller Archiv-Einträge (xlsx/ods sind ZIP). Schützt vor ZIP-Bomben, auch außerhalb des JS-Heaps (Buffer). |
| `kompressionsverhaeltnis` | 100 : 1 | Ab 1 MB entpackt: erklärte Größe / Dateigröße darüber → verdächtig. Echte Tabellen liegen bei ca. 5–30 : 1. |
| `archivEintraege` | 1000 | Eine Tabelle besteht aus wenigen Dutzend Teilen; sehr viele Einträge sind ein Angriffsmuster. |
| `zeilen` | 20.000 | Datenzeilen je Blatt **ohne** Kopfzeile (erste nicht leere Zeile), nach Entfernen leerer Zeilen. |
| `spalten` | 200 | Je Blatt, nach Entfernen leerer Spalten. |
| `blaetter` | 20 | Anzahl Tabellenblätter. |
| `zellen` | 4.000.000 | Gesamtzahl Zellen über alle Blätter (entspricht einem Blatt mit voller Zeilen- mal Spaltenzahl); begrenzt den Speicher bei vielen Blättern. |
| `zeitMs` | 20.000 | Zeitlimit der Verarbeitung (siehe 4). |
| `zellZeichen` | 32.767 | Höchstlänge eines Textes je Zelle (wie Excel). Zusammen mit der Textmenge unten → `TEXT_ZU_GROSS`. |

**Textmenge** (Review 1da3ceb, H2): Ein Eintrag der gemeinsamen Textliste (`sharedStrings`) ist im Worker ein einziger String, auf den beliebig
viele Zellen verweisen können; `postMessage` kopiert ihn aber je Zelle in den Hauptthread (gemessen: 1,1-MB-Datei mit 1.000 Verweisen auf
einen 1,5-Mio.-Zeichen-Text → 1,5 Mrd. Zeichen, ca. 1,4 GB im Hauptthread). Deshalb zählt der Worker **vor** `postMessage` die Zeichen des
Ergebnisses: jede Zelle (Text, Datums-/Fehlertext) höchstens `zellZeichen`, alle Texte zusammen (einschließlich Blattnamen) höchstens
`entpacktBytes` Zeichen. Überschreitung → `TEXT_ZU_GROSS`, kein Teil-Ergebnis.

Überschreitung → Fehlercode, kein Teil-Ergebnis. Hinweis zu `zeilen` bei xlsx/xls/ods: zulässig sind Zeilen**positionen** bis
`zeilen + 1 + 10.000` (Puffer für Leerzeilen). Liegt in einem Blatt eine Zeile darüber hinaus, wird `ZU_VIELE_ZEILEN` gemeldet, auch wenn die
Zeilen dazwischen leer sind. Es wird **nie** still abgeschnitten (Review PR #123, Befund 2; Review 1da3ceb, M1):
- xlsx: vor SheetJS wird jedes Blatt-XML streng geprüft und die höchste Zeilenposition bestimmt, nach demselben Lesepfad wie SheetJS
  (`parse_ws_xml_data`/`parsexmltag`), unabhängig von `<dimension>`:
  - Zeilenblöcke werden an `</…row>` getrennt; das Element, das SheetJS als Zeile liest, muss `row` (mit oder ohne Präfix) heißen, sonst `BESCHAEDIGT`
    (z. B. `<ext r="50000">` nach der letzten Zeile).
  - Attribute werden wie bei SheetJS benannt (Präfix entfällt, `_…` entfällt, Groß-/Kleinschreibung zählt gleich); jedes höchstens einmal,
    sonst `BESCHAEDIGT` (z. B. `r="4" x:r="50000"`, `r="A3" R="A9"`).
  - `row r`: nur Ziffern, ≥ 1, mit oder ohne Anführungszeichen; sonst `BESCHAEDIGT` (auch Entitäten wie `&#53;`, die SheetJS nicht dekodiert).
  - `c r`: nur `[A-Z]+` gefolgt von Ziffern, Zeile ≥ 1, Spalte ≤ `XFD`; sonst `BESCHAEDIGT`. Zellbezüge zählen zur höchsten Zeilenposition.
  - Fehlt `r`, gilt (wie bei SheetJS) Vorgänger + 1.
- xlsx: **kein** `sheetRows` mehr; die Zahl der tatsächlich gelesenen Zeilen (`!data.length`) über der Grenze → `ZU_VIELE_ZEILEN`.
- ods: SheetJS liest mit `sheetRows = Grenze + 1`; mehr gelesene Zeilen als die Grenze oder `!fullref` über der Grenze → `ZU_VIELE_ZEILEN`.
- xls: ohne `sheetRows` (die Dateigröße begrenzt die Zellzahl, BIFF8 hat höchstens 65.536 Zeilen); danach dieselbe Positionsprüfung.

## 4. Zeit- und Speichergrenzen

Das Entpacken und Lesen ist rechenintensiv und synchron. Liefe es im Hauptthread des Servers, würde eine große oder präparierte Datei alle anderen
Anfragen blockieren. Deshalb läuft die gesamte Verarbeitung (Formaterkennung, Entpackprüfung, SheetJS, CSV) in einem **eigenen Worker-Thread**:

- Zeitlimit `zeitMs`: Überschreitung beendet den Worker hart (`terminate`) → Code `ZEITLIMIT`. Der Hauptthread bleibt ansprechbar.
- Speicherlimit des Workers (`maxOldGenerationSizeMb` 768): Überschreitung beendet nur den Worker → Code `SPEICHERLIMIT`.
- Vorab im Hauptthread nur billige Prüfungen: Eingabe vorhanden, nicht leer, `dateiBytes`.

## 5. ZIP-Prüfung (xlsx, ods) vor der Übergabe an SheetJS

Seit Review PR #123 (Befund 1) liest der Parser das Archiv vollständig selbst (`pruefeZip` in `parser-kern.mjs`) und gibt SheetJS **nur ein neu
aufgebautes Archiv** aus den geprüften Einträgen (unkomprimiert, ohne Extrafelder, ohne Kommentar). Widersprüchliche Metadaten des Originals
erreichen SheetJS nicht mehr.

1. Archivende (EOCD): die letzte EOCD-Signatur der Datei (so sucht auch SheetJS); sie muss mit ihrer Kommentarlänge **exakt** am Dateiende enden.
   Keine zweite EOCD-Signatur ab Beginn des Zentralverzeichnisses (Verzeichnis, Archivende, Kommentar). Datenträgernummern 0.
   Eintragszahl „auf dieser Disk“ (Offset 8) **gleich** Gesamtzahl (Offset 10), beide ≤ `archivEintraege`, mindestens 1.
   Das Verzeichnis endet exakt bei `cdVersatz + cdGroesse` = Beginn des Archivendes; die Einträge füllen es lückenlos.
   Widerspruch → `BESCHAEDIGT`. ZIP64 (Markierungswerte 0xFFFF/0xFFFFFFFF, ZIP64-Locator, Extrafeld 0x0001 im Verzeichnis oder im lokalen Kopf)
   → `NICHT_UNTERSTUETZT`. Doppelte Eintragsnamen (ohne Groß-/Kleinschreibung) → `BESCHAEDIGT`.
   Namen werden vorher wie bei SheetJS normalisiert (Review 1da3ceb, M2): führendes `/` entfällt, `//` wird zu `/`; Steuerzeichen
   U+0000–U+0006 und `\` im Namen → `BESCHAEDIGT`. `xl/worksheets/sheet1.xml` und `/xl/worksheets/sheet1.xml` sind damit doppelt.
   Das neu aufgebaute Archiv (Punkt 5) enthält die normalisierten Namen.
2. Summe der erklärten unkomprimierten Größen ≤ `entpacktBytes`, sonst `ENTPACKT_ZU_GROSS`. Verhältnis ≤ `kompressionsverhaeltnis`, sonst `KOMPRESSION_VERDAECHTIG`.
3. Jeder Eintrag: verschlüsselt → `PASSWORTGESCHUETZT`; Name (Bytes), Merkmale, Methode, Größen und CRC im lokalen Kopf müssen dem Zentralverzeichnis
   entsprechen (bei nachgestelltem Datenblock dürfen Größen/CRC im lokalen Kopf 0 sein); Daten liegen vor dem Verzeichnis. Sonst `BESCHAEDIGT`.
4. Jeder Eintrag wird selbst mit `zlib.inflateRawSync` und `maxOutputLength` = erklärte Größe entpackt; Ist-Größe = erklärte Größe und
   CRC-32 = Verzeichnis-CRC, sonst `BESCHAEDIGT`; lügt der Header (tatsächlich mehr) → `ENTPACKT_ZU_GROSS`. Die Summe der **tatsächlich**
   entpackten Bytes wird laufend gegen `entpacktBytes` geprüft; Abbruch sofort bei Überschreitung. Nur „gespeichert“ und „deflate“.
5. Erst danach wird das saubere Archiv gebaut und an SheetJS gegeben. Spitzenbedarf außerhalb des JS-Heaps: höchstens etwa 2 × `entpacktBytes`
   (entpackte Einträge und neues Archiv), danach werden die Einzelpuffer freigegeben. Das Ganze läuft im Worker-Thread (siehe 4).

## 6. Zellwerte (Rohwerte)

Jede Zeile ist ein Array gleicher Länge (rechteckig). Eine Zelle ist:

| Wert | Bedeutung |
|---|---|
| `null` | leer |
| `string` | Text (CSV: **jeder** Wert ist Text, auch Zahlen und Datumsangaben; führende Nullen bleiben) |
| `number` | Zahl (xlsx/xls/ods) |
| `boolean` | Wahrheitswert |
| `{ typ:"datum", roh:<Zahl>, text:<string> }` | Datumszelle: Rohwert (Excel-Seriennummer, **immer im Datumssystem 1900**) plus so angezeigter Text; IMP-1 prüft daraus Gültigkeit und Zeitzone |
| `{ typ:"fehler", text:"#DIV/0!" }` | Fehlerzelle, nicht endliche Zahl |

**Datumssystem** (Review PR #123, Befund 3; präzisiert durch Review 1da3ceb, H1): Excel-Arbeitsmappen speichern Datumswerte als Seriennummer
im System 1900 (Standard) oder 1904 (ältere Mac-Dateien; Seriennummer 0 = 01.01.1904). Der Parser ist die **einzige** Stelle, die umrechnet:

- Er liest das System aus der Arbeitsmappe (`Workbook.WBProps.date1904`). Bei 1904 wird `roh` jeder Zelle mit **Datumsformat** genau einmal um
  1.462 Tage auf das System 1900 normiert; Hinweis `DATUMSSYSTEM_1904`, Ergebnisfelder `datumssystem: "1900"`, `datumssystemQuelle: "1904"`.
- **Datumsformat** heißt: das Zahlenformat enthält einen Datumsteil (Tag `d`, Jahr `y`/`e`/`b`, Ära `g` oder Monat `m` — `m` gilt als Monat bei
  drei oder mehr `m` oder wenn das Format keine Stunden/Sekunden enthält). **Zeit- und Dauerformate** (`hh:mm`, `[h]:mm`, `mm:ss`, `h:mm AM/PM`,
  ODS-Zeitwerte) werden **nicht** verschoben, auch wenn sie als `{ typ:"datum" }` geliefert werden: ihr Wert ist ein Tagesbruchteil bzw. eine
  Dauer und hängt nicht vom Datumssystem ab (06:00 bleibt `roh: 0.25`). Datum mit Uhrzeit wird als Ganzes verschoben.
- Gewöhnliche Zahlen und Text werden nie umgerechnet. Eine xlsx-Zelle `t="d"` (ISO-Datum) **ohne** Datumsformat liefert SheetJS als Zahl im
  System der Mappe; sie bleibt eine unveränderte Zahl (keine Umrechnung, kein `{ typ:"datum" }`).
- ODS: Das System steht in `<table:null-date>`. SheetJS wertet es erst aus, wenn es den Tag erreicht. Steht es **nach** der ersten Tabelle oder
  mehrfach → `BESCHAEDIGT`; ein anderer Wert als `1899-12-30` oder `1904-01-01` → `NICHT_UNTERSTUETZT` (SheetJS würde ihn still ignorieren).
- Derselbe Kalendertag ergibt damit in beiden Systemen denselben `roh`-Wert und denselben `text`. Nachfolgende Schritte (IMP-1, IMP-3) rechnen
  **nicht** erneut um und werten `datumssystemQuelle` nicht für Berechnungen aus.

**Leerer `text`**: `text` ist der von SheetJS formatierte Anzeigetext. Für manche (z. B. deutsche, benutzerdefinierte) Zahlenformate kann
SheetJS den Text nicht bilden (`SSF.format` wirft intern); dann ist `text` der leere String `""`. Verbindlich für die Auswertung ist `roh`.

Ein Datum, das als **Text** in der Datei steht (z. B. `31.02.2024`), bleibt Text. Formeln werden nicht ausgewertet: geliefert wird nur der in der Datei gespeicherte Wert,
nie der Formeltext. Namen von Spalten, Blättern und Zellen werden nicht getrimmt, umbenannt oder entdoppelt.

## 7. Mehrere Blätter, leere Zeilen und Spalten

Alle Blätter werden geliefert (`blaetter` in Dateireihenfolge, je mit `name`). Ein Blatt ohne Daten wird mit `zeilen: []` und Hinweis `LEERES_BLATT` geliefert;
enthält die Datei insgesamt keine Daten → Fehler `LEER`. Vollständig leere Zeilen und Spalten (nur `null`/Leerzeichen) werden entfernt und je Blatt gemeldet.

## 8. Hinweise (`hinweise: [{ code, nachricht, blatt?, anzahl? }]`)

`LEERE_ZEILEN_ENTFERNT`, `LEERE_SPALTEN_ENTFERNT`, `LEERES_BLATT`, `ENDUNG_ABWEICHEND`, `ZEICHENSATZ_ERSATZ`, `MAKROS_VERWORFEN`
(xlsm/vbaProject.bin, ODS-Skripte, VBA in XLS: nichts wird ausgeführt oder übernommen), `EXTERNE_VERWEISE_IGNORIERT` (`xl/externalLinks`),
`EINGEBETTETE_OBJEKTE_IGNORIERT`, `AUSGEBLENDETES_BLATT` (Blatt wird trotzdem geliefert), `DATUMSSYSTEM_1904` (Datumswerte auf 1900 normiert, Zusatzfeld `datumssystemQuelle: "1904"`, siehe 6).
`MAKROS_VERWORFEN` wird nur bei echten Makro-Bestandteilen gesetzt: Eintrag `vbaProject.bin`, ODS `Scripts/`/`Basic/`, oder in `[Content_Types].xml`
ein `ContentType="application/vnd.ms-office.vbaProject"`. Der allgemeine Standardeintrag `Default Extension="bin"` (`…macroEnabled.main`) zählt nicht.

**Spaltenzahl vor dem Ausbau** (Review PR #123, Punkt 6, nur dokumentiert): die Spaltengrenze wird erst nach dem Aufbau der Zeilen geprüft.
Ein Blatt mit Zellen in sehr weit rechts liegenden Spalten (xlsx bis `XFD`, ODS `number-columns-repeated`) erzeugt vorher lange Zeilen-Arrays.
Das ist durch Zeit-, Speicher- und Entpackgrenzen begrenzt (Ergebnis dann `ZEITLIMIT`/`SPEICHERLIMIT`, nie ein Teilergebnis), aber nicht vorab abgewiesen.

## 9. Fehlercodes

`EINGABE_UNGUELTIG`, `LEER`, `DATEI_ZU_GROSS`, `ENTPACKT_ZU_GROSS`, `KOMPRESSION_VERDAECHTIG`, `ZU_VIELE_ZEILEN`, `ZU_VIELE_SPALTEN`, `ZU_VIELE_BLAETTER`,
`ZU_VIELE_ZELLEN`, `TEXT_ZU_GROSS`, `UNBEKANNTES_FORMAT`, `NICHT_UNTERSTUETZT`, `PASSWORTGESCHUETZT`, `BESCHAEDIGT`, `ZEITLIMIT`, `SPEICHERLIMIT`, `VERARBEITUNG_FEHLGESCHLAGEN`.

## 10. Sicherheitsregeln (verbindlich)

- Bibliothek: ausschließlich `vendor/sheetjs/xlsx.mjs` (SheetJS CE 0.20.3, Prüfsummen in `vendor/sheetjs/PRUEFSUMMEN.txt`); nie das npm-Paket `xlsx`; nur Lesen, kein Schreiben.
- Kein Nachladen aus dem Netz, keine Ausführung von Makros oder aktiven Inhalten, keine Auflösung externer Verweise.
- Der Parser trägt keine Dokumenteigenschaften, Formeln oder Stile in sein Ergebnis.
- Ergebnisse enthalten nur Daten und Hinweise; kein Inhalt der Datei wird als Code oder Schlüssel in Objekten verwendet.
