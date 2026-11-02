# WP-02 Datenintegrität — Nachweis

Branch `acc45/security/wp02-datenintegritaet`, Basis `origin/feature/geo-zeiterfassung` (a379095).
Alle Läufe lokal unter Windows 11, Node 24.18, vitest 4.1.10, am 2026-11-02.

## Befund

`bestandSchreiben` (server/lib/bestand.mjs) liest den Standzeiger, gleicht ab und schreibt N+1 erst nach mehreren
`await` — ohne Sperre je Raum. Zwei Schreiber mit demselben erwarteten Stand bestanden beide; die Monatsscherbe des
einen ging verloren, beide bekamen 200. In Kette B meldet `/api/stempeln` bei einem *erkannten* Konflikt bereits 409
(nicht mehr `ok: true` wie in `main`) — der Verlust entstand aber gerade dann, wenn **kein** Konflikt erkannt wurde.
Unter Windows führten gleichzeitige Schreibvorgänge auf dieselbe Datei zusätzlich zu 500-Antworten.

## Umsetzung

- **Raumsperre** (`server/lib/raumsperre.mjs`): Reihe je Raum im Prozess (Muster `nacheinander`), Zeitgrenze 15 s
  beim Warten (Fehler `RAUMSPERRE_ZEITGRENZE` → HTTP 503 „nichts gespeichert“, statt Hängen; der Platz in der Reihe
  wird freigegeben, ohne den Ausschluss aufzuheben). Wiedereintritt über `AsyncLocalStorage`: Wer die Sperre hält und
  erneut danach greift, kommt sofort durch — keine Verklemmung; die Kennzeichnung erlischt mit dem Ende der Arbeit.
- `bestandSchreiben` läuft immer unter der Sperre — damit auch Provisionierung und jeder künftige Aufrufer.
- In `server/funktionen/daten.mjs` laufen **Lesen → Prüfen/Zusammenführen → Schreiben** gemeinsam unter der Sperre, mit
  frischem Lesen innerhalb der Sperre: PUT `/api/bestand`, `/api/stempeln`, `/api/zeit-bestaetigen`,
  `/api/bestand-anlegen` (Belegt-Prüfung + Anlegen), Wiederherstellen, `/api/raum-loeschen`. Lesepfade bleiben sperrfrei.
- **Stempeln**: Stempel wird in der Sperre aus dem frischen Stand gebaut; Serverzeit wird beim Eintreffen der Anfrage
  genommen. Echter Konflikt (nur noch durch Schreiber außerhalb der Sperre möglich): bis zu 3 Wiederholungen, dann 409
  `STEMPEL_KONFLIKT`, nie `ok: true`. Antwort enthält den gespeicherten Eintrag. Protokoll: `wiederholt` je
  Zwischenversuch, `konflikt` nur am Ende.
- **Prozesssperre** (`server/lib/prozesssperre.mjs`, Aufruf in `server.mjs` vor allem anderen):
  `CENTRIC_DATEN/.prozess` mit O_EXCL, Inhalt `{pid, start, rechner}`, Puls (mtime) alle 10 s. Gleicher Rechner:
  lebende fremde PID + frischer Puls → Start verweigert (Exit 1); tote oder eigene PID (Container: PID 1) → veraltet,
  wird übernommen. Fremder Rechner (zweiter Container): Puls > 30 s alt → veraltet; sonst bis 35 s beobachten.
  Übernahme per Umbenennen + Inhaltsvergleich (kein Rennen zweier Starter). Freigabe bei Prozessende; geht die Sperre
  im Betrieb verloren, beendet sich der Prozess.

## Tests — vorher (unveränderter Code a379095) / nachher

