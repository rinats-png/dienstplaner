# Hauptwebsite ausliefern (centric-dienstplanung.de) - Variante B

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
git clone --depth 1 --branch deploy/hauptwebsite-docker https://github.com/rinats-png/dienstplaner.git /root/cs
bash /root/cs/deploy/website/website-konsole.sh
```

`website-konsole.sh` macht der Reihe nach: rein lesende Vorpruefung (bei `ABWEICHUNG` Abbruch, nichts geaendert) ->
Archiv beschaffen (lokale Datei oder https-Download) -> Pflicht-Pruefsumme sha256 gegen `DIST-SHA256.txt` -> Archivinhalt
pruefen (keine absoluten Pfade, kein `..`, keine Links/Geraete) und in ein frisches Temp-Verzeichnis entpacken ->
kurze Zusammenfassung (Quelle, Summe, Dateianzahl, was geaendert wird) -> Sie tippen `JA` (alles andere bricht ab, es gibt
keine Option, das zu umgehen) -> `website-ausliefern.sh` (Sicherung, Validierung, Reload, Gegenprobe, Rollback bei Fehler).
Ein anderer Archivpfad: `bash /root/cs/deploy/website/website-konsole.sh /pfad/archiv.tgz`.
Am Ende stehen zwei Kontrollbefehle und der Rueckweg. Wiederholung ist unschaedlich (neue Fassung, alte bleibt als Sicherung).

Rueckweg: `bash /root/cs/deploy/website/website-zurueck.sh` (ohne Stempel: letzter Lauf; ein Stempel steht am Ende der Ausfuehrung).

Danach, unabhaengig davon:
- DNS (IONOS, Betreiber): A-Eintrag `www` auf dieselbe IPv4 wie die Hauptdomain; erst dann liefert `www.` ein Zertifikat und leitet per 301 um.
- Von aussen: `curl -sI https://centric-dienstplanung.de` -> 200; `curl -sI https://app.centric-dienstplanung.de` -> 200; `curl -sI https://centric-dienstplanung.de/gibt-es-nicht` -> 404.

## Ablauf B: Fallback mit SSH und scp (Schritt fuer Schritt)

1. Laptop: `python build.py`, packen, Pruefsumme, `scp` des `.tgz` - siehe `deploy/website/dist-bauen.md`.
2. VPS: `sha256sum -c`, entpacken nach `~/website-dist`; Skripte aus dem oeffentlichen Repo: `git clone --depth 1 --filter=blob:none --sparse --branch deploy/hauptwebsite-docker https://github.com/rinats-png/dienstplaner.git ~/centric-src && cd ~/centric-src && git sparse-checkout set deploy/website && cd deploy/website`
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
- **Validierung vor Reload:** `docker exec caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` prueft die Gesamtkonfiguration einschliesslich der importierten `sites/*.caddy` (Import-Pfade gelten relativ zum Caddyfile); danach `caddy adapt` zum Beleg, dass die Hauptdomain darin steht. Bei Fehler wird die neue Datei **vor** dem Reload zurueckgenommen - Caddy wurde nie neu geladen und lief durchgehend mit der alten Konfiguration.
- **Reload:** `docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile`. Das ist ein Konfigurationswechsel im laufenden Prozess (Sekundenbruchteile bis wenige Sekunden); bestehende Verbindungen werden nicht getrennt, auch die App bleibt erreichbar. Scheitert die Gegenprobe, folgt Rollback mit erneutem validate und Reload.
- **Sicherungen** liegen unter `/opt/proxy/sites/centric-website/sicherung/<stempel>/` (auch `sites/*.caddy`-Kopien). Der Import `sites/*.caddy` erfasst nur direkte Kinder von `sites/`, diese tieferen Kopien werden nicht geladen (Test mit Attrappe). Deshalb darf `centric-website` nie auf `.caddy` enden (das Skript verweigert es). Alte Fassungen (`releases/`, je ca. 2 MB) und Sicherungen werden nicht automatisch geloescht.
- Test ohne Server: `npm run pruefung:website` (Attrappen fuer docker, curl, df; Linux-CI). Er ersetzt nicht die Gegenprobe auf dem VPS.

## Rueckfall Variante A (nur nach gesonderter Freigabe)

Stimmt die Vorpruefung nicht (z. B. Sites-Ordner nicht eingehaengt): eigener Mount per `deploy/website/caddy-compose-fragment.yml`
mit `WEB_DIR_HOST`/`WEB_ROOT_CONTAINER=/srv/centric-website` ausserhalb des Sites-Ordners; erstellt den Caddy-Container neu
(wenige Sekunden Unterbrechung aller Seiten). Dazu vorher die Ausgabe der Vorpruefung melden.
