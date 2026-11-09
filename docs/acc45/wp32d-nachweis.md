# WP-32d — Betreiber-2FA verpflichtend vor produktivem Betrieb: Nachweis

Branch `feature/wp15-wp32d`, Basis `bda8b68` (integration/release-v4). Baut auf WP-32b/32c auf
(`server/lib/betreiber-zweifaktor.mjs`, `wp32b-nachweis.md`). Kein echtes Geheimnis angefasst, kein Betreibercode
verändert; das Verhalten des Betreiber-Logins ändert sich nur dort, wo die Pflicht greift.

## Was gilt jetzt

| Umgebung | Betreibercode ohne eingerichteten zweiten Faktor |
|---|---|
| `NODE_ENV=production` (Docker-Image, Produktion/Staging-VPS) | **keine Sitzung** (403, `zweifaktor: "einrichten"`); nur `stand`, `beginnen`, `bestaetigen` |
| sonst, `CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT=1` | wie oben |
| sonst (Entwicklung, Prüfungen) | wie bisher: Sitzung mit dem Code allein |

`betreiberPflicht()` (`betreiber-zweifaktor.mjs`) wird bei jedem Aufruf gelesen. **Kein Abschalter in production:**
`CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT=0`, `aus`, leer — alles bleibt Pflicht (fail-closed). Eingerichteter Faktor galt
schon vorher immer (Anmeldung nur mit Code); unverändert.

Die Sitzung eines Betreibers entsteht ausschließlich in `daten.mjs` (`/api/anmelden`, nach `betreiberZweifaktor`);
`/api/demo` weist die Rolle ab, `betriebsauswahl.mjs` vergibt die Rolle nach Personen im Bestand. Ein Test pinnt die
Stellen, an denen `sitzungAnlegen(` vorkommt (Quelltext-Invariante).

## Einrichtungsweg (erster Zugang)

1. `werkzeug/zugaenge-anlegen.sh` legt den Betreibercode an (unverändert) und weist in der Ausgabe auf Pflicht und
   Wiederherstellung hin.
2. Mit dem Code: Anmeldemaske → „Zwei-Faktor einrichten“ (Konsole) bzw. `/api/anmelden` mit `zweifaktorAktion`
   `beginnen` → Geheimnis/otpauth **einmal**; in die Authenticator-App, dann `bestaetigen` mit dem ersten Code → zehn
   Wiederherstellungscodes **einmal** (offline sichern). Danach Anmeldung nur mit Code.
3. Voraussetzung: `CENTRIC_PFEFFER` gesetzt (ohne ihn: 503, kein Faktor, keine Sitzung — fail-closed; `deploy.sh`
   verlangt ihn ohnehin).

Restrisiko Bootstrap: Zwischen dem Anlegen des Codes und dem Bestätigen kann jede Person, die den Code kennt, den
Faktor einrichten. Der Code ist der erste Faktor und wird nur dem Betreiber ausgehändigt; die Einrichtung sofort nach
dem Anlegen erledigen. Unter Pflicht kann **eine begonnene Einrichtung vom Code allein nicht mehr überschrieben
werden** (409 `ausstehend`, Protokollzeile) — vorher durfte `beginnen` eine ausstehende Einrichtung ersetzen
(gebremst); in production wäre das die Tür für einen Codedieb.

## Wiederherstellung (offline, ohne Abschwächung)

Authenticator **und** Wiederherstellungscodes verloren (oder Einrichtung abgebrochen und Geheimnis weg):

```
docker compose -f deploy/compose.yml stop centric-dp-web    # die Ablage gehört immer nur einem Prozess
printf '%s\n' 'BETREIBER-CODE' | CENTRIC_DATEN=<Datenordner> CENTRIC_PFEFFER=<wie im Betrieb> \
  node werkzeug/betreiber-2fa-zuruecksetzen.mjs --ja
docker compose -f deploy/compose.yml start centric-dp-web
```

Voraussetzungen, alle nötig: Zugriff auf den Server (Datenordner), der Pfeffer des Betriebs **und** der Betreibercode
(über stdin, nie als Argument). Es gibt keinen Netzweg, kein festes Geheimnis, kein Standardpasswort.
Wirkung: alle Sitzungen dieses Codes enden; alter Faktor, Nachweise und Wiederherstellungscodes werden gelöscht; sofort
beginnt eine **neue** Einrichtung mit frisch erzeugtem Geheimnis, das nur im Terminal erscheint. Der Code steht also nie
im Zustand „kein Faktor, Einrichtung frei“; Bestätigen mit dem ersten Code, erst dann gilt er wieder. Nicht-Betreiber,
gesperrte oder unbekannte Codes, fehlender Pfeffer, fehlendes `--ja`, belegte Ablage (Server läuft): Ausgang 1, nichts
verändert. Protokoll: `zweifaktor/offline/warnung`.

