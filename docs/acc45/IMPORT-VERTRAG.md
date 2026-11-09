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
- `datumssystem` beschreibt das **Ergebnis** und ist bei Arbeitsmappen (`xlsx`, `xls`) immer `"1900"` (nach Umrechnung).
  `datumssystemQuelle: "1904"` steht zusätzlich nur bei Mappen im System 1904 (Herkunft, nur zur Information). Bei `csv`/`tsv`
  fehlen beide Felder (Text hat kein Datumssystem). Folgeschritte rechnen **nichts** um. Siehe 6.

## 2. Formate und Erkennung

| `format` | Erkennung (Inhalt, nicht Endung; Reihenfolge wie SheetJS `parse_zip`/`readSync`) |
|---|---|
| `xlsx` | ZIP (`PK\x03\x04`) ohne ODS-/Numbers-Merkmale, mit `[Content_Types].xml`, das **genau eine** Arbeitsmappe mit dem Typ `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml` (der xlsm-Typ `application/vnd.ms-excel.sheet.macroEnabled.main+xml` wird abgewiesen, siehe 8) deklariert; Pfad nicht auf `bin` endend und im Archiv vorhanden. Strikte Paketprüfung siehe 5. |
| `xls` | OLE2/CFB (`D0 CF 11 E0 A1 B1 1A E1`) mit plausibler CFB-Struktur (siehe 5a) und einem Strom `Workbook` oder `Book` |
| `csv` / `tsv` | reiner Text (keine NUL-Bytes, < 1 % Steuerzeichen), Trenner `;` `,` Tab automatisch (Tab bei Endung `.tsv`) |

**Nicht unterstützt** (`NICHT_UNTERSTUETZT`, Review 8725dc5, Entscheidungen E1/E3; Begründung in 11):
- **ODS / OpenDocument**: Eintrag `mimetype` (Tabelle oder anderes ODF-Dokument), `META-INF/manifest.xml` oder `objectdata.xml` im Archiv
  (so erkennt SheetJS ODS bzw. UOC). Meldung: „OpenDocument-Tabellen (ODS) werden derzeit nicht unterstützt; bitte als XLSX oder CSV speichern.“
- **xlsb**: Arbeitsmappen-Typ `…sheet.binary.macroEnabled.main`, ein Arbeitsmappenpfad auf `bin` (auch getarnt mit xlsx-Typ) oder ein Blatt, das auf
  einen `.bin`-Teil verweist.
- **Vorlagen und Add-ins**: Arbeitsmappen-Typ `…spreadsheetml.template.main+xml` (xltx) oder `…addin.macroEnabled.main+xml` (xlam).
- **Pakete mit unbekanntem Hauptinhaltstyp**: kein Arbeitsmappen-Override in `[Content_Types].xml` (z. B. Word, PowerPoint, Phantasietypen),
  ZIP ohne `[Content_Types].xml` (Numbers 08/09, verschachteltes `Index.zip`), Numbers (`Index/Document.iwa`).
- **OLE2 ohne Tabellenstrom** (Word, PowerPoint, Quattro Pro), XML/HTML, ZIP64, mehrteilige Archive.

Alles Unbekannte ergibt `UNBEKANNTES_FORMAT`. Weicht die Endung vom erkannten Format ab, wird trotzdem nach Inhalt gelesen und der Hinweis
`ENDUNG_ABWEICHEND` gesetzt (die Endung erscheint darin höchstens mit 10 Zeichen).
**Abgleich nach dem Lesen**: SheetJS muss im erkannten Format gelesen haben (`bookType` `"xlsx"` bei xlsx, kein `bookType` bei xls); sonst
`BESCHAEDIGT`. Bei xlsx muss jedes Blatt der Mappe gelesen worden sein; ein nicht lesbares Blatt wird nicht still leer geliefert (`BESCHAEDIGT`,
bzw. `NICHT_UNTERSTUETZT`, wenn es auf einen `.bin`-Teil verwies).
CSV: UTF-8 (BOM wird entfernt); ist der Text kein gültiges UTF-8, wird Windows-1252 angenommen (Hinweis `ZEICHENSATZ_ERSATZ`).
CSV-Anführungszeichen nach RFC 4180 (Trenner und Zeilenumbrüche in Anführungszeichen, `""` als Anführungszeichen). Blattname bei CSV/TSV: `Tabelle1`.

