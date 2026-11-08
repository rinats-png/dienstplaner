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