Wer weder Serverzugriff noch Pfeffer hat, kommt nicht hinein — gewollt. Wer den Pfeffer verliert, verliert ohnehin alle
Schlüssel (siehe Betriebshandbuch).

## Review-Nachträge (Opus-Review)

Umgesetzt und je mit rotem Test auf dem Stand `42f1db6` (`betreiber-zweifaktor-pflicht.test.js`, Gruppe „Review-Nachträge WP-32d“):
(1) Verwalterschlüssel unter production Pflicht (`/einrichten`), (2) Abschalten unter Pflicht 409, (3) Einrichtung verfällt nach 15 min,
Protokoll `warnung` mit Alter, (4) Start beendet Betreibersitzungen ohne Faktor, (5) `server/lib/umgebung.mjs` `istProduktion()`
für post/versand/pushziel/Pflicht/einrichten. Einzelheiten und Betreiber-Anleitung: `wp15-wp32d-fragen.md`.
Folge für die Prüfstrecken: Der Vorlauf richtet auch den Verwalterschlüssel ein (in `serverlauf` direkt in der Ablage, weil
`/einrichten` insgesamt auf 20 Aufrufe je 10 Minuten begrenzt ist; auf entfernten Servern über die API) und liefert für
Verwalterkonten frische Codes.

## Folgen für Prüfläufe und Auslieferung

- Fast alle HTTP-Prüfläufe starten den Server mit `NODE_ENV=production` und melden sich mit einem frisch angelegten
  Betreibercode an — dort gilt jetzt die Pflicht. `werkzeug/betreiber-faktor-vorlauf.mjs` (mit `node --import`
  durch `pruefungen/serverlauf.mjs`, per `import` in `staging-proben.mjs`, `staging-smoke.mjs`,
  `zugaenge-anlegen.test.js`) umhüllt nur im Prüfprozess `fetch`: bei 403 `einrichten` richtet er den Faktor über
  die öffentliche API ein (beginnen, bestätigen) und meldet mit dem nächsten Code an; den Token merkt er je Code
  (Abmelden verwirft ihn). Der Server wird dafür **nicht** gelockert. Getestet im Pflicht-Test („Vorlauf“).
- Der Vorlauf und `werkzeug/betreiber-2fa-zuruecksetzen.mjs` liegen flach in `werkzeug/` und kommen per eigener
  `COPY`-Zeile ins Image (`auslieferung.test.js` erlaubt nur flache `werkzeug/*.mjs`-Kopien). Das Werkzeug liegt damit
  auch im Container (`/app/werkzeug/betreiber-2fa-zuruecksetzen.mjs`); es läuft nur bei gestopptem Dienst (sonst
  belegt der Server die Ablage) und braucht denselben Datenmount und Pfeffer — das genaue `docker run`-Kommando
  ist ein Betriebsschritt (Betriebshandbuch), nicht getestet.
- `serverlauf` (rechte, zeiterfassung, betreiber-sicht, betreiberfelder, demozugang, erstbefuellung, mandanten,
  schichtverantwortung, session-kanal, sicherungen, sicht-planung-leitung, verwalter, verwaltungswege, vollausgabe,
  zustellung-rechte, kalender-rechte, geo, bremse) lief mit dem Vorlauf grün.
- Ohne Befund geblieben, aber lokal nicht lauffähig (Windows): `zugaenge-anlegen.test.js` (braucht `jq`),
  `server.test.js` „SIGTERM“.
- Außerdem: Das Pflicht-403 zählt nicht mehr als Fehlversuch der Anmeldebremse (der Code war richtig).

## Tests

`pruefungen/betreiber-zweifaktor-pflicht.test.js` (18): Schalter (production an, Option 1 an, sonst aus, kein
Abschalter in production, Dockerfile setzt NODE_ENV); Pflicht an/aus über den echten Handler (fehlende Einrichtung →
403 ohne Token; andere Rollen unberührt; Einrichten und Bestätigen; falscher Code 401; Wiederholung desselben Codes
401; Bremse über viele Herkünfte → 429 auch für den richtigen Code; Überschreibschutz 409; ohne Pfeffer 503/403; Zustand
bleibt nicht hängen); Wiederherstellung (Sitzungen weg, alter Authenticator und alle Wiederherstellungscodes wertlos,
Dieb kann nicht überschreiben, Bestätigen mit dem Offline-Geheimnis → Anmeldung; Ablehnungen ändern nichts; zwei
Läufe → verschiedene Geheimnisse; Werkzeug als Kindprozess inkl. belegter Ablage); Quelltext-Invariante.
Unverändert grün: `betreiber-zweifaktor.test.js` (17), `zweifaktor.test.js` (31).

