# Bereitstellung

Was zu tun ist, um einen Stand aus `main` auf `app.centric-dienstplanung.de`
zu bringen — in der Reihenfolge, in der es zu tun ist.

---

## Wie es läuft

    Browser
      → https://app.centric-dienstplanung.de
      → Caddy (TLS, HSTS)                          Container „caddy", /opt/proxy
      → Container centric-dp-web:3000              /opt/apps/centric-dienstplanung
      → node server.mjs                            liefert dist/ aus, ruft die Funktionen
      → server/funktionen/*.mjs + server/lib/*.mjs
      → Dateien unter /data                        Bind-Mount ./data, Rechte 700

    GitHub (main)
      → Actions „Prüfung" (jeder Push)             Linter, Typen, alle Prüfungen, Bild bauen
      → Actions „Auslieferung" (von Hand)          Bild bauen, gegen den Container prüfen, nach GHCR
      → ghcr.io/rinats-png/dienstplaner:<sha>, :latest
      → VPS: docker compose pull && docker compose up -d

Ein einziger Node-Prozess je Container, kein Port nach außen: Caddy erreicht
ihn über das Docker-Netz `proxy` als `centric-dp-web:3000`. Der Container
läuft schreibgeschützt, ohne Capabilities, als Benutzer 1000 — nur `/data`
und `/tmp` sind beschreibbar (`deploy/compose.yml`).

| Ort auf dem VPS | Inhalt | Im Git? |
|---|---|---|
| `/opt/apps/centric-dienstplanung/compose.yml` | Container-Definition (Kopie von `deploy/compose.yml`) | ja |
| `/opt/apps/centric-dienstplanung/.env` | Laufzeitumgebung, Rechte 600 | **nie** |
| `/opt/apps/centric-dienstplanung/data/` | alle Anwendungsdaten | **nie** |
| `/opt/proxy/Caddyfile`, `/opt/proxy/sites/app.centric-dienstplanung.de.caddy` | Caddy: `reverse_proxy centric-dp-web:3000`, Sicherheitsköpfe | nein |

Die eigene Adresse der Anwendung steht an genau einer Stelle im Quelltext
(`src/kontakt.js`, Vorgabe `https://app.centric-dienstplanung.de`) und wird
beim Bauen über `VITE_ANWENDUNG_URL` übersteuert (Repository-Variable in
GitHub Actions, `Dockerfile`-Build-Argument). Sie ist der Rückweg aus jeder
Benachrichtigung und jeder Zugangsliste — **nie** die Adresse der Website,
sonst landet jemand aus einer Dienstplan-Benachrichtigung auf einer
Verkaufsseite statt in seinem Plan.

---

## Keine Datenbank nötig

CENTRIC speichert Dateien. Es gibt keine einzige SQL-Abfrage im Quelltext,
kein Schema und keinen Fremddienst für die Daten. Was der Betrieb an Ablage
braucht, steht in `server/lib/bestand.mjs`: ein Kern je Betrieb plus eine
Scherbe je Monat; die Ablage selbst — atomares Schreiben, Schlüssel als
Dateinamen, ein Umschlag je Wert — in `server/lib/ablage.mjs`. Vier Stores
liegen unter `/data`: `centric` (Betriebe, Accounts, Mitgliedschaften,
Zugänge, Sicherungen), `centric-sitzungen` (Arbeitssitzungen und
Sicherungsschlüssel), `centric-accountsitzungen` (Account-Sitzungen),
`centric-takt` (Bremse), `centric-spur` (Protokoll). Was davon gesichert wird,
steht in 5.4.

Eine zusätzliche Datenbank würde eine zweite Datenhaltung einführen, die
nichts löst.

---

## Schritt 1 — Bild bauen und veröffentlichen

Jeder Push nach `main` lässt `Prüfung` laufen (`.github/workflows/pruefung.yml`):
Linter, Typen, Regelwerk, Branchen, Untergrenzen, Lenkzeiten, Aufbewahrung,
Zugangscodes, Scherben, Ablage, Bremse, Server, Bereitstellungsskript,
Rechtetabellen, Konten, Registrierung, Anmeldung, Betriebsauswahl, Tarife,
Betreiberrechte, Rollen, Standorte, Selbsttest, Sicherung und
Wiederherstellung, Bauen — und danach gegen ein frisch gebautes, gehärtet
gestartetes Bild: Rechteprüfung, Verwalterkonten, Demozugänge, Sicherung
außer Haus, Bremse. Daneben `Sicherheit` (Audit, Secret-Scan, verbotene
Muster). Ein roter Lauf blockiert.

Ausgeliefert wird nur, was `Prüfung` und `Sicherheit` bestanden haben, und nur
von Hand. Der Workflow `Auslieferung` ruft beide selbst als erste Aufträge auf
(`pruefung`, `sicherheit`); das Bauen, das Laden nach GHCR und der Schritt auf
den VPS hängen davon ab. Ist einer rot, entsteht kein Bild:

    GitHub → Actions → „Auslieferung" → Run workflow → Branch main

Der Lauf baut das Bild mit `VITE_ANWENDUNG_URL` und `VITE_KONTAKT_MAIL` aus
den Repository-Variablen, startet es genau so gehärtet wie auf dem VPS,
lässt die Rechteprüfung dagegen laufen und lädt es dann nach GHCR — als
`<vollständiger Commit-Hash>` und als `latest`. Erst wenn beide Kennzeichen
da sind, geht es weiter mit Schritt 3.

Zu jedem veröffentlichten Stand gehört damit ein Commit. Ob das laufende Bild
wirklich zu ihm gehört, lässt sich auf dem VPS belegen:

    docker exec centric-dp-web sha256sum /app/server/funktionen/daten.mjs
    git show <hash>:server/funktionen/daten.mjs | sha256sum

## Schritt 2 — Umgebungsvariablen setzen

`/opt/apps/centric-dienstplanung/.env`, Rechte 600, Vorlage `.env.example`.
Der Container liest sie beim Start; nach jeder Änderung `docker compose up -d`
(erstellt den Container neu — die Daten liegen außerhalb).

| Variable | Pflicht | Wert |
|---|---|---|
| `CENTRIC_PFEFFER` | **ja** | `openssl rand -base64 32` — **vor dem ersten Zugangscode setzen, danach nie ändern** |
| `CENTRIC_DATEN`, `CENTRIC_ABLAGE`, `PORT`, `NODE_ENV` | gesetzt durch Compose | `/data`, `dateien`, `3000`, `production` |
| `IMAGE_TAG` | nein | Kennzeichen des Bilds, Vorgabe `latest`; für einen Rollback der Commit-Hash |
| `CENTRIC_ADMIN` | **nur vorübergehend** | `openssl rand -base64 24` — nur bis das erste benannte Verwalterkonto angelegt ist (Schritt 5.1), dann entfernen |
| `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_KONTAKT` | nein | aus `npx web-push generate-vapid-keys`; beide Hälften gehören zusammen |
| `RESEND_API_KEY`, `CENTRIC_ABSENDER` | nein | E-Mail-Versand; der Absender braucht eine bei Resend verifizierte Domain |
| `REDIS_REST_URL`, `REDIS_REST_TOKEN` | nein | atomare Bremse, siehe unten |
| `CENTRIC_AUFRAEUMEN` | nein | `aus` schaltet den täglichen Löschlauf für abgelaufene Testbetriebe ab (Vorgabe: an) |

Die Anwendung **läuft auch ohne die optionalen Variablen**. Was fehlt:

| Fehlt | Folge |
|---|---|
| `RESEND_API_KEY` | Kein Mailversand. Der Selbststart funktioniert weiter — die Zugangscodes stehen in der Antwort und damit auf dem Bildschirm. |
| `VAPID_PUBLIC`, `VAPID_PRIVATE` | Keine Push-Mitteilungen. |
| `VITE_KONTAKT_MAIL` (Bauzeit) | Hilfe und Impressum zeigen `kontakt@example.org` mit sichtbarem Hinweis. |

**Zu `CENTRIC_PFEFFER`:** Ohne ihn liegen die Zugangscodes als ungesalzenes
SHA-256 im Speicher — bei drei Blöcken aus einem Alphabet von sechsundzwanzig
Zeichen ist das mit einer Wortliste zurückrechenbar. Einmal setzen und **nie
wieder ändern**: `umschluesseln()` in `server/lib/codes.mjs` schlüsselt jeden
Code beim nächsten Anmelden auf den neuen Hashwert um, und ohne denselben
Pfeffer gilt danach keiner mehr.

**Zu `CENTRIC_ADMIN`:** ein Wegwerfschlüssel für genau einen Zweck — das erste
benannte Verwalterkonto anlegen. Danach gehört er aus der `.env` entfernt und
der Container neu erstellt; wer ihn stehen lässt, hat ein Geheimnis mit
unbekanntem Leserkreis auf einem laufenden System. Ab dann führt der Weg in
die Verwaltung ausschließlich über benannte `V-`-Schlüssel. Geht der letzte
verloren, hilft nur: `CENTRIC_ADMIN` erneut setzen, `docker compose up -d`,
Konto anlegen, Variable wieder entfernen, erneut `docker compose up -d`.

**Zu VAPID:** Ein Paar erzeugen und **beide** Hälften eintragen — nur der
öffentliche Teil allein sendet nichts, ohne dass es auffiele.

**Zu `CENTRIC_ABSENDER`:** `onboarding@resend.dev` ist die Sandbox-Adresse
von Resend und stellt ausschließlich an die Adresse des Resend-Kontos zu.
Jede Nachricht an einen Kunden ginge ins Leere, ohne dass jemand etwas merkt.
Vor dem Echtbetrieb eine eigene Domain bei Resend verifizieren.

**Zu `VITE_`-Variablen:** Sie werden beim **Bauen** eingesetzt, nicht zur
Laufzeit — sie stehen als Repository-Variablen in GitHub, nicht in der
`.env`. Nach einer Änderung muss ein neues Bild gebaut werden (Schritt 1).

### Optional, härtet die Fehlversuchsbremse

| Variable | Wirkung |
|---|---|
| `REDIS_REST_URL`, `REDIS_REST_TOKEN` | Ohne sie zählt die Bremse je Vorgang und je Netzadresse über die Ablage und den Prozess, aber nicht atomar über gleichzeitige Anfragen. Mit ihnen ist die Grenze scharf. Siehe `atomarZaehlen()` in `server/lib/schutz.mjs`. |

## Schritt 2a — Nachsehen, ob es angekommen ist

    curl -sS https://app.centric-dienstplanung.de/einrichten/umgebung \
      -H "authorization: Bearer V-XXXXX-XXXXX-XXXXX-XXXXX"

(Solange es noch kein Verwalterkonto gibt: mit `CENTRIC_ADMIN` statt des
`V-`-Schlüssels.) Ohne Terminal geht es genauso — auf der Seite `F12`,
Reiter *Console*:

    fetch("/einrichten/umgebung", { headers: { authorization: "Bearer <Schlüssel>" } })
      .then(r => r.json()).then(a => console.log(JSON.stringify(a, null, 2)))

Antwortet mit `ja` oder `nein` je Variable, **nie mit einem Wert**, dazu
einer Liste offener Punkte im Klartext. `"inOrdnung": true` heißt: nichts
mehr offen. Der Bericht fragt den laufenden Server, ob er den Wert
tatsächlich sieht — das ist die einzige Rückmeldung in dieser Kette, die
trägt.

**Achtung, die Bremse zählt mit.** `/einrichten` lässt fünf Versuche je zehn
Minuten zu, dann dreißig Minuten Sperre, gezählt je Netzadresse — auch für
den Bericht und auch für Fehlversuche mit falschem Kopf. Wer den Schlüssel
ohne das Wort `Bearer` schickt, verbraucht einen Versuch. Eine stehende
Sperre verlängert sich durch weitere Versuche **nicht**; verdoppelt wird
erst, wenn nach Ablauf erneut fünf Fehlversuche zusammenkommen.

## Schritt 3 — Auf den VPS ausliefern

Im Verzeichnis `/opt/apps/centric-dienstplanung`:

    docker compose pull
    docker compose up -d
    docker compose ps            # centric-dp-web … (healthy)

Danach prüfen — jeder Punkt einzeln:

    docker inspect centric-dp-web --format '{{.State.Health.Status}} {{.Image}}'
    docker run --rm --network proxy curlimages/curl -sS http://centric-dp-web:3000/gesund
    curl -sS https://app.centric-dienstplanung.de/gesund
    curl -sS -o /dev/null -w '%{http_code}\n' https://app.centric-dienstplanung.de/
    docker logs centric-dp-web --tail 5
    docker logs caddy --since 5m

`/gesund` antwortet `{"status":"ok"}`; die Startseite 200; das Startlog des
Containers nennt die Funktionen und „Ablage: Dateien unter /data".

**Rollback:** Das vorige Bild bleibt lokal liegen. `IMAGE_TAG=<voriger
Commit-Hash>` in die `.env`, `docker compose up -d`, nach dem Prüfen wieder
auf `latest`. Die Daten unter `/data` sind von einem Bildwechsel nie
betroffen.

Der Schritt auf den VPS aus GitHub Actions heraus (`deploy.yml`, Job `vps`
über SSH und `/opt/bin/deploy.sh` mit Healthcheck und Rollback) ist
vorbereitet, aber nicht scharf: Er läuft erst, wenn `DEPLOY_HOST` und
`DEPLOY_SSH_KEY` hinterlegt sind und das Skript auf dem VPS liegt. Bis dahin
gilt der Weg oben.

## Schritt 4 — Was beim ersten Öffnen geschieht

**Keine Migration.** Ein leeres `/data` ist ein leerer Betrieb; die
Anwendung legt beim ersten Schreiben an, was sie braucht.

**Dienstarbeiter.** Beim ersten Aufruf richtet sich der Offlinebetrieb ein.
Danach startet die Anwendung auch ohne Netz, und der zuletzt geladene Plan
bleibt lesbar — mit einem Hinweis, wie alt er ist.

## Schritt 5 — Unmittelbar nach der ersten Inbetriebnahme

### 5.0 Betreiberzugang, Demobetriebe und einen leeren Testbetrieb anlegen

**Vorher `CENTRIC_PFEFFER` setzen** (Schritt 2) **und mit Schritt 2a
nachsehen, dass er wirklich da ist.** Danach entstehen Codes, und ab dann
ist der Pfeffer nicht mehr folgenlos zu ändern.

    CENTRIC_ADMIN='<Verwalterschlüssel oder Ursprungsschlüssel>' \
      werkzeug/zugaenge-anlegen.sh

Das Skript legt in einem Zug an und schreibt alle Codes in eine Datei mit
Rechten `600` — jeder erscheint genau einmal. Es ist **wiederholbar**: Vor
jedem Schritt fragt es über `GET /einrichten/uebersicht?bestand=demo-schau`
nach, was es schon gibt, überspringt Vorhandenes und meldet am Ende
„n angelegt, m übersprungen". Ausgabedateien tragen die Uhrzeit und werden
nie überschrieben. Es braucht `curl` und `jq`; `SITE` zeigt in der Vorgabe
auf `https://app.centric-dienstplanung.de`. Die Variable heißt aus
historischen Gründen `CENTRIC_ADMIN` — ein benannter `V-`-Schlüssel tut es
genauso.

| Was | Wie | Wodurch |
|---|---|---|
| Betreiberkonsole | Code, Rolle `betreiber` | `/einrichten` |
| Drei Demobetriebe | ohne Code offen auf der Anmeldeseite | `/einrichten`, `demo: true` |
| Ein leerer Testbetrieb | eigener Raum, 30 Tage | `/starten` |

**Abgelaufene Testbetriebe löscht der Server selbst.** Ein selbst angelegter
Testbetrieb läuft 30 Tage; danach weist die Anmeldung ab, die Daten bleiben
90 Tage liegen, dann löscht ein täglicher Lauf im Serverprozess den Raum
vollständig (erster Lauf eine Minute nach jedem Start, dann alle 24 Stunden;
`server/lib/aufraeumen.mjs`). Gelöscht wird nur, was eindeutig ein
abgelaufener Testbetrieb ist: Raum `t-…`, `selbstAngelegt`, Status „test",
Ablaufdatum plus 90 Tage überschritten. Ein auf „aktiv" gesetzter Betrieb
wird nie angefasst. Jeder Lauf hinterlässt `aufraeumen:letzter` in der Ablage
(Zeitpunkt, geprüft, gelöscht, Fehler) und Zeilen `loeschlauf` im Protokoll;
ein Raum, bei dem etwas liegen blieb, behält seinen Kern und wird beim
nächsten Lauf erneut versucht.

**Warum der Testbetrieb über `/starten` läuft.** Nur dieser Weg legt den
Betrieb mit `baueLeerenBetrieb()` an — kein Beispielpersonal, keine
erfundenen Dienstpläne, nur Name, Branche und Bundesland. Ein über
`/einrichten` angelegter Code zeigt auf einen Raum, den die Anwendung beim
ersten Öffnen mit den drei Beispielmandanten aus `startbestand()` füllt.
Für einen Testzugang „ohne Demodaten" ist das genau das Falsche.

**Warum der Demoraum `demo-schau` heißen muss.** `/api/demo` lässt einen
Zugang ohne Code nur durch, wenn sein Raum mit `demo-` beginnt. Der Raumname
trägt die Absicht; ein versehentlich als Demo gekennzeichneter Zugang auf
einen echten Betrieb wäre sonst öffentlich lesbar.

**Die drei Demobetriebe sind öffentlich beschreibbar.** Sie stehen ohne Code
offen, und für Demositzungen gibt es keine Schreibsperre — wer sie öffnet,
kann Personal löschen und Pläne ändern, und der nächste Besucher sieht das.
Für eine Vorführung ist das hinnehmbar, für eine öffentlich verlinkte Seite
nicht. Wer das ändern will, braucht eine Schreibsperre für Sitzungen mit
`demo: true` in `server/funktionen/daten.mjs` — dieselbe Stelle, an der
`nurSicherung` schon so behandelt wird.

**Der Server hält zusätzlich dagegen.** Ein zweiter aktiver Demozugang für
denselben Betrieb und dieselbe Rolle wird von `/einrichten` mit `409` und
dem Verweis auf den vorhandenen abgewiesen. Ein zurückgezogener Zugang
zählt dabei nicht — nach dem Zurückziehen darf neu angelegt werden.

**Wenn doch etwas doppelt ist — Aufräumen aus der Konsole.** Der Reiter
„Demozugänge" der Betreiberkonsole zeigt dieselbe Liste wie die Startseite,
markiert Doppelte und bietet je Eintrag „Zurückziehen" (sperrt über die
öffentliche Kennung, beendet laufende Sitzungen; die Startseite zieht binnen
einer Minute nach). Darunter stehen alle Konten des Demoraums mit gekürzter
Kennung — auch Betreibercodes — je mit „Sperren"; der eigene Zugang ist
ausgenommen. Unter „Selbststarts" löscht „Datenraum löschen" einen
Testbetrieb vollständig — Bestand, Monate, Sicherungen, Zugangscodes,
Sitzungen und der Vermerk in der Liste. Alles verlangt eine Anmeldung, die
jünger als zwanzig Minuten ist.

### 5.1 Ein benanntes Verwalterkonto anlegen

    curl -X POST https://app.centric-dienstplanung.de/einrichten/verwalter \
      -H "content-type: application/json" \
      -H "authorization: Bearer <CENTRIC_ADMIN>" \
      -d '{"neuerName":"<Vor- und Nachname>","email":"<E-Mail>","tage":365}'

Der zurückgegebene Schlüssel erscheint **genau einmal**. Danach
`CENTRIC_ADMIN` aus der `.env` entfernen und `docker compose up -d` — ab dann
ist jede Handlung einer Person zuzuordnen und einzeln widerrufbar
(`DELETE /einrichten/verwalter {"kennung":"<8 Zeichen>"}`; der eigene Zugang
lässt sich nicht sperren).

**Erst sichern, dann prüfen, dann löschen — in dieser Reihenfolge.** Beim
ersten Durchgang ging der Schlüssel verloren, weil zuerst gelöscht und
danach geprüft wurde; das kostete den kompletten Wiederherstellungsweg aus
Schritt 2. Prüfen heißt: `GET /einrichten/verwalter` mit dem neuen
Schlüssel muss 200 liefern und das Konto mit `gesperrt: false` nennen.

**Der Schlüssel hat vier Blöcke.** `V-XXXXX-XXXXX-XXXXX-XXXXX`,
fünfundzwanzig Zeichen. Beim Markieren mit der Maus fehlt leicht der erste
oder letzte Block, und ein abgeschnittener Schlüssel gibt dieselbe Antwort
wie ein falscher: `401`. Sicherer ist der Weg über die Zwischenablage:

    const v = await (await fetch("/einrichten/verwalter", { method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer <CENTRIC_ADMIN>" },
      body: JSON.stringify({ neuerName: "<Name>", email: "<E-Mail>", tage: 365 }) })).json();
    await navigator.clipboard.writeText(v.schluessel);
    console.log("Laenge:", v.schluessel.length);   // muss 25 sein

**Der Schlüssel gehört in keinen Chat, kein Ticket, kein Protokoll.** Steht
er einmal dort, ist er als offengelegt zu behandeln: neues Konto anlegen,
altes sperren. Auf dem Server liegt nur seine Prüfsumme.

**Nach dem Entfernen von `CENTRIC_ADMIN` den Container neu erstellen.** Die
Umgebung wird beim Start gelesen; ohne `docker compose up -d` sieht der
laufende Prozess den alten Wert weiter. Erst danach ist der Wegwerfschlüssel
wirklich wertlos — nachsehen mit Schritt 2a: `ursprungsschluessel: false`.

### 5.2 Einen Zugang zurückziehen

Als Organisationsleitung oder Betreiber angemeldet, Anmeldung jünger als
zwanzig Minuten:

    POST /api/zugang-sperren     { "code": "<Zugangscode>" }
    POST /api/zugang-sperren     { "kennung": "<8 Zeichen aus der Übersicht>" }
    POST /api/zugang-sperren     { "alleDesBetriebs": true }

Der Eintrag bleibt als Grabstein stehen (derselbe Code wird nie wieder
vergeben), laufende Sitzungen enden sofort. Bei `alleDesBetriebs` bleibt der
eigene Zugang bestehen. Ein Zugangscode, der in einem Chatverlauf oder einer
Datei im Klartext stand, gilt als kompromittiert und wird zurückgezogen —
nicht aufgehoben.

### 5.3 Eine Sicherung außer Haus einrichten

Als Organisationsleitung unter **Verwaltung → Datenmitnahme**:
Sicherungsschlüssel anlegen, dann auf einem eigenen Rechner täglich

    curl -sS -H "Authorization: Bearer <Schlüssel>" \
      https://app.centric-dienstplanung.de/api/vollausgabe \
      -o centric-$(date +%F).json

Der Schlüssel darf ausschließlich lesen. Er kann nichts ändern, nichts
löschen und sich nicht anmelden. Unabhängig davon gehört `/data` auf dem
VPS in die Sicherung des Servers — es ist der einzige Ort, an dem die Daten
liegen.

### 5.4 Sicherung und Wiederherstellung der gesamten Ablage

Die Sicherung nach 5.3 holt nur die Betriebsdaten über die Schnittstelle. Konten,
Mitgliedschaften, Zugangscodes und das Protokoll stehen dort nicht. Für eine
vollständige Wiederherstellung — Server verloren, Platte defekt — gibt es
`werkzeug/ablage-sicherung.mjs`. Es ist im Bild enthalten und braucht nur Node.

**Wo die Daten liegen.** Alles unter `/data` im Container, auf dem VPS
`/opt/apps/centric-dienstplanung/data` (Bind-Mount): ein Verzeichnis je Store,
darin eine Datei je Schlüssel.

**Was gesichert wird**

| Klasse | Store | Inhalt |
|---|---|---|
| A, zwingend | `centric` | Betriebe, Bestände, Monatsscherben, Stände, betriebsinterne Sicherungen, Accounts, Mitgliedschaften samt Generation, Zugangscodes, Verwalter, Kalender-Feeds, Push-Anmeldungen |
| B, sinnvoll | `centric-sitzungen`, nur `sk:` | Sicherungsschlüssel für die Sicherung außer Haus (gelten bis zu einem Jahr; ohne den Eintrag gälte der Schlüssel im Skript der Sicherung außer Haus nicht mehr, und der Klartext lässt sich nicht neu erzeugen) |
| B, sinnvoll | `centric-spur` | Protokoll |

**Was bewusst nicht gesichert wird (C, flüchtig):** Account- und Arbeitssitzungen
(`centric-accountsitzungen`, `t:` in `centric-sitzungen`), offene Einmal-Token
(`token:`, `tokencode:` in `centric`: Einladungs-, Verifizierungs-, Passwortlinks)
und die Bremszähler (`centric-takt`). Das ist die sichere Richtung: Eine Sitzung
oder ein Link, der nach der Sicherung widerrufen oder verbraucht wurde, würde
sonst nach einer Wiederherstellung wieder gelten. Folge: Nach einer
Wiederherstellung müssen sich alle neu anmelden, und offene Links werden neu
angefordert. Die Sicherung zählt jedes Ausgelassene im Manifest und in ihrer
Ausgabe mit.

**Der Pfeffer gehört zur Sicherung — ohne ihn ist keine Sicherung verwendbar.**
`CENTRIC_PFEFFER` liegt nicht in `/data`, ist aber ein zwingender Bestandteil der
Wiederherstellbarkeit: Ohne genau denselben Pfeffer findet kein Konto und kein
Zugangscode mehr zu seinem Datensatz, weil die Ablageschlüssel daraus gebildet
werden. Eine Sicherung ohne den passenden Pfeffer ist ein Archiv, das niemand mehr
öffnen kann.

- Die Sicherung enthält nur einen Prüfwert des Pfeffers, nie den Pfeffer selbst. Die
  Wiederherstellung lehnt einen anderen oder fehlenden Pfeffer ab — das ist gewollt.
- Eine Kopie gehört **getrennt von den Sicherungen** und außerhalb des VPS in einen
  Passwortmanager. Wer beides im selben Ordner ablegt, hat die Trennung aufgehoben;
  wer nur die Sicherung außer Haus legt, hat im Ernstfall nichts, womit er sie
  öffnet.
- Vor jeder Wiederherstellung muss der Pfeffer in der `.env` des Dienstes stehen.
  Er gehört in die `.env` und nie in `compose.yml`, in die Shell-Historie, auf eine
  Kommandozeile (dort sieht ihn `ps`) oder in ein Log. Container bekommen ihn über
  `--env-file`, nicht über `-e`.
- Er lässt sich nicht rotieren. Wer ihn ändert, macht alle bestehenden Konten und
  Zugangscodes unauffindbar.
- Die Kopie im Passwortmanager ist erst dann eine Sicherung des Pfeffers, wenn sie
  einmal gegen eine echte Sicherung benutzt wurde: Beim Restore-Test (unten) die
  Kopie aus dem Passwortmanager verwenden, nicht die auf dem Server.
- Staging und Produktion haben **verschiedene** Pfeffer. Eine Sicherung aus dem
  Staging lässt sich mit dem Pfeffer der Produktion nicht öffnen, und umgekehrt.

**Sicherung erstellen.** Der Server darf dabei laufen. Jede Datei ist einzeln
atomar; das Werkzeug sieht die Quelle nach dem Kopieren noch einmal an und
verwirft die Sicherung, wenn sich währenddessen etwas geändert hat (drei
Versuche, dann Abbruch mit Meldung — in dem Fall den Server kurz stoppen).

    cd /opt/apps/centric-dienstplanung
    mkdir -p sicherungen && sudo chown 1000:1000 sicherungen && chmod 700 sicherungen
    docker compose run -T --rm --no-deps -v "$PWD/sicherungen:/sicherungen" centric-dp-web \
      node werkzeug/ablage-sicherung.mjs sichern --quelle /data --ziel /sicherungen

`-T` schaltet die Terminalzuteilung ab und ist **Pflicht**, sobald der Aufruf nicht
von einer interaktiven Konsole kommt — aus einem Skript, über SSH ohne Terminal,
aus einer Pipe oder einem Cron-Auftrag. Ohne `-T` bricht `docker compose run` dort
mit „the input device is not a TTY" ab oder hängt. Bei der Staging-Validierung war
das die erste Abweichung zur ursprünglichen Fassung dieses Abschnitts.

Das Ergebnis ist ein Ordner `sicherungen/centric-sicherung-<UTC-Zeit>/`. Er wird
unter `.unfertig-…` aufgebaut und erst am Ende umbenannt; er enthält `daten/`,
`MANIFEST.json` (Dateiliste mit SHA-256), `MANIFEST.sha256` und als Letztes
`FERTIG`. Fehlt `FERTIG`, ist die Sicherung unvollständig. Ein Fehler
(unbekannter Store, beschädigte Datei, geänderte Quelle) beendet das Werkzeug
mit einem Code ungleich 0 und legt keine Sicherung an.

**Aufbewahrung.** Mindestens eine Kopie gehört **außerhalb des VPS** — ein
verlorener Server nimmt sonst die Sicherung mit. Den Ordner als Ganzes kopieren
(`rsync`, `scp`, `tar` — nichts ändern), danach am Zielort prüfen:

    node werkzeug/ablage-sicherung.mjs pruefen --sicherung <Ordner>

Das prüft FERTIG, Manifest, jede Datei nach Größe und Prüfsumme und dass nichts
dabeiliegt, was das Manifest nicht kennt. Täglich sichern, mehrere Stände
behalten, die Sicherungen verschlüsselt ablegen — sie enthalten Personaldaten.

**Wiederherstellen.** Das Werkzeug prüft die Sicherung zuerst vollständig, bricht bei
jedem Befund ab und fasst bis dahin nichts an. Es verlangt den passenden Pfeffer und
lehnt ein Ziel ab, auf dem noch ein Server läuft. Es gibt zwei Wege. Der erste ist
der erprobte (Staging-Validierung, mit Ersatz des Containers und Wiederholung der
fachlichen Prüfungen) und der bevorzugte, weil er nichts überschreibt: Der Rückweg
ist ein Umbenennen.

*Weg 1 — beiseitelegen und in ein neues, leeres `data/` zurückspielen.*

    cd /opt/apps/centric-dienstplanung
    docker compose stop -t 30                      # sauberes Beenden (SIGTERM), Exitcode 0
    mv data "data.vor-wiederherstellung-$(date -u +%Y%m%dT%H%M%SZ)"
    sudo install -d -m 700 -o 1000 -g 1000 data    # neu, leer, dem Benutzer node (uid 1000)
    docker run --rm --network none --read-only --user 1000:1000 --cap-drop ALL \
      --security-opt no-new-privileges:true --env-file .env \
      -v "$PWD/sicherungen/centric-sicherung-<Zeit>:/s/sicherung:ro" \
      -v "$PWD/data:/s/ziel" <dasselbe-Bild-wie-der-Dienst> \
      node werkzeug/ablage-sicherung.mjs wiederherstellen \
      --sicherung /s/sicherung --ziel /s/ziel < /dev/null
    docker compose rm -f -s centric-dp-web         # Container entfernen …
    docker compose up -d --pull never              # … und neu erzeugen, nicht nur neu starten

Dazu:

- Das Bild ist dasselbe wie das des Dienstes (`docker compose images`); bei einer
  Auslieferung per Digest genau dieser Digest. `--pull never` verhindert, dass beim
  Neuerzeugen stillschweigend ein anderes Bild gezogen wird.
- Der Pfeffer kommt über `--env-file .env` in den Container, nie über die
  Kommandozeile. `--network none` heißt: Der Restore kann nichts senden, und das
  Werkzeug findet keinen laufenden Server (das ist der erwartete Zustand).
- `data.vor-wiederherstellung-<Zeit>` ist die Sicherheitskopie des Zustands vor dem
  Eingriff. Sie wird nicht gelöscht, solange nicht alles bestätigt ist (anmelden,
  Betrieb öffnen, Stichproben). Danach entweder verschlüsselt außerhalb des VPS
  archivieren oder bewusst löschen — sie enthält alles, auch Sitzungsdateien und
  Zugangsdaten.
- Geht etwas schief: `docker compose stop`, das neue `data/` in `data.fehlgeschlagen-<Zeit>`
  umbenennen, die Sicherheitskopie zurück nach `data/` benennen, `up -d`.
- Nach dem Start läuft der tägliche Löschlauf erstmals eine Minute später und danach
  alle 24 Stunden **ab diesem Start**. Seine Uhrzeit wandert also mit jedem
  Neuerzeugen des Containers. Er schreibt den Vermerk `aufraeumen:letzter` neu — das
  ist die einzige Datei in `centric`, die sich von selbst täglich ändert.

*Weg 2 — `--ersetzen` (nur wenn Weg 1 nicht möglich ist).* Ein nicht leeres Ziel wird
nur mit `--ersetzen` angefasst — und auch dann wird nichts gelöscht: Der alte Inhalt
wandert nach `.vor-wiederherstellung-<Zeit>/` im Ziel.

    cd /opt/apps/centric-dienstplanung
    docker compose stop
    docker compose run -T --rm --no-deps -v "$PWD/sicherungen:/sicherungen:ro" centric-dp-web \
      node werkzeug/ablage-sicherung.mjs wiederherstellen \
      --sicherung /sicherungen/centric-sicherung-<Zeit> --ziel /data --ersetzen --ohne-serverpruefung
    docker compose up -d

`CENTRIC_PFEFFER` kommt dabei aus der `.env` des Dienstes, also derselben wie im
Betrieb. Danach anmelden, einen Betrieb öffnen, stichprobenweise Daten ansehen.
Erst wenn alles stimmt, `data/.vor-wiederherstellung-<Zeit>/` von Hand entfernen.

**Was nach einer Wiederherstellung gilt.** Wiederhergestellt wird der Stand der
Sicherung: Was seitdem geschah — auch ein Zugangsentzug, eine Passwortänderung, eine
Sperre — ist zurückgenommen und muss erneut ausgeführt werden. Sitzungen, offene
Einmal-Token und Bremszähler (Klasse C) fehlen bewusst; dadurch kann nichts
wiederaufleben, was nach der Sicherung widerrufen wurde: Ein Konto, eine Sitzung
oder ein Betriebsmerkmal, die erst nach der Sicherung entstanden sind, gibt es
danach nicht, und ihre Merkmale sind wertlos. Der Rückweg zu den Sitzungen ist die
neue Anmeldung.

**Restore-Test.** Eine Sicherung, die nie zurückgespielt wurde, ist keine. Mindestens
vierteljährlich, und nach jeder Änderung an Ablage oder Konten: in einen leeren
Ordner zurückspielen (nicht in `data/`) und dort ansehen.

    mkdir -p restore-test && sudo chown 1000:1000 restore-test
    docker compose run -T --rm --no-deps \
      -v "$PWD/sicherungen:/sicherungen:ro" -v "$PWD/restore-test:/restore" centric-dp-web \
      node werkzeug/ablage-sicherung.mjs wiederherstellen \
      --sicherung /sicherungen/centric-sicherung-<Zeit> --ziel /restore --ohne-serverpruefung
    docker run --rm -p 127.0.0.1:3001:3000 --env-file .env \
      -e CENTRIC_DATEN=/data -v "$PWD/restore-test:/data" \
      ghcr.io/rinats-png/dienstplaner:latest

Gegen `127.0.0.1:3001` (SSH-Tunnel) anmelden und einen Betrieb öffnen; danach
Container beenden und `restore-test/` löschen.

Ein Restore, der nicht gegen die Sicherung verglichen wurde, ist nicht geprüft.
Belastbar ist der Vergleich Datei für Datei: Jede Datei unter `daten/` der Sicherung
muss im Ziel denselben SHA-256 haben, und im Ziel darf nichts liegen, was die
Sicherung nicht kennt. Wer die aktive Ablage mit der Sicherung vergleicht, muss
erklärbare Abweichungen kennen und nur diese zulassen: den Löschlauf-Vermerk
`aufraeumen:letzter`, neue Protokolleinträge (das Protokoll hängt nur an) und die
nicht gesicherten Laufzeitdaten (Sitzungen, Bremszähler, Einmal-Token). Jede andere
Abweichung ist ein Befund. Der Ablauf der Werkzeuge selbst ist
mit `npm run pruefung:sicherung-ablage` automatisch geprüft (Konto, Mitgliedschaft,
Betrieb, Anmeldung und Betriebsauswahl nach der Wiederherstellung).

**Als root wiederherstellen** (nicht über `docker compose run`): danach
`chown -R 1000:1000 data`, sonst kann der Container nicht schreiben.

### 5.5 Staging auf dem VPS (ohne Domain, ohne Caddy)

Bevor eine Änderung in die Produktion geht, läuft dasselbe Bild auf einem eigenen
Staging neben der Produktion — nicht öffentlich erreichbar. So wurde es in der
technischen Staging-Validierung betrieben:

| | Produktion | Staging |
|---|---|---|
| Verzeichnis | `/opt/apps/centric-dienstplanung` | `/opt/apps/centric-staging` |
| Dienst / Container | `centric-dp-web` | `centric-staging-web` |
| Compose-Projekt | `centric-dienstplanung` | ein eigener Name, nie derselbe |
| Ablage | `./data` | `./data`, eigene Daten |
| Pfeffer | der der Produktion | **ein eigener**, nie der der Produktion |
| Netz | `proxy` | `proxy` (nur Mitglied), keine Port-Bindung |
| Erreichbarkeit | über Caddy | nur aus dem Netz `proxy` oder per `docker exec` |

Regeln, die sich bewährt haben:

- **Eigener Dienstname und eigener Alias im Netz `proxy`.** Zwei Container mit demselben
  Namen oder Alias im selben Netz lassen den Namen auf den falschen Container
  auflösen. Der Projektname muss sich ebenfalls unterscheiden, sonst übernimmt
  `docker compose` Container der Produktion.
- **Bild per Digest** in der `compose.yml`, Start mit `docker compose up -d --pull never`.
  Ein Update ist dann der bewusste Austausch des Digests, ein Rollback der Austausch
  zurück.
- **Container erneuern heißt neu erzeugen**: `docker compose rm -f -s <Dienst>` und
  `up -d --pull never`. Ein Neustart prüft weder die Konfiguration noch das Bild.
- **`docker compose config` zeigt aufgelöste Werte, also Secrets.** Zum Prüfen der
  Konfiguration `docker compose config --no-env-resolution` benutzen und die Ausgabe
  nicht weitergeben.
- **Prüfungen laufen im Container:** `docker exec -i centric-staging-web node
  --input-type=module -` mit dem Skript über die Standardeingabe, oder `docker run`
  mit `--network proxy`. Kein DNS, kein Caddy, kein Port, bis das ausdrücklich
  freigegeben ist.
- **Eigene Daten:** Testkonten mit `example.org`-Adressen, nie ein Abzug aus der
  Produktion. Sicherung und Wiederherstellung wie in 5.4, mit dem Dienstnamen des
  Staging.
- **Die Produktion wird nicht angefasst.** Vor und nach jedem Schritt die Referenzen der
  Produktion vergleichen (Startzeit, Neustartzähler, Health der Container, `/gesund`).

### 5.6 Offene Entscheidungen zur Aufbewahrung

- **`stufe:` (Eskalationsgedächtnis der Anmeldebremse, Speicher `centric-takt`).** Wer
  wiederholt an der Anmeldung scheitert, wartet jedes Mal doppelt so lange; die
  erreichte Stufe steht in `stufe:<Art>:<Kennung>` und bleibt heute bis zu einer
  erfolgreichen Anmeldung bestehen — unbegrenzt. Der Aufräumlauf für Sitzungen und
  Bremszähler (Phase A.1) lässt sie **ausdrücklich unangetastet**: Eine Frist wäre
  keine Aufräumregel, sondern eine Sicherheitsentscheidung (kürzere Frist erleichtert
  einen langsamen Angriff, unbegrenzte Aufbewahrung kostet nur einen kleinen
  Datensatz je Ziel). Sie ist offen und wird getrennt entschieden, bevor die
  Datenmenge der Bremse eine Rolle spielt.

---

## Schritt 6 — Bevor zahlende Kunden echte Personaldaten eingeben

Das ist keine technische Liste, und sie lässt sich nicht durch eine
Auslieferung erledigen.

1. **Rechtstexte nachführen.** Der Bestand liegt auf dem eigenen VPS bei
   IONOS; AV-Vertrag, Verarbeitungsverzeichnis und Datenschutzhinweise in
   `rechtliches/` beschreiben noch den früheren Hoster und müssen Hoster,
   Standort des Rechenzentrums und Unterauftragsverarbeiter (Resend, falls
   E-Mail-Versand aktiv) nennen. Sie beschreiben den Zustand, nicht das
   Vorhaben — also am Tag der Änderung, mit Beleg.
2. **Rechtstexte anwaltlich prüfen lassen** und die `[BEISPIEL-…]`-Angaben
   ersetzen — siehe `rechtliches/PLATZHALTER.md`.
3. **Betriebsrat beteiligen** nach § 87 Abs. 1 Nr. 6 BetrVG. Das betrifft
   vor allem Zeiterfassung und Standortprüfung beim Stempeln.
4. **AV-Vertrag mit jedem Kunden schließen**, bevor dieser echte
   Beschäftigtendaten einspielt.
5. **Entscheiden, ob der Vorrat öffentlich bleiben soll.**
   `rinats-png/dienstplaner` steht auf `visibility: public`. Ein Geheimnis
   liegt nicht darin — alle Werte kommen aus der Umgebung, und der
   Secret-Scan läuft bei jedem Push. Öffentlich ist aber auch die
   Sicherheitsarchitektur lesbar: Bremsschwellen, Sitzungsdauern,
   Rechtetabellen. Das ist eine Entscheidung, keine Panne — sie sollte nur
   bewusst getroffen sein.
