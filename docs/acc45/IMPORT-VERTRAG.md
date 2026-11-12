# IMPORT-VERTRAG — Parser-Vertrag (IMP-0, Teil Parser; umgesetzt in IMP-2)

Stand: 2026-11-09. Umsetzung: `server/lib/import/parser.mjs` (Schnittstelle), `parser-kern.mjs`, `parser-prozess.mjs` (Kindprozess), `parser-worker.mjs` (Kindskript).
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
| `xls` | OLE2/CFB (`D0 CF 11 E0 A1 B1 1A E1`) mit plausibler CFB-Struktur (siehe 5a) und einem Tabellenstrom, den SheetJS selbst wählt: `CFB.find("/Workbook")`, sonst `CFB.find("/Book")` (exakter Pfad direkt unter der Wurzel; Großschreibung und Namenslänge wie SheetJS); genau ein Treffer, Typ Strom, mit Inhalt (Länge > 0). Siehe 5a (Review 561dd32, H2) |
| `csv` / `tsv` | reiner Text (keine NUL-Bytes, < 1 % Steuerzeichen), Trenner `;` `,` Tab automatisch (Tab bei Endung `.tsv`) |

**Nicht unterstützt** (`NICHT_UNTERSTUETZT`, Review 8725dc5, Entscheidungen E1/E3; Begründung in 11):
- **ODS / OpenDocument**: Eintrag `mimetype` (Tabelle oder anderes ODF-Dokument), `META-INF/manifest.xml` oder `objectdata.xml` im Archiv
  (so erkennt SheetJS ODS bzw. UOC). Meldung: „OpenDocument-Tabellen (ODS) werden derzeit nicht unterstützt; bitte als XLSX oder CSV speichern.“
- **xlsb**: Arbeitsmappen-Typ `…sheet.binary.macroEnabled.main`, ein Arbeitsmappenpfad auf `bin` (auch getarnt mit xlsx-Typ) oder ein Blatt, das auf
  einen `.bin`-Teil verweist.
- **Vorlagen und Add-ins**: Arbeitsmappen-Typ `…spreadsheetml.template.main+xml` (xltx) oder `…addin.macroEnabled.main+xml` (xlam).
- **Pakete mit unbekanntem Hauptinhaltstyp**: kein Arbeitsmappen-Override in `[Content_Types].xml` (z. B. Word, PowerPoint, Phantasietypen),
  ZIP ohne `[Content_Types].xml` (Numbers 08/09, verschachteltes `Index.zip`), Numbers (`Index/Document.iwa`).
- **OLE2 ohne Tabellenstrom `Workbook`/`Book` direkt unter der Wurzel** (Word, PowerPoint, Quattro Pro und Lotus mit `PerfectOffice_MAIN`, `NativeContent_MAIN`, `MN0`; ein Strom `Workbook` nur in einem Unterordner zählt nicht). Maßgeblich ist die Auswahl von SheetJS (`CFB.find`), kein eigener Namensvergleich:
  ein Name, den SheetJS nicht als `Workbook` findet (z. B. mit Kelvin-Zeichen U+212A oder mit überlanger Namenslänge), und ein gewählter Strom
  ohne Inhalt ergeben `NICHT_UNTERSTUETZT`; ein doppelter Tabellenstrom `BESCHAEDIGT` (Review 561dd32, H2a–d). XML/HTML, ZIP64, mehrteilige Archive.

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

**Textmenge** (Review 1da3ceb, H2): Ein Eintrag der gemeinsamen Textliste (`sharedStrings`) ist im Parser ein einziger String, auf den beliebig
viele Zellen verweisen können; `postMessage` kopiert ihn aber je Zelle in den Hauptthread (gemessen: 1,1-MB-Datei mit 1.000 Verweisen auf
einen 1,5-Mio.-Zeichen-Text → 1,5 Mrd. Zeichen, ca. 1,4 GB im Hauptthread; seit Review 561dd32 gilt dasselbe für die JSON-Ausgabe des Kindprozesses). Deshalb zählt das Kindskript **vor** der Ausgabe die Zeichen des
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

