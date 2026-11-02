# WP-45b Rückweg bei unlesbarer Datei (Review-Befund B1) — Nachweis

Branch `acc45/security/wp45b-scherbe-rueckweg`, Basis `origin/integration/centric-complete`.
Beim Abzweigen stand der Branch bereits auf 541ebc2 und damit nach dem genannten 60818c0.

## Befund

Seit WP-45 macht eine einzige unlesbare Datei eines Bestands den ganzen Raum 503. Betroffen sind auch die Anzeige und
das Wiederherstellen in der App. Einen Rückweg gab es nur für Journale (`werkzeug/journal-pruefen.mjs`).

Dabei fiel auf: `journal-pruefen --beiseitelegen` benannte die kaputte Datei nur um. `werkzeug/ablage-sicherung.mjs`
bricht aber bei jeder ungültigen Datei der Ablage ab. Nach dem Beiseitelegen wäre deshalb **keine Sicherung mehr
gelaufen**.

## Umsetzung

`werkzeug/ablage-pruefen.mjs` hat drei Betriebsarten:

- **Trockenlauf:** listet je Raum jede unlesbare Datei: Kern, Altbestand, Scherbe, Standvermerk, Standzeiger und
  Journal (dieses mit Prüfsumme).
- **`--aus-sicherung <ordner>`:**
  - Die Sicherung wird zuerst ganz geprüft (`pruefen` aus `ablage-sicherung.mjs`: FERTIG, Manifest, Prüfsumme jeder
    Datei). Stimmt etwas nicht, wird nichts angefasst.
  - Dann wird jede unlesbare Datei byte-gleich zurückgeholt: atomar geschrieben, danach zurückgelesen und verglichen.
  - Die kaputte Datei wird vorher beiseitegelegt.
- **`--beiseitelegen`:**
  - Die Rohbytes kommen unverändert, mit SHA-256, in einen gültigen Eintrag `beiseite:<raum>:<zeit>:<schlüssel>`
    (`beiseiteSicher`). Erst nach dem Zurücklesen verschwindet die Datei unter ihrem alten Namen.
  - Damit geht nichts verloren, und die Ablage bleibt sicherbar.
  - Einen **Kern** legt das Werkzeug nicht beiseite; dafür ist nur `--aus-sicherung` vorgesehen.

Gemeinsame Regeln:

- Das Werkzeug läuft nur bei gestopptem Server. Es belegt die Prozesssperre `.prozess` und gibt sonst 2 zurück.
- `journal-pruefen.mjs` legt Journale jetzt ebenfalls mit `beiseiteSicher` beiseite.
- Die Raumlöschung räumt auch `beiseite:<raum>:` ab.

**Betriebsanleitung:** `docs/BETRIEB-SICHERUNG.md`, §4a „Unlesbare Datei“. Ablauf: R0 anhalten, prüfen, aus der
Sicherung zurückholen, sonst beiseitelegen (der Monat gilt dann als leer), erneut prüfen, Leitung informieren und
fachlich prüfen lassen, Sicherung von Hand anstoßen.

**Entscheidung — Wiederherstellen in der App toleriert keine unlesbare Scherbe.** Das Wiederherstellen ersetzt nur den
eigenen Betrieb und übernimmt den Rest des Raums aus dem jetzigen Stand, also auch andere Betriebe. Würde es eine
unlesbare Scherbe übergehen, schriebe es den Raum ohne diesen Monat zurück. Gehört der Monat einem anderen Betrieb, wäre
er still gelöscht. Außerdem wäre die automatische Sicherung vor dem Wiederherstellen unvollständig. Deshalb bleibt es
bei 503, und der Rückweg ist das Werkzeug. Die Begründung steht auch in §4a.

## Tests

`pruefungen/ablage-pruefen.test.js` hat 8 Tests und läuft über `pruefung:datenintegritaet` im CI-Gate:

- Trockenlauf
- Verweigern bei laufendem Prozess
- Beiseitelegen: kein Byte verloren, Raum wieder lesbar, Monat leer, Schreiben geht weiter, Sicherung gelingt
- Kern wird nicht beiseitegelegt
- Rückholung byte-gleich
- Manipulierte Sicherung wird abgelehnt
- Raumlöschung räumt ab
- `journal-pruefen` blockiert Sicherungen nicht

Vorher war das Werkzeug nicht vorhanden; alle Tests waren rot. Der letzte Test war auch für `journal-pruefen` allein
rot, weil die alte Umbenennung jede folgende Sicherung abbrach.

Regression lokal: `ablage-pruefen`, `journal-lesen`, `aufraeumen` und `sicherung-ablage` mit 64/64 grün.
CI („Prüfung“, „Sicherheit“, „Betrieb: Deploy-Skripte“) ist grün.

## Review-Auflagen (unabhängiges Review, B1–B7)

Stand vor den Auflagen: 10e5da4. Umsetzung in e8c4359 (Werkzeug, Tests) und 394e30f (Bild, CI, §4a).
Neue Prüfdatei `pruefungen/ablage-pruefen-rueckweg.test.js` (14 Tests, einer nur unter Linux ohne root), im CI-Gate
über `pruefung:datenintegritaet`. Auf dem alten Werkzeug (10e5da4) lokal: **12 rot, 1 grün, 1 übersprungen**
(Linux-Test); auf dem neuen: **13 grün, 1 übersprungen** (Windows). In CI (Linux) läuft auch der Rechte-Test.

