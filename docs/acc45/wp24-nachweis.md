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
- Zugangscode: das Zugangskonto gibt es, ist nicht gesperrt und nicht abgelaufen (`laeuftAb`, Testräume). Nach der
  Umschlüsselung (Pfeffer) trägt die Sitzung den alten Schlüssel; der alte Eintrag vermerkt jetzt `ersetztDurch`, und die
  Prüfung folgt der ganzen Kette (gesperrt oder abgelaufen an irgendeiner Stelle, fehlender Nachfolger, Kreis: ungültig).
Bei jedem Abruf geprüft; fehlt die Berechtigung: 404 wie unbekannt und endgültiger Widerruf (`feed:`, `feeddaten:`,
`feedperson:`-Index). Ein Lesefehler widerruft nichts (5xx). Feeds ohne Herkunft (vor WP-24 eingerichtet) werden nur über die
Person geprüft (bisherige Autorität D1f/D1g); die Sperre eines Kontos (`accountSperren`) oder Zugangscodes
(`/api/zugang-sperren`) widerruft sie zusätzlich über den `feedperson:`-Index der gebundenen Person
(`server/lib/feedwiderruf.mjs`, Option a). Ein **neuer** Feed ohne ableitbare Herkunft wird nicht eingerichtet (403,
fail-closed).

**Alte Geräte-Termine.** `feeddaten:*` (vom Gerät gerechnet, mit der Art der Abwesenheit im Klartext, auch „Krank“) wird nie
mehr gelesen. Der Datenschutzlauf (WP-26, Schalter `CENTRIC_DATENSCHUTZLAUF`) räumt sie mit: `vorschau` (Vorgabe) zählt
(`feeddatenFaellig`, Protokoll), `an` löscht (`feeddatenGeloescht`). Nichts wird ohne den bestehenden Schalter gelöscht.

**Protokoll.** Der Pfad eines Feeds trägt das Geheimnis; `server.mjs` schreibt bei einer Ausnahme jetzt
`adresseFuersProtokoll(req.url)` (`/kalender/feed/[geschwärzt]`, ohne Abfrage) statt der rohen Adresse.

**raumLoeschen räumt Indizes.** `feedperson:<raum>:*` blieb bisher liegen; jetzt mit gelöscht (`server/lib/raumloeschung.mjs`).

## Datenabfluss

- Nur die eigenen Dienste der Person: Dienstart, Zeiten, Dauer, Pause, Ort. Kein Kollege, keine Besetzung.
- Abwesenheit nur als ganztägiger Termin; die Art steht nur bei Urlaub, Schulung, Freizeitausgleich, Freistellung — Krankheit,
  Mutterschutz, Beschäftigungsverbot, Elternzeit, Kur, Sonstiges heißen „abwesend“. Nie Grund oder Notiz. **Vorher:** die
  Oberfläche schrieb die Art (auch „Krank“) in den Feed auf ein fremdes Gerät.
- Keine Schutzmerkmale (Alter, Schwangerschaft, Einschränkungen), keine Befunde.
- `DTSTAMP` = Stand des Bestands (nie die Uhr des Abrufs): derselbe Bestand ergibt byte-gleiche Dateien.
- Entwürfe (WP-23): **dieselbe Regel wie die Sicht** — `planFreigabeAktiv` und `istEntwurfstag` aus
  `server/lib/planfreigabe.mjs`, die auch `sicht.mjs` (`planOhneEntwurf`) und die Oberfläche benutzen; keine eigene Fassung
  mehr im Feed. Verborgen nur für Beschäftigte (wie `entwurfVerbergen` in der Sicht); Betriebsrat, Schichtverantwortung,
  Planung und Leitung sehen den Entwurf. Die Rolle im Feed ist die der Person im Bestand (`p.rolle`), ohne Angabe
  `mitarbeiter` — gleich oder strenger als die Sitzung. Statt der Einteilung einmal je Monat der ganztägige Termin „Plan noch
  nicht veröffentlicht“; heute und früher bleibt sichtbar; Abwesenheiten sind kein Entwurf. Gleichheit mit
  `bestandFuerRolle` geprüft: 11 Betriebsformen × 6 Rollenangaben × 205 Tage.

## Prüfungen

