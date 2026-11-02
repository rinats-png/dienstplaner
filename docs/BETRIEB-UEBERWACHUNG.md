# Betrieb: Überwachung und Alarme (WP-05)

Stand 2026-11-03. Code und Doku. **Nichts davon ist extern eingerichtet:**
kein Uptime-Dienst, kein Alarmkanal, keine Änderung am VPS. Was der
Betreiber entscheidet und einrichtet, steht in Abschnitt 5.

## 1. /gesund

Anmeldefrei. Nach außen nur die Stufe — keine Pfade, Raumnamen, Versionen,
Zahlen oder Fehlertexte:

| Antwort | HTTP | Bedeutung | Container |
|---|---|---|---|
| `{"status":"ok"}` | 200 | alles in Ordnung | healthy |
| `{"status":"warnung"}` | 200 | Aufmerksamkeit nötig, der Dienst arbeitet | healthy |
| `{"status":"kritisch"}` | 503 | arbeitet nicht verlässlich | unhealthy |

Nur **kritisch** macht den Container unhealthy (Healthcheck im Dockerfile und
in `deploy/compose.yml`: `r.ok`). Eine knappe Platte, eine alte Sicherung oder
gehäufte Fehler sind Warnungen: Ein Neustart behebt keines davon, und mit
einem Werkzeug, das unhealthy Container neu startet, entstünde eine Schleife.
`deploy-smoke.mjs` (WP-31) verlangt 200 und bleibt damit bei „warnung“ grün.

### Prüfungen

| Prüfung | warnung | kritisch |
|---|---|---|
| `sperre` — Raumsperre, Schreibstopp (raumsperre.mjs) | — | hängende Schreibarbeit oder Schreibstopp |
| `ablage` — Probe schreiben und lesen im eigenen Store `centric-gesund` (keine Kundendaten, keine Raumsperre, daher kein Konflikt mit WP-02) | — | Probe scheitert |
| `platz` — freier Platz unter `CENTRIC_DATEN` | < `CENTRIC_GESUND_PLATZ_WARNUNG_PROZENT` (15) | < `CENTRIC_GESUND_PLATZ_KRITISCH_PROZENT` (3) oder < `CENTRIC_GESUND_PLATZ_KRITISCH_MB` (200) |
| `sicherung` — Alter der letzten erfolgreichen Sicherung außer Haus (WP-04) | älter als `CENTRIC_GESUND_SICHERUNG_WARNUNG_STUNDEN` (26) oder Statusdatei unlesbar | — |
| `loeschlauf` — letzter Lauf des Löschlaufs (`aufraeumen:letzter`) | älter als `CENTRIC_GESUND_LOESCHLAUF_WARNUNG_STUNDEN` (26) oder mit Fehlern | — |
| `fehler` — gleitend über 15 min: 5xx-Antworten, unlesbare Räume, Journal-Wiederanläufe, Bremse fail-closed | 5xx ≥ `CENTRIC_GESUND_5XX_WARNUNG` (10) oder eines der anderen ≥ 1 | — |

`sicherung` braucht den Pfad zur Statusdatei der Sicherung
(`STATUS_VERZEICHNIS/letzte-erfolgreiche.json`, WP-04) im Container: in
`deploy/compose.yml` die beiden auskommentierten Zeilen
(`CENTRIC_SICHERUNG_STATUS` und den Mount `:ro`). Ohne sie meldet die Prüfung
„nicht eingerichtet“ und bleibt ok.

Ergebnisse werden 10 s zwischengespeichert (`CENTRIC_GESUND_CACHE_MS`) — ein
Ansturm auf den anmeldefreien Endpunkt schreibt nicht je Anfrage eine Probe.
Der Store `centric-gesund` ist flüchtig (Klasse C in
`werkzeug/ablage-sicherung.mjs`) und wird nicht gesichert.

### Einzelheiten: nur von der eigenen Maschine

`GET /gesund?detail=1` liefert alle Prüfungen mit Werten (freier Platz,
Alter, Zählerstände) — aber nur, wenn die Gegenstelle `127.0.0.1`/`::1` ist
und kein `X-Forwarded-For`/`Forwarded` mitkommt. Sonst dieselbe Antwort wie
ohne `detail`.

    docker exec centric-dp-web node -e "fetch('http://127.0.0.1:3000/gesund?detail=1').then(r=>r.text()).then(console.log)"

