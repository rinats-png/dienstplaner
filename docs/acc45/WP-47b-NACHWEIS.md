# WP-47b Nachweis (Folge) — Lesebremse nach Bestandsgröße, Feed-Bremse, Zwischenspeicher

Branch `folge/wp-47b-lesebremse`, Basis `origin/integration/release-v4`. Ergänzt `docs/acc45/wp47b-nachweis.md`.

## Befund: das meiste bestand schon

| Ziel | Stand auf der Basis |
|---|---|
| Lesebremse nach Bestandsgröße | vorhanden: `lesenGrenze(bytes)` (1,2 GB/min geteilt durch Antwortgröße, mindestens 1, unbekannte Größe zählt 10 MB, fail closed), Raumgrenze `lesen-raum` mit 15 s Sperre, Lesen je Person `bestandlesen` |
| Eigene Feed-Bremse | vorhanden: `GRENZEN.feed` 30/min je Geheimnis, fail closed, 429 mit Retry-After |
| Zwischenspeicher je Raum/Stand | vorhanden: `raumBytes` (nur die Größe, nie der Bestand), gilt nur für denselben Stand und dieselbe Änderungszeit, ein neuer Stand ersetzt den Eintrag |

## Lücke, die geschlossen wurde

Der Feed hatte keine Grenze je Herkunft (`wp-kleinpakete-fragen.md`, Frage 11): Jeder Abruf mit einem anderen, auch
unbekannten Geheimnis legte einen eigenen Zähler in der Ablage an. Neu: `GRENZEN["feed-herkunft"]` = 120 je Minute,
Sperre 60 s, fail closed, gezählt je Herkunft (`kennung(req, null)`) **vor** der Bremse je Geheimnis
(`server/funktionen/kalender.mjs`). Keine bestehende Grenze wurde verändert, gelockert oder abgeschwächt.

## Rot zu grün

Neue Tests in `pruefungen/wp47b-lesebremse.test.js` (Gruppe „Feed-Bremse je Herkunft“), vor der Änderung 3 von 3 rot
(Grenze fehlt; 121 verschiedene Geheimnisse einer Herkunft blieben 404 statt 429; Quelltext), danach grün:
26 Tests in der Datei (vorher 23). Keine bestehenden Tests geändert.

## Offen

- **Budget 1,2 GB/min liegt über der Messung** (≈ 200 Antworten/min bei 4,6 MB = rund 0,9 GB/min); die Raumgrenze
  schützt also nicht sicher vor Kernsättigung. Zielkonflikt mit dem Schichtwechsel, Entscheidung offen (Frage 2).
- **Lastprobe** („große Bestände unter Last ohne Kernsättigung“) nicht gelaufen; Nachmessung mit `werkzeug/last` (E-20).
- **Zwischenspeicher der Antwort selbst** nicht umgesetzt (Frage 4; berührt Widerruf bei Sperre/Entzug).
- Die Größe je Raum wird erst beim nächsten Abruf nach einem Schreibvorgang erneuert; bis dahin gilt die alte Zahl.
- Mehrere Instanzen: die Zähler gelten je Ablage, der Zwischenspeicher je Prozess.
