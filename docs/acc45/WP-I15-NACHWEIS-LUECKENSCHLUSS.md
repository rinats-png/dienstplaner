# WP-I15 – Nachweis: Kostenschutz, Limits, Deadline, degradierter Modus (Lückenschluss)

Branch `intelligence/wp-i15-kostenschutz` (Basis `origin/integration/release-v4`). Nur Attrappe, keine echten Kosten, keine Abrechnung, kein Anbieter. Status und `work-packages.json` bewusst nicht angefasst.

## Vorprüfung auf Vorhandenes (nicht doppelt gebaut)

Schon im Integrationsbranch (siehe auch `wp-i15-nachweis.md`, Teilstand):

| Bereich | Vorhanden | Ort |
|---|---|---|
| Eingabegrenzen 20k/60k/150k, IE-Einheiten, nie kürzen | ja | `gateway/limits.mjs` |
| Person je Stunde/Tag, Klasse A, gleiche Anfrage, Parallelität | ja | `limits.mjs` |
| Betrieb Monat/Tag, Reserve, Pause, Klasse A nie gesperrt, Plattform-Tagesbudget und hartes Dach | ja | `limits.mjs` |
| Persistenz (append-only + Rollup), Fail-closed bei Zählerfehler (nicht A) | ja | `zaehlerspeicher.mjs`, `limits.mjs` |
| Alarme 70/90/100/110 %, Plattform | ja | `alarme.mjs` |
| Globale Deadline 120 s, Stufenfrist, Restzeit-Logik, Zeit-Rückfall | ja | `gateway.mjs`, `anbieter.mjs` (Tests Kern/Review, Fake-Timer PR 149) |
| Notschalter, Pausierung während des Vorgangs | ja | `schalter.mjs`, `gateway.mjs` |
| Rückfall bei Anbieterausfall/Prüferfehler/Zeit | ja | `gateway.mjs` |
| Ausgabegrenze in Zeichen/Bytes (Text 4000, 64 KB) | ja | `pruefer.mjs` |

## Lücken (hier geschlossen)

1. **Obergrenze je Betrieb und Zeitraum (Stunde)**: optional `betriebJeStundeIE` (gleitende Stunde, nur Nicht-A, Zeit unlesbar oder ungültige Angabe: fail closed). Rückbuchung und `erweitern` wirken im Fenster mit. Nicht persistent (Monat und Tagesdach bleiben die dauerhaften Deckel).
2. **Ausgabegrenze in Token**: `ausgabeTokenMax` (Vorgabe 8000, Konfiguration). Überschreitung wird verworfen, nie gekürzt oder teilweise ausgegeben, Rückfall `KI_GROESSE`; die Einheiten bleiben verbraucht (B7). Unbekannte Nutzung (`null`): die harten Prüfer-Grenzen gelten weiter.
3. **Zeitkonfiguration fail closed**: NaN, 0, negativ, Text oder Stufenfrist größer als Deadline lassen das Gateway nicht entstehen (`KI_ZEIT`); zuvor wäre die Deadline wirkungslos gewesen.
4. **Degradierter Modus bei Limit-Überschreitung**: `ausfuehrenDegradiert` macht aus `KI_LIMIT`/`KI_KONTINGENT`/`KI_GROESSE` eine schema-gültige Rückfall-Antwort (feste Texte, keine Personendaten, kein Anbieteraufruf). `ausfuehren` wirft unverändert. Notschalter, Pausierung und Anfragefehler bleiben Ausnahmen.

## Tests (rot, dann grün)

Neu: `pruefungen/intelligence-kostenschutz-i15.test.js`.
- Rot auf altem Stand: 15 von 21 fehlgeschlagen (6 bestanden: Verhalten ohne Angabe).
- Danach ein Test entfernt (Weitergabe der Grenze an den Adapter, siehe unten), grün: 20 von 20.
- Regression: `intelligence-*.test.js` und `ki-*.test.js` 25 Dateien, 708 Tests grün. `node werkzeug/sicherheit/statik.mjs`: keine unbegründeten harten Treffer.
- Kein bestehender Test geändert oder abgeschwächt.

## Bewusste Entscheidung

Die Ausgabegrenze wird dem Adapter nicht als Eingabefeld mitgegeben: `intelligence-gateway-kern.test.js` pinnt die Schlüsselliste der Adaptereingabe (Positivliste gegen Abfluss). Die Weitergabe gehört zu WP-I18 (Anbieteranbindung) und braucht dort eine bewusste Erweiterung dieser Liste.

## Offen

Euro-Budget (Preise ungeklärt), Anbieter-Deckel (fünfte Ebene), Verdrahtung `schutz.mjs`/`gesund.mjs`/Betreiber-Mail, Lasttest „nicht auf dem Event-Loop“, Kontingent je Tarif, Zeitzone der Tagesgrenzen (UTC), Mehrinstanzbetrieb (Single-Instance-Voraussetzung, siehe `wp-i15-nachweis.md`).

## Review-Befunde und Korrektur

Review von PR #158; jeder Befund zuerst als roter Test, dann Korrektur (gruen).

1. **Ausgabe-Ueberschreitung ging zur naechsten Stufe** (gateway.mjs, Ausgabegrenze). Jetzt: Ueberschreitung von usgabeTokenMax fuehrt sofort zum Rueckfall KI_GROESSE (reak statt continue), keine weitere Stufe, keine Teilausgabe. Test: Ueberschreitung -> sofort Rueckfall KI_GROESSE: KEIN Aufruf der naechsten Stufe (rot: mehr als ein Anbieteraufruf; gruen: genau einer).
2. **max_tokens am Adapter**: Die Anbieter-Schnittstelle (nbieter.mjs, Kopf) sieht kein max_tokens-Feld vor; der Live-Adapter ist noch ein Platzhalter. Die Grenze wird daher NICHT uebergeben, sondern weiter ueber den Rueckfall nachgeprueft (im Code vermerkt). Test haelt den Stand fest (Eingabe-Felder des Adapters). Offen: bei WP-I18 (Live-Adapter) Feld in die Schnittstelle aufnehmen und als Obergrenze uebergeben.
3. **Unbegrenztes Stundenfenster** (limits.mjs). Jetzt: s.stunde wird nur gefuellt, wenn etriebJeStundeIE gesetzt ist, und auf Grenze plus Reserve (16 Eintraege) begrenzt; aelteste Eintraege fallen zuerst heraus. Tests: ohne betriebJeStundeIE waechst der Puffer nicht (rot: Puffer 50) und mit betriebJeStundeIE bleibt der Puffer hart beschraenkt (rot: 500).

Tests: intelligence-kostenschutz-i15 und intelligence-gateway-kern zusammen 76 gruen (vorher 3 rot bei den neuen Tests).
