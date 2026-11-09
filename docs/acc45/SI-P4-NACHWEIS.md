# SI-P4 – Zweiter Faktor für Leitung, Planung und Kunde

Branch `acc45/sicherheit/si-p4`, Basis `integration/release-v4` (18ce941). Befund P4 (mittel) aus
[SICHERHEIT-INTERN-2026-11.md](SICHERHEIT-INTERN-2026-11.md).

## Ausgangslage

- `server/lib/zweifaktor.mjs`: TOTP nach RFC 6238 (SHA-1, 30 s, 6 Stellen, Fenster ±1), Wiederholungsschutz über den
  zuletzt angenommenen Schritt, Geheimnis AES-256-GCM mit Schlüssel aus `CENTRIC_PFEFFER`, zehn
  Wiederherstellungscodes als HMAC. Die Bausteine sind rollenneutral (Ablage je `id`).
- `server/lib/betreiber-zweifaktor.mjs`: Der Weg über `/api/anmelden` (`zweifaktorAktion`: stand, beginnen,
  bestaetigen, abschalten; Pflicht beim Anmelden, Bremse je Code und Herkunft, Sitzungsende bei Wechsel) gab es nur
  für Codes der Rolle `betreiber`.
- `server/funktionen/daten.mjs`: Jede andere Rolle bekam auf `zweifaktorAktion` 400 („nur für Betreiberzugänge“).
  Leitung, Planung und Kunde meldeten sich mit dem Code allein an.
- `src/speicher.js`: „Zugang merken“ legte das Sitzungsmerkmal bei Häkchen für jede Rolle in `localStorage`, auch
  für Leitung (und bei Anmeldung mit Code auch für den Betreiber; nur der Demoweg schloss ihn aus).

## Änderung

- `server/lib/betreiber-zweifaktor.mjs`: Der bestehende Ablauf ist jetzt `codeZweifaktor(…, art)`;
  `betreiberZweifaktor` ist unverändert nach außen (gleiche id, Bremszähler `b:`, Texte, Pflicht nach WP-32d).
  Neu:
  - `ZWEIFAKTOR_ROLLEN = leitung, planer, subplaner, kunde`, `zweifaktorRolle()`.
  - `rollenZweifaktor()` – derselbe Ablauf für diese Rollen, eigene Ablage-id (`rollen-code:<schlüssel>`),
    eigener Bremszähler `r:`.
  - `rollenPflicht()` – Pflicht nur mit `CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT=1` (Vorgabe aus, auch in production).
    Unter Pflicht wie beim Betreiber: keine Sitzung ohne eingerichteten Faktor, kein Überschreiben einer laufenden
    Einrichtung, kein Abschalten über das Netz.
  - `merkenErlaubt(rollen, zweifaktorAktiv)` – Betreiber nie; eine der ZWEIFAKTOR_ROLLEN nur mit aktivem Faktor;
    leere Rollenliste nein.
- `server/funktionen/daten.mjs` (`/api/anmelden`): Für Codes der ZWEIFAKTOR_ROLLEN **oder** mit wirksamer Rolle
  daraus (Mitarbeitercode, dessen Person im Betrieb Leitung ist) läuft `rollenZweifaktor`. Ist ein Faktor
  eingerichtet, gibt es ohne gültigen Code keine Sitzung – unabhängig von der Pflicht (kein Umgehungspfad). Die
  Sitzung trägt `zweifaktor: true`, wenn sie mit bestandenem Faktor entstand. Antwort neu: `merkenErlaubt`.
  `/api/bestand` (GET) liefert ebenfalls `merkenErlaubt` (aus Code-Rolle, wirksamer Rolle und
  `sitzung.zweifaktor`), damit eine geänderte Rolle einen schon gemerkten Zugang aufhebt.
- `src/speicher.js`: gemerkt wird nur bei `merkenErlaubt === true` (fehlt die Angabe: nicht gemerkt). `lies()` nimmt
  einen gemerkten Zugang aus `localStorage`, wenn der Server `merkenErlaubt` nicht bestätigt (nur echte
  Serverantworten, nicht aus dem Dienstarbeiter). Demozugänge (ohne Faktor): Leitung, Planung, Kunde, Betreiber
  werden nie gemerkt.
- `src/betreiber-2fa.jsx`, `src/main.jsx`: In der Anmeldemaske „Zweiten Faktor einrichten oder verwalten“ – derselbe
  Abschnitt wie in der Betreiberkonsole (Stand, Einrichten, Bestätigen, Abschalten) mit dem eigenen Zugangscode,
  ohne Sitzung. Hinweistext am Häkchen. Das Code-Feld beim Anmelden (`ZweifaktorFeld`) bestand schon.
  `App.jsx` (Konfliktzone) ist nicht berührt.
