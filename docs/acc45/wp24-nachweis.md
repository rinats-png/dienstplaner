# WP-24 — Kalender-Feed live und gebunden: Nachweis

Branch `acc45/security/wp24-kalender-feed`, Basis `integration/centric-complete`.

## Akzeptanz

**Feed aus aktuellem Bestand.** `GET /kalender/feed/<geheim>.ics` rechnet die Termine bei jedem Abruf aus dem
vollständigen, konsistent gelesenen Bestand (`bestandLesenStreng`) mit derselben Planrechnung wie die Prüfungen
(`dienstAm`, `server/lib/kalenderfeed.mjs`): 180 Tage voraus. Vorher rechnete die Oberfläche beim Einrichten und lud die
Termine hoch (`/kalender/daten`) — ein geänderter Plan erreichte den Kalender nie, und das Gerät bestimmte den Inhalt.
`/kalender/daten` prüft eingehende Termine weiter (alte Oberflächen), speichert und liefert sie aber nicht mehr aus
(`live: true`); alte `feeddaten:` werden nie ausgeliefert. Die Oberfläche schickt keine Termine mehr.

**Sperre widerruft.** Ein neuer Feed trägt die Herkunft der einrichtenden Sitzung (`server/lib/feedherkunft.mjs`):
- Konto: Konto `aktiv`, Mitgliedschaft für genau diesen Raum `aktiv`, Generation von Feed, Mitgliedschaft und Lauf gleich
  (ein Entzug zählt die Generation weiter — ein später ausgesprochener Zugang macht den alten Verweis nicht wieder gültig);
- Zugangscode: das Zugangskonto gibt es und ist nicht gesperrt.
Bei jedem Abruf geprüft; fehlt die Berechtigung: 404 wie unbekannt und endgültiger Widerruf (`feed:`, `feeddaten:`,
`feedperson:`-Index). Ein Lesefehler widerruft nichts (5xx). Feeds ohne Herkunft (vor WP-24 eingerichtet) werden nur über die
Person geprüft (bisherige Autorität D1f/D1g) — **Grenze**, bis sie neu eingerichtet werden.

**raumLoeschen räumt Indizes.** `feedperson:<raum>:*` blieb bisher liegen; jetzt mit gelöscht (`server/lib/raumloeschung.mjs`).

## Datenabfluss

- Nur die eigenen Dienste der Person: Dienstart, Zeiten, Dauer, Pause, Ort. Kein Kollege, keine Besetzung.
- Abwesenheit nur als ganztägiger Termin; die Art steht nur bei Urlaub, Schulung, Freizeitausgleich, Freistellung — Krankheit,
  Mutterschutz, Beschäftigungsverbot, Elternzeit, Kur, Sonstiges heißen „abwesend“. Nie Grund oder Notiz. **Vorher:** die
  Oberfläche schrieb die Art (auch „Krank“) in den Feed auf ein fremdes Gerät.
- Keine Schutzmerkmale (Alter, Schwangerschaft, Einschränkungen), keine Befunde.
- `DTSTAMP` = Stand des Bestands (nie die Uhr des Abrufs): derselbe Bestand ergibt byte-gleiche Dateien.
- Entwürfe (WP-23): Beschäftigte sehen keine Einteilung eines nicht freigegebenen künftigen Monats, wenn der Entwurfsfilter
  wirkt (mindestens eine Freigabe oder `einstellungen.planFreigabePflicht === true`), stattdessen einmal je Monat den
  ganztägigen Termin „Plan noch nicht veröffentlicht“. Heute und früher bleibt sichtbar; Abwesenheiten sind kein Entwurf.
  Die Regel steht an **einer** Stelle (`entwurfSichtbar` in `kalenderfeed.mjs`), bis WP-23 im Integrationsstand ist; dann
  durch die Funktion aus `sicht.mjs` ersetzen (Hinweis im Quelltext).

## Prüfungen

`pruefungen/kalender-feed-live.test.js` (Skript `pruefung:kalender-feed-live`, CI-Schritt „Kalenderfeed live und gebunden“):
live nach Plan-Änderung, Geräte-Termine nie im Feed, leerer Betrieb, DTSTAMP (Einheit + zwei Abrufe mit Abstand), nur eigene
Dienste und keine Gesundheitsangaben, Abwesenheitsarten, Herkunft (Konto, Entzug, Kontosperre, Codesperre, Lesefehler,
Altfeed), `raumLoeschen`, Entwürfe (ohne Freigabe, mit Freigabe, später freigegeben, Pflicht, Leitung, Abwesenheit).
Angepasst: `kalender.test.js` (Feed live statt Gerätedaten), `kalender-feed-autoritaet.test.js` (unlesbarer Bestand: 503),
`kalender-rechte.mjs` (Betriebsname statt Gerätename).

Mutanten (alle rot): Herkunft nie geprüft; Mitgliedschaftsstatus ignoriert; Codesperre ignoriert; DTSTAMP = Uhr des Abrufs;
„Krank“ im Klartext; Entwurf immer sichtbar; Filter ohne Übergangsregel; Index bleibt bei raumLoeschen; fremde Person im Feed.

## Grenzen

- Posten (Dienstarten aus Gruppendiensten) rechnet nur die Oberfläche (`dienstAm`): ihre Besetzung steht nicht im Feed.
- Jeder Abruf liest den Bestand (begrenzt durch die Bremse „lesen“ und `private, max-age=1800`); ein Zwischenspeicher je Stand ist
  ein möglicher Folgeschritt.
- Die Epoche (Passwortwechsel) und die Anmeldesitzung zählen für den Feed nicht (ein Kalender meldet sich nicht neu an); der
  Verweis lässt sich einzeln zurückziehen (`loeschen`).
