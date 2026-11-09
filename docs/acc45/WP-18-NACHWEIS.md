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

> **Korrektur (Review-Auflage M3, Ausbau `acc45/zugaenge/wp-18-ext`, Abschnitt 6):** Die Aussage „niemand außer der
> Person kennt ihren Code — auch die Leitung nicht" war falsch. Die Einladung ist ein **Inhaberschlüssel**: Die
> Leitung sieht sie beim Ausstellen und kann sie selbst einlösen; ebenso jeder, an den sie gerät. Richtig ist: Der
> Code steht nirgends im Klartext, die Leitung bekommt ihn nicht ausgehändigt, und jede Einlösung wird ihr in der
> Einladungsliste angezeigt (Status, Zeitpunkt, Hinweis „neu eingelöst").

Zwei Schritte (Ausstellen ohne Code, Einlösen gibt den Code einmal aus):

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

## 4. Offene Punkte (Stand des ersten Commits; erledigt bzw. neu bewertet in Abschnitt 6)

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
(Im Ausbau, Abschnitt 6, kommt `server/lib/betreiber-zweifaktor.mjs` mit einer neuen Funktion hinzu.)

## 6. Ausbau: Review-Auflagen und Betreibervorgaben (Branch `acc45/zugaenge/wp-18-ext`)

Basis: `origin/integration/release-v4` @ `9c9e80d` (enthält SI-P4 und WP-39). Der erste WP-18-Commit wurde
darauf umgesetzt; zwei kleine Konflikte, ohne Umbau gelöst: `src/App.jsx` (WP-39 hatte den Import `Antraege`
entfernt — es bleibt nur der Import `Einladungen`), `package.json` (beide Skriptzeilen `pruefung:app-aufbau` und
`pruefung:einladungen`). Kein Merge, kein PR, kein Deploy, kein Eingriff in Produktion. Nur erfundene Testdaten.

### 6.1 Review-Auflagen

| Auflage | Status | Umsetzung | Test (vorher → nachher) |
|---|---|---|---|
| **M1** Faktor gegen wirksame Rolle | erledigt | `einladung.mjs`, `leitungSitzung`: nach `wirksameRolle` zusätzlich `rollenSitzungOhneFaktor(s, rolleWirksam)`; Verstoß → Sitzung beenden, 401 `zweifaktor: "neu-anmelden"` (wie `daten.mjs`, `zustellung.mjs`). Gilt für Ausstellen, Liste, Widerruf | „M1: … Hochstufung …" mit `CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT=1`: rot (200, Einladung ausgestellt) → grün (401, kein Token, Sitzung danach ungültig) |
| **M2** Lesefehler geschluckt | erledigt | `konten.mjs` `alleKontenStreng` (wirft); `aktiverZugangVorhanden` nutzt sie; Kollisionsprüfung mit `kontoLesenStreng`; Lesefehler vor dem Anlegen → 503, nichts angelegt. `token.mjs`: Löschen muss gelingen (drei kurze Wiederholungen gegen vorübergehende Windows-Sperren), sonst `grund: "nicht-entwertet"`, Sperrvermerk `tokensperre:<Prüfsumme>` + prozesslokale Sperre; jeder weitere Versuch → `gesperrt`. Für Einladungen hält zusätzlich der exklusive Zustandsvermerk (6.3), der vor dem Löschen steht | vier Tests: Konten nicht lesbar (rot: 200 → grün: 503, kein Token), Kollisionsprüfung nicht lesbar (rot: Code angelegt → grün: 503, kein Konto, danach 410), Token nicht löschbar (rot: 200 → grün: 503, danach 410), `token.mjs` direkt (rot: Eintrag zurück → grün: `nicht-entwertet`, danach gesperrt) |
| **M3** Doku „Leitung kennt Code nicht" | erledigt | Kopf von `server/lib/einladungen.mjs`, Abschnitt 2 oben, RECHTEMATRIX: Inhaberschlüssel; Benachrichtigung der Leitung (B5) | – (Doku) |
| **N1** Text nach Verbrauch | erledigt | Jeder Fehler nach dem exklusiven Vermerk → 503 „Die Einladung ist damit verbraucht — bitte neu einladen lassen." (`NEU_EINLADEN`); nur Fehler VOR dem Verbrauch → 503 „später erneut versuchen" | in den M2-Tests (`/neu einladen/`) |
| **N2** Wettlauf Laufnummer | erledigt | Laufnummer lesen, schreiben, Token ausstellen und ältere Einladungen widerrufen unter `unterRaumsperre("@einladung:<raum>")` — derselben Sperre wie beim Einlösen | zwei gleichzeitige Einladungen für dieselbe Person: rot (200 + 409: beide gültig) → grün (200 + 410) |
| **N3** `b % 26` | erledigt | verwerfendes Ziehen (`b >= 234` verworfen) wie `token.mjs` | Form/Alphabet über 500 Codes + Quelltextprüfung: rot (Funktion fehlte) → grün |
| **N4** Bremse bei Sammeleinladungen | dokumentiert | Ausstellen zählt gegen `zugaenge` (10 je 10 min, steigend). **Bedienhinweis:** Wer mehr als zehn Personen auf einmal einlädt, läuft in die Sperre; dann später fortsetzen oder den Betreiber die Codes über `/api/zugaenge` (bis 20 je Aufruf) anlegen lassen. Liste und Widerruf zählen nicht dagegen (`lesen` bzw. `schreiben`). Zusätzlich gilt die **installationsweite**
Gesamtgrenze `WEITERE.zugaenge` (40 je 10 min über alle Betriebe, geteilt mit `/api/zugaenge`): Laden mehrere
Betriebe gleichzeitig viele Personen ein, bremsen sie sich gegenseitig (429). Kopf von `einladung.mjs` | – |

### 6.2 Neue Funktionen (B1, B2, B4, B5)

**B1 — frische Bestätigung beim Ausstellen** (`frischeBestaetigung`, `server/lib/einladungen.mjs`; serverseitig im
Endpunkt, vor der Fachprüfung). Höchstens 5 Minuten (`FRISCH_MS`). Kein neues Anmeldeverfahren, nur die
vorhandenen Wege:

| Lage | genügt | sonst |
|---|---|---|
| `CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT=1` | Code aus der App im Rumpf (`bestaetigung.zweifaktor`; `rollenFaktorFrisch` in `betreiber-zweifaktor.mjs`: TOTP ±30 s, einmalig, eigene Bremse `rf:`) **oder** Anmeldung mit bestandenem Faktor (`zweifaktor: true`) vor ≤ 5 min | 403 `bestaetigung: "zweifaktor"`; ein Zugangscode allein genügt nicht |
| ohne Pflicht, Sitzung aus Zugangscode | eigener Zugangscode (`bestaetigung.zugangscode`, muss der Code genau dieser Sitzung sein — Vergleich der Prüfsumme mit `sitzung.konto`), Code aus der App, oder Anmeldung vor ≤ 5 min | 403 `bestaetigung: "zugangscode"` |
| ohne Pflicht, Sitzung aus Konto (E-Mail/Passwort) | Passwort (`bestaetigung.passwort`, `passwortPruefen` gegen das Konto) — eine junge Arbeitssitzung zählt nicht (sie entsteht bei der Betriebsauswahl, nicht bei der Passworteingabe) | 403 `bestaetigung: "passwort"` |

Falsche Bestätigung: 400 ms Verzögerung, 403, Protokoll ohne Inhalt. Ablage nicht lesbar: 503. Die Oberfläche
fragt nach einem 403 mit `bestaetigung` nach dem passenden Merkmal und schickt es mit.

**B2 — Einladungsverwaltung.** `POST /api/einladung/liste`: Einladungen des eigenen Betriebs (Schlüssel enthält
Raum und Betrieb) mit Person (Name aus dem Bestand), Rolle, Ausstellungszeit, Ablauf und Status `offen` /
`eingeloest` / `widerrufen` (auch „durch neuere ersetzt") / `abgelaufen` / `verbraucht` (eingelöst, aber kein Zugang
entstanden, z. B. Rolle geändert). Das Token erscheint nur in der Antwort des Ausstellens, nie in der Liste
(Metadaten `einladung:<betrieb>:<id>` ohne Token, ohne Namen). `POST /api/einladung/widerrufen { id }`: legt den
Vermerk „widerrufen" exklusiv an, dann wird das Token gelöscht; Einlösen danach einheitlich 410; zweimal widerrufen
bleibt 200; eingelöste → 409 (Zugang sperren); fremder Betrieb → 404. Nach 30 Tagen Nachlauf verschwinden erledigte
Einträge aus der Liste (der Vermerk bleibt).

**B4 — Einladungslink.** `https://<app>/einladung#einladung=<token>`. Das Token steht nur im Fragment (geht nie an
den Server, nie in einen Referrer). `src/ansichten/einladungen.jsx` liest es beim Laden des Moduls
(`einladungAusAdresse`) und entfernt es sofort per `history.replaceState` — auch wenn jemand angemeldet ist; die
Anmeldeseite öffnet dann das Einlösefeld vorbefüllt. `server.mjs` liefert `/einladung` (index.html) mit
`Referrer-Policy: no-referrer`; die CSP der Anwendung (`default-src 'self'`, nur eigene Skripte, Schriften, Verbindungen)
gilt unverändert, es gibt keine Drittanbieter-Ressourcen. Der Einlöseaufruf selbst geht mit
`referrerPolicy: "no-referrer"`. Der Link ersetzt keine Prüfung — eingelöst wird wie beim Abtippen.
QR-Code und Mailversand können auf diesem Link aufbauen (nicht Teil dieses Auftrags).

### 6.3 Mehrinstanzfähigkeit (B3) und ihre Grenze

Was die Ablage bietet (`server/lib/ablage.mjs`): atomares Schreiben (Zwischendatei + `rename`) und
**`setJSONWennNeu`** — Anlegen nur, wenn der Schlüssel fehlt: Zwischendatei vollständig schreiben, dann `link()`;
`link` scheitert mit `EEXIST`, wenn das Ziel schon existiert. Von vielen gleichzeitigen Anlegern gewinnt genau einer,
auch über Prozesse. Ein bedingtes Überschreiben (Vergleich der Fassung) gibt es nicht. `prozesssperre.mjs` stellt
sicher, dass im Betrieb nur ein Serverprozess je Ablage läuft; die Raumsperre (`raumsperre.mjs`) und die Reihe in
`token.mjs` sind prozesslokal.

Verfahren: Jede Einladung hat eine Kennung und einen Zustandsvermerk `einladungsstatus:<id>`, der genau einmal
angelegt werden kann. Einlösen, Widerrufen und Ersetzen konkurrieren um diesen Vermerk (`setJSONWennNeu`). Ablauf
beim Einlösen: Token ansehen (ohne zu verbrauchen) → Vermerk exklusiv anlegen (Verlierer: 410) → Token löschen
(nachweisbar, sonst 503) → fachliche Prüfungen → Zugang anlegen → Vermerk „fertig". Der Vermerk ist der Nachweis
der Entwertung; er steht, bevor irgendetwas angelegt wird.

**Grenze (ehrlich):** Das trägt nur, solange alle Prozesse DIESELBE Ablage auf EINEM Dateisystem sehen (ein Rechner,
ein Volume — auch zwei Container, die dasselbe Volume einbinden), weil nur dort `link()` atomar ist. Auf verteiltem
Speicher (NFS ohne verlässliches `link`, Objektspeicher, getrennte Volumes je Instanz) gilt es nicht; dort braucht es
einen Zustandsautomaten mit bedingtem Schreiben im Speicher selbst (Anlegen-wenn-fehlt bzw. Vergleich der Fassung,
etwa `If-None-Match`/`If-Match` oder eine Datenbank-Transaktion). Die Laufnummer je Person und die Prüfung „schon ein
Zugang" laufen weiter unter der prozesslokalen Raumsperre; über mehrere Prozesse schützt dort heute die
Prozesssperre (ein Prozess je Ablage) — für einen echten Mehrinstanzbetrieb wäre auch das auf bedingtes Schreiben
umzustellen. Die Sperre des generischen `token.mjs` bei einem Löschfehler ist für andere Zwecke (Registrierung,
Passwort) ohne Vermerk-Schreibrecht nur prozesslokal.

Nachweis: zwei Tests — zwei Modulinstanzen (eigene Reihen, eigene Raumsperren, eigene Ablage-Objekte) lösen
dieselbe Einladung gleichzeitig ein (4 Runden), und **zwei Node-Prozesse** auf derselben Ablage (3 Runden,
gemeinsamer Startzeitpunkt). Vorher rot (zwei Codes für dieselbe Person bzw. Kindprozess-Absturz beim gleichzeitigen
Anlegen), nachher genau ein Gewinner und genau ein Konto je Runde.

### 6.4 B5 — Zweites Merkmal beim Einlösen: geprüft, verworfen; stattdessen Benachrichtigung

Geprüft wurde, ob die Person beim Einlösen ein Merkmal aus dem Bestand bestätigen soll (Geburtsdatum,
Personalnummer). Entscheidung: **nicht umgesetzt**, aus Datenschutz- und Sicherheitsgründen:

- **Zweckbindung (Art. 5 Abs. 1 lit. b DSGVO):** Geburtsdatum (`geburtstag`/`geburtsdatum`, im Bestand für
  Jugendarbeitsschutz/Fachprüfung) und Personalnummer (für DATEV/Lohn) wurden für andere Zwecke erhoben. Als
  Anmeldegeheimnis wären sie eine Zweckänderung (Art. 6 Abs. 4), die eine eigene Prüfung und Information der
  Beschäftigten bräuchte; im Beschäftigtenkontext zusätzlich § 26 BDSG.
- **Datenminimierung:** Das Einlösen ist ohne Sitzung erreichbar. Ein Vergleich gegen den Bestand wäre ein Orakel
  für diese Daten (wer die Einladung hat, kann Geburtsdaten durchprobieren), und die Felder sind nicht in jedem
  Betrieb gepflegt.
- **Schutzwirkung gering:** Beide Merkmale kennt die Leitung selbst — gegen das in M3 beschriebene Risiko (die
  Leitung löst ein) hilft es nicht. Ein Geburtsdatum ist zudem mit wenigen tausend Versuchen ratbar.

Umgesetzt stattdessen: **Benachrichtigung der Leitung bei Einlösung** ohne Personendaten im Protokoll. Jede Einlösung
erscheint in der Einladungsliste mit Status „eingelöst" und Zeitpunkt; Einlösungen seit dem letzten Blick einer
Leitung des Betriebs werden als `neuEingeloest` gezählt und in der Oberfläche als Hinweis gezeigt („… seit deinem
letzten Blick eingelöst. War das nicht die eingeladene Person, bitte den Zugang sperren und neu einladen."). Das
Protokoll (`einladung`) enthält beim Ausstellen und Einlösen nur Rolle und Kennung der Einladung — keine Person,
keinen Namen, keinen Code (früher stand die Personenkennung darin). Zustellung per Mail/Push ist nicht umgesetzt
(siehe 6.6).

### 6.5 Tests

Neue Tests nur in den beiden bestehenden Dateien; keine bestehende Assertion geändert oder entfernt (die
Inventarliste `routen-inventar.test.js` um drei Wege ergänzt).

Vorher rot (neue Tests gegen den Stand vor dem Ausbau, Quelltexte auf den alten Commit zurückgesetzt, Tests neu):
`Tests 31 failed | 31 passed (62)` — alle 28 alten Tests grün, von den 34 neuen 31 rot und 3 grün. Die drei grünen
sind Positivkontrollen, die auch vorher gelten müssen: „eigener Zugangscode als Bestätigung → 200", „Anmeldung mit
Faktor vor < 5 min → 200", „`/` behält `strict-origin-when-cross-origin`".

| Punkt | neue Tests | vorher rot | nachher grün |
|---|---|---|---|
| M1 | 1 | 1 | 1 |
| M2 (+ N1) | 4 | 4 | 4 |
| N2 | 1 | 1 | 1 |
| N3 | 1 | 1 | 1 |
| B1 ohne Pflicht | 5 | 4 | 5 |
| B1 unter Pflicht | 3 | 2 | 3 |
| B2 (+ B5) Server | 7 | 7 | 7 |
| B2 Oberfläche | 3 | 3 | 3 |
| B3 | 2 | 2 | 2 |
| B4 (Fragment, replaceState, Server-Kopf) | 7 | 6 | 7 |
| **Summe** | **34** | **31** | **34** |

Nachher (lokal, Windows, vitest 4, `--testTimeout=60000`): `einladungen.test.js` 45/45,
`einladungen-oberflaeche.test.js` 17/17; zusammen mit `wp39-app-aufbau`, `routen-inventar`, `sitzungsinventar`,
`arbeitssitzung`, `token`, `rechtematrix-zeilen`, `verdrahtung`: 886/886. Gegenprobe der Nachbarn (Token,
Registrierung, Passwort, Konto-Anmeldung, Schreib-Halt, Zweitfaktor, frischer Faktor, Server): grün bis auf zwei
Fälle, die auf dem Stand vor dem Ausbau genauso scheitern (Windows: `server.test.js` „SIGTERM",
`sicherung-ablage.test.js` Zeitgrenze). `node werkzeug/verdrahtung-pruefen.mjs`: ok. `tsc -p jsconfig.json`: 0 Fehler.
eslint auf allen geänderten Dateien: 0 Fehler, 0 Warnungen.

### 6.6 Offene Punkte und Entscheidungen

- **Mehrinstanzbetrieb** (6.3): Für verteilten Speicher oder mehrere Volumes ist ein Zustandsautomat mit bedingtem
  Schreiben nötig; heute gilt ein Prozess je Ablage (Prozesssperre). Entscheidung, ob das angegangen wird, beim
  Betreiber.
- **Benachrichtigung per Mail/Push** bei Einlösung: nicht umgesetzt (nur Liste + Hinweis in der Anwendung).
  Entscheidung, ob die Leitung aktiv benachrichtigt werden soll (WP-30-Zustellung), offen.
- **B5 Zweitmerkmal**: verworfen (6.4). Sollte der Betreiber es dennoch wollen, braucht es eine
  Datenschutzbewertung (Zweckänderung, Information der Beschäftigten) — Vorlage an Datenschutz/Recht.
- **B1 für Kontositzungen**: Passwortbestätigung ist umgesetzt und auf Bibliotheksebene geprüft; ein HTTP-Ende-zu-Ende
  mit Konto-Anmeldung und Betriebsauswahl fehlt (unter Pflicht kann eine Kontositzung ohnehin keine Leitung sein).
- **Einlöseseite bei bestehender Anmeldung**: Ist auf dem Gerät schon jemand angemeldet, zeigt `/einladung` die
  Anwendung; das Token wird trotzdem sofort aus der Adresse entfernt, aber nicht eingelöst. Hinweis für die
  Browserprüfung.
- **Browserprüfung durch einen Menschen** (Staging, künstliche Daten): Einladen mit Bestätigungsabfrage (Sitzung
  älter als 5 min), Link in privatem Fenster öffnen → Adresszeile ohne `#…`, Feld vorbefüllt → einlösen → Liste
  zeigt „eingelöst · neu"; Widerruf einer offenen Einladung → Einlösen meldet ungültig; Smartphone-Breite.
- Aufräumen: Zustandsvermerke `einladungsstatus:` und `einladungsblick:` bleiben liegen (kein Personenbezug außer
  Kennungen); `tokensperre:` fällt über `tokenAufraeumen` nach Fristende.

Geänderte Dateien im Ausbau: `server/lib/einladungen.mjs`, `server/funktionen/einladung.mjs`, `server/lib/token.mjs`,
`server/lib/konten.mjs`, `server/lib/betreiber-zweifaktor.mjs` (neue Funktion `rollenFaktorFrisch`), `server.mjs`
(eine Zeile: Kopf für `/einladung`), `src/ansichten/einladungen.jsx`, `src/speicher.js`, `RECHTEMATRIX.md`,
`pruefungen/einladungen.test.js`, `pruefungen/einladungen-oberflaeche.test.js`, `pruefungen/routen-inventar.test.js`.
`src/App.jsx` und `src/main.jsx` im Ausbau unverändert.

## 7. Auflagen aus dem Sicherheitsreview (Branch `acc45/zugaenge/wp-18-fix`, Basis 13331cf)

Vorher-rot: Die neuen Tests liefen gegen den Servercode von 13331cf (`server/lib/einladungen.mjs`,
`server/lib/token.mjs`, `server/lib/betreiber-zweifaktor.mjs`, `server/funktionen/einladung.mjs` auf 13331cf
zurückgesetzt, Tests neu): **6 rot** (5 in `einladungen.test.js`, 1 in `token.test.js`), alle übrigen grün. Mit dem
Fix: alle grün. Keine bestehende Assertion geändert oder entfernt. Erwartungen, die altes Verhalten festschreiben:
keine gefunden — die bestehenden B1-Tests nutzen Zugänge ohne Faktor (ohne Pflicht) bzw. laufen unter Pflicht, beide
Wege sind von D-N2 nicht berührt.

| Auflage | Status | Test (Datei › Block › Fall) | 13331cf | Fix |
|---|---|---|---|---|
| M-1 (a) Vermerk „fertig" einmal wiederholen | umgesetzt | einladungen.test.js › M-1 › „ein gescheiterter Schreibversuch wird wiederholt: danach steht „fertig“" | rot (1 Versuch) | grün |
| M-1 (b) Liste leitet „eingelöst" aus dem Konto ab | umgesetzt | einladungen.test.js › M-1 › „Vermerk dauerhaft nicht schreibbar: Code kommt an, Liste zeigt „eingelöst“ (nicht „verbraucht“), neu gezählt" | rot (`verbraucht`) | grün |
| N-1 Rechte vor Bestätigung | umgesetzt | einladungen.test.js › N-1 › „Zugangscode-Sitzung ohne roles.assign …" und „Konto-Sitzung ohne roles.assign …" | rot (2) | grün |
| N-2 / D-N2 eingerichteter Faktor auch ohne Pflicht | umgesetzt | einladungen.test.js › N-2 / D-N2 (4 Fälle, am Dateiende) | rot („nur Zugangscode" → 200) | grün |
| N-3 Sperrvermerk aus `codeEinloesen` mit Frist | umgesetzt | token.test.js › N-3 › „nach tokenAufraeumen ist ein per Code eingelöstes, nicht löschbares Token weiterhin gesperrt" | rot (Vermerk weggeräumt) | grün |
| N-6 Zwei-Prozess-Test mit Bereitschaftssignal | umgesetzt (nur Test) | einladungen.test.js › B3 › „zwei Node-Prozesse auf derselben Ablage …" | grün (kein Verhalten geändert) | grün |
| N-4 Hinweis je Betrieb, kein Mail/Push | dokumentiert (7.6) | — | — | — |
| N-5 Wiederherstellung hebt Widerrufe auf | dokumentiert als Grenze (7.7) | — | — | — |

Verifikation (lokal, Windows, `--testTimeout=60000`): `einladungen.test.js` (53), `einladungen-oberflaeche.test.js`,
`routen-inventar.test.js`, `token.test.js` (29), `arbeitssitzung.test.js`, `sitzungsinventar.test.js` — zusammen
**163/163 grün** (Basis 154; +9 neu: 8 in `einladungen.test.js`, 1 in `token.test.js`). Zusätzlich, weil
`betreiber-zweifaktor.mjs` berührt ist: `betreiber-zweifaktor.test.js`, `betreiber-zweifaktor-pflicht.test.js`,
`rollen-zweifaktor.test.js`, `rollen-zweifaktor-merken.test.js`, `zugaenge-frischer-faktor.test.js` 104/104 grün.
`eslint .` 0 Fehler (geänderte Dateien ohne Warnung), `tsc -p jsconfig.json` ohne Fehler,
`node werkzeug/verdrahtung-pruefen.mjs` „Verdrahtung ok: 288 Prüfdateien" (nur die bekannten Warnungen zu
Paketständen).

### 7.1 M-1 — Abschlussvermerk schlägt nicht mehr stillschweigend fehl

`einladungEinloesen`, `abschluss`: Das Schreiben des Vermerks wird einmal wiederholt (zwei Versuche). Scheitern
beide, bleibt der beim Anlegen geschriebene Vermerk `{status: "eingeloest", fertig: false}` stehen — die Einladung
bleibt gesperrt. Der Einlösende bekommt seinen Code trotzdem: Der Zugang ist angelegt; ein 503 hinterließe einen
Zugang, den niemand kennt.

`einladungenListe`, `statusVon`: Hat eine Einladung einen Vermerk, der weder „widerrufen" noch „eingeloest + fertig"
ist, liest die Liste (nur dann, höchstens einmal je Abruf) die Konten und wertet die Einladung als **eingelöst**,
sobald ein Konto mit `einladung.id` = Einladungskennung existiert (gleicher Raum, gleiche `mandantId`). Der Hinweis
„neu eingelöst" zählt dann korrekt (er hängt am Zeitpunkt im Vermerk). Ein Lesefehler an den Konten ist 503, kein
„verbraucht" (fail-closed). Das gilt auch, wenn ein Fehler nach dem Anlegen „verbraucht" vermerkt hat, das Konto aber
steht — die Leitung sieht dann den Zugang und kann ihn sperren.

### 7.2 N-1 — Rechteprüfung vor der Bestätigung

`server/funktionen/einladung.mjs`: `POST /api/einladung` ruft zuerst `einladungRechtePruefen` (= `leitungPruefen`)
und erst danach `frischeBestaetigung`. Eine Sitzung ohne `roles.assign` bekommt ohne, mit falschem und mit richtigem
Passwort bzw. Zugangscode sowie mit TOTP dieselbe Antwort (403 „Einladungen verwaltet die Organisationsleitung.",
ohne `bestaetigung`-Feld, ohne die 400-ms-Verzögerung der Fehlbestätigung). Der Endpunkt ist damit kein Prüforakel
für Passwort oder Zugangscode mehr.

**Befund nebenbei (offen):** Eine Arbeitssitzung aus einem Konto (Betriebsauswahl, `betriebsauswahl.mjs`) trägt keine
`mandantId`. `leitungPruefen` verlangt sie — eine Kontositzung kann deshalb heute **keine** Einladung ausstellen,
auch als Leitung nicht (403 „Dieser Zugang ist keinem Betrieb eindeutig zugeordnet."). Der Passwortweg der frischen
Bestätigung war bis zu diesem Fix nur als Orakel erreichbar. Der Test prüft beide Lagen: heute (ohne `mandantId`:
drei gleiche Antworten) und mit in der Sitzung nachgetragener `mandantId` (dreimal 403 „keine Rollenvergabe"). Ob
Kontositzungen künftig `mandantId` tragen sollen, ist eine eigene Entscheidung, nicht Teil dieses Fixes.

### 7.3 N-2 / D-N2 — eingerichteter zweiter Faktor wird auch ohne Pflicht verlangt

Entscheidung D-N2 (Betreiber, verbindlich): Ist für den Zugang ein zweiter Faktor eingerichtet, wird er beim
Ausstellen auch OHNE 2FA-Pflicht verlangt — ein aktueller Code aus der App, oder eine Anmeldung MIT Faktor, die
höchstens fünf Minuten alt ist. Ohne eingerichteten Faktor bleibt es beim bisherigen Weg (Anmeldung ≤ 5 min oder der
eigene Zugangscode).

Begründung: Der Zugangscode ist der erste Faktor. Wer für seinen Zugang einen zweiten eingerichtet hat, hat damit
festgelegt, dass der erste allein nicht genügt — bei der Anmeldung ist der Faktor Pflicht, sobald er eingerichtet
ist (`codeZweifaktor`). Die frische Bestätigung vor dem Prägen eines neuen Zugangs darf nicht schwächer sein als die
Anmeldung selbst: Bisher reichten ein abgegriffenes Sitzungsmerkmal und ein mitgelesener Zugangscode für neue
Zugänge, obwohl ein Faktor da war. Ohne eingerichteten Faktor gibt es nichts Stärkeres zu verlangen; dort bleibt die
Anmeldung ≤ 5 min der frische Nachweis.

Umsetzung: `rollenFaktorEingerichtet` (`betreiber-zweifaktor.mjs`) sucht den Faktor wie `rollenFaktorFrisch`
(entlang `ersetztDurch`) und wertet zusätzlich den Vermerk `zweiterFaktor: true` am Zugang (pfefferunabhängig,
fail-closed). Lesefehler → 503. In `frischeBestaetigung` steht die Prüfung nach dem TOTP- und dem Pflichtzweig und
vor dem Zugangscode-Zweig. Kontositzungen (Passwort) sind nicht betroffen — ein Konto kennt keinen zweiten Faktor.

Tests: Faktor eingerichtet, Pflicht aus, Anmeldung > 5 min, nur Zugangscode → 403 (`bestaetigung: "zweifaktor"`),
nichts ausgestellt; ohne Angabe → 403; gültiger TOTP → 200; frische Anmeldung mit Faktor → 200; Zugang ohne Faktor,
Anmeldung ≤ 5 min → 200 und eigener Zugangscode nach > 5 min → 200 (unverändert).

### 7.4 N-3 — Sperrvermerk aus dem Codeweg

`token.mjs`, `codeEinloesen`: `verbrauchen(store, schluessel, eintrag)` statt `null`. Scheitert das Löschen, steht der
Sperrvermerk mit der Frist des Tokens (`bis`), nicht mit `bis: 0`; `tokenAufraeumen` entfernt ihn erst zusammen mit
dem Token. Der Test bildet den „anderen Prozess" (ohne die prozesslokale Sperre) mit einer frischen Modulinstanz nach
(`vi.resetModules`). Nebenwirkung: `verbrauchen` versucht den Codezeiger erneut zu löschen — er ist an dieser Stelle
schon gelöscht, ein Fehler wird wie bisher geschluckt.

### 7.5 N-6 — Zwei-Prozess-Test mit Bereitschaftssignal

Der Test startet beide Kindprozesse, wartet auf deren Zeile `BEREIT <Zeit>` (gesendet nach dem Laden der Module und
der Ablage) und gibt erst dann beiden das Startsignal (eine Zeile auf stdin). Keine feste Wartezeit mehr (vorher
Start = jetzt + 5 s). Neu geprüft: beide Bereitschaftszeitpunkte ≤ Startsignal, beide Startzeitpunkte ≥ Startsignal,
spätestes „bereit" ≤ frühester Start. Die bestehende Erwartung (genau einer gewinnt, ein Konto) bleibt.

### 7.6 N-4 — Hinweis „neu eingelöst" (nur dokumentiert)

Der Zeitpunkt des letzten Blicks (`einladungsblick:<Betrieb>`) gilt **je Betrieb, nicht je Leitung**: Hat eine
Leitung die Liste geöffnet, sieht eine zweite Leitung desselben Betriebs dieselbe Einlösung nicht mehr als „neu"
(Status „eingelöst" mit Zeitpunkt steht weiter in der Liste). Eine aktive Benachrichtigung per **Mail oder Push**
gibt es nicht; die Leitung erfährt die Einlösung nur beim Öffnen der Liste. Beides bleibt offen (siehe 6.6).

### 7.7 N-5 — Wiederherstellung einer Sicherung (Grenze, nur dokumentiert)

Die Einmaligkeit hängt an Vermerken in der Ablage (`einladungsstatus:`, `tokensperre:`, Laufnummer `einladungsnr:`).
Wird eine Sicherung von vor einem Widerruf (oder vor dem Ersetzen bzw. Einlösen) zurückgespielt, stehen Token und
Vermerke wieder wie damals — eine inzwischen widerrufene Einladung kann dann wieder einlösbar sein, solange ihre Frist
(7 Tage) läuft. Das ist das allgemeine Wiederherstellungsthema (jeder Widerruf und jede Sperre nach dem
Sicherungszeitpunkt geht verloren), nicht spezifisch für WP-18. Handhabung bis zu einer allgemeinen Lösung: nach einer
Wiederherstellung die offenen Einladungen in der Liste prüfen und gegebenenfalls widerrufen bzw. neu einladen.

Geänderte Dateien (Fix): `server/lib/einladungen.mjs`, `server/funktionen/einladung.mjs`, `server/lib/token.mjs`,
`server/lib/betreiber-zweifaktor.mjs` (neue Funktion `rollenFaktorEingerichtet`), `pruefungen/einladungen.test.js`,
`pruefungen/token.test.js`, dieses Dokument.