| Befund | Umsetzung | Test (rot → grün) |
|---|---|---|
| **B1** Journal aus der Sicherung überschreibt Neueres | `--aus-sicherung` holt Journal, Standvermerke und Standzeiger **nie** zurück, sondern legt sie beiseite. Nach jeder Änderung an einem Raum schreibt das Werkzeug den Stand einmal über `bestandSchreiben` neu (mit Journal): Vermerk und Zeiger passen zur Platte, die Standnummer zählt weiter. Das ist nötig, weil der Wiederanlauf in `bestand.mjs` eine fehlende, aber im Vermerk genannte Scherbe nicht erkennt, und weil ein stehengebliebener Stand einen alten Browser-Stand still über den zurückgeholten Monat schreiben ließe. | „ein Journal aus der Sicherung überschreibt keine neueren Daten (p3 bleibt)“ — vorher verschwand p3 bei Rückgabe 0. „Standvermerk und Standzeiger werden beiseitegelegt und neu berechnet“ — vorher stand der Zeiger wieder auf 1. |
| **B2** Original vor der Rückholung gelöscht; Fehlendes nicht erkannt | Rückholung daneben schreiben (0600, fsync), Hülle als **Kopie** ablegen, dann `rename` über das Original, Ordner-fsync, Vergleich. Ein Abbruch lässt die alte Datei liegen; die Zwischendatei wird bei einem Fehler entfernt, nach einem harten Abbruch übergeht sie die Sicherung (`.tmp`) und räumt der Server beim Start weg. Der Befund prüft gegen den Vermerk des aktuellen Stands (größerer aus Kern und Zeiger, wie der Wiederanlauf) und meldet fehlenden Kern und fehlende Scherben (Rückgabe 1). Fehlende Scherben: aus der Sicherung zurückholbar oder mit `--beiseitelegen` als leerer Monat hinnehmbar. Unlesbare Dateien (auch wegen Dateirechten) bekommen eine Hülle mit Lesefehler statt Bytes. | „Abbruch bei ‚rueckholung-geschrieben‘ / ‚huelle-abgelegt‘“ (je: Datei bleibt, Trockenlauf meldet, zweiter Lauf holt zurück, Sicherung danach in Ordnung); „Trockenlauf meldet fehlende Scherbe und fehlenden Kern“; „fehlende Scherbe aus der Sicherung“; „--beiseitelegen nimmt fehlende Scherbe hin“. |
| **B3** Werkzeuge nicht im Bild | Dockerfile kopiert `ablage-pruefen.mjs` und `journal-pruefen.mjs` (Abhängigkeiten `ablage-sicherung.mjs` und `server/` sind schon im Bild). §4a: Aufruf `docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --user 1000:1000 -v "$PWD/data:/data" <bild@digest> node /app/werkzeug/ablage-pruefen.mjs …` (Pfade aus `deploy/compose.yml`: `./data:/data`, uid 1000), Sicherung zusätzlich `:ro` unter `/s/sicherung`; nie als root (0600-Dateien sonst für uid 1000 unlesbar → 503); 45 s nach `compose stop`, wenn die Sperre eines anderen Rechnernamens noch frisch ist. | CI-Schritt „Rückweg-Werkzeuge im Bild“ (`pruefungen/werkzeuge-im-bild.sh`): im Bild vorhanden, Trockenlauf 0, kaputte Scherbe → 1, `--beiseitelegen` → 0, alle Dateien uid 1000/0600, laufender Dienst-Container → beide Werkzeuge 2, nach sauberem Stopp 0. Vorher fehlten die Dateien im Bild. |
| **B4** Kern-Rückholung falsch beschrieben | Kern und Altbestand aus der Sicherung nur mit `--kern-zurueck`; ohne Flag bleibt er, das Werkzeug nennt die Folgen (alle nicht-monatlichen Daten — Personen, Dienstarten, Einheiten, Einstellungen — auf Sicherungsstand; neuere Monate können auf Fehlendes verweisen), mit Flag ebenfalls. §4a: eigener Abschnitt und Text für die Leitung. | „ohne --kern-zurueck bleibt der Kern, mit Flag kommt er zurück“; „--kern-zurueck ohne --aus-sicherung wird abgelehnt“. |
| **B5** Nur Bestandsdateien geprüft | Zusätzlich jede Datei, an der `ablage-sicherung` abbräche (gleiche Logik: `quelleAnsehen` und `umschlagPruefen`, dafür exportiert): App-Sicherungen, Konten, Codes, Sitzungen, Protokoll, fremde Dateien. Nur gemeldet (Rückgabe 1), nie angefasst. §4a: Tabelle je Art mit Vorgehen (Quarantäne neben `data/`, Zugänge neu vergeben statt alte zurückholen, Rechte zurückgeben). | „meldet unlesbare App-Sicherung und Sitzung, fasst sie nicht an“. |
| **B6** Sperre ohne Puls | `puls: true` (auch `journal-pruefen`), Verlust der Sperre bricht vor der nächsten Änderung ab. Eine fremde, frische Sperre bleibt zu (`wartenMs: 0` → „belegt“, Rückgabe 2); die Meldung nennt die 45 s. | „fremde, frische Sperre (anderer Rechner) bleibt zu“ — das Verweigern war schon vorher so, rot war nur der fehlende Hinweis auf die Wartezeit; Übernahme einer über 45 s alten Sperre geprüft. „hält die Sperre mit Puls“ — vorher stand die Änderungszeit still. Mit echtem anderem Rechnernamen: CI-Schritt aus B3. |
| **B7** fehlende Tests | Journal/Kern aus der Sicherung, Abbruch im Rückholfenster, fremder Rechner, mehrere Räume ohne Raumangabe („alle betroffenen Räume in einem Lauf“), Dateirechte (`chmod 000` gemeldet, Rückgeholtes 0600, keine `.tmp`-Reste; nur Linux ohne root, also in CI). Testtitel „benennt um (nie löschen)“ ersetzt durch eine Beschreibung des tatsächlichen Verhaltens (Hülle mit Rohbytes, dann verschwindet das Original). | siehe oben |

Regression lokal (Windows): `ablage-pruefen`, `ablage-pruefen-rueckweg`, `journal-lesen`, `sicherung-ablage`,
`prozesssperre` mit 50/50 grün (1 übersprungen); `eslint` und `tsc` ohne Befund.

CI: Der erste Lauf auf 394e30f (Prüfung 41528860871) scheiterte am Bildbau — `.dockerignore` ließ die beiden
Werkzeuge nicht in den Bau-Kontext; behoben in e71233f. Auf e71233f grün: Prüfung 41529512245 (darin
„Datenintegrität“ 57/57 ohne Übersprungenes, also auch der Rechte-Test unter Linux, und „Rückweg-Werkzeuge im Bild“
mit allen sieben Proben), Sicherheit 41529512178, Betrieb: Deploy-Skripte 41529512213.