Das Entpacken und Lesen ist rechenintensiv und synchron. Liefe es im Server-Prozess, würde eine große oder präparierte Datei alle anderen
Anfragen blockieren oder den Server-Prozess mit Speicher außerhalb des JS-Heaps (Buffer) überlasten. Deshalb läuft die gesamte Verarbeitung
(Formaterkennung, Entpackprüfung, CFB-Prüfung, SheetJS, CSV, Textmengen- und Zeilenprüfung) seit Review 561dd32 (H1, Entscheidung E-A) in einem
**eigenen Kindprozess**: `parser-prozess.mjs` startet `parser-worker.mjs` mit derselben Node-Binärdatei. Vorher lief sie in einem Worker-Thread
im Server-Prozess; dessen Heap-Grenze erfasste Buffer-Speicher nicht (gemessen: 1,4-MB-Datei → ca. 2 GB im Server-Prozess, siehe Nachweis §11).

- Start ohne Shell-Option von `spawn`, mit festen Argumenten, ohne die Umgebungsvariablen des Servers (insb. ohne `NODE_OPTIONS`),
  zusätzlich `--disallow-code-generation-from-strings`.
- Wandzeit `zeitMs` (Standard 20 s): Überschreitung → das Kind wird hart beendet (`SIGKILL`) → Code `ZEITLIMIT`, kein Teil-Ergebnis.
- Heap des Kindes `--max-old-space-size=256` (256 MB). Überlauf beendet nur das Kind → Code `SPEICHERLIMIT`.
- **Linux**: zusätzlich Adressraum-Limit über die Shell (`/bin/sh -c 'ulimit -v …; exec node …'`), Standard 1.500.000 KB, einstellbar über
  `CENTRIC_IMPORT_ADRESSRAUM_KB` (0 = aus). Lässt sich das Limit nicht setzen, wird die Datei nicht verarbeitet (`VERARBEITUNG_FEHLGESCHLAGEN`,
  fail closed). **Windows und macOS (nur Entwicklung): ohne Adressraum-Limit.**
- Übergabe: Eingabe über stdin, Ergebnis über stdout als JSON, höchstens 128 MB (darüber Kill → `TEXT_ZU_GROSS`). Der Server lässt nur die Form
  dieses Vertrags durch: bei `ok:false` ausschließlich `code` und `nachricht` (kein Teil-Ergebnis), bei `ok:true` ein Objekt mit `format`,
  `blaetter` und `hinweise`; alles andere → `VERARBEITUNG_FEHLGESCHLAGEN`. stderr dient nur der Einordnung eines Abbruchs und wird verworfen.
- Absturz des Kindes (Heap-Überlauf, nativer Abbruch, Kill durch das System): der Server-Prozess läuft weiter und antwortet mit `SPEICHERLIMIT`
  bzw. `VERARBEITUNG_FEHLGESCHLAGEN`. Jedes Kind wird beendet und von Node eingesammelt (kein Zombie).