Warum nicht „nur für Betreiber“ über eine Sitzung: Das hieße, Zustandsdaten
über denselben Weg auszuliefern wie Kundendaten, mit Anmeldung, Bremse und
Sitzungsprüfung in einem Endpunkt, der gerade dann antworten soll, wenn die
Ablage klemmt. „Nur lokal“ braucht keine Ablage, keinen Zugang und verrät
über Caddy nichts: Caddy erreicht den Container über das Netz `proxy`, nie
über 127.0.0.1, und setzt `X-Forwarded-For`.

## 2. Fehlerzählung

`server/lib/gesund-zaehler.mjs`: nur Art und Zeit, keine Raumnamen,
Adressen oder Fehlertexte. Haken in `server.mjs` (jede Antwort ≥ 500),
`server/lib/bestand.mjs` (unlesbar, Journal-Wiederanlauf) und
`server/lib/schutz.mjs` (Bremse zählt wegen Ablagefehler nur im Speicher).
Fenster 15 min, gleitend.

## 3. Alarm

Im Serverprozess: alle `CENTRIC_GESUND_TAKT_S` (60) eine frische Prüfung.
Entprellung `CENTRIC_ALARM_ENTPRELLUNG_S` (120): Eine Stufe über „ok“ muss so
lange anhalten, bevor alarmiert wird; ebenso die Rückkehr vor der
Entwarnung. Verschärfung (warnung → kritisch) alarmiert erneut. Bleibt es
schlecht: Erinnerung nach `CENTRIC_ALARM_WIEDERHOLUNG_S` (6 h).
**Spätestens nach Takt + Entprellung + Takt ≈ 4 min** liegt der Alarm beim
Kanal (Prüfung `≤ 5 min` in `pruefungen/gesund.test.js`).

**Kanal: Vorgabe AUS.** Ohne `CENTRIC_ALARM_WEBHOOK` wird nur ins Log
geschrieben („kein Alarmkanal eingerichtet“). Mit einer `https://`-URL geht ein
POST mit JSON hinaus:

    {"dienst":"CENTRIC","art":"alarm|erinnerung|entwarnung","stufe":"warnung|kritisch|ok",
     "betroffen":["platz"],"zeit":"2026-11-03T08:00:00.000Z"}

Nur Prüfungsnamen, keine personenbezogenen Daten. Mail: über einen Webhook,
der an Mail weiterleitet (die meisten Alarm- und Uptime-Dienste können das);
eine eigene Mailanbindung im Server gibt es bewusst nicht — sie hinge an
Resend (WP-30 offen) und fiele aus, wenn der Dienst selbst gestört ist.

Grenze: Der Alarm läuft **im** Dienst. Steht der Container, alarmiert er
nicht — dafür ist der externe Check da (4).

## 4. Externer Check (nur dokumentiert)

Ein Uptime-Dienst außerhalb des VPS fragt `https://app.centric-dienstplanung.de/gesund`
im Abstand von höchstens einer Minute ab:

- Alarm, wenn **nicht 200** oder **keine Antwort** in 10 s (deckt „kritisch“,
  Container tot, Caddy tot, VPS tot ab);
- optional Schlüsselwort: Alarm, wenn der Inhalt nicht `"status":"ok"` ist
  (deckt zusätzlich „warnung“ ab);
- Bestätigung erst nach 2 Fehlschlägen (Entprellung), damit bleibt der Alarm
  unter 5 min.

Keine Anmeldung bei einem Dienst in diesem Paket — Auswahl und Konto sind
Entscheidung des Betreibers. Die Sicherung außer Haus (WP-04) meldet sich
zusätzlich über ihren eigenen Ping (`ALARM_PING_URL`, docs/BETRIEB-SICHERUNG.md).

## 5. Entscheidungen und Einrichtung (Betreiber)

1. Alarmkanal wählen (Webhook-Ziel; z. B. derselbe Dienst wie der externe
   Check) und `CENTRIC_ALARM_WEBHOOK=https://…` in die `.env` — die URL ist
   ein Geheimnis, gehört nie ins Repository.
2. Externen Check einrichten (4).
3. Nach WP-04: in `deploy/compose.yml` `CENTRIC_SICHERUNG_STATUS` und den
   Mount einkommentieren.
4. Schwellen nur bei Bedarf ändern (Variablen oben, `.env.example`).

Probe ohne echten Kanal: Detailansicht (1) im Container lesen; für einen
Probealarm `CENTRIC_GESUND_PLATZ_WARNUNG_PROZENT=101` setzen — nach rund drei
Minuten erscheint der Alarm im Log bzw. beim Kanal, danach den Wert wieder
entfernen.