## 3. Grenzen (technische Schutzgrenzen, keine Geschäftsregeln)

| Schlüssel | Standard | Begründung |
|---|---|---|
| `dateiBytes` | 10 MB | Eine Personal-/Dienstetabelle mit 20.000 Zeilen belegt weit weniger; größere Uploads sind fast immer Fehlgriffe oder Angriffe. |
| `entpacktBytes` | 100 MB | Summe der erklärten **und** der tatsächlich entpackten Größen aller Archiv-Einträge (xlsx ist ZIP); bei xls Summe der erklärten Stromgrößen im CFB-Verzeichnis (5a). Schützt vor ZIP-Bomben, auch außerhalb des JS-Heaps (Buffer). |
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
Ergebnisses: jede Zelle (Text, Datums-/Fehlertext) höchstens `zellZeichen`, alle Texte zusammen (einschließlich Blattnamen **und aller
Hinweise**: `nachricht` und `blatt`, Review 8725dc5 E5) höchstens `entpacktBytes` Zeichen. Überschreitung → `TEXT_ZU_GROSS`, kein Teil-Ergebnis.

**Blattnamen** (Review 8725dc5, E5): höchstens 31 Zeichen (Excel-Regel). Ein längerer Name → `BESCHAEDIGT`, geprüft direkt nach dem Lesen und
bevor ein Name in einen Hinweis oder Fehlertext gelangt; die Meldung nennt den Namen nicht. Hinweise und Fehlertexte enthalten damit nie einen
Blattnamen über 31 Zeichen.

Überschreitung → Fehlercode, kein Teil-Ergebnis. Hinweis zu `zeilen` bei xlsx/xls: zulässig sind Zeilen**positionen** bis
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
  - Fehlt `row r`, gilt (wie bei SheetJS) Vorgänger + 1.
  - **Spalten-Fallback** (Review 8725dc5, E7): SheetJS bestimmt die Spalte mit dem ungebundenen Muster `r="…"` über den ganzen Zelltext
    (also auch aus `xr="…"` oder aus einem Kindelement) und verwendet sie für Zellen ohne `r`-Attribut. Entscheidung (einfachster sicherer Weg):
    **ablehnen**. Mit `r`-Attribut muss der erste Treffer des Musters genau dessen Wert sein; ohne `r`-Attribut darf es keinen Treffer geben; die
    fortlaufende Spalte (Vorgänger + 1) bleibt ≤ `XFD`. Sonst `BESCHAEDIGT`.
- xlsx: **kein** `sheetRows` mehr; die Zahl der tatsächlich gelesenen Zeilen (`!data.length`) über der Grenze → `ZU_VIELE_ZEILEN`.
- xls: ohne `sheetRows` (die Dateigröße begrenzt die Zellzahl, BIFF8 hat höchstens 65.536 Zeilen); danach dieselbe Positionsprüfung.

## 4. Zeit- und Speichergrenzen

Das Entpacken und Lesen ist rechenintensiv und synchron. Liefe es im Hauptthread des Servers, würde eine große oder präparierte Datei alle anderen
Anfragen blockieren. Deshalb läuft die gesamte Verarbeitung (Formaterkennung, Entpackprüfung, SheetJS, CSV) in einem **eigenen Worker-Thread**:

- Zeitlimit `zeitMs`: Überschreitung beendet den Worker hart (`terminate`) → Code `ZEITLIMIT`. Der Hauptthread bleibt ansprechbar.
- Speicherlimit des Workers (`maxOldGenerationSizeMb` 768): Überschreitung beendet nur den Worker → Code `SPEICHERLIMIT`.
- Vorab im Hauptthread nur billige Prüfungen: Eingabe vorhanden, nicht leer, `dateiBytes`.