## Offen

- Die nächtliche Sicherung bricht bei einer unlesbaren Datei ab. Das ist gewollt, weil es Alarm auslöst. Zum
  Zurückholen braucht es deshalb die letzte Sicherung *vor* dem Schaden.
- Wird ein Monat aus einer älteren Sicherung zurückgeholt, gilt für ihn deren Stand. Was seitdem in diesem Monat
  eingetragen wurde, fehlt und muss von der Leitung nachgetragen werden.
- Kern-Rückholung: Hat bei einem Wiederanlauf ein Browser noch einen Stand von *vor* dem Schaden offen, kann er nach
  dem Angleichen einen Abgleich-Konflikt bekommen statt eines stillen Überschreibens — gewollt, aber für die
  Betroffenen erklärungsbedürftig (Leitungsinformation in §4a).
- Ein harter Abbruch (SIGKILL, Stromausfall) des Werkzeugs zwischen Rückholung und Umbenennen ist durch die
  Reihenfolge abgedeckt, aber nur als geworfener Fehler simuliert (`schritt`-Haken), nicht als echter Prozessabbruch.
- Die „Andere Dateien“ werden nur gemeldet; das Verschieben in die Quarantäne ist Handarbeit nach §4a.

## Nachprüfung (N1–N3)

Nachprüfung auf 7841419: B1–B7 erledigt, drei neue Befunde.

| Befund | Umsetzung | Test (rot auf 7841419 → grün) |
|---|---|---|
| **N1** Angleichen trotz offener Einträge — eine fehlende Scherbe fiel still aus dem neuen Vermerk, Rückgabe 0 | Je Raum erst planen, dann handeln: Bleibt nach dem Plan auch nur eine Datei offen, wird im Raum **nichts** angefasst und nicht angeglichen („Raum NICHT angefasst“, Rückgabe 1, Befund bleibt sichtbar). Strenger als „nur nicht angleichen“: Auch ein beiseitegelegter Zeiger allein ließe den Wiederanlauf des Servers den Vermerk ohne die offene Scherbe neu rechnen. Damit ein Raum trotzdem in einem Lauf lösbar ist, dürfen `--aus-sicherung` und `--beiseitelegen` jetzt zusammen stehen (zurückholen, was in der Sicherung liegt, Rest beiseite). Die Prüfsummen der Sicherung werden vor der ersten Änderung im Raum geprüft. | „N1: bleibt im Raum etwas offen, wird nichts angefasst und nicht angeglichen“ (genau der Fall: Zeiger unlesbar, Oktober fehlt, Sicherung ohne Oktober); „--aus-sicherung mit --beiseitelegen“. |
| **N2** `--beiseitelegen` nahm fehlende Scherben still hin, auch ohne Raumangabe | Fehlende Scherben nur mit `--fehlende-hinnehmen <raum>:<monat>` (oder `<raum>:<betrieb>:<monat>`, Raum Pflicht, sonst Rückgabe 2). Spur in der Ablage: `beiseite:<raum>:<zeit>:<schlüssel>` mit `{ fehlte: true, durch, zeit }`. `--beiseitelegen` allein nennt den passenden Aufruf. | „fehlende Scherbe nimmt nur --fehlende-hinnehmen hin — mit Spur“; „N2: --beiseitelegen ohne Raum leert keinen fehlenden Monat eines anderen Raums“ (Raum A kaputtes Journal, Raum B ohne Oktober). |
| **N3** §4a-Hinweise | (a) Beiseitegelegtes Journal eines abgebrochenen Schreibvorgangs: Zwischenstand wird beim Angleichen festgeschrieben — jetzt ausdrücklich, mit Folge und Ausweg (§4). (b) Abgebrochene Raumlöschung (Scherben und Vermerke vor dem Kern) sieht aus wie „fehlt“: vor `--aus-sicherung` klären, ob der Raum gelöscht werden sollte. Dazu der Abschnitt „ganz oder gar nicht“. | Dokumentation |