- Vorab im Server-Prozess nur billige Prüfungen: Eingabe vorhanden, nicht leer, `dateiBytes`.
- Kosten: Prozessstart und Laden von SheetJS je Datei ca. 0,3–0,6 s zusätzlich (Messung Windows-Entwicklungsrechner).

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
   (entpackte Einträge und neues Archiv), danach werden die Einzelpuffer freigegeben. Das Ganze läuft im Kindprozess (siehe 4).
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
- **Alle Sektorketten zusammen** (Review 561dd32, K2, Entscheidung E-C): SheetJS (`make_sector_list`) folgt beim Öffnen der FAT-Kette **jedes**
  Sektors, auch freier und im Verzeichnis nicht genannter Sektoren, und kopiert jede Kette (bricht nur bei einer Schleife innerhalb einer Kette ab,
  nicht bei bereits gelesenen Sektoren). Die Vorprüfung rechnet diesen Durchlauf genau nach (Reihenfolge ab Verzeichnisbeginn, dieselben
  Abbruchregeln, Bytes jenseits des Dateiendes als 0 wie `__readInt32LE`): die **Summe aller Kettenlängen ≤ 4 × Sektorzahl**, sonst `BESCHAEDIGT`.
  Ein Kettenverweis auf einen Sektor außerhalb der Datei → `BESCHAEDIGT` (SheetJS bricht dort ebenfalls ab). Gültige Dateien kommen auf etwa
  1 × Sektorzahl. Folge: eine einzelne rückwärts verkettete Kette ist nur bis etwa √(6 × Sektorzahl) Sektoren zulässig (Datei mit ca. 430 Sektoren:
  bis ca. 50 Sektoren rückwärts; geprüft mit 40); ob echte Excel-/LibreOffice-Dateien so etwas enthalten, ist mangels Originaldateien im Repo noch nicht geprüft.
- **Größenbudget vor dem Lesen**: jede Stromgröße ab 4096 Byte passt in ihre Kette (Sektoren × Sektorgröße); die Summe aller erklärten
  Stromgrößen ≤ `entpacktBytes` (sonst `ENTPACKT_ZU_GROSS`).
- **Verzeichnisbaum** (imp-2-fix5, A1; vervollständigt in Review 561dd32, K1, Entscheidung E-B): SheetJS (`build_full_paths`) durchläuft den Baum
  über **alle** Einträge (auch unbenutzte, Typ 0, und von der Wurzel aus nicht erreichbare), ohne Zykluserkennung. Deshalb:
  - die Zeiger links, rechts und Kind **jedes** Eintrags zeigen auf einen vorhandenen Eintrag oder sind -1 (NOSTREAM);
  - der Durchlauf von `build_full_paths` wird nachgerechnet (Warteschlange, dad-Zuordnung, dad-Ketten; ohne Pfadtexte): Warteschlange
    länger als 4 × Eintragszahl oder mehr als 4 × Eintragszahl Schritte in den dad-Ketten (Schleife) → `BESCHAEDIGT`. Gemessen: von SheetJS
    geschriebene Dateien 1,0 ×, entarteter (links absteigender) Baum bis 1,94 ×, ausgeglichene Bäume in gemischter Reihenfolge bis 1,94 ×
    (Warteschlange); dad-Schritte ≤ 1 × Eintragszahl;
  - zusätzlich (wie bisher) jeder Eintrag von der Wurzel aus höchstens einmal erreichbar, kein erreichbarer unbenutzter Eintrag.
  Ein Eintrag mit Größe < 0 und Start < 0 gilt wie in `read_directory` als unbenutzt.
- **Tabellenstrom** (Review 561dd32, H2, Entscheidung E-D): erst nach bestandener Strukturprüfung liest der Parser den Container mit `CFB.read`
  (dieselbe Funktion, die `XLSX.read` aufruft) und wählt den Strom genau wie `parse_xlscfb`: `CFB.find(cfb, "/Workbook")`, sonst
  `CFB.find(cfb, "/Book")`. Der Treffer muss eindeutig sein (alle Einträge, die `CFB.find` für den Pfad treffen könnte, auch über dessen
  Ersatzregeln für U+0000–U+0006; mehr als einer → `BESCHAEDIGT`), ein Strom (Typ 2) sein und Inhalt haben (Länge > 0; ein Eintrag mit Start -2
  und Größe > 0 hat keinen Inhalt). Sonst `NICHT_UNTERSTUETZT`. Gegenprobe: die eigene Auswahl muss dasselbe Objekt sein, das `CFB.find` liefert,
  sonst `BESCHAEDIGT`. Damit gelten Großschreibung (Kelvin-Zeichen U+212A wird nicht zu „K“) und volle Namenslänge wie bei SheetJS; ein Strom
  gleichen Namens in einem Unterordner zählt weiterhin nicht (Quattro Pro/Lotus mit `PerfectOffice_MAIN`, `NativeContent_MAIN` oder `MN0` wird
  nicht als XLS gelesen).