| Test | vorher | nachher |
|---|---|---|
| R1 50 gleichzeitige Stempel | rot: 19 bzw. 14 von 50 mit 200, Rest 500 (zwei Läufe) | grün: 50 × 200, 50 gespeichert |
| R2 zwei PUTs, gleicher Stand | rot: `[200, 200]` (stiller Verlust) | grün: `[200, 409]` |
| R3 Stempel ∥ Leitungs-PUT, 10 Runden | rot: 500 / Verlust | grün: jede Erfolgsmeldung gespeichert, sonst 409 |
| R4 dauerhafter Konflikt | rot: 1 Schreibversuch statt 4 (409 kam schon in Kette B) | grün: 4 Versuche, 409, nichts gespeichert |
| R5 Konflikt, dann Erfolg | rot: 409 | grün: 200, genau ein Stempel |
| R6 zweiter Prozess, gleiche Ablage | rot: zweiter Prozess antwortet | grün: verweigert, nach Ende des ersten wieder möglich |
| R7 Last 200/min, Bündel zu 10, 2 Betriebe, 60 s | rot: 170 × 200, 30 × 500, **131 Verluste** | grün: 200 × 200, 0 Verluste, Median 239 ms, **p95 848 ms**, max 1716 ms |

R7 gleichmäßig verteilt (Bündelgröße 1) war auch ohne Fix verlustfrei (keine Überlappung; p95 103–112 ms) und beweist
deshalb nichts — die Probe läuft mit Bündeln (Schichtwechsel). Zwei Betriebe, weil die Schreibbremse je Betrieb
120/min zulässt. R7 ist nicht im CI-Gate (`npm run pruefung:last-stempeln`).

Zusätzlich (Bausteine, neu): Raumsperre — Reihenfolge je Raum / parallel über Räume, Wiedereintritt, Zeitgrenze ohne
Aufhebung des Ausschlusses, Freigabe nach Fehler, keine „geerbte“ Sperre in späteren Folgen; Prozesssperre — tote
PID übernommen, lebende nicht, fremder Rechner nach Puls, Freigabe nur der eigenen Sperre.

## Geänderte bestehende Prüfung

`pruefungen/stempeln.test.js` kodierte „einmalige fremde Änderung desselben Monats → 409“. Das widerspricht R5
(Wiederholung). C, D, G prüfen jetzt den **dauerhaften** Konflikt (409, nichts gespeichert, nie ok); neu H: einmaliger
Konflikt → 200, Stempel und fremde Änderung gespeichert. Protokollzählung angepasst (3 konflikt, 10 wiederholt,
5 erfolg, 2 abgewiesen). Vorher (alter Code) schlagen C, H und die Protokollzählung fehl.

## Auflagen aus dem unabhängigen Review (Runde 2)

Alle neuen Tests auf dem Stand vor dieser Runde (063b021) ausgeführt: **14 von 14 rot**, jeweils aus dem
gemeinten Grund. Für den Rückbau-Test wurde im alten `provisionierung.mjs` nur `export` vor `zurueckrollen` gesetzt,
damit er die Sperre prüft und nicht an einem fehlenden Export scheitert. Nachher alle grün.

