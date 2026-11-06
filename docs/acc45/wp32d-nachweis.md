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

## Offen (Entscheidung beim Inhaber)

Siehe `wp15-wp32d-fragen.md`: Staging mit `NODE_ENV=production` hat dieselbe Pflicht (bewusst); das Einrichten des
echten Faktors ist E-10 (Betreiber), nicht Teil dieses Pakets.
