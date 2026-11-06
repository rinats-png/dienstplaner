# WP-47b Nachweis — Lesebremse nach Bestandsgröße, eigene Feed-Bremse

Branch `feature/ready-kleinpakete`, Basis `9aac167` (integration/release-v4). Ausgangslage: WP-28 Befund 5 und
WP-47 Abschnitt 8, Punkt 1 (Backlog „WP-47b“).

## Was

1. **Lesebremse nach Bestandsgröße** (`server/lib/schutz.mjs`, `server/funktionen/daten.mjs`).
   - `lesenGrenze(bytes)`: Bytes je Minute geteilt durch die Größe der letzten Antwort des Raums, begrenzt auf
     die Lesegrenze (300) und nie unter 1. Budget `LESEN_BYTES_JE_MINUTE` = 600 MB, also rund 130 Antworten je
     Minute bei 4,6 MB (gemessen ≈ 200 je Minute bei einem Kern). Begründung und Annahme: siehe Fragen 2 in
     `docs/acc45/wp-kleinpakete-fragen.md`.
   - Fail closed: Unbekannte, leere oder ungültige Größe zählt wie `LESEN_GROESSE_UNBEKANNT` (10 MB, rund 60 je
     Minute). Nach einem Neustart gilt also die strenge Grenze bis zum ersten Abruf.
   - `bremse(art, kennung, ziel, optionen)`: neuer optionaler vierter Parameter `{ versuche }`. Ohne Angabe
     unverändert. Mit Angabe gilt diese Grenze für diesen Aufruf; Fenster, Sperre und `failClosed` bleiben.
   - `GET /bestand` nutzt die Grenze nach Größe. Die Größe je Raum wird zwischengespeichert je Stand
     (`raumBytes`, `bytesMerken`): ein neuer Stand ersetzt den Eintrag; gespeichert wird nur die Zahl.
2. **Eigene Feed-Bremse** (`server/lib/schutz.mjs`, `server/funktionen/kalender.mjs`).
   - `GRENZEN.feed = { versuche: 30, fenster: 60, sperre: 60, failClosed: true }`, gezählt je Geheimnis
     (`f:<hash>`), nicht mehr über die Lesebremse.
   - Fail closed: Ein Plattenfehler am Sperreintrag sperrt das Geheimnis (`frei: false`, mit `fehler`).
   - 429 mit Retry-After über `zuVielAntwort`, wie bei den übrigen Bremsen.

## Tests

Neue Datei `pruefungen/wp47b-lesebremse.test.js`: **15 Tests**. Vor der Änderung rot: 12 von 14 (der 15. Test, Zwischenspeicher, kam danach hinzu; die zwei grünen
prüfen die unveränderte Standardgrenze und die Sperre bei fehlender Angabe, das ist Verhalten, das schon galt).
Nach der Änderung grün.

| Gruppe | Tests | Was geprüft wird |
|---|---|---|
| `lesenGrenze` | 5 | 4,6 MB unter der Sättigung (100–150); kleine Bestände volle Grenze; monoton fallend; unbekannt streng; mindestens 1 |
| `bremse()` mit Grenze | 2 | `versuche: 3` lässt drei durch, bremst den vierten mit Wartezeit; ohne Angabe unverändert |
| Feed-Bremse | 4 | `GRENZEN.feed` mit 12–30, 60 s, fail closed; 31. Abruf gebremst; anderes Geheimnis frei; Plattenfehler sperrt |
| Feed über den echten Handler | 1 | 31. Abruf liefert **429 mit Retry-After**; anderes Geheimnis nicht gebremst |
| Quelltext-Verdrahtung | 3 | `kalender.mjs` bremst mit `"feed"`, `daten.mjs` setzt die Grenze nach Größe, Zwischenspeicher je Stand |

Fail-closed-Pfad der Feed-Bremse: über `vi.mock` der Ablage mit gezielter Störung (wie `bremse-lokal.test.js`).