## Nachtrag 2026-11-09: Ist-Prüfung und Härtung (Branch `acc45/sicherheit/wp-32d`)

Ist-Lage auf `origin/integration/release-v4` (`a792f7c`), je Pfad:

| Pfad | Befund vorher |
|---|---|
| `/api/anmelden` mit Betreibercode, `NODE_ENV=production` | Pflicht, kein Abschalter (`betreiberPflicht`); ohne Faktor 403 `einrichten` — **gedeckt** |
| `/api/demo`, Betriebsauswahl (Konto) | Betreiberrolle abgewiesen — **gedeckt** |
| Abschalten / Überschreiben über das Netz unter Pflicht | 409 — **gedeckt** |
| `NODE_ENV` fehlt, leer oder unbekannt (`prod`, `staging`; Start ohne Docker-Image) | Pflicht **aus**: Betreibercode allein gab eine Sitzung — **Lücke** |
| Bestehende Betreibersitzung ohne bestandenen Faktor (Lauf als development auf derselben Ablage, Bereinigung beim Start gescheitert — dort nur `try/catch` mit Log) | trug unter production bei jeder Anfrage weiter, bis zu 2 h — **Lücke** |
| Offline-Wiederherstellung `werkzeug/betreiber-2fa-zuruecksetzen.mjs` | unverändert, nicht angefasst |

Geschlossen:

1. `server/lib/umgebung.mjs` `betreiberZweifaktorPflicht()`: Ausgenommen sind nur `NODE_ENV=development` und `test`
   (dort schaltet `CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT=1` sie ein). Jede andere Lage, auch eine fehlende Variable, ist
   Pflicht. Der Schalter wird nur mit „1“ verglichen und kann nur einschalten. `betreiberPflicht()` fragt dort.
2. `server/lib/sitzungen.mjs` `sitzungLesen()`: Unter Pflicht gilt eine Sitzung der Rolle `betreiber` nur mit
   `zweifaktor: true` (gesetzt allein von `/api/anmelden` nach bestandenem Faktor); andere werden entfernt, jede
   Anfrage bekommt „nicht angemeldet“. Gilt für alle Endpunkte, unabhängig von der Bereinigung beim Start.

Tests (`betreiber-zweifaktor-pflicht.test.js`, Gruppe „Nachtrag WP-32d“, 6 neu; 1 Erwartung verschärft:
`betreiberPflicht({})` jetzt `true`): Pflicht für 13 Nicht-Entwicklungswerte × 13 Schalterwerte; keine von 12
Abschalt-Variablen hebt production auf; Quelltext-Invariante (nur `umgebung.mjs` liest den Schalter, nur `=== "1"`);
Anmeldung ohne `NODE_ENV` → 403; gepflanzte Betreibersitzung ohne Faktor unter production → 401 und entfernt (mit Faktor
und andere Rollen unberührt); die Anmeldung setzt `zweifaktor: true`. Auf dem alten Stand: 5 rot, 24 grün; neu: 29 grün.

`zugaenge-frischer-faktor.test.js` („Pflicht ohne eingerichteten Faktor“): Eine vor der Pflicht entstandene
Betreibersitzung bekam an `POST /api/zugaenge` 403 `einrichten`; jetzt trägt sie gar nicht mehr (401, Sitzung entfernt).
Die Erwartung ist verschärft, nicht gelockert: weiterhin „nichts entsteht“, zusätzlich zweiter Aufruf 401 und neue
Anmeldung 403 `einrichten` ohne Token.

Folge: Ein lokaler Start ohne `NODE_ENV` verlangt für Betreibercodes jetzt den zweiten Faktor; wer ohne arbeiten will,
setzt `NODE_ENV=development` (die Browserproben tun das bereits). Nicht geändert: Verwalterschlüssel (`/einrichten`)
bleibt an `istProduktion()` gebunden.

## Offen (Entscheidung beim Inhaber)

Siehe `wp15-wp32d-fragen.md`: Staging mit `NODE_ENV=production` hat dieselbe Pflicht (bewusst); das Einrichten des
echten Faktors ist E-10 (Betreiber), nicht Teil dieses Pakets.