- Widerspruch → `BESCHAEDIGT`. Verschlüsselte Dateien (`EncryptedPackage`, `EncryptionInfo` als Bytes vor der Strukturprüfung; nach `CFB.read`
  zusätzlich `CFB.find("EncryptedPackage")` bzw. `/encryption`) → `PASSWORTGESCHUETZT`.

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

### 9a. Endpunkt /api/import: Statuscodes und Fehlerschlüssel (Stand server/funktionen/import.mjs)

Alle Wege (`/api/import/upload`, `analyse`, `vorschau`, `uebernahme`, `verwerfen`) sind POST mit Sitzung. Fehlerantworten sind JSON
`{ fehler, code, … }`; die Ausnahmen sind unten vermerkt. Die Reihenfolge der Prüfung ist die der Tabelle von oben nach unten.

**Server-Schalter `CENTRIC_IMPORT_AKTIV`** (Vorgabe aus; nur genau `"true"` schaltet ein): Ist er aus, antworten alle fünf Wege für jede Rolle und
auch ohne Sitzung mit **404** und `{ "fehler": "Gibt es nicht." }` (ohne `code`), und zwar vor Methode, Herkunft, Sitzung und Rumpf
(`server.mjs` prüft denselben Schalter über `config.aktiv` schon vor dem Einlesen). Die Oberfläche hat ihren eigenen Schalter
`IMPORT_DATEI_AKTIV` (Vorgabe false); keiner von beiden ist eingeschaltet.

