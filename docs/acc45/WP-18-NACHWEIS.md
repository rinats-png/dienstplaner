# WP-18 — Zugänge: personengebundene Codes, Konto-UI, Einladungen (Nachweis)

Branch `acc45/zugaenge/wp-18`, Basis `origin/integration/release-v4` (881f8c9). Nur künstliche Testdaten.
Akzeptanz (SSOT): „Leitung lädt Testperson ein → Anmeldung → richtige Rolle; ein Code = eine Person".

## 1. Ist-Stand vor der Änderung

- Zugangscodes entstanden nur beim Betreiber: `POST /api/zugaenge` (daten.mjs) mit frischer Anmeldung und
  zweitem Faktor; der Betreiber sah jeden Code im Klartext. `/einrichten` (Verwalterschlüssel) ebenso.
- Ein Konto (`konto:<hmac>`) trägt `rolle`, `person`, `betrieb`, `mandantId`; die wirksame Rolle einer Sitzung
  kommt aus der Personalliste (`rechte.mjs`, `wirksameRolle`).
- Die Leitung konnte niemanden selbst einladen. Es gab keinen Endpunkt und keine Oberfläche dafür.
- `server/lib/accounts.mjs` / `token.mjs` kennen einen Zweck „einladung" (7 Tage, einmalig), genutzt nur für
  das Konto-/Passwortmodell (E-Mail), nicht für Zugangscodes. Kein Endpunkt lädt damit eine Person ein.
- `rollenvergabe.mjs` (`darfVergeben`) regelt, wer welche Rolle vergeben darf; nur die Leitung hat `roles.assign`.

## 2. Änderung (kleinste sichere Umsetzung)

Zwei Schritte, damit niemand außer der Person ihren Code kennt:

1. `POST /api/einladung` (Sitzung der Leitung) `{ personId, rolle? }` → `{ einladung, bis, person, rolle }`.
   Kein Zugangscode in der Antwort.
2. `POST /api/einladung/annehmen` (ohne Sitzung) `{ einladung }` → `{ zugangscode, rolle, name }`.
   Der Code wird genau einmal angezeigt. Danach normale Anmeldung über `/api/anmelden`.

Regeln (alle serverseitig, `server/lib/einladungen.mjs`):

- Nur Sitzungen mit `roles.assign` (wirksame Rolle = Leitung), nicht Demo, nicht Betreiber, Sitzung an einen
  eindeutigen Betrieb gebunden (`mandantId` muss zur Position passen).
- Person wird nur im eigenen Betrieb gesucht, muss aktiv sein (`aktivePerson`); fremder Betrieb = 404.
- Rolle kommt aus der Personalliste; eine abweichende angefragte Rolle → 409; Rolle muss unterhalb der eigenen
  liegen (`darfVergeben`, also keine zweite Leitung) → sonst 403.
- Ein Code = eine Person: Hat die Person schon einen nicht gesperrten Code (gleicher Raum + Betrieb + Person),
  gibt es keine Einladung (409) und kein Einlösen (409). Eine neue Einladung entwertet die ältere (Laufnummer je
  Person, `einladungsnr:<sha256>`).
- Einladung: `token.mjs`, Zweck „einladung", 7 Tage, gehasht abgelegt, einmalig, gleichzeitige Einlösungen
  nacheinander; zusätzlich `art: "zugang"` (Account-Einladungen lassen sich nicht hier einlösen).
- Beim Einlösen wird erneut geprüft (fail-closed): Betrieb unverändert, Person aktiv, Rolle unverändert, kein
  aktiver Code. Bestand nicht lesbar → 503, nichts angelegt. Ungültig/abgelaufen/benutzt/entwertet → einheitlich 410.
- Das neue Konto: `{ rolle, person, betrieb, mandantId, demo: false, einladung: { von, am } }` — dieselbe Form wie
  aus `/api/zugaenge`; Anmeldung, Sperren, Feed-Widerruf funktionieren unverändert.
- Bremse: Ausstellen über Art `zugaenge`, Einlösen über Art `anmelden` (Ratefläche ohne Sitzung). Protokoll Art `einladung`.