## 5. ZIP-Prüfung (xlsx) vor der Übergabe an SheetJS

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
6. **Strikte Paketprüfung** (Review 8725dc5, E3/E4/E6), vor SheetJS:
   - Formatbestimmung wie SheetJS (siehe 2); `[Content_Types].xml` wird wie `parse_ct` gelesen (Namensraum
     `http://schemas.openxmlformats.org/package/2006/content-types`, sonst `BESCHAEDIGT`; doppelte Attribute → `BESCHAEDIGT`).
   - **Teile mit Endung `.bin`** (ohne Groß-/Kleinschreibung) liest SheetJS binär (`parse_ws_bin`, `parse_sst_bin`, …). Sie werden **nicht** in das
     saubere Archiv übernommen (vbaProject.bin, printerSettings, eingebettete Objekte braucht das Lesen der Tabellendaten nicht). Verweist ein Blatt
     darauf, ist es nicht lesbar → `NICHT_UNTERSTUETZT`.
   - **Kodierung** (E6): Jeder andere Teil, der mit einer UTF-16-BOM beginnt (SheetJS `cc2str` dekodiert dann UTF-16: `FF FE` an 0, `FE FF` an 1),
     → `BESCHAEDIGT`. Jeder XML-artige Teil (beginnt nach optionaler UTF-8-BOM mit `<`) und jeder Teil mit `sheetData` muss gültiges UTF-8 sein; eine
     XML-Deklaration mit anderer Kodierung als UTF-8 → `BESCHAEDIGT`. Die UTF-8-BOM ist zulässig.
   - **Blätter** (E4): Jeder Teil mit `sheetData`-Inhalt wird als Blatt streng geprüft (siehe 3), **unabhängig von Name und Endung** (SheetJS liest
     Blätter über die Beziehungen der Arbeitsmappe, z. B. `worksheets/sheet1.dat`). Ein Teil, der die Prüfung nicht besteht, erreicht SheetJS nicht:
     die Datei wird abgewiesen.
   - Befunde der Inhaltsprüfung werden nach der Formatbestimmung gemeldet (eine ODS-Datei ergibt also immer `NICHT_UNTERSTUETZT`).

## 5a. CFB-Prüfung (xls) vor der Übergabe an SheetJS

Review 8725dc5, E2: XLS (binär, CFB) bleibt unterstützt, wenn die CFB-Struktur plausibel ist; keine XML-Vorprüfung. Geprüft wird nach dem Aufbau
von `CFB.parse` in `vendor/sheetjs/xlsx.mjs`, alles vor SheetJS:

- **Kopf**: Signatur; Version 3 mit Sektorgröße 512 oder Version 4 mit 4096; Mini-Sektor 64; reservierte Bytes 0; Grenze für Mini-Ströme 4096;
  Zahl der FAT-, DIFAT- und Mini-FAT-Sektoren im Bereich der Datei; Verzeichnisbeginn in der Datei; mindestens 2 Sektoren.
- **Sektorketten** (Verzeichnis, Mini-FAT, Mini-Strom, jeder Strom ab 4096 Byte) laufen nur über vorhandene Sektoren, **ohne Zyklus** und ohne
  Sektoren, die schon zu einer anderen Kette gehören. Hintergrund: SheetJS (`get_sector_list`) folgt der Kette eines Stroms, der mitten in einer
  anderen Kette beginnt, ohne Zykluserkennung (Endlosschleife bis Zeit-/Speicherlimit).
- **Größenbudget vor dem Lesen**: jede Stromgröße ab 4096 Byte passt in ihre Kette (Sektoren × Sektorgröße); die Summe aller erklärten
  Stromgrößen ≤ `entpacktBytes` (sonst `ENTPACKT_ZU_GROSS`).
- Der erste Verzeichniseintrag ist der Stammeintrag; es gibt einen Strom `Workbook` oder `Book` (sonst `NICHT_UNTERSTUETZT`).
- Widerspruch → `BESCHAEDIGT`. Verschlüsselte Dateien (`EncryptedPackage`, `EncryptionInfo`) → `PASSWORTGESCHUETZT` (vor der Strukturprüfung).

## 6. Zellwerte (Rohwerte)

Jede Zeile ist ein Array gleicher Länge (rechteckig). Eine Zelle ist:

| Wert | Bedeutung |
|---|---|
| `null` | leer |
| `string` | Text (CSV: **jeder** Wert ist Text, auch Zahlen und Datumsangaben; führende Nullen bleiben) |
| `number` | Zahl (xlsx/xls) |
| `boolean` | Wahrheitswert |
| `{ typ:"datum", roh:<Zahl>, text:<string> }` | Datumszelle: Rohwert (Excel-Seriennummer, **immer im Datumssystem 1900**) plus so angezeigter Text; IMP-1 prüft daraus Gültigkeit und Zeitzone |
| `{ typ:"fehler", text:"#DIV/0!" }` | Fehlerzelle, nicht endliche Zahl |