| Status | code | Weg | Bedeutung |
|---|---|---|---|
| 404 | (ohne code) | alle | Serverschalter aus |
| 405 | (ohne Rumpf, Kopf `Allow: POST`) | alle | Methode nicht POST |
| 403 | `HERKUNFT` | alle | Anfrage kommt nicht von der Anwendung |
| 401 | `NICHT_ANGEMELDET` | alle | keine Sitzung |
| 403 | `KEINE_BERECHTIGUNG` | alle | nur Leitung und Planung mit vollem Schreibumfang; Betreiber, Rückfallrolle „kunde", Schichtverantwortung, Beschäftigte, Betriebsrat abgewiesen; auch bei der Übernahme, falls die Rolle dort nicht zulässig ist |
| 404 | `NICHT_GEFUNDEN` | alle | kein eigener Betrieb in der Sitzung; Vorgang unbekannt oder gehört einem anderen Betrieb, Raum oder einer anderen Person |
| 400 | `ART_UNBEKANNT` | upload | `art` weder `personal` noch `schichtzyklus` |
| 415 | `FORMAT_DER_ANFRAGE` | upload | Inhaltstyp nicht `application/octet-stream` |
| 413 | `DATEI_ZU_GROSS` | upload | größer als 10 MB (Kopf `Content-Length` oder Parser) |
| 429 | (ohne code; `fehler: "zu viele Anfragen"`, `wartet`, Kopf `Retry-After`) | upload, uebernahme | allgemeine Bremse „schreiben" |
| 429 | `ZU_VIELE_VORGAENGE` | upload | Vorgangsgrenze (je Raum und gesamt) erreicht |
| 503 | `ZU_VIEL_GLEICHZEITIG` (Kopf `Retry-After: 5`) | upload | Parser des Raums oder prozessweit belegt |
| 422 | Parsercode aus 9 (außer `DATEI_ZU_GROSS`, siehe 413) | upload | Datei nicht lesbar oder nicht unterstützt, kein Teilergebnis |
| 201 | – | upload | Vorgang angelegt: `vorgang`, `art`, `format`, `blaetter`, `vorgabeBlatt`, `hinweise`, `gueltigBis`, `inaktivMinuten` |
| 400 | `RUMPF_UNGUELTIG` | analyse, vorschau, uebernahme, verwerfen | kein JSON-Objekt oder größer als 2 MB |
| 200 | – | verwerfen | `{ ok: true }`, Vorgang gelöscht |
| 409 | `BEREITS_UEBERNOMMEN` | analyse, vorschau, uebernahme | Vorgang schon übernommen (`ergebnis`) |
| 409 | `UEBERNAHME_LAEUFT` | analyse, vorschau | Übernahme dieses Vorgangs läuft |
| 422 | `BLATT_UNGUELTIG` | analyse | Blattindex nicht vorhanden |
| 422 | `ZUORDNUNG_UNGUELTIG` | analyse, vorschau | Spaltenzuordnung ungültig |
| 409 | `ANALYSE_FEHLT` | vorschau | Analyse noch nicht ausgeführt |
| 422 | `PFLICHTSPALTE_FEHLT` | vorschau | Pflichtspalte nicht zugeordnet (`fehlendePflicht`) |
| 422 | `ENTSCHEIDUNG_UNZULAESSIG`, `AKTUALISIERUNG_OHNE_BESTAETIGUNG`, `ZUORDNUNGSKONFLIKT` | vorschau | Entscheidungen passen nicht zu den Datensätzen (`datensaetze`) oder Einheit, Standort, Qualifikation fehlt ohne Anlegen |
| 403 | `ORG_EDIT_FEHLT` | vorschau | Einheiten, Standorte oder Qualifikationen anlegen ohne Recht `org.edit` (Leitung) |
| 422 | `ART_NICHT_FREIGEGEBEN` | uebernahme | Art `schichtzyklus` wird nicht übernommen |
| 409 | `VORSCHAU_FEHLT`, `BESTAETIGUNG_UNGUELTIG`, `LAEUFT_BEREITS`, `VORSCHAU_VERALTET` | uebernahme | keine Vorschau, keine oder veraltete Bestätigung, Übernahme läuft; `VORSCHAU_VERALTET` auch, wenn sich der Bestand seit der Vorschau änderte |
| 409 | `DATEI_BEREITS_UEBERNOMMEN`, `FACHPRUEFUNG`, `KONFLIKT` | uebernahme | gleiche Datei schon übernommen (`frueher`), Prüfbefunde, gleichzeitige Änderung; jeweils nichts geändert |
| 422 | `NICHTS_ZU_UEBERNEHMEN`, `STANDORT_UNGUELTIG`, `GESTALT` | uebernahme | nichts übrig, ungültiger Standort, unvollständiger neuer Stand |
| 500 | `UEBERNAHME_ABGEBROCHEN`, `INTERNE_PRUEFUNG`, `SCHREIBEN_UNKLAR` | uebernahme | Übernahme nicht ausgeführt; `SCHREIBEN_UNKLAR`: Bestand vor erneutem Versuch prüfen |
| 503 | `SCHREIBEN_FEHLGESCHLAGEN` | uebernahme | Schreiben fehlgeschlagen, nichts geändert |
| 200 | – | analyse, vorschau, uebernahme | Erfolg (Übernahme: `{ ok, zaehler, etag }`) |
| 503 | `VORUEBERGEHEND` | alle | Speicher vorübergehend nicht verfügbar |
| 500 | `INTERNER_FEHLER` | alle | unerwarteter Fehler, nichts übernommen, kein Stacktrace |

Schichtzyklen (`art=schichtzyklus`): Upload und Analyse liefern 200/201 mit `unterstuetzt: false` und den Hinweis, dass sie mit IMP-6 übernommen werden; die Vorschau ist
leer (`bereit: false`), die Übernahme antwortet 422 `ART_NICHT_FREIGEGEBEN`. IMP-6 ist nur Bibliothek (`server/lib/import/schichtmodelle.mjs`), nicht an den Endpunkt oder die Oberfläche angeschlossen.

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

## 12. Organisationseinheiten im Import (IMP-5)

