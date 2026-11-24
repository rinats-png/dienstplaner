# Hauptwebsite ausliefern (centric-dienstplanung.de) - Variante B

> **Stand der Uebernahme (Paket W3, 2026-11-24):** Diese Anleitung und `deploy/website/` stammen vom Zweig
> `deploy/hauptwebsite-auflagen` (Kopf 39f1d48e). Die Website-Quelle liegt seit Paket W1 im Ordner `website/` dieses
> Repositories (Bau: `CENTRIC_OUT=<Temp-Ordner> python build.py`; `website/DIST-SHA256` listet die Pruefsumme jeder
> gebauten Datei). Offen, Betreiberentscheidung: (1) Der Klonbefehl unten nennt noch den Zweig `deploy/hauptwebsite-docker`;
> er muss auf den Zweig zeigen, der diese Dateien traegt (nach dem Zusammenfuehren: der freigegebene Stand), und
> `<KOPF>` muss danach neu gesetzt werden. (2) Cache-Control: die Site-Datei setzt keines (Befund CC-1, Live ebenso).
> (3) Eine Auslieferung gibt es nur nach ausdruecklicher Freigabe des Betreibers.
>
> **Nacharbeit zu Review #519 (2026-11-24):** Vor jeder Auslieferung sind die Punkte im Abschnitt "Grenzen und offene Punkte
> (Review #519)" unten zu erledigen oder zu entscheiden (CI-Verdrahtung von `website-caddy.sh`, shellcheck fuer
> `deploy/website/*.sh`, fester Zweig/Kopf in der Anweisung). Die drei Website-Tests laufen in der CI im Job `pruefen-c`
> (Schritt Smoke-Tageswechsel), nicht in `pruefen-a`.

Statische Website im vorhandenen Caddy-Container, neben der App. Kein neuer Mount, kein Container-Neustart,
nur `caddy reload`. Bestaetigter Stand (Betreiber, direkt am Server): Container `caddy`; Mounts
`/opt/proxy/config`->`/config` rw, `/opt/proxy/data`->`/data` rw, `/opt/proxy/Caddyfile`->`/etc/caddy/Caddyfile` ro,
`/opt/proxy/sites`->`/etc/caddy/sites` ro (im Container); Hauptdatei enthaelt `import sites/*.caddy`.
Diese Werte sind die Vorgaben der Skripte: **keine Variable setzen**.

## Ablauf A: Remotekonsole (root, zwei kurze Befehle)

Voraussetzung: Das Website-Archiv ist verfuegbar (veroeffentlicht auf Branch `website/dist`; Download nur von raw.githubusercontent.com), entweder als Datei `/root/centric-website-dist.tgz` oder ueber die
URL in `deploy/website/DIST-QUELLE.txt` (nach Veroeffentlichung durch den Betreiber). Die erwartete Pruefsumme steht in
`deploy/website/DIST-SHA256.txt`; Bauen und Aktualisieren: `deploy/website/dist-bauen.md`.

```
rm -rf /root/cs && git clone --depth 1 --branch deploy/hauptwebsite-docker https://github.com/rinats-png/dienstplaner.git /root/cs && git -C /root/cs rev-parse HEAD
bash /root/cs/deploy/website/website-konsole.sh
```

