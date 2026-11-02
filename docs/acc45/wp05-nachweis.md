# WP-05 — Überwachung und Alarme: Nachweis

Branch `acc45/infra/wp05-ueberwachung`, Basis `merge/wp31-32c` (6e6d582; #32 war beim
Anlegen noch nicht im Integrationsstand). Nur Code und Doku: kein externer Dienst, kein
Alarmkanal, nichts am VPS.

## Umgesetzt

| Akzeptanz | Umsetzung |
|---|---|
| /gesund prüft Ablage und Platz | `server/lib/gesund.mjs`: Prüfungen `sperre`, `ablage` (Probe in `<Daten>/.gesund/`, siehe Review M2), `platz`, `sicherung` (Alter, WP-04-Statusdatei), `loeschlauf`, `fehler`; Stufen ok/warnung/kritisch; nach außen nur `{"status": …}`, 503 nur bei kritisch; Einzelheiten (`?detail=1`) nur von 127.0.0.1/::1 ohne Weiterleitungskopf |
| Fehlerzählung | `server/lib/gesund-zaehler.mjs`, gleitend 15 min; Haken: `server.mjs` (≥ 500), `bestand.mjs` (unlesbar, Journal-Wiederanlauf), `schutz.mjs` (Bremse fail-closed) — je eine Zeile |
| Alarm ≤ 5 min | Takt 60 s im Serverprozess, Entprellung 120 s, Verschärfung, Erinnerung (6 h), Entwarnung; Kanal Webhook (`CENTRIC_ALARM_WEBHOOK`, nur https), Vorgabe AUS; Nachricht nur Stufe und Prüfungsnamen |
| externer Check | dokumentiert (`docs/BETRIEB-UEBERWACHUNG.md` §4), nichts angemeldet |

Kompatibilität: `{"status":"ok"}` bleibt wörtlich gleich (`server.test.js`); Healthcheck
(Dockerfile, compose) und `deploy-smoke.mjs` sind bei „warnung“ grün, nur „kritisch“ ist
unhealthy. Die frühere Antwort `{"status":"gestört","haengend":…,"schreibstopp":…}` ist
ersetzt durch `{"status":"kritisch"}` (keine internen Zahlen nach außen).

Weitere Änderungen: `werkzeug/ablage-sicherung.mjs` ordnet `centric-gesund` als Klasse C
(flüchtig) ein — sonst bräche die Sicherung am unbekannten Store ab. `deploy/compose.yml`:
`CENTRIC_SICHERUNG_STATUS` und Mount der Statusdatei, auskommentiert. `.env.example`,
`package.json` (`pruefung:gesund`), `pruefung.yml` (Schritt „Überwachung“).

Abschaltbar: `CENTRIC_UEBERWACHUNG=aus` (nur der Takt; /gesund prüft weiter).

## Prüfungen

`pruefungen/gesund.test.js` (16): Stufen je Prüfung inkl. Grenzwerte; Ablage nicht
beschreibbar → kritisch; Sicherung jung/alt/unlesbar/nicht eingerichtet; Löschlauf
alt/mit Fehlern/abgeschaltet; Zwischenspeicher; 5xx-Schwelle und Fenster; unlesbarer Raum
über den Haken in `bestand.mjs`; Einzelheiten nur lokal; Alarm mit Fake-Timern
(Flattern ohne Alarm, Alarm nach Entprellung, Verschärfung, Erinnerung, Entwarnung,
nur erlaubte Felder); ≤ 5 min bei Eintritt zu ungünstiger Zeit; Webhook-Sender;
über `server.mjs`: ok/warnung/kritisch mit HTTP-Status, nur `status` nach außen,
Detail lokal ja/über XFF nein, Healthcheck-Befehl aus dem Dockerfile (warnung → 0,
kritisch → 1; unter Windows nicht auswertbar), `deploy-smoke.mjs` bei warnung grün.

Rot vorher: Ohne `gesund.mjs`/`gesund-zaehler.mjs` scheitert die Datei beim Import; mit
dem alten `server.mjs` gäbe es kein „warnung“ und keine Detailansicht.

Lokal (Windows) zusätzlich grün: `server.test.js` bis auf „SIGTERM“ (unter Windows kein
echtes SIGTERM; in der CI maßgeblich), `datenintegritaet`, `prozesssperre`,
`sicherung-ablage`, `bremse-lokal`, `sitzungsinventar`, `lesefehler`, `atomar`.

## Review-Auflagen (H1, M1, M2, N1–N3, staging-geo)

| Punkt | Umsetzung | Test (rot gegen 01b55ba) |
|---|---|---|
| H1 parallele Proben → „kritisch“ | single-flight (geteiltes Promise, auch bei frisch), eigener Dateiname je Lauf (schreiben, sync, lesen, löschen), „kritisch“ der Ablage erst nach einer Wiederholung | 25 parallel (×6 Runden): 0 kritisch, keine Probedatei bleibt |
| M1 Pendeln ohne Alarm | Entprellung ok gegen nicht ok, schlimmste Stufe der Störung, Verschärfung sofort | Pendeln 60 min: Alarm „kritisch“ binnen 5 min; Alarmfolge angepasst |
| M2 Store-Ordner bricht alte Sicherung | Probe in `<Daten>/.gesund/` (Punkt-Ordner, kein Store); STORES-Eintrag entfernt | `ablage-sicherung` aus 6e6d582 sichert die Ablage; Befund belegt: mit Ordner `centric-gesund` bricht sie ab |
| N1 Platz kritisch | Alarmstufe kritisch, nach außen `warnung`/200; 503 nur bei Sperre/Ablage; `deploy.sh` prüft nach der Sicherung den Platz gegen dieselben Schwellen und wechselt darunter nicht (alter Stand weiter bzw. R0 nach H1-Logik aus WP-31) | Platz kritisch → 200 `warnung`, Healthcheck grün; Ablage kritisch → 503; Deploy-Test „nach der Sicherung kritisch wenig Platz“ (Linux) |
| N2 Webhook-Umleitung | `redirect: "error"` | Umleitung wird nicht verfolgt |
| N3 Doku | Detail nur per `docker exec` | — |
| staging-geo flackert | ungültige Breite 412.3456789 statt 410 (eindeutige Zeichenkette), Prüfung unverändert streng | — |

Integration: `origin/integration/centric-complete` (737c453) hineingemergt.

## Offen (Betreiber)

Alarmkanal wählen und `CENTRIC_ALARM_WEBHOOK` setzen; externen Check einrichten; nach
WP-04 den Sicherungsstatus einhängen. Siehe `docs/BETRIEB-UEBERWACHUNG.md` §5.