- `.env.example`, `docs/BETRIEBSHANDBUCH.md`: neuer Schalter `CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT`.
- `package.json`: `pruefung:betreiber-zweifaktor` führt die zwei neuen Prüfdateien mit (läuft in `pruefung.yml`
  und in `npm run pruefung`). Workflows unverändert.

## Tests

Neu:

- `pruefungen/rollen-zweifaktor.test.js` (22 Tests, Unit + HTTP-Sonde gegen den echten Handler): Bausteine
  (Rollenliste, `merkenErlaubt`-Matrix, getrennte id, Pflichtschalter); Leitung ohne Faktor (Sitzung,
  `merkenErlaubt: false` in Anmeldung und Bestand); Einrichten (Geheimnis einmal, keine Sitzung); Bestätigen
  (falscher Code 401, richtiger aktiviert, zehn Wiederherstellungscodes, alte Sitzung endet → 401); Anmeldung ohne
  Code 401, falscher/fehlformatierter Code 401, richtiger Code 200 mit `merkenErlaubt: true`; Wiederholungsschutz
  (derselbe Code und älterer Schritt 401); Wiederherstellungscode genau einmal; Abschalten nur mit frischem Code;
  Bremse je Code (429, danach auch der richtige Code nicht); Planer, Subplaner, Kunde; Mitarbeitercode mit wirksamer
  Rolle Leitung; Mitarbeiter (400, merken erlaubt); Betreiber (nie merken); Pflicht (403 ohne Faktor, Einrichtung
  möglich, danach nur mit Code, kein Abschalten über das Netz).
- `pruefungen/rollen-zweifaktor-merken.test.js` (7 Tests, `src/speicher.js`): merken nur mit `merkenErlaubt === true`,
  fehlende Angabe = nicht merken, Demowege, `lies()` räumt einen nicht mehr erlaubten gemerkten Zugang.

Rot auf altem Stand (Server- bzw. Client-Dateien auf `HEAD` zurückgesetzt, neue Tests unverändert):

| Datei | alter Stand | neuer Stand |
|---|---|---|
| `rollen-zweifaktor.test.js` | 21 von 22 rot | 22/22 grün |
| `rollen-zweifaktor-merken.test.js` | 4 von 7 rot | 7/7 grün |

Angepasst (keine Assertion entfernt): `pruefungen/betreiber-zweifaktor.test.js`, Test „andere Rollen kennen keine
Zwei-Faktor-Aktion“ – prüfte bisher die Leitung (400 auf `beginnen`), was SI-P4 bewusst ändert. Er prüft jetzt einen
Mitarbeitercode mit denselben drei Assertions (400, 200, `zweifaktor` undefined) und zusätzlich, dass die Leitung
ohne Faktor weiter angemeldet wird (`zweifaktor: false`). Auf dem neuen Stand rot ohne diese Anpassung (1 von 18).

Läufe (lokal, Windows, Node 22, vitest 4.1.12):

| Lauf | vorher (18ce941) | nachher |
|---|---|---|
| `betreiber-zweifaktor`, `betreiber-zweifaktor-pflicht`, `zweifaktor`, `zugaenge-frischer-faktor`, `anmeldung-http` | 157/157 | 157/157 |
| dieselben + `rollen-zweifaktor*`, `entwuerfe`, `stempel-integritaet` (9 Dateien) | – | 343/343 |
| `npm run pruefung:betreiber-zweifaktor` | 18/18 (eine Datei) | 47/47 (3 Dateien) |
| `npm run pruefung:sicherheit-intern` | 58/58 | 58/58 |
| `npm run lint` (geänderte Dateien), `npm run pruefung:typen` | – | ohne Befund |
| `node werkzeug/verdrahtung-pruefen.mjs` | – | ok, 283 Prüfdateien |
| alle vitest-Dateien `pruefungen/` (Volllauf, parallel belastet) | – | 7456 grün, 28 rot, 15 übersprungen (262 Dateien) |

