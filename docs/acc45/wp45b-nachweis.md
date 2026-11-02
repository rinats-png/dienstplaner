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