Gezielt nach der Änderung (zusammen mit WP-27c, 18 Tests dort): `wp47b-lesebremse`, `bremse-lokal`,
`bremse-wp47`, `stempel-429-client`, `kalender-feed-live`, `kalender-feed-autoritaet`, `kalender-rechte`,
`kalender`, `gesund`, `anmeldung-http`, `vollausgabe`, `leserechte`, `etag-pflicht`, `schutzkonflikte`,
`stempel-integritaet`, `herkunft-xff`: **alle grün bis auf `server.test.js` > „hört auf SIGTERM sauber auf“**.
Dieser Test schlägt auch auf dem Basisstand ohne jede Änderung fehl (Windows meldet bei `kill("SIGTERM")` immer
das Signal; vorbestehend, nicht Teil dieses Pakets).

## Offen

- **Lastprobe nicht gelaufen.** Akzeptanz „große Bestände (≈ 4,6 MB) unter Last ohne Kernsättigung“ ist nur durch
  Rechnung und Tests belegt, nicht durch eine Messung. Nachmessung mit `werkzeug/last` bleibt beim Betreiber (E-20).
- **Zwischenspeicher der Antwort** ist nicht umgesetzt (nur die Größe). Frage 4 in `wp-kleinpakete-fragen.md`.
- Vollausgabe und Auswertung für den Betriebsrat bleiben bei der allgemeinen Lesegrenze (Frage 5).

## Review-Runde (Opus-Review zu fb79daa)

Die Zahlen oben in den Abschnitten „Was“ und „Tests“ gelten für den ersten Stand (87071b3) und sind hier **überholt**:
das Budget ist jetzt 1,2 GB/min (nicht 600 MB), und das Lesen je Raum ist aufgeteilt.

1. **Lesen je Person (Review 1).** Bestandsabrufe zählen je Person (`bestandlesen`, Schlüssel `kennungPerson`, 300/min,
   60 s Sperre). Die Bytegrenze gilt nur als zusätzliche Raumgrenze `lesen-raum` mit **15 s Sperre**, fail closed.
   Ein Mitarbeiter mit vielen Abrufen sperrt den Raum damit nicht mehr 60 s lang.
2. **Eigene Arten (Review 2).** `vollausgabe` und `auswertung` haben eigene Arten; die Bestandssperre blockiert den
   Sicherungslauf (Vollausgabe mit Sicherungsschlüssel) nicht mehr.
3. **Zwischenspeicher (Review 4).** Die gemerkte Größe gilt nur für denselben Stand **und** dieselbe Änderungszeit
   (`stand` + `zeit`); der Altformat-Stand `alt` wechselt nie.
4. **Abrunden (Review 6).** `bremse()` rundet `versuche` erst ab und setzt dann mindestens 1 (0,5 → 1, nie 0).
5. **Budget (Review 1, Zielkonflikt).** `LESEN_BYTES_JE_MINUTE` = 1,2 GB/min: 240 Antworten bei 5 MB, 260 bei 4,6 MB.
   Damit geht ein realistischer Schichtwechsel (200 × 2 Abrufe in 2 Min. bei 5 MB) durch. Das liegt **über** der
   einzelnen Messung (≈ 200/min bei 4,6 MB), die Grenze schützt also nicht sicher vor Kernsättigung. Offen:
   `docs/acc45/wp-kleinpakete-fragen.md`, Frage 2.
6. **Feed (Review 3).** Unbekannte Geheimnisse ohne Begrenzung je Herkunft: offen, Frage 11.

**Tests (Review-Runde):** 23 Tests in `wp47b-lesebremse.test.js` (vorher 8 davon rot, u. a. Personengrenze,
Vollausgabe, Raumgrenze mit kurzer Sperre, Plattenfehler der Raumgrenze, Verdrahtung, Zwischenspeicher).
Der Schichtwechsel-Test prüft die Raumgrenze mit 400 Abrufen über 2 Minuten bei gefälschter Uhr; die Personengrenze
ist im Personentest mit kleiner Grenze (3) geprüft, weil jede Ablage-Operation auf diesem Rechner ≈ 150 ms dauert.