Die 28 roten im Volllauf liegen in 9 Dateien und sind umgebungsbedingt bzw. lastabhängig, nicht durch SI-P4:
`zugaenge-anlegen`, `server`, `selbsttest`, `ablage`, `mail-push-produktion`, `sicherung-ablage`,
`wp28b-sicherung-last` sind **auch auf dem alten Stand (18ce941) rot** – einzeln gelaufen alt 17 rot, neu 14 rot
in diesen 7 Dateien (Ursachen: `jq` fehlt unter Windows, EPERM beim Umbenennen, SIGTERM/Dateirechte unter
Windows, Zeitgrenzen). `entwuerfe` und `stempel-integritaet` waren nur im belasteten Volllauf rot und sind einzeln
auf dem neuen Stand grün. Die CI (Linux) ist maßgeblich.

## Offene Punkte und Entscheidungen

1. **Pflicht im Pilot (Betreiberentscheidung).** Umgesetzt ist der Schalter `CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT`,
   Vorgabe aus. Die Akzeptanz verlangt TOTP „mindestens im Pilot“; ob die Pflicht für den Pilot mit echten Daten
   eingeschaltet wird (und ab wann, nach Einrichtung durch alle Leitungen), entscheidet der Betreiber. Fail-closed
   gilt unabhängig davon: ein eingerichteter Faktor ist immer Pflicht, und „Zugang merken“ ist ohne Faktor gesperrt.
2. **Umfang „Planung“ und „Kunde“ (fachlich).** Umgesetzt mit dem sicheren Default: `planer` und `subplaner`
   (PLANUNGSROLLEN) sowie `kunde` bekommen den Faktor und die Merken-Sperre, nicht nur die Leitung. Falls „Zugang
   merken“ für Planung/Kunde ohne Faktor erlaubt sein soll, ist das eine Entscheidung, keine technische Frage.
3. **Verlust von Gerät und Wiederherstellungscodes.** Rückweg ist ein neuer Zugangscode (alter wird gesperrt); ein
   Offline-Werkzeug wie `werkzeug/betreiber-2fa-zuruecksetzen.mjs` gibt es für diese Rollen nicht. Unter Pflicht ist
   Abschalten über das Netz verweigert.
4. **Konto-Anmeldung (E-Mail/Passwort, Arbeitssitzung aus Account).** Hat noch keinen zweiten Faktor; solche
   Sitzungen tragen kein `zweifaktor` und erhalten daher `merkenErlaubt: false` für Leitung/Planung/Kunde
   (fail-closed). TOTP für Accounts ist ein eigenes Paket.
5. **Bestehende Sitzungen.** Ein vor dem Ausrollen gemerkter Leitungszugang wird beim nächsten Laden aus
   `localStorage` genommen (Reiter bleibt angemeldet). Serverseitig laufen bestehende Sitzungen bis zu ihrer Frist;
   beim Einrichten des Faktors enden alle Sitzungen des Codes.
6. **Oberfläche.** Die Einrichtung sitzt in der Anmeldemaske (ohne Sitzung, mit dem Code als Ausweis), nicht in der
   App selbst; eine Einrichtung aus den Einstellungen der Leitung (App.jsx) ist nicht gebaut. Browser-/Smartphone-Test
   der Maske steht aus.
7. Review (Sicherheit) erforderlich; nicht integriert, nicht auf Staging geprüft, nicht deployt.

## Auflagen aus Review

Unabhängiges Sicherheitsreview von PR #120. Branch `acc45/sicherheit/si-p4-auflagen` auf `origin/review/si-p4`
(f17f417). Punkt 4 und 5 oben sind damit unter Pflicht überholt (siehe M1/M2).

| Auflage | Status | Umsetzung |
|---|---|---|
| **M1** (mittel) Konto-Anmeldung und Betriebsauswahl umgehen die Pflicht | erledigt | siehe unten |
| **M2** (mittel bei Pflicht) Hochstufung nach der Anmeldung | erledigt, Sitzung wird **beendet** | siehe unten |
| **N2** (niedrig) fehlender/gewechselter `CENTRIC_PFEFFER` | erledigt | siehe unten |
| Negativtests (rot zuerst) | erledigt | 13 neue Tests rot auf altem Stand, alle grün |
| **N1, N3, N4** | dokumentiert (N4 zusätzlich als Warnung umgesetzt) | Restrisiken unten |