Oberfläche:

- `src/ansichten/einladungen.jsx`: `Einladungen` (Personalbereich, nur mit `roles.assign`, nicht Demo) — Person
  wählen, Einladung ausstellen, Einladung anzeigen. `EinladungEinstieg`/`EinladungAnnehmen` (Anmeldeseite) —
  Einladung einfügen, persönlichen Code einmal anzeigen.
- Eingehängt in `src/App.jsx` (Personalansicht) und `src/main.jsx` (Anmeldeseite, unter dem Hinweis „Die Daten
  sind erfunden"). Client-Aufrufe am Ende von `src/speicher.js`.
- `RECHTEMATRIX.md` Abschnitt 2: zwei Zeilen für die neuen Wege.

## 3. Tests

Vorher (rot): `pruefungen/einladungen.test.js` geschrieben, bevor `server/funktionen/einladung.mjs` existierte →
`Test Files 1 failed (1) · Tests 20 skipped (20)` (Import des Handlers schlägt fehl).

Nachher (grün, lokal, Windows, Node, vitest 4):

| Datei | Ergebnis |
|---|---|
| `npm run pruefung:einladungen` = `einladungen.test.js` (HTTP über die echten Handler, Ende-zu-Ende Einladen → Einlösen → Anmelden → Bestand) + `einladungen-oberflaeche.test.js` (gerendert, Einhängepunkte) | 28/28 (21 + 7) |
| `verdrahtung`, `routen-inventar`, `arbeitssitzung`, `sitzungsinventar`, `rechtematrix-zeilen` (Inventare um die neuen Wege ergänzt) | 792/792 |
| `doku`, `acc45-status`, `acc45-werkzeuge` | 58 bestanden, 1 übersprungen |
| `node werkzeug/verdrahtung-pruefen.mjs` | „Verdrahtung ok: 284 Prüfdateien" |
| `npm run lint` | 0 Fehler, 153 Warnungen (alle in Bestandsdateien, keine in neuen Dateien) |

Negativfälle in `einladungen.test.js`: falsche Rolle (abweichende Rolle 409, Leitung → Leitung 403, Planung /
Beschäftigte / Demo 403, ohne Sitzung 401, fremde Herkunft 403), fremder Mandant (A→B und B→A 404; Code aus B
sieht nur B), wiederverwendete Einladung (zweites Einlösen 410; 5 gleichzeitige → genau 1 Code), abgelaufene
Einladung (8 Tage alt → 410, kein Konto), Code/Einladung einer anderen Person (zwei offene Einladungen, jede
schreibt nur ihre Person, jeder Code meldet nur seine Person an; Person mit Code bekommt keine weitere Einladung;
ältere Einladung nach neuer entwertet; Rollenänderung vor dem Einlösen 409; Account-Einladung nicht einlösbar).

Angepasste Bestandstests (nichts abgeschwächt, keine Assertion entfernt): `arbeitssitzung.test.js` und
`sitzungsinventar.test.js` führen die Liste der Endpunkte mit Sitzungszugriff; `einladung.mjs` ist dort
eingetragen — dieselben Prüfungen gelten jetzt zusätzlich für die neue Datei. `routen-inventar.test.js`:
zwei INVENTAR-Einträge (Sonde `einladungen.test.js`); Matrixzeilen stehen in `RECHTEMATRIX.md` §2, also keine
neue Lücke (`LUECKEN_ANZAHL` unverändert 5).

### 3a. Gesamtlauf (lokal, Windows, parallel)

`npx vitest run`: 263 Dateien, 7502 Tests — 7236 bestanden, 126 fehlgeschlagen (40 Dateien), 140 übersprungen.
Die neuen und angepassten Dateien sind nicht darunter. Die Fehlschläge sind Umgebung: 87× „Test timed out",
6× „Hook timed out", EPERM/ENOTEMPTY (Windows-Dateisystem), „jq fehlt", Dateirechte 600, SIGTERM.
Gegenprobe: 12 der betroffenen Dateien mit Bezug zu Anmeldung/Rollen/Sitzung einzeln nacheinander
(`--no-file-parallelism`: rollen-failclosed, rollen-eintritt, mandanten-session, session-kanal, server,
zugaenge-frischer-faktor, kalender-rechte, zustellung-rechte, verwaltungswege, selbstauskunft, anmeldesperre,
betreiber-zweifaktor) → 259/260; der eine Rest ist `server.test.js` „hört auf SIGTERM" (Windows-Signal).
Maßgeblich ist die CI (Linux); dort läuft `pruefung:einladungen` als eigener Schritt.

## 4. Offene Punkte

- **Browserprüfung durch einen Menschen** (Staging, künstliche Daten): Leitung → Personal → „Zugang einladen" →
  Person wählen → Einladung kopieren; neues privates Fenster → Anmeldeseite → „Ich habe eine Einladung" →
  einfügen → Code erscheint einmal → damit anmelden → Rolle/Ansicht passt (Beschäftigte: „Meine Schichten",
  Schichtverantwortung: eigener Bereich). Zweites Einlösen derselben Einladung → Fehlermeldung. Smartphone-Breite.
- Die Einladung ist ein 43-stelliger Schlüssel zum Kopieren (kein Abtippformat, kein Link, kein Mailversand).
  Link/QR oder Kurzcode wäre eine Folgeentscheidung.
- Die Leitung braucht keine frische Anmeldung für das Ausstellen (anders als der Betreiber). Bewusst offen
  gelassen; die Einladung allein gibt keinen Code preis, und der Server prüft Person/Rolle beim Einlösen erneut.
- Keine Übersicht offener Einladungen und kein Zurückziehen einer Einladung (nur durch eine neue entwertbar,
  sonst Ablauf nach 7 Tagen). Zum Sperren eines eingelösten Codes gibt es `/api/zugang-sperren`.
- Raumlöschung räumt `einladungsnr:`-Zähler nicht weg (nur Laufnummern, keine Personendaten außer Hash);
  Token selbst laufen ab und fallen über `tokenAufraeumen`.
- Prozesslokale Reihe beim Einlösen (wie token.mjs): bei mehreren Instanzen bräuchte es bedingtes Schreiben.
- SSOT `work-packages.json` nicht angefasst (Status bleibt bei der Steuerung).

## 5. Betroffene Dateien (Konfliktprüfung gegen PR #120)

Neu: `server/lib/einladungen.mjs`, `server/funktionen/einladung.mjs`, `src/ansichten/einladungen.jsx`,
`pruefungen/einladungen.test.js`, `pruefungen/einladungen-oberflaeche.test.js`, `docs/acc45/WP-18-NACHWEIS.md`.

Geändert: `src/App.jsx` (Import + 3 Zeilen), `RECHTEMATRIX.md` (2 Zeilen), `pruefungen/arbeitssitzung.test.js`,
`pruefungen/sitzungsinventar.test.js`, `pruefungen/routen-inventar.test.js`, `.github/workflows/pruefung.yml`
(ein Prüfschritt „Einladungen" nach „Bereitstellungsskript"; kein Deploy-Workflow).

- `package.json`: eine eigene Zeile `pruefung:einladungen` am Ende von `scripts` angehängt (PR #120 ändert dort
  Zeile 23; textuell getrennt).

**In PR #120 angefasst und hier minimal geändert** (für die Oberfläche zwingend — der Bearer-Kopf liegt nur in
`speicher.js`, die Anmeldeseite nur in `main.jsx`):

- `src/speicher.js`: zwei Funktionen am Dateiende angehängt (PR #120 ändert Zeilen 85–180).
- `src/main.jsx`: ein Import direkt vor `function Einstieg()` und eine Zeile unter dem Hinweis „Die Daten sind
  erfunden" (PR #120 ändert Zeilen 12–18, 644–651, 855–882).

Nicht angefasst: `.env.example`, `docs/BETRIEBSHANDBUCH.md`, `server/funktionen/daten.mjs`,
`server/lib/betreiber-zweifaktor.mjs`, `src/betreiber-2fa.jsx`, Deploy-Workflows, Konfiguration, Secrets.