**Datumssystem** (Review PR #123, Befund 3; präzisiert durch Review 1da3ceb, H1): Excel-Arbeitsmappen speichern Datumswerte als Seriennummer
im System 1900 (Standard) oder 1904 (ältere Mac-Dateien; Seriennummer 0 = 01.01.1904). Der Parser ist die **einzige** Stelle, die umrechnet:

- Er liest das System aus der Arbeitsmappe (`Workbook.WBProps.date1904`). Bei 1904 wird `roh` jeder Zelle mit **Datumsformat** genau einmal um
  1.462 Tage auf das System 1900 normiert; Hinweis `DATUMSSYSTEM_1904`, Ergebnisfelder `datumssystem: "1900"`, `datumssystemQuelle: "1904"`.
- **Datumsformat** heißt: das Zahlenformat enthält einen Datumsteil (Tag `d`, Jahr `y`/`e`/`b`, Ära `g` oder Monat `m` — `m` gilt als Monat bei
  drei oder mehr `m` oder wenn das Format keine Stunden/Sekunden enthält). **Zeit- und Dauerformate** (`hh:mm`, `[h]:mm`, `mm:ss`, `h:mm AM/PM`)
  werden **nicht** verschoben, auch wenn sie als `{ typ:"datum" }` geliefert werden: ihr Wert ist ein Tagesbruchteil bzw. eine
  Dauer und hängt nicht vom Datumssystem ab (06:00 bleibt `roh: 0.25`). Datum mit Uhrzeit wird als Ganzes verschoben.
- **Bewusst so festgelegt** (Review 8725dc5): Entscheidend ist allein das Format, nicht der Wert. Eine Zelle mit `v ≥ 1` (also mit
  echtem Tagesanteil) und einem reinen Zeitformat ohne Datumsteil wird in einer 1904-Mappe **nicht** verschoben (`roh` bleibt der Wert der
  Datei, z. B. 45306,25 mit `hh:mm`); dieselbe Zahl mit `dd.mm.yyyy hh:mm` wird verschoben (45306,25 + 1462). Die Anzeige `text` zeigt in
  beiden Fällen nur, was das Format zeigt. Folgeschritte, die aus einer solchen Zelle ein Datum bilden wollten, müssen das Zeitformat beachten.
- Gewöhnliche Zahlen und Text werden nie umgerechnet. Eine xlsx-Zelle `t="d"` (ISO-Datum) **ohne** Datumsformat liefert SheetJS als Zahl im
  System der Mappe; sie bleibt eine unveränderte Zahl (keine Umrechnung, kein `{ typ:"datum" }`).
- ODS (`<table:null-date>`) entfällt mit E1 (ODS wird nicht unterstützt); die frühere ODS-Prüfung ist aus dem Lesepfad entfernt.
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
(xlsm/vbaProject.bin, VBA in XLS: nichts wird ausgeführt oder übernommen), `EXTERNE_VERWEISE_IGNORIERT` (`xl/externalLinks`),
`EINGEBETTETE_OBJEKTE_IGNORIERT`, `AUSGEBLENDETES_BLATT` (Blatt wird trotzdem geliefert), `DATUMSSYSTEM_1904` (Datumswerte auf 1900 normiert, Zusatzfeld `datumssystemQuelle: "1904"`, siehe 6).
`MAKROS_VERWORFEN` wird nur bei echten Makro-Bestandteilen gesetzt: Eintrag `vbaProject.bin`, oder in `[Content_Types].xml`
ein `ContentType="application/vnd.ms-office.vbaProject"`. Die Arbeitsmappe mit Makro-Typ `application/vnd.ms-excel.sheet.macroEnabled.main+xml`
wird seit imp-2-fix4 nicht mehr mit Hinweis durchgelassen, sondern mit `NICHT_UNTERSTUETZT` abgewiesen (E4-Entscheidung).
Der allgemeine Standardeintrag `Default Extension="bin"` (`…macroEnabled.main`) zählt nicht.

**Spaltenzahl vor dem Ausbau** (Review PR #123, Punkt 6, nur dokumentiert): die Spaltengrenze wird erst nach dem Aufbau der Zeilen geprüft.
Ein Blatt mit Zellen in sehr weit rechts liegenden Spalten (xlsx bis `XFD`) erzeugt vorher lange Zeilen-Arrays.
Das ist durch Zeit-, Speicher- und Entpackgrenzen begrenzt (Ergebnis dann `ZEITLIMIT`/`SPEICHERLIMIT`, nie ein Teilergebnis), aber nicht vorab abgewiesen.

## 9. Fehlercodes

`EINGABE_UNGUELTIG`, `LEER`, `DATEI_ZU_GROSS`, `ENTPACKT_ZU_GROSS`, `KOMPRESSION_VERDAECHTIG`, `ZU_VIELE_ZEILEN`, `ZU_VIELE_SPALTEN`, `ZU_VIELE_BLAETTER`,
`ZU_VIELE_ZELLEN`, `TEXT_ZU_GROSS`, `UNBEKANNTES_FORMAT`, `NICHT_UNTERSTUETZT`, `PASSWORTGESCHUETZT`, `BESCHAEDIGT`, `ZEITLIMIT`, `SPEICHERLIMIT`, `VERARBEITUNG_FEHLGESCHLAGEN`.

**Für IMP-3 (nur benannt, dort umzusetzen):** Der Import-Endpunkt muss `TEXT_ZU_GROSS` aus diesem Vertrag sowie seinen eigenen Code
`ZU_VIEL_GLEICHZEITIG` (Begrenzung paralleler Parser-Läufe) in seinem Vertrag führen und verständlich anzeigen. Eine Datumsumrechnung in IMP-3 bleibt
entfernt (Branch `acc45/import/imp-3-datum`); maßgeblich ist allein `roh` im System 1900 (siehe 6).

## 10. Sicherheitsregeln (verbindlich)

- Bibliothek: ausschließlich `vendor/sheetjs/xlsx.mjs` (SheetJS CE 0.20.3, Prüfsummen in `vendor/sheetjs/PRUEFSUMMEN.txt`); nie das npm-Paket `xlsx`; nur Lesen, kein Schreiben.
- Kein Nachladen aus dem Netz, keine Ausführung von Makros oder aktiven Inhalten, keine Auflösung externer Verweise.
- Der Parser trägt keine Dokumenteigenschaften, Formeln oder Stile in sein Ergebnis.
- Ergebnisse enthalten nur Daten und Hinweise; kein Inhalt der Datei wird als Code oder Schlüssel in Objekten verwendet.

## 11. Nicht unterstützte Formate und Begründung (Review 8725dc5)

- **ODS (E1)**: Der Auftrag verlangt ODS nur, soweit technisch zuverlässig. Das Sicherheitsreview von 8725dc5 zeigte, dass die Prüfung von
  ODS-Paketen nicht zuverlässig genug ist: SheetJS wählt den ODS-Leser schon bei `META-INF/manifest.xml` oder `objectdata.xml` (getarnte ODS in
  einer xlsx), das Datumssystem (`null-date`) und die Tabellen-Elemente lassen sich über Präfixe/Unicode und Aliasse an der Vorprüfung vorbei
  formulieren. Eine Vorprüfung, die dem ODS-Lesepfad (`parse_content_xml`) in allen Varianten genau folgt, wäre ein zweiter ODS-Parser.
  Deshalb: ODS → `NICHT_UNTERSTUETZT` mit der Meldung „OpenDocument-Tabellen (ODS) werden derzeit nicht unterstützt; bitte als XLSX oder CSV
  speichern.“ Die ODS-spezifischen Prüfungen (null-date, Blattnamen-Entitäten, `sheetRows` für ODS) sind aus dem Lesepfad entfernt.
- **xlsb, Vorlagen, Add-ins, Numbers, unbekannte Hauptinhaltstypen (E3)**: binäre bzw. nicht vorgeprüfte Lesepfade von SheetJS.
- **Makro-Arbeitsmappen (xlsm, E4-Entscheidung, imp-2-fix4)** werden abgewiesen: `NICHT_UNTERSTUETZT`, Meldung „Dateien mit Makros (xlsm) werden nicht gelesen. Bitte die Datei als .xlsx speichern (Makros entfernen).“ Keine Datenübernahme, kein Teilergebnis; eine Datei mit Makro-Typ wird nie Datenquelle. Der Hinweis `MAKROS_VERWORFEN` bleibt nur für Makro-Bestandteile in Dateien ohne Makro-Arbeitsmappentyp (siehe 8).
- **xls (E2)** bleibt unterstützt, nur mit plausibler CFB-Struktur (5a).