Auf 7841419 lokal: 5 der 17 Tests der Prüfdatei rot (die vier neuen und der Kern-Test als Folgefehler des
liegengebliebenen Zustands), mit der Korrektur 24/24 grün mit `ablage-pruefen.test.js` (1 übersprungen, Windows).
Zwei Erwartungen in den B1-Tests sind an das neue Ausgabeformat angepasst (gleicher Inhalt: „beiseitegelegt … nie aus
der Sicherung“), nicht abgeschwächt.

## 2. Nachprüfung (N4, N5)

CI auf 9bee93f grün: Prüfung 41532375386, Sicherheit 41532375420, Betrieb: Deploy-Skripte 41532375439.

| Befund | Umsetzung | Test (rot auf 9bee93f → grün) |
|---|---|---|
| **N4** Vermerk-Abgleich übersprungen, sobald ein Journal liegt — auch ein kaputtes; fehlende Scherbe fiel beim Angleichen still heraus (Umgehung von `--fehlende-hinnehmen`) | Der Abgleich wird nur bei einem **gültigen** Journal übersprungen (das dann gilt). Ein kaputtes Journal gilt nie und wird beiseitegelegt; der Abgleich läuft, die fehlende Scherbe erscheint im Plan: aus der Sicherung zurückholen, sonst nur mit `--fehlende-hinnehmen`, sonst „Raum NICHT angefasst“ (Rückgabe 1). | „N4: kaputtes Journal plus fehlende Scherbe … ohne Sicherung bleibt der Raum unangetastet“ (Trockenlauf meldet beides, `--beiseitelegen` → 1, Journal unverändert); „… Oktober in der Sicherung — zurückgeholt“. |
| **N5** Reihenfolge im Raum | Rückholungen vor Beiseitelegen und Hinnehmen. Ein Abbruch dazwischen lässt den Raum gesperrt (z. B. Zeiger noch unlesbar), nie lesbar mit fehlendem Monat. | „N5: Rückholung vor dem Beiseitelegen“ (fehlender Oktober + unlesbarer Zeiger, Abbruch per `schritt`-Haken bei der Rückholung: Zeiger noch unverändert, Oktober weiter gemeldet, zweiter Lauf vollständig). |

Auf 9bee93f lokal: 4 von 20 Tests der Prüfdatei rot (die drei neuen und der Kern-Test als Folgefehler des
liegengebliebenen Zustands); mit der Korrektur 27/27 grün mit `ablage-pruefen.test.js` (1 übersprungen, Windows).

## 3. Nachprüfung (V1, K1, V2) — strukturell

CI auf 7bf8303 grün: Prüfung 41533293130, Sicherheit 41533293014, Betrieb: Deploy-Skripte 41533293187.

Dieselbe Fehlerklasse (ein fehlender Monat wird still als leer festgeschrieben, Rückgabe 0) trat in der dritten Runde
noch an zwei Stellen auf: beim unlesbaren aktuellen Vermerk (V1) und beim unlesbaren Kern (K1); bei fehlendem Vermerk
war eine fehlende Scherbe gar nicht erkennbar (V2). Ursache: `befund` übersprang den Abgleich, sobald Kern oder
aktueller Vermerk nicht lesbar waren, und das Angleichen lief trotzdem.

**Umsetzung (strukturell):**

1. **Invariante vor dem Angleichen.** Ein Raum wird nur angeglichen, wenn ein nach allen Aktionen *frisch* erhobener
   `befund(store, { raeume: [raum] })` leer ist und der Abgleich gegen einen lesbaren Vermerk stattgefunden hat.
   Ausgenommen sind nur der fehlende aktuelle Vermerk (das Angleichen schreibt ihn) und, mit `--ohne-vermerk <raum>`,
   der fehlende Abgleich. Ausdrücklich geleerte Monate (`--fehlende-hinnehmen`, beiseitegelegte unlesbare Scherben)
   zählen nicht. Sonst „Stand NICHT angeglichen“ mit dem Offenen, Rückgabe 1.