**Kopf-Pinning (A1; Pflicht, Review #519 A3):** Der Klonbefehl holt einen Zweig (`--branch deploy/hauptwebsite-docker`), und
ein Zweig kann sich aendern. Vor jeder Auslieferung legt der Betreiber Zweig und Commit fest. Die Anweisung enthaelt
dann `ERWARTETER_KOPF=<KOPF>` als feste Zeile (Pflicht, nicht optional) oder holt den Commit per SHA. Empfehlung
(die Festlegung ist Betreiberentscheidung): den freigegebenen Kopf nennen und `ERWARTETER_KOPF` immer mitgeben. Der erste Befehl zeigt den Commit-Hash des Klons; er muss mit dem in der Anweisung genannten
`<KOPF>` uebereinstimmen (Platzhalter: der Hash wird nach dem letzten Push in die Anweisung eingesetzt). Stimmt er nicht:
nicht weitermachen. `website-konsole.sh` zeigt den Stand noch einmal als `Skriptstand: <hash>` und in der Zusammenfassung
als Kurz-Hash; `JA` gilt nur, wenn dieser Kurz-Hash mit der Anweisung uebereinstimmt. Wer den Abgleich vom Skript
erzwingen will (in der Anweisung Pflicht): `ERWARTETER_KOPF=<KOPF> bash /root/cs/deploy/website/website-konsole.sh` (Abbruch bei Abweichung). Ein lokal
veraenderter Klon (`git status`) wird abgelehnt.

`website-konsole.sh` macht der Reihe nach: rein lesende Vorpruefung (bei `ABWEICHUNG` Abbruch, nichts geaendert) ->
Archiv beschaffen (lokale Datei oder https-Download) -> Pflicht-Pruefsumme sha256 gegen `DIST-SHA256.txt` -> Archivinhalt
pruefen (keine absoluten Pfade, kein `..`, keine Links/Geraete) und in ein frisches Temp-Verzeichnis entpacken ->
kurze Zusammenfassung (Quelle, Summe, Dateianzahl, was geaendert wird) -> Sie tippen `JA` (alles andere bricht ab; die Frage verlangt ein Terminal, siehe Grenzen unten; es gibt
keine Skript-Option, sie zu ueberspringen) -> `website-ausliefern.sh` (Sicherung, Validierung, Reload, Gegenprobe, Rollback bei Fehler).
Ein anderer Archivpfad: `bash /root/cs/deploy/website/website-konsole.sh /pfad/archiv.tgz`.
Am Ende stehen zwei Kontrollbefehle und der Rueckweg. Wiederholung ist unschaedlich (neue Fassung, alte bleibt als Sicherung).

Rueckweg: `bash /root/cs/deploy/website/website-zurueck.sh` (ohne Stempel waehlt das Skript die zuletzt angelegte Sicherung, auch die eines fehlgeschlagenen und schon automatisch zurueckgerollten Laufs; deshalb den Stempel vom Ende der Ausfuehrung angeben. Der Rueckweg legt keine eigene Sicherung an: nach einem Rueckweg ist die Fassung davor nur noch unter `releases/` zu finden).

Danach, unabhaengig davon:
- DNS (IONOS, Betreiber): A-Eintrag `www` auf dieselbe IPv4 wie die Hauptdomain. Das Skript prueft rein lesend per DNS, ob `www.centric-dienstplanung.de` aufloesbar ist: nur dann enthaelt die Site-Datei den www-Block (301-Weiterleitung, Abschnitt `# WWW-BEGIN` bis `# WWW-ENDE` der Vorlage). Sonst wird er weggelassen (kein Zertifikatsversuch fuer einen unaufloesbaren Namen) und die Konsole meldet "www hat noch keinen DNS-Eintrag - nach dem Eintrag diesen Befehl erneut ausfuehren". Die Wiederholung ist unschaedlich (neue Fassung, alte bleibt als Sicherung).
- IPv6 (IONOS-Parking): Hat `centric-dienstplanung.de` einen AAAA-Eintrag, der nicht zu einer lokalen Adresse des Servers gehoert, meldet die Vorpruefung einen HINWEIS - Let's Encrypt prueft bevorzugt IPv6 und das Zertifikat kann scheitern. Dann DNS beim Kunden klaeren (AAAA entfernen oder auf den Server richten).
- Von aussen: `curl -sI https://centric-dienstplanung.de` -> 200; `curl -sI https://app.centric-dienstplanung.de` -> 200; `curl -sI https://centric-dienstplanung.de/x` -> 404 **mit** den Kopfzeilen (Strict-Transport-Security, X-Content-Type-Options, Content-Security-Policy) auch auf der Fehlerseite.
- Bekannte Eigenheit (B12): `404.html` im Archiv nutzt relative Asset-Pfade (`assets/...`). Auf Unterpfaden (`/a/b`) laedt die 404-Seite daher ohne Stil/Skripte. Das Archiv (und damit die Pruefsumme) wird deshalb **nicht** angefasst; die Korrektur gehoert in den naechsten Bau der Website (absolute Pfade `/assets/...`).

## Ablauf B: Fallback mit SSH und scp (Schritt fuer Schritt)

1. Laptop: `python build.py`, packen, Pruefsumme, `scp` des `.tgz` - siehe `deploy/website/dist-bauen.md`.
2. VPS: `sha256sum -c` (Pflicht von Hand: Ablauf B vergleicht die Summe nicht selbst mit `deploy/website/DIST-SHA256.txt`, anders als `website-konsole.sh`), entpacken nach `~/website-dist`; Skripte aus dem oeffentlichen Repo: `git clone --depth 1 --filter=blob:none --sparse --branch deploy/hauptwebsite-docker https://github.com/rinats-png/dienstplaner.git ~/centric-src && cd ~/centric-src && git sparse-checkout set deploy/website && cd deploy/website` (der Zweig ist beweglich: danach `git -C ~/centric-src rev-parse HEAD` mit dem Kopf der Anweisung vergleichen, Pflicht; oder den Commit per SHA holen)
3. Vorpruefung (rein lesend): `sudo -E ./website-vorpruefung.sh` - erwartet `OK`-Zeilen fuer alle vier Mounts, `import`-Zeile, App-Datei, am Ende `VARIANTE B PASST`. Bei `ABWEICHUNG`: nicht weitermachen, Ausgabe melden.
4. Ausfuehren: `sudo -E ./website-ausliefern.sh ~/website-dist` (legt `/opt/proxy/sites/centric-website` selbst an; ohne `sudo -E` meldet es "Kein Schreibrecht ... mit sudo -E ausfuehren"; findet sudo `docker` nicht: `sudo -E env "PATH=$PATH" ./website-ausliefern.sh ~/website-dist`).
5. Erfolg: Zeilen `Versuch n: Hauptdomain 200, App 200, Hauptdomain/unbekannt 404`, dann `FERTIG` mit Stempel. Bei jedem Fehler rollt das Skript selbst zurueck und nennt die App-Antwort (soll 200).
6. Rueckweg jederzeit: `sudo -E ./website-zurueck.sh <stempel>`.
7. DNS und Kontrolle von aussen wie oben.

## Was das Skript garantiert

- **Schreibt nur** `centric-dienstplanung.de.caddy` (und kurz die Punktdatei `.centric-dienstplanung.de.caddy.tmp`) sowie das Unterverzeichnis `centric-website/` im Sites-Ordner. `app.centric-dienstplanung.de.caddy` und alle anderen Dateien bleiben byte- und mtime-gleich - bei Erfolg, Fehler und Rollback (Test).
- **Vorab, ohne Aenderung bei Abbruch:** Schreibrecht auf `SITES_DIR_HOST`/`WEB_DIR_HOST`; Container sieht die App-Datei unter `/etc/caddy/sites` (Pfadzuordnung); `import sites/*.caddy` im Caddyfile; dist vollstaendig; freier Platz mindestens dist x 3 + 50 MB; App antwortet 200.
- **Rechte:** abgelegte Fassung und Site-Datei werden auf `u=rwX,go=rX` normalisiert, damit der Caddy-Container (anderer Benutzer) lesen kann.
- **Nach dem Ablegen:** im Container `test -f /etc/caddy/sites/centric-website/aktuell/index.html`, `readlink -f` des relativen Links `aktuell -> releases/<stempel>`, `test -f` der eigenen `.caddy`.
- **Vorab-Validierung der neuen Datei (B1):** Die neue Site-Datei wird NICHT zuerst in `sites/` gelegt und dann geprueft, sondern zusammen mit Kopien der uebrigen Site-Dateien und des Hauptcaddyfiles in `sicherung/<stempel>/pruef/` vom Container validiert (`caddy validate --config <Container-Pfad>/sicherung/<stempel>/pruef/Caddyfile`; `import sites/*.caddy` gilt relativ zu dieser Probe). Erst danach wird sie eingespielt. Gewaehlt, weil es im Caddy-Image ohne Zusatzwerkzeug geht und das Fenster "ungepruefte Datei in `sites/`" schliesst: Endet der Prozess nach dem Einspielen ohne Rollback (SIGKILL, Stromausfall), liegt dort eine bereits gepruefte Datei, die beim naechsten Caddy-Start nichts mitreisst. Zusaetzlich bleibt die Validierung der Live-Konfiguration vor dem Reload.
- **Abbruchsicherheit:** Rollback ueber eine EXIT-Falle mit Erfolgsmerker (auch bei Signalen INT/TERM/HUP/QUIT und bei `set -e`/`-u`-Abbruechen); die Merker werden vor der jeweiligen Aktion gesetzt (der Rollback ist wiederholbar); waehrend des Rollbacks sind weitere Signale blockiert (ein zweites Strg-C bricht ihn nicht ab). Pfade (`WEB_DIR_HOST`, `releases`, `sicherung`) duerfen keine Links sein und kein `.`/`..` enthalten; `HAUPT_HOST`/`APP_HOST` muessen gewoehnliche Hostnamen sein; das Ziel des Links `aktuell` (auch aus der Sicherung) muss `releases/<name>` sein; die Punktdatei `.centric-dienstplanung.de.caddy.tmp` wird nie ueber einen dort liegenden Link beschrieben.
- **Validierung vor Reload:** `docker exec caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` prueft die Gesamtkonfiguration einschliesslich der importierten `sites/*.caddy` (Import-Pfade gelten relativ zum Caddyfile); danach `caddy adapt` zum Beleg, dass die Hauptdomain darin steht. Bei Fehler wird die neue Datei **vor** dem Reload zurueckgenommen - Caddy wurde nie neu geladen und lief durchgehend mit der alten Konfiguration.
- **Reload:** `docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile`. Das ist ein Konfigurationswechsel im laufenden Prozess (Sekundenbruchteile bis wenige Sekunden); bestehende Verbindungen werden nicht getrennt, auch die App bleibt erreichbar. Scheitert die Gegenprobe, folgt Rollback mit erneutem validate und Reload.
- **Sicherungen** liegen unter `/opt/proxy/sites/centric-website/sicherung/<stempel>/` (auch `sites/*.caddy`-Kopien). Der Import `sites/*.caddy` erfasst nur direkte Kinder von `sites/`, diese tieferen Kopien werden nicht geladen (Test mit Attrappe). Deshalb darf `centric-website` nie auf `.caddy` enden (das Skript verweigert es). Alte Fassungen (`releases/`, je ca. 2 MB) und Sicherungen werden nicht automatisch geloescht.
- Test ohne Server: `npm run pruefung:smoke-tageswechsel` (laeuft in der CI im Job `pruefen-c`, Schritt Smoke-Tageswechsel; enthaelt `website-ausliefern.test.js`, `website-konsole.test.js` und `website-kopfzeilen.test.js`; Attrappen fuer docker, curl, df; Linux-CI). Er ersetzt nicht die Gegenprobe auf dem VPS. Die echte Site-Datei mit dem echten Caddy-Bild (per Digest gepinnt) prueft nur `pruefungen/website-caddy.sh`, und zwar von Hand (`CADDY_BILD=... bash pruefungen/website-caddy.sh`, braucht Docker); **die CI ruft es nicht auf** (offener Punkt, siehe Grenzen). Das Skript macht `caddy validate`/`adapt` mit und ohne www-Block und einen Rauchtest (200, 404-Seite samt Kopfzeilen, 301 fuer www) gegen ein Dummy-dist.

## Grenzen und offene Punkte (Review #519)

Bekannte Grenzen der Skripte (so gebaut, hier ehrlich benannt):

- **JA-Frage:** `website-konsole.sh` liest die Antwort nur von einem Terminal (`[ -t 0 ]`). Ein Aufruf per Pipe oder
  Umleitung (`echo JA | bash website-konsole.sh`) bricht ab, bevor etwas geaendert wird. Das schuetzt vor einem versehentlichen
  Aufruf; es ist **keine Rechtegrenze**: Der Ausfuehrende ist ohnehin root und kann `website-ausliefern.sh` direkt starten.
  Der Test startet das Skript in einem Pseudo-Terminal (`script -qec`); eine Test-Umgebungsvariable gibt es bewusst nicht.
- **Rueckweg ohne Stempel:** siehe oben (neueste Sicherung, auch die eines fehlgeschlagenen Laufs; keine eigene Sicherung).
- **Dateinamen im dist:** `website-ausliefern.sh` bildet die Pruefsumme mit `find | xargs sha256sum` ohne `-0`. Ein Dateiname mit
  Leerzeichen oder Zeilenumbruch bricht den Lauf **vor** jeder Aenderung ab. Der Bau (`website/build.py`) erzeugt keine solchen
  Namen. Ein `-print0`-Umbau ist nicht erfolgt (ohne Linux-Lauf nicht abgedeckt).
- **Keine Sperre gegen parallele Laeufe:** zwei gleichzeitige Laeufe (etwa zwei Konsolen) sind nicht ausgeschlossen. Es darf immer nur
  ein Lauf aktiv sein; vor dem Start pruefen, dass keine andere Konsole `website-*.sh` ausfuehrt.
- **Ablauf B** vergleicht das Archiv nicht selbst mit `DIST-SHA256.txt`: `sha256sum -c` von Hand (Schritt 2).

Offene Punkte, vor jeder Website-Auslieferung zu entscheiden (Workflow-Aenderungen gehoeren in die Betreiberzone und sind hier
nicht gemacht; Nachverfolgung ohne Nummer in `docs/acc45/ENTSCHEIDUNGSLISTE.md`, Abschnitt D):

1. **`website-caddy.sh` in die CI** (Review #519 A1). Kein Workflow ruft das Skript auf; die echte Site-Datei wird mit dem echten
   Caddy-Bild nur von Hand geprueft. Empfehlung: einen Schritt in `lieferkette.yml` (oder dem Job mit der Caddy-Vorlage) mit dem
   gepinnten `CADDY_BILD` ergaenzen. Bis dahin: vor jeder Auslieferung von Hand ausfuehren und das Ergebnis vermerken.
2. **shellcheck fuer `deploy/website/*.sh`** (Review #519 A4). `betrieb-deploy.yml` prueft nur `deploy/*.sh` (nicht rekursiv).
   Empfehlung: `deploy/website/*.sh` aufnehmen (`shellcheck -x --source-path=SCRIPTDIR`, wegen `# shellcheck source=website-lib.sh`).
3. **Fester Zweig/Kopf** (Review #519 A3). Siehe Kopf-Pinning oben: Zweig und Commit festlegen, `ERWARTETER_KOPF` als Pflicht in der
   Anweisung. Gilt auch fuer `deploy/website/dist-bauen.md` Abschnitt 3.

## Rueckfall Variante A (nur nach gesonderter Freigabe)

Stimmt die Vorpruefung nicht (z. B. Sites-Ordner nicht eingehaengt): eigener Mount per `deploy/website/caddy-compose-fragment.yml`
mit `WEB_DIR_HOST`/`WEB_ROOT_CONTAINER=/srv/centric-website` ausserhalb des Sites-Ordners; erstellt den Caddy-Container neu
(wenige Sekunden Unterbrechung aller Seiten). Dazu vorher die Ausgabe der Vorpruefung melden.