| Nr | Befund | Umsetzung | Test (vorher → nachher) |
|---|---|---|---|
| 1 | `bestandLesen` übergeht Lese-/List-Fehler; der Schreibweg baut ohne die Scherbe, die Waisenbereinigung löscht sie | `bestandLesenStreng` (wirft `BESTAND_UNLESBAR` → 503, es wird nichts geschrieben) in allen Schreibwegen und im Abgleich; Zeiger, Kern und Vermerk werden streng gelesen. Gelöscht werden nur Scherben, die der bisherige Stand-Abdruck kennt und die der Schreiber weglässt; jede wird vorher noch einmal gelesen (unlesbar → Abbruch vor dem ersten Schreiben). `raumBelegt`: unlesbar heißt belegt. | `lesefehler.test.js`: beschädigte Scherbe + Stempel / PUT / Zeit bestätigen: 200 und Datei weg → 503, Datei unverändert. List-Fehler + Stempel / PUT: 200 und Monat überschrieben → 503, nichts verloren |
| 2 | Löschlauf ungesperrt | `aufraeumen.mjs`: `unterRaumsperre(raum, () => raumLoeschen(…))` | `loeschsperre.test.js`: Löschlauf während eines Schreibers: Waisen `stand:…` → keine |
| 3 | Provisionierung: Belegt-Prüfung, Anlegen und Rückbau ungesperrt | Prüfen und Anlegen zusammen unter der Sperre; `zurueckrollen` unter der Sperre (für den Test exportiert) | zwei gleichzeitige Anlagen: `[true, true]` → genau eine, die andere `belegt`. Rückbau während eines Schreibers: Waisen → keine |
| 4 | Abbruch zwischen Kern und Zeiger → danach jeder Stempel 409; Herzschlag-Fehler → sofortiges `exit` | (a) „verloren“ erst nach 3 Fehlschlägen in Folge (Takt 5 s statt 10 s, also 15 s < 30 s Veraltungsgrenze); eine Sperre, die nachweislich einem anderen gehört, sofort. (b) Bei Verlust: `schreibstopp` (neue Schreibvorgänge → 503), laufende höchstens 10 s abwarten (`alleFrei`), dann `exit(1)`. (c) Beim Schreiben unter der Sperre: Kern-Stand, Zeiger, Vermerk und vorhandene Scherben müssen zusammenpassen; sonst wird der Vermerk aus dem tatsächlich Gespeicherten (streng gelesen) neu berechnet und der Zeiger nachgezogen. Es wird nichts gelöscht und nichts zurückgesetzt. | simulierter Abbruch vor Vermerk/Zeiger, danach Stempel: 409 → 200; der frühere Stempel und die halb geschriebene Leitungsänderung bleiben, der nächste Stempel ebenfalls 200. Herzschlag-Aussetzer: sofort verloren → toleriert; dauerhaft weg → genau eine Meldung. Schreibstopp/alleFrei (neu) |
| 5 | Kein Wächter für lange gehaltene Sperren | Wächter (30 s): Fehlerprotokoll und `sperrZustand().gesund = false`; `/gesund` antwortet dann 503 `{status: "gestört"}`, ebenso während eines Schreibstopps | Baustein-Test Wächter (neu) |
| 6 | Grenze des Wiedereintritts | Kommentar in `raumsperre.mjs` und `bestandSchreiben`: in einer gesperrten Arbeit nie parallel schreiben (kein `Promise.all`) | — |
| 9 | `konten` (Sammelblob) ohne Sperre; Sicherung ohne konsistente Momentaufnahme | `raumloeschung.mjs`: Lesen, Ändern, Schreiben von `konten` unter der festen Sperre `@konten` (Reihenfolge immer erst der Raum, dann `@konten`). `POST /api/sicherung`: strenges Lesen und Ablegen unter der Raumsperre | zwei gleichzeitige Löschungen: `['c1','c3']` → `['c3']`. Sicherung während eines PUT: `{a:false, b:true}` (Mischstand) → beide neu |

Regression nachher (lokal): 33 vitest-Dateien **950/950**; `scherben.mjs` 19/19; Serverlauf zeiterfassung 38/38, geo
14/14, rechte 147/147, sicherungen 28/28, erstbefuellung 29/29; `server.test.js` 17/18 (bekannter Windows-Fall SIGTERM);
`tsc` sauber; eslint 0 Fehler (331 Warnungen wie vorher). Lastprobe R7 erneut: 200 × 200, 0 Verluste, Median 304 ms,
p95 778 ms, max 1372 ms.

## Offene Punkte

- Werkzeuge unter `werkzeug/` schreiben direkt in die Ablage, an Raum- und Prozesssperre vorbei.
- Lesen bleibt sperrfrei; ein Leser (GET) kann einen halb geschriebenen Stand sehen. Er wird dabei nur angezeigt,
  nicht zurückgeschrieben: Jeder Schreibweg liest unter der Sperre neu.
- Durchsatz: Unter der Sperre wird der ganze Bestand gelesen und geschrieben. Bei Bündeln zu 10 liegt p95 unter Windows
  bei 778–848 ms. Unter Linux/ext4 ist es vermutlich schneller, gemessen wurde das nicht.
- Prozesssperre nach hartem Ende des Vorgänger-Containers: Der Start verzögert sich um bis zu ~35 s, weil der Herzschlag
  beobachtet wird. Die Wartezeit in `deploy.sh` muss deshalb ≥ 60 s sein (gehört zu WP-31).
- `/gesund` meldet jetzt 503, solange eine Schreibarbeit über dem Wächter hängt oder ein Schreibstopp gilt. Wie Docker
  oder Caddy darauf reagieren (Neustart?), steht in `deploy/`, das nicht zu diesem Paket gehört.