`pruefungen/kalender-feed-live.test.js` (Skript `pruefung:kalender-feed-live`, CI-Schritt „Kalenderfeed live und gebunden“):
live nach Plan-Änderung, Geräte-Termine nie im Feed, leerer Betrieb, DTSTAMP (Einheit + zwei Abrufe mit Abstand), nur eigene
Dienste und keine Gesundheitsangaben, Abwesenheitsarten, Herkunft (Konto, Entzug, Kontosperre, Codesperre, Lesefehler,
Altfeed), `raumLoeschen`, Entwürfe (ohne Freigabe, mit Freigabe, später freigegeben, Pflicht, Leitung, Abwesenheit).
Nach dem Review (Auflagen A1–A4, Befunde 3, 7, 9): Quelle nimmt die Entwurfsregel aus `planfreigabe.mjs`; Gleichheit mit der
Sicht je Betriebsform/Rolle/Tag; **Rollen-Sonde** MA, BR, SV, PL, LT durch den echten Handler (nur eigene Dienste, keine fremden
Marker, Entwürfe je Rolle wie `bestandFuerRolle`; RECHTEMATRIX.md verweist darauf); Entzug und Neuvergabe ohne Abruf dazwischen
→ 404; `cache-control: private`; Konto- und Codesperre widerrufen Altfeeds der gebundenen Person (fremde Person, fremder
Betrieb, fremder Raum, Feed mit Herkunft: unberührt); Datenschutzlauf `feeddaten:*` (Vorschau zählt, `an` löscht, `aus`
nichts); Umschlüsselung (`ersetztDurch`, Kette, Kreis); Einrichten ohne Herkunft 403; `laeuftAb`; Schwärzung in der Konsole.
Angepasst: `kalender.test.js` (Feed live statt Gerätedaten), `kalender-feed-autoritaet.test.js` (unlesbarer Bestand: 503),
`kalender-rechte.mjs` (Betriebsname statt Gerätename).

Mutanten (alle rot): Herkunft nie geprüft; Mitgliedschaftsstatus ignoriert; Codesperre ignoriert; DTSTAMP = Uhr des Abrufs;
„Krank“ im Klartext; Entwurf immer sichtbar; Filter ohne Übergangsregel; Index bleibt bei raumLoeschen; fremde Person im Feed.
Nach dem Review (alle rot): Entwürfe auch für BR/SV verborgen; nur für BR; Entwurfsfilter aus; Default-Rolle `leitung`;
Generationsvergleich in `feedherkunft.mjs` entfernt; `cache-control: public`; Konto- bzw. Codesperre ohne Altfeed-Widerruf;
Widerruf auch mit Herkunft; Bindungsprüfung (Person, Betrieb, Raum) einzeln entfernt; Vorschau löscht; Lauf löscht nicht;
`ersetztDurch` nicht vermerkt bzw. nicht gefolgt; Einrichten ohne Herkunft; `laeuftAb` ignoriert; `req.url` roh in der
Konsole; Schwärzung ohne Wirkung.

## Grenzen, offene Entscheidungen und Folgepunkte

- **Feeds ohne Herkunft** (vor WP-24): außer bei einer Sperre nur über die Person geprüft. Vorschlag zur Entscheidung bis
  **2026-12-01**: (b) Stichtag — 60 Tage nach dem Produktions-Rollout von WP-24 gilt ein Feed ohne Herkunft nicht mehr (404,
  Hinweis zum Neu-Einrichten); (c) bis dahin zählt der Trockenlauf (Datenschutzlauf, Vorschau) die Feeds ohne Herkunft je Raum.
  Beides in RECHTEMATRIX.md, Abschnitt 3.
- Ein Zugangscode ohne Betriebskennung (`mandantId`, vor dem ersten Anmelden nach D1) hat keinen eindeutigen
  `feedperson:`-Index — sein Altfeed wird von der Codesperre nicht erfasst und hängt an der Person.
- **Befund 6 (offene Entscheidung):** Passwortwechsel (Epoche) und Abmelden widerrufen den Feed nicht — ein Kalender meldet sich
  nicht neu an; zurückziehen einzeln über `/kalender/loeschen`. Ob ein Passwortwechsel alle Feeds widerrufen soll, ist eine
  Produktentscheidung.
- **Befund 8 (Grenze):** Posten (Dienste aus Gruppendiensten) rechnet nur die Oberfläche (`dienstAm`): ihre Besetzung steht
  nicht im Feed.
- **Befund 4 → WP-47b:** Jeder gültige Abruf liest den vollen Bestand; gebremst nur über die Art „lesen“ (300/min je Geheimnis)
  und `private, max-age=1800`. Folgepunkt für WP-47b: eigene Bremsart „feed“ (12–30/min je Geheimnis) und ein
  Ergebnis-Zwischenspeicher je Raum und Stand.
- Folgepunkt (außerhalb des Feeds, beim Review von Befund 3 gesehen): `/api/zugang-sperren` beendet Sitzungen über
  `sit.konto`; eine Sitzung aus der ersten Anmeldung nach der Umschlüsselung trägt den alten Schlüssel und endet bei der
  Sperre nur des neuen Eintrags nicht (sie läuft nach höchstens zwölf Stunden ab).