**M1.** Die Konto-Anmeldung (`/api/account/anmelden`) legt nur eine Identität an: kein Merkmal in der Antwort, keine
Rolle, kein Bestand. Rechte entstehen erst bei der Betriebsauswahl — dort wird geprüft (`lib/betriebsauswahl.mjs`,
`betriebWaehlen`): Unter `CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT=1` und Rolle der Mitgliedschaft **oder** wirksamer Rolle der
Person aus `ZWEIFAKTOR_ROLLEN` gibt es keine Arbeitssitzung; `/api/account/betrieb` antwortet 403
`{ fehler: "zweifaktor-pflicht", hinweis }` ohne Personendaten und ohne Rolle. Ohne Pflicht unverändert. Die
Konto-Anmeldung selbst wird bewusst nicht abgewiesen: Sie kennt zu diesem Zeitpunkt keine Rolle, und ein Konto kann
zugleich Mitarbeiter-Mitgliedschaften haben, die weiter offen bleiben sollen. Die Rolle `kunde` ist über ein Konto
gar nicht erreichbar (Mitgliedschaft mit `kunde` wird abgelehnt, `wirksameRolle` liefert nie `kunde` aus der
Personalliste) — Test dazu. `.env.example` und `docs/BETRIEBSHANDBUCH.md` beschreiben jetzt genau dieses Verhalten.

**M2 — Entscheidung: beenden statt nur abweisen.** Eine Sitzung ohne `zweifaktor: true` ist unter Pflicht für
Leitungs-, Planungs- oder Kundenrechte nicht tragbar, gleich wie sie entstand: Hochstufung nach der Anmeldung, Sitzung
aus der Zeit vor dem Einschalten der Pflicht, Arbeitssitzung aus einem Konto. Nur abweisen ließe sie bestehen; nach
einer Rückstufung (oder bei abgeschalteter Pflicht) arbeitete dasselbe Merkmal weiter, obwohl es nie einen zweiten
Faktor gesehen hat. Deshalb: `rollenSitzungOhneFaktor(s0, rolleJetzt)` (`lib/betreiber-zweifaktor.mjs`) ist wahr, wenn
Pflicht aktiv, Rolle beim Anlegen oder jetzt wirksame Rolle eine der `ZWEIFAKTOR_ROLLEN` und `s0.zweifaktor !== true`.
Die Regel umfasst die geforderte Bedingung `zweifaktorRolle(s.rolle) && !zweifaktorRolle(s0.rolle)` und ist breiter.
Geprüft an drei Stellen (korrigiert im Delta-Review, siehe unten):
- `lib/arbeitssitzung.mjs` (`arbeitssitzungLesen`, der eine Prüfpunkt für alle Pfade inkl. Zugang sperren, Kalender,
  Zustellung): **nur die Rolle beim Anlegen** (`s0.rolle`); Sitzung wird beendet, `grund: "zweifaktor-pflicht"`. Eine
  Hochstufung nach der Anmeldung sieht diese Stelle nicht.
- `funktionen/daten.mjs` nach der Berechnung der wirksamen Rolle (eine lokale Prüfung, 9 Zeilen): Hochstufung; Sitzung
  wird beendet, 401 `{ zweifaktor: "neu-anmelden" }`.
- `funktionen/zustellung.mjs`, `POST /zustellung/senden`, nach der Berechnung der wirksamen Rolle und **vor**
  `anstossRegel`: dieselbe Regel `rollenSitzungOhneFaktor(s, wirksameRolle(s, bestand))`, Sitzung beendet, 401
  `{ zweifaktor: "neu-anmelden" }` (Delta-Auflage 1). Die übrigen Zustellpfade (`schluessel`, `anmelden`/`abmelden`
  des eigenen Geräts) geben keine Rollenrechte und bleiben bei der Prüfung in `arbeitssitzungLesen`.
Ausgenommen: Pflicht aus, Sicherungsschlüssel (`nurSicherung`, eigene Prüfung SI-P1), Betreiber (eigene Pflicht
WP-32d), Demositzungen (`demo: true` **und** Raum `demo-*`). Wirkung im Betrieb: Mit dem Einschalten der Pflicht
enden alle Leitungs-/Planungs-/Kundensitzungen ohne Faktor bei ihrer nächsten Anfrage.

**N2.** Der Faktor liegt unter einer Kennung aus dem gepfefferten Ablageschlüssel; ohne oder mit anderem Pfeffer zeigt
die Rechnung auf eine leere Kennung, und die Anmeldung lief ohne Faktor durch. Jetzt:
- Nach dem Bestätigen trägt der Zugang den Vermerk `zweiterFaktor: true` (alle Ablageschlüssel des Codes, neu/
  gefunden/alt); er hängt nicht am Pfeffer. Vor dem Abschalten wird er entfernt (scheitert das: 503, Faktor bleibt).