Umsetzung: `server/lib/import/org.mjs` (rein), eingebunden in `personen.mjs` und `uebernahme.mjs`. Prüfung: `pruefungen/import-org-imp5.test.js` (`npm run pruefung:import-org`).

- **Teams** = Einheiten, **Standorte**, **Qualifikationen** (neue Spalte „Qualifikationen“, Trenner `,` `;` `|`, höchstens 20 je Zelle, je Eintrag höchstens 100 Zeichen). **Bekannte Grenze:** Ein Qualifikationsname, der selbst ein Komma, Semikolon oder einen senkrechten Strich enthält, ist nicht importierbar; er wird getrennt und bleibt ein Zuordnungskonflikt (die Leitung legt ihn vorher im Betrieb an und ordnet nach Kürzel zu).
- Zugeordnet wird nach Name, bei Qualifikationen auch nach Kürzel. Der Vergleich normalisiert (Unicode NFKC, ohne Null-Breite-/weiche-Trennung-/Richtungszeichen, Leerraum zusammengefasst, ohne Groß-/Kleinschreibung): „Müller“ in NFD und in NFC ist derselbe Name und erzeugt kein Duplikat; gespeichert wird die bereinigte NFC-Form. Unbekanntes ist ein **Zuordnungskonflikt**
  (`einheit-unbekannt`, `standort-unbekannt`, `qualifikation-unbekannt`; der Konflikt nennt nie den Wert). Der Datensatz bleibt offen („klären“).
  Trifft ein Name mehrere Qualifikationen, gilt `qualifikation-mehrdeutig`: nie „die erste“ wählen, und Anlegen löst das nicht.
- **Planung allein erzeugt keine Einheiten.** Angelegt wird nur, wenn die Person ausdrücklich `einheitenAnlegen: true` verlangt (der Schalter gilt für alle drei Arten) **und** `org.edit` hat
  (Leitung, bestehendes Recht, kein neues). Ohne `org.edit`: 403 `ORG_EDIT_FEHLT`, Planung und Übernahme schreiben nichts davon. Dieselbe Prüfung steht zusätzlich in `orgAnlegen`/`anwenden` (wirft ohne `org.edit`) und in `nurGeplant` (der Betrieb darf nur um genau die geplanten Einheiten, Standorte, Qualifikationen wachsen).
- **Qualifikationen ohne Sonderstatus:** vom Import angelegt, aber nie Fachkraft, nie harte Sperre, nie nachweispflichtig, unbefristet; die Leitung stellt rechtlich Bedeutsames danach selbst ein. Eine Qualifikation wird nur **neuen** Personen zugeordnet, `aktualisieren` ändert sie nie (bewusst konservativ, Freigabe offen).
- Vorschau und Übernahme führen `neueQualifikationen` (Namen) und die Zahl `zaehler.neueQualifikationen`.
- **Anzeige vor der Bestätigung:** Analyse (`datensaetze[].qualifikationen`) und Vorschau (`vorschau.neu[].qualifikationen`) zeigen je neuer Person die zugeordneten Qualifikationen mit Name, Kürzel, `fachkraft`, `nachweisPflicht`, `harteSperre` und `neu` (wird mit org.edit neu angelegt) oder bestehend. Dieselben Daten gehen in den Bestätigungs-Hash ein: ändert sich ein Kennzeichen zwischen Vorschau und Übernahme, ist die Bestätigung veraltet (409 `VORSCHAU_VERALTET`). So sieht die Person, die bestätigt, wenn eine neue Person eine bestehende Fachkraft- oder nachweispflichtige Qualifikation bekäme.

## 13. KI-Schnittstelle (IMP-9, austauschbar, ohne Aktivierung)

Umsetzung: `server/lib/import/ki-schnittstelle.mjs`. Prüfung: `pruefungen/import-ki-schnittstelle-imp9.test.js` (`npm run pruefung:import-ki`).
**Nicht verdrahtet:** kein Import-Modul, kein Endpunkt, kein Server ruft sie auf (Quelltextprüfung); der deterministische Import ist unabhängig von der KI.

