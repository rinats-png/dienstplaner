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

## Offen

- Die nächtliche Sicherung bricht bei einer unlesbaren Datei ab. Das ist gewollt, weil es Alarm auslöst. Zum
  Zurückholen braucht es deshalb die letzte Sicherung *vor* dem Schaden.
- Wird ein Monat aus einer älteren Sicherung zurückgeholt, gilt für ihn deren Stand. Was seitdem in diesem Monat
  eingetragen wurde, fehlt und muss von der Leitung nachgetragen werden.