- `rollenZweifaktor`: ohne Pfeffer und (Vermerk oder Pflicht) → 503 `zweifaktor: "pfeffer"`; mit Pfeffer, Vermerk, aber
  unter der jetzigen Kennung kein aktiver Faktor (Pfeffer gewechselt, Eintrag weg) → 503. Kein Durchlassen, kein
  Neueinrichten mit dem Code allein. Rückweg: neuer Zugangscode.
- Ein Zugang, der nur unter dem gepfefferten Schlüssel liegt, ist ohne Pfeffer gar nicht auffindbar (401 „Unbekannter
  Zugangscode“), also ebenfalls keine Sitzung.
- Betreibercodes unverändert (unter Pflicht ohne Pfeffer weiterhin 403, Test in `betreiber-zweifaktor-pflicht`).

**Negativtests** (`pruefungen/rollen-zweifaktor.test.js`, Abschnitt „Auflagen“, und `pruefungen/betriebsauswahl.test.js`,
„SI-P4 M1“):
- Mitarbeitercode, wirksame Rolle Leitung, Faktor eingerichtet: ohne Code 401 (ohne und mit Pflicht; mit eingerichtetem
  Faktor ist 401 „erforderlich“ die richtige Antwort). Ohne Faktor unter Pflicht 403 „einrichten“.
- Coderolle Leitung, Person im Bestand Mitarbeiter: Faktor gilt (401 ohne, 200 mit Code).
- M2: Sitzung als Mitarbeiter, Person danach Leitung, unter Pflicht 401 `neu-anmelden`; danach auch ohne Pflicht und
  nach Rückstufung 401 (beendet). Ohne Pflicht: unverändert (Rechte aus der Personalliste). Leitungssitzung aus der
  Zeit vor der Pflicht: beendet.
- M1: Betriebsauswahl Leitung/Planer/Subplaner unter Pflicht 403, keine Arbeitssitzung, keine Personendaten; Mitglied-
  schaft Mitarbeiter mit Person Leitung 403; Mitarbeiter 200; ohne Pflicht Leitung 200; Arbeitssitzung aus Konto vor
  der Pflicht wird beendet; Kunde über Konto nicht anlegbar.
- `/api/demo` unter Pflicht: **festgelegt als Ausnahme** für Demoräume — Sitzung und Bestand 200, `merkenErlaubt: false`.
  Ein `demo`-Kennzeichen ohne Raum `demo-*` ist keine Ausnahme (Baustein-Test).
- Fehler im Faktor-Speicher (unlesbarer Eintrag): 503, keine Sitzung, mit und ohne Pflicht.
- Pfeffer fehlt / gewechselt bei aktivem Faktor: 503, kein Neueinrichten; unter Pflicht ohne Pfeffer 503; Abschalten
  entfernt den Vermerk.
- N4: unerwartete Schalterwerte erkannt.

Angepasste bestehende Tests: keine Assertion entfernt oder abgeschwächt; kein bestehender Test prüfte das alte
Verhalten unter Pflicht (Pflicht war in allen Konto-/Betriebsauswahl-Tests aus). Einzige Änderung an bestehendem
Test: „SI-P4 Bremse je Code“ bekommt eine Zeitgrenze von 30 s statt 5 s — er wartet 400 ms je falschem Code und lief im
belasteten Gesamtlauf schon auf dem Ausgangsstand in die 5-s-Grenze (vorher einzeln grün, parallel rot).
`rollen-zweifaktor.test.js`: Probebestand in `bestandSetzen()` ausgelagert (zwei Personen ergänzt), Inhalte gleich.

Rot auf altem Stand (Server-Dateien auf f17f417, neue Tests unverändert): `rollen-zweifaktor.test.js` +
`betriebsauswahl.test.js` 13 von 85 rot (M2 ×3, N2 ×4, N4, M1 ×5). Neuer Stand: 85/85 grün.

Läufe (lokal, Windows, Node 24, vitest 4.1.10):

| Lauf | vorher (f17f417) | nachher |
|---|---|---|
| 12 Dateien: `rollen-zweifaktor`, `rollen-zweifaktor-merken`, `betreiber-zweifaktor`, `betreiber-zweifaktor-pflicht`, `betriebsauswahl`, `accountanmeldung`, `anmeldung-http`, `demo-rollenwaehler`, `demo-schalter`, `zweifaktor`, `arbeitssitzung`, `code-sitzung-person` | 362/363 (1 Zeitgrenze, einzeln grün) | 385/385 (mit `--testTimeout=60000`) |
| dieselben 12 + `sitzungsinventar`, `zugaenge-frischer-faktor`, `doku` (15 Dateien) | – | 420/420 (mit `--testTimeout=60000`) |
| `rollen-zweifaktor.test.js` einzeln | 22/22 | 36/36 |
| `betriebsauswahl.test.js` einzeln | – | 49/49 |
| `eslint` geänderte Dateien / `npm run lint` | – | 0 Fehler (Warnungen nur Altbestand) |