- **Port** `erzeugeKiPort({ anbieter, konfig, schalter })`; Vorgabe `KI_PORT_AUS` (kein Anbieter, beide Schalter „aus“). Der Anbieter ist ein Adapter nach `intelligence/gateway/anbieter.mjs`. Kein Netz, keine Umgebung, kein Schlüssel im Modul.
- **Freigabe, alles oder nichts, bei jedem Aufruf:** Notschalter beider Ebenen `"an"` (`gatewayAn`) **und** Freigabe-Gate (`freigabe`, `monatsbudget` > 0, bestätigter AV-Vertrag mit Datum, `freigabeGate`) **und** ein protokollierter Vermerk
  `vermerk: { e25: "erteilt", e26: "erteilt", zweck: "import-spaltenzuordnung", anbieterId, modellOrt, datum }` zu **E-25** (Anbieter, AVV, ZDR, Drittland) und **E-26** (DSFA), gebunden an Anbieter, Modellort und Zweck. Sonst Code `KI_AUS`/`KI_NICHT_FREIGEGEBEN`, der Anbieter wird nicht berührt.
- **Minimierung (tatsächliche Garantie):** an den Anbieter gehen nur Spalten **ohne** Zuordnung: Index, eine Überschrift und auf Verlangen höchstens 3 **Formmasken** (`Aa, Aa`, `9.9.9`), nie Zeilen oder Zellwerte.
  Die Überschrift steht **nur dann im Klartext**, wenn sie ein Wort des **festen Import-Vokabulars** ist (die Überschriften-Synonyme aus `personen.mjs`, `FELD_SYNONYME`: u. a. Personalnummer, Nachname, Vorname, Einheit, Team, Standort, Wochenstunden, Eintritt, Qualifikation) **und** die Datei eine erkannte Kopfzeile hat (mindestens zwei Spalten mit genauem Synonym-Treffer). **Jede andere Überschrift** (ein Name, ein Ort, eine Einheit, eine Konfession, ein Tippfehler, die erste Datenzeile einer Datei ohne Kopfzeile) wird durch den Platzhalter „Spalte N“ ersetzt. Das gilt **unabhängig von der Sperrliste**: Sie kennt nur bereits gespeicherte Personen des Betriebs, nie die Personen der Importdatei, und ist deshalb nur die **zweite** Schranke (Leck-Prüfung jeder Spalte und des ganzen Pakets; ohne Sperrliste kein Aufruf, `KI_LECK`). Eine Formmaske verrät nur Zeichenklassen und Satzzeichen (keine Buchstaben, keine Ziffern, keine Länge); sie ist keine Anonymisierung der Struktur. Es gibt keinen Modus, der Personendaten freigibt.
- **Ergebnis-Schema** (streng, genau diese Form, sonst wird die ganze Antwort verworfen): `{ version: "1", vorschlaege: [{ spalte, feld, konfidenz }], unsicherheiten?: [{ spalte, grund, alternativen? }], validierungsfehler?: [{ code, spalte? }] }`; kein Freitext, höchstens 16 KiB.
- **Nur Vorschlag:** `bestaetigt: false`, `autoAnwenden: false`. Eine Zuordnung entsteht erst mit `vorschlagUebernehmen` und ausdrücklicher Bestätigung je Spalte; danach gilt dieselbe Prüfung wie bei jeder manuellen Zuordnung.
- Codes: `KI_AUS`, `KI_NICHT_FREIGEGEBEN`, `KI_EINGABE`, `KI_LECK`, `KI_ANBIETER`, `KI_ZEIT`, `KI_GROESSE`, `KI_PRUEFER`, `KI_LIMIT`; feste Texte, keine Anbieter- oder Dateiwerte. Die Funktion F7A des Gateways bleibt gesperrt; E-25/E-26 bleiben Bedingung jeder produktiven Anbindung.

