# WP-45 Atomares Schreiben — Nachweis

Branch `acc45/security/wp45-atomares-schreiben`, Basis `origin/acc45/security/wp02-datenintegritaet` (82cf345).
Lokal gelaufen unter Windows 11, Node 24.18, vitest 4.1.10, am 2026-11-02.

## 1 Schreibvorgang ganz oder gar nicht (Pflicht)

**Schreibjournal** (`server/lib/bestand.mjs`): Jeder Schreibvorgang wird zuerst vollständig als Liste von Schritten in
die Datei `journal:<raum>` geschrieben. Die Liste enthält Kern, Scherben, Löschungen, Vermerk und Zeiger, jeweils mit
den neuen Werten, dazu eine SHA-256-Prüfsumme. Die Ablage schreibt diese eine Datei atomar und mit fsync
(Zwischendatei, dann umbenennen). Damit ist die Journaldatei der Punkt, an dem der neue Stand festgeschrieben ist.
Danach werden die Zieldateien geschrieben und das Journal gelöscht.

- **Abbruch vor dem Journal:** Es gilt vollständig der alte Stand.
- **Abbruch danach:** Es gilt vollständig der neue Stand. Der nächste Schreiber führt das Journal unter der Raumsperre
  zu Ende (`journalAbschliessen`, wiederholbar) und löscht es.
- **Unlesbares Journal oder falsche Prüfsumme:** Schreiber bekommen `BESTAND_UNLESBAR` (503) und schreiben nichts.

**Leser ohne Sperre sehen nie einen halben Stand.** Sie lesen in dieser Reihenfolge: Stand des Kerns, Journal, Inhalt,
Journal, Stand des Kerns.

- Liegt dasselbe Journal vorher und nachher, wird es über das Gelesene gelegt. Das Ergebnis ist der neue Stand.
- Liegt keines und ist der Stand unverändert, ist das Gelesene der alte Stand.
- Sonst wird neu gelesen. Nach vier Versuchen wird einmal unter der Raumsperre gelesen.

Die Raumlöschung entfernt das Journal zuerst. Sonst würde ein Leser es über die Reste legen, und der Kern eines
gelöschten Raums erschiene wieder.

**Windows-Nebenwirkung:** Unter Windows scheitert `rename` über eine Datei, die ein Leser gerade offen hat, mit EPERM.
`ablage.mjs` versucht es deshalb unter Windows bis zu viermal erneut, zusammen höchstens etwa 50 ms. Unter Linux hat
das keine Wirkung.

## 2 kontoVereinzeln gegen Raumlöschung

- `kontoVereinzeln` (`server/lib/konten.mjs`) läuft unter der Sperre `@konten`. Die Konstante `KONTEN_SPERRE` liegt
  jetzt in `server/lib/raumsperre.mjs`.
- Die Raumlöschung bereinigt zuerst den Sammelblob (unter `@konten`) und löscht erst danach die Einzelkonten `konto:*`.

## 3 Abstand Prozessende ↔ Übernahme

- Bisher schrieb ein Halter nach seinem letzten gelungenen Herzschlag schlimmstenfalls noch 25 s: drei gescheiterte
  Herzschläge zu je 5 s, dann bis zu 10 s Warten auf laufende Schreibvorgänge.
- Ein anderer Prozess durfte die Sperre aber schon nach 30 s ohne Herzschlag übernehmen. Das sind nur 5 s Abstand, und
  die hat ein träger Ereignistakt schnell verbraucht.
- Die Übernahmegrenze `VERALTET_MS` ist jetzt **45 s**, also 20 s Abstand. `WARTEN_MS` ist 50 s.
- `VERLUST_WARTEN_MS` ist aus `server.mjs` nach `prozesssperre.mjs` gewandert und exportiert; ein Test prüft
  „Abstand ≥ 15 s“.
- **Folge:** Nach einem harten Ende des Vorgänger-Containers startet der neue erst nach bis zu ~50 s. Die Wartezeit in
  `deploy.sh` muss deshalb ≥ 75 s sein (gehört zu WP-31).

## Tests — vorher (82cf345) / nachher

Für den Lauf „vorher“ wurden `bestand.mjs`, `raumloeschung.mjs`, `konten.mjs`, `prozesssperre.mjs`, `raumsperre.mjs`
und `server.mjs` auf den Stand von 82cf345 zurückgesetzt. `ablage.mjs` blieb dabei neu, damit der Leser-Test am
Mischstand scheitert und nicht an EPERM unter Windows.

| Test | vorher | nachher |
|---|---|---|
| `atomar.test.js` — Abbruch vor jeder Teilschreibung | rot: Mischstand nach Abbruch vor Teilschreibung 2, 3 und 4; bei 3 fehlte der verschobene Eintrag ganz | grün: immer vollständig alt oder neu, Eintrag genau einmal, nächster Schreibvorgang gelingt |
| `atomar.test.js` — Leser während eines langsamen Schreibvorgangs | rot: 5 Mischstände gesehen | grün: keiner |
| `loeschsperre.test.js` — Anmeldung während der Raumlöschung | rot: `konto:x1` zeigt auf den gelöschten Raum | grün: kein Einzelkonto, Sammelblob bereinigt |
| `prozesssperre.test.js` — Abstand ≥ 15 s | rot: `VERLUST_WARTEN_MS` fehlt (NaN), Abstand 5 s | grün: 20 s |

## Regression nachher

- 38 vitest-Dateien: **1123/1123** grün.
- `scherben.mjs` 19/19.
- Serverlauf: zeiterfassung 38/38, geo 14/14, rechte 147/147, sicherungen 28/28, erstbefuellung 29/29.
- `server.test.js` 17/18; der eine Fehlschlag ist der bekannte Windows-Fall SIGTERM.
- `ablage.test.js` 21/24: drei der vier bekannten Windows-Fehlschläge. Der vierte („fünfzig gleichzeitige
  Schreibvorgänge“) gelingt jetzt dank des Neuversuchs.
- `tsc` sauber; eslint 0 Fehler, 331 Warnungen wie vorher.

## R7-Lastprobe, nachgefahren

200 Stempel pro Minute in Bündeln zu 10, auf 2 Betriebe verteilt, über 60 s:

- 200 × 200, 0 Verluste.
- Median 362 ms, **p95 988 ms**, max 1288 ms.
- Vorher (WP-02): p95 778–848 ms. Das Journal kostet also etwa 15–25 %, weil der Kern und die geänderten Scherben ein
  zweites Mal geschrieben werden.

## Offen

- Die Werkzeuge unter `werkzeug/` schreiben weiter am Journal und an den Sperren vorbei.
- Die Reparatur aus WP-02 bleibt als Rückfall für ältere Inkonsistenzen ohne Journal. Ihre eigenen drei
  Schreibvorgänge (Kern, Vermerk, Zeiger) heilen sich bei einem erneuten Abbruch selbst, weil sie bei jedem Lauf neu
  berechnet werden.
- Durchsatz unter Linux nicht gemessen.