Zeitgrenzen: Der Rechner war während der Läufe stark belastet (parallele Agenten). Mit der Vorgabe 5 s liefen
`betreiber-zweifaktor` und `zweifaktor` in Zeitgrenzen — **auf dem alten Stand f17f417 genauso** (13 von 18 rot in
`betreiber-zweifaktor`, Zeitüberschreitungen und Folgefehler); der alte Stand war unter geringerer Last zu Beginn
grün (Zeile oben), der neue ist mit `--testTimeout=60000` grün. Die CI (Linux) ist
maßgeblich.

Weitere Änderung: `/api/einrichten/umgebung` meldet `rollenZweifaktorPflicht` und warnt bei unerwartetem Schalterwert
(N4).

### Restrisiken (dokumentiert, nicht umgebaut)

- **N1 Demozugang.** `/api/demo` (öffentlich, ohne Code) erzeugt in `demo-*`-Räumen auch unter Pflicht Sitzungen mit
  Leitungsrolle. Tragbar, solange Demoräume nur Beispieldaten enthalten und `CENTRIC_DEMO` im Pilot mit echten Daten aus
  ist (Vorgabe aus). Demo-**Codes** über `/api/anmelden` unterliegen der Pflicht weiterhin (strenger).
- **N3 Einrichtung mit gestohlenem Code ohne Pflicht.** Ohne Pflicht kann, wer einen Leitungscode kennt, den Faktor
  vor dem Eigentümer einrichten und ihn so aussperren. Rückweg: neuer Zugangscode. **Frage an den Betreiber:** Soll es
  für diese Rollen ein Offline-Zurücksetzen wie `werkzeug/betreiber-2fa-zuruecksetzen.mjs` geben, oder bleibt „neuer
  Code“ der einzige Rückweg?
- **N4 Schalter nur „1“.** Andere Werte („ja“, „true“) lassen die Pflicht aus. Umgesetzt als Warnung in
  `/api/einrichten/umgebung` (nicht in `/gesund`: dessen Stufen lösen Alarme aus; eine Konfigurationswarnung gehört in
  den Umgebungsbericht).
- **Ohne Pfeffer, ohne Pflicht, ohne Vermerk:** Anmeldung mit dem Code allein wie bisher (ein Faktor lässt sich dort
  gar nicht einrichten). Vermerk-Schreiben kann scheitern (Ablagefehler): Der Faktor gilt dann, nur der
  Pfeffer-Schutz fehlt für diesen Zugang; protokolliert, Antwort trägt `vermerk: false`.
- **Sicherungsschlüssel** (`nurSicherung`, Rolle Leitung, Vollausgabe lesend) sind von der Pflicht ausgenommen; sie
  entstehen unter Pflicht ohnehin nur aus einer Sitzung mit Faktor, ältere bleiben gültig (SI-P1-Prüfung).
- **Betreiber:** N2-Vermerk nicht übernommen (eigene Pflicht in production, Offline-Werkzeug); bei Bedarf eigenes Paket.
- **Konten mit zweitem Faktor** (TOTP für Accounts) bleiben ein eigenes Paket; bis dahin ist unter Pflicht der
  Zugangscode der einzige Weg für Leitung/Planung über Arbeitsbereiche.

## Auflagen aus dem Delta-Review

Branch `acc45/sicherheit/si-p4-delta` auf `acc45/sicherheit/si-p4-auflagen` (ac1e06d).

| Auflage | Status | Umsetzung |
|---|---|---|
| **1** (blockierend) Zustellung rechnet Rechte mit der wirksamen Rolle, prüft Faktor aber nur mit der Anlegerolle | erledigt | `funktionen/zustellung.mjs` |
| **2** (blockierend, Doku) Über das Konto angelegte Betriebe unter Pflicht für ihre Leitung nicht erreichbar | dokumentiert + Test, nicht umgebaut | Handbuch, Test, offene Entscheidung unten |
| `vermerk: false` als Ablehnung | **nicht umgesetzt**, Restrisiko | siehe unten |
| Wettlauf `faktorVermerken` ↔ Zugang sperren | dokumentiert, nicht umgebaut | siehe unten |

