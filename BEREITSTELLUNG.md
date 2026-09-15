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
liegen unter `/data`: `centric` (Betriebe, Zugänge, Sicherungen),
`centric-sitzungen`, `centric-takt` (Bremse), `centric-spur` (Protokoll).

Eine zusätzliche Datenbank würde eine zweite Datenhaltung einführen, die
nichts löst.

---

## Schritt 1 — Bild bauen und veröffentlichen

Jeder Push nach `main` lässt `Prüfung` laufen (`.github/workflows/pruefung.yml`):
Linter, Typen, Regelwerk, Branchen, Untergrenzen, Lenkzeiten, Aufbewahrung,
Zugangscodes, Scherben, Ablage, Bremse, Server, Bereitstellungsskript,
Rechtetabellen, Bauen — und danach gegen ein frisch gebautes, gehärtet
gestartetes Bild: Rechteprüfung, Verwalterkonten, Demozugänge, Sicherung
außer Haus, Bremse. Daneben `Sicherheit` (Audit, Secret-Scan, verbotene
Muster). Ein roter Lauf blockiert.

Ausgeliefert wird nur, was `Prüfung` bestanden hat, und nur von Hand:

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