2. **Bezugsvermerk.** Bei gültigem Journal dessen Vermerk (was es setzt, zählt als vorhanden). Sonst der jüngste
   *lesbare* Vermerk bis zum aktuellen Stand (größter aus Kern, Zeiger und Vermerknummern): auf der Platte oder, mit
   `--aus-sicherung`, in der Sicherung. Ein unlesbarer Kern, Zeiger oder aktueller Vermerk verhindert den Abgleich
   nicht mehr. Der fehlende aktuelle Vermerk wird gemeldet (V2).
   - Ist nur ein *älterer* Vermerk lesbar, wären danach angelegte Monate nicht erkennbar. Das gilt als „kein
     vollständiger Abgleich“: Gemeldet wird, was der ältere Vermerk vermisst, aber angeglichen wird nur mit
     `--ohne-vermerk <raum>` (ausdrücklich, mit Spur in der Ablage). Ein älterer Vermerk kann eine seitdem bewusst
     entfernte Scherbe nennen; sie wird trotzdem gemeldet (sicher statt still).
   - Abweichung von der Anregung „Scherben der Sicherung als Referenz“: Die Scherbenliste der Sicherung enthielte
     auch Monate, die seit der Sicherung bewusst entfernt wurden, und `--aus-sicherung` holte sie zurück. Bezug sind
     deshalb die *Vermerke* der Sicherung, nicht ihre Scherbenliste.
3. **Kern-Rückholung (K1).** Der Abgleich läuft auch bei unlesbarem Kern; die fehlende Scherbe steht damit im Plan und
   wird mit zurückgeholt. Zusätzlich prüft der frische Befund nach der Rückholung noch einmal.
4. **Testmatrix** `pruefungen/ablage-pruefen-matrix.test.js` (im CI-Gate über `pruefung:datenintegritaet`), 140 Fälle:
   Schaden {Kern, Journal, aktueller Vermerk, Zeiger, keiner} × Oktober von m1 fehlt {ja, nein} × Sicherung enthält
   ihn {ja, nein} × Modus {Trockenlauf, `--beiseitelegen`, `--aus-sicherung`, `+ --kern-zurueck`,
   `--aus-sicherung --beiseitelegen --kern-zurueck`, `--beiseitelegen --fehlende-hinnehmen`, alles zusammen}, je Raum
   zwei Betriebe. Invarianten: kein Monat verschwindet ohne `--fehlende-hinnehmen` (sonst bleibt er im Befund); kein
   Exit 0, solange etwas fehlt; Rückholung, wenn in der Sicherung; vorhandene Monate und Betrieb m2 bleiben; nie
   Rückgabe 2; was lösbar ist, wird gelöst. Jede Gruppe hat eine eigene kleine Ablage und Sicherung (lokal 132 s).

**Rot → grün:** Die Matrix gegen das Werkzeug von 7bf8303: **28 von 140 rot** — genau alle Fälle „Kern“ und
„aktueller Vermerk“ mit fehlendem Oktober (V1, K1; im Trockenlauf war der fehlende Monat nicht sichtbar). Mit der
Korrektur 140/140 grün. Dazu `ablage-pruefen` und `ablage-pruefen-rueckweg` 27/27 grün (1 übersprungen, Windows),
eslint und tsc ohne Befund.

**Angepasster Test:** In `ablage-pruefen.test.js` war „Beiseitelegen“ (Scherbe, einziger Vermerk 1 und Journal
unlesbar) mit Rückgabe 0 erwartet. Ohne lesbaren Vermerk ist dort kein Abgleich möglich; der Test erwartet jetzt
zuerst Rückgabe 1 und nichts angefasst, dann mit `--ohne-vermerk ap-befund` Rückgabe 0 (und die Spur
`stand:ap-befund:ohne-abgleich`). Das ist das neue, strengere Verhalten, keine Abschwächung.

**Neu in §4a:** Bezugsvermerk, „kein vollständiger Abgleich“, `--ohne-vermerk`, Invariante beim Angleichen.