**Auflage 1 — Zustellung.** `POST /zustellung/senden` las die Sitzung über `arbeitssitzungLesen` (Prüfung nur gegen
`s0.rolle`) und gab Rechte über `anstossRegel(wirksameRolle(s, bestand))`. Eine als Mitarbeiter **ohne** Faktor
angelegte Sitzung, deren Person danach Leitung wurde, konnte unter Pflicht so jede Mitteilung des Betriebs anstoßen
(`/api/*` wies dieselbe Sitzung schon ab). Jetzt wird vor `anstossRegel` mit `rollenSitzungOhneFaktor(s, rolleWirksam)`
geprüft — dieselbe Regel wie in `daten.mjs`: Pflicht aktiv, wirksame Rolle (oder Anlegerolle) mit Faktorpflicht,
`s0.zweifaktor !== true` → Sitzung beenden, protokollieren, 401 `{ fehler, zweifaktor: "neu-anmelden" }`. Ausnahmen
unverändert über die Funktion (Pflicht aus, Demositzung im `demo-*`-Raum, Sicherungsschlüssel, Betreiber).

Tests (`pruefungen/rollen-zweifaktor.test.js`, „SI-P4 Delta-Auflage 1“), über die echten Handler `/api/anmelden`,
`/api/demo`, `/api/bestand` und `/zustellung/senden`:
- Mitarbeitersitzung ohne Faktor, Person danach Leitung, unter Pflicht `POST /zustellung/senden` → 401
  `neu-anmelden`, kein `ergebnis`; danach (ohne Pflicht, Rückstufung) weder Zustellung noch `/api/bestand` (401,
  Sitzung beendet). **Rot auf ac1e06d** (200 mit `ergebnis`), grün nach der Änderung.
- Ohne Pflicht unverändert: Hochstufung gibt die Rechte der Leitung, 200, Sitzung bleibt.
- Mitarbeitersitzung ohne Hochstufung unter Pflicht: 200, Sitzung bleibt.
- Demo-Ausnahme: Demositzung Leitung (`/api/demo`, Raum `demo-*`, mit Person) stellt unter Pflicht zu (200), Sitzung
  bleibt.

**Auflage 2 — über das Konto angelegte Betriebe.** `lib/provisionierung.mjs` (Testbetrieb aus der Registrierung) legt
die Leitung als Konto-Mitgliedschaft `rolle: "leitung"` an — **ohne Zugangscode**. Unter
`CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT=1` öffnet die Betriebsauswahl diesen Betrieb nicht (M1): 403
`{ fehler: "zweifaktor-pflicht", hinweis: "… mit dem Zugangscode und dem Code aus der App anmelden." }`, keine
Arbeitssitzung. Den Zugangscode gibt es aber nicht; der Hinweis führt ins Leere. **Folge: Ein solcher Betrieb ist unter
Pflicht für seine Leitung nicht erreichbar.** Bewusst nicht umgebaut. Festgehalten in
`pruefungen/betriebsauswahl.test.js`, „SI-P4 Delta-Auflage 2“ (echter Weg: Registrierung, Bestätigung, Passwort,
Provisionierung, Konto-Anmeldung über HTTP): kein Zugangscode für den Raum; unter Pflicht 403 mit Hinweis, keine
Arbeitssitzung; ohne Pflicht 200 als Leitung. Ändert sich das Verhalten, muss der Test bewusst mitgeändert werden.
Im Handbuch (`CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT`) als Warnung vor dem Einschalten vermerkt. Hinweis: Die
Provisionierung hat derzeit keinen öffentlichen Endpunkt (Test „wird von keinem öffentlichen Endpunkt für den
Accountweg aufgerufen“); die Lage betrifft also nur Betriebe, die auf diesem Weg tatsächlich entstanden sind oder
entstehen werden.

**Offene Produktentscheidung: Rückweg für Konto-Betriebe unter Pflicht** (nicht implementiert):
1. **Zugangscode bei der Provisionierung mit anlegen** (Leitungscode, Faktor bei erster Anmeldung einzurichten) —
   einfachster Weg in die bestehende Pflichtlogik; Frage: wie wird der Code sicher übergeben (Mail? einmalige Anzeige?).
2. **Zugangscode nachträglich durch den Betreiber anlegen** (Betreiberoberfläche / Werkzeug) für einen bestehenden
   Konto-Betrieb — manuell, pro Fall, mit Identitätsprüfung.
3. **Zurücksetzen durch den Betreiber offline** (analog `werkzeug/betreiber-2fa-zuruecksetzen.mjs`), z. B. Ausnahme
   je Raum — widerspricht dem Sinn der Pflicht, nur als Notweg.
