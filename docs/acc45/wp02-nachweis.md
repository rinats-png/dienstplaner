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

## Offene Punkte

- `server/lib/aufraeumen.mjs` (Löschlauf Testbetriebe) und `server/lib/provisionierung.mjs` (Rückbau) rufen
  `raumLoeschen` ohne Raumsperre (Dateien außerhalb des Pakets). `bestandSchreiben` in der Provisionierung ist gesperrt.
- Werkzeuge unter `werkzeug/` schreiben direkt in die Ablage, an Raum- und Prozesssperre vorbei.
- Lesen bleibt sperrfrei; ein Leser kann einen halb geschriebenen Stand sehen (wie bisher).
- Durchsatz: unter der Sperre wird der ganze Bestand gelesen und geschrieben; p95 von 848 ms bei Bündeln zu 10 unter
  Windows. Auf Linux/ext4 schneller zu erwarten, nicht gemessen.
- Prozesssperre bei hart beendetem Vorgänger-Container: Start bis ~35 s verzögert (Beobachtung des Pulses).