4. **Zweiter Faktor für Konten** (TOTP am Account) — fachlich sauber, eigenes Paket (siehe Restrisiken oben).
5. **Pflicht nur für Räume mit echten Daten** / Konto-Testbetriebe ausnehmen — schwächt die Pflicht, nur wenn
   Testbetriebe nachweislich keine echten Personendaten tragen.
Bis zur Entscheidung: Pflicht nur einschalten, wenn keine Konto-Betriebe genutzt werden, oder deren Leitung vorher
über einen manuell angelegten Zugangscode (Weg 2) versorgen.

**Nicht blockierend — `vermerk: false`** (`lib/betreiber-zweifaktor.mjs`, Bestätigen): Scheitert das Schreiben des
Vermerks `zweiterFaktor` nach der Aktivierung, gilt der Faktor, die Antwort trägt `vermerk: false`, protokolliert wird
„Vermerk am Zugang nicht geschrieben“. Eine Ablehnung an dieser Stelle hieße, die schon erfolgte Aktivierung und das
Beenden der Sitzungen zurückzunehmen (oder einen Faktor ohne Vermerk aktiv zu lassen und trotzdem „Fehler“ zu melden) —
nicht klein und nicht risikolos, daher **nicht umgesetzt**. Restrisiko: Für diesen einen Zugang fehlt der Schutz gegen
fehlenden/gewechselten Pfeffer (N2), bis der Faktor neu eingerichtet wird. Der Faktor selbst gilt.

**Nicht blockierend — Wettlauf `faktorVermerken` ↔ Zugang sperren** (nur dokumentiert): `faktorVermerken` liest den
Zugang (`kontoLesenStreng`) und schreibt ihn mit `{ ...e, zweiterFaktor: true }` (bzw. ohne Vermerk) zurück, ohne
Sperre oder Versionsprüfung. Sperrt die Leitung denselben Zugang (`/api/zugang-sperren`, `daten.mjs`,
`kontoSchreiben(… gesperrt: true)`) genau zwischen diesem Lesen und Schreiben, überschreibt `faktorVermerken` die
Sperre mit dem alten Stand (verlorene Aktualisierung). Laufende Sitzungen beendet die Sperre trotzdem; der Code wäre
danach aber wieder anmeldefähig (mit Faktor). Fenster: Millisekunden, nur während Bestätigen/Abschalten des Faktors
für genau diesen Code, und wer bestätigt, kennt Code und Faktor. Abhilfe später: Schreiben unter derselben
Prozesssperre wie das Sperren, oder bedingtes Schreiben (nur Feld setzen, `gesperrt` neu lesen). Nicht umgebaut.

**Läufe Delta-Review** (lokal, Windows, Node 24, vitest 4.1.10, Rechner stark belastet durch parallele Agenten). Acht
Dateien: `rollen-zweifaktor`, `rollen-zweifaktor-merken`, `betriebsauswahl`, `arbeitssitzung`, `zustellung-rechte`,
`betreiber-zweifaktor`, `betreiber-zweifaktor-pflicht`, `provisionierung`.

| Lauf | vorher (ac1e06d) | nachher |
|---|---|---|
| Vorgabe-Zeitgrenzen (5 s Test / 10 s Hook) | 213/244 (31 rot: 26 Zeitüberschreitungen + Folgefehler) | 196/250, 12 rot, 42 übersprungen (Hook-Zeitüberschreitung in `zustellung-rechte`, 10 Test-Zeitüberschreitungen + Folgefehler) |
| `--testTimeout=60000` (vorher ohne, nachher mit `--hookTimeout=60000`) | 201/244, 1 rot (Zeitgrenze 40 s im Test selbst, `betriebsauswahl` Bremse), 42 übersprungen (Hook 10 s in `zustellung-rechte`) | **250/250 grün** |
| Neue Tests einzeln (`-t "Delta-Auflage 1"` / `"Delta-Auflage 2"`) | Auflage 1: 1 rot, 3 grün | 4/4 + 2/2 grün |
| `npm run lint` | – | 0 Fehler (153 Warnungen, Altbestand; geänderte Dateien ohne Warnung) |

Fehlschläge mit Vorgabe-Zeitgrenzen sind Zeitüberschreitungen unter Last und deren Folgefehler (ein abgebrochener Test
hinterlässt Zustand, z. B. Pflicht-Schalter oder halb eingerichteten Faktor; dieselben Tests sind mit
`--testTimeout=60000` grün); keine Assertion entfernt, kein Test abgeschwächt. Die CI (Linux) ist maßgeblich.
