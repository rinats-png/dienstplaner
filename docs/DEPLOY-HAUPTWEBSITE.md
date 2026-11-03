# Hauptwebsite ausliefern (centric-dienstplanung.de)

Statische Website, ausgeliefert vom Caddy-Container neben der App. Skripte und Site-Datei:
`deploy/website/`. Bauen und Uebertragen: `deploy/website/dist-bauen.md`.
Nichts davon ist auf dem Server ausgefuehrt; alle Angaben zum VPS sind unten als Befehle formuliert,
die die Ausgabe zeigen.

## Betreiber-Checkliste (VPS, in dieser Reihenfolge)

1. Laptop: bauen, packen, uebertragen laut `dist-bauen.md`. Auf dem VPS entpacken nach `~/website-dist`.
2. Angaben holen (Befehle unter "Vorab"): `CADDY_CONTAINER`, `SITES_DIR_HOST`. Ergebnis: zwei Werte.
3. Verzeichnis anlegen: `sudo mkdir -p /opt/centric-website && sudo chown "$USER" /opt/centric-website`
4. Verzeichnis im Caddy einhaengen (Variante A, Neustart von Caddy) oder Variante B (ohne Neustart) - siehe unten.
5. `export CADDY_CONTAINER=<name> SITES_DIR_HOST=<pfad> WEB_DIR_HOST=/opt/centric-website`
6. `cd ~/website-deploy && ./website-ausliefern.sh ~/website-dist`
7. Erfolg: letzte Zeilen `Versuch n: Hauptdomain 200, App 200, Hauptdomain/unbekannt 404`, dann `FERTIG`.
8. Von aussen: `curl -sI https://centric-dienstplanung.de | head -3` -> `200`; `curl -sI https://app.centric-dienstplanung.de | head -1` -> `200`.
9. Bei Fehler: das Skript rollt selbst zurueck und meldet die App-Antwort. Nach Erfolg zurueck: `./website-zurueck.sh` (Stempel steht am Ende der Ausgabe).
10. DNS (IONOS, Betreiber): A-Eintrag `www` auf dieselbe IPv4 wie die Hauptdomain. Erst dann `https://www.centric-dienstplanung.de` -> 301 auf die Hauptdomain.

## Vorab: die Angaben, die noch fehlen

```bash
docker ps --format '{{.Names}}  {{.Image}}'                      # Name des Caddy-Containers
docker inspect <caddy> --format '{{range .Mounts}}{{.Type}} {{.Source}} -> {{.Destination}} ({{if .RW}}rw{{else}}ro{{end}}){{println}}{{end}}'
docker exec <caddy> grep -n import /etc/caddy/Caddyfile         # wie werden die Sites eingebunden?
docker inspect <caddy> --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'   # Ordner der Caddy-Compose
```

- `SITES_DIR_HOST` = die Quelle (`Source`) der Zeile, deren Ziel `/etc/caddy/sites` ist. Ist stattdessen
  `/etc/caddy` als Ganzes eingehaengt, ist es `<Source>/sites`.
- Dieselbe Ausgabe zeigt, ob `/data` (Zertifikate) ein Volume oder Bind-Mount ist. Ist es das nicht,
  **nicht** neu erstellen (Variante B).
- Das Skript prueft selbst, dass im Sites-Ordner die App-Datei liegt (Schutz gegen den falschen Pfad).

## Verzeichnis im Container sichtbar machen

Warum nicht das Web-Verzeichnis selbst als Mount: Wird ein eingehaengtes Verzeichnis durch ein neues ersetzt,
sieht der Container weiter das alte. Deshalb wird `WEB_DIR_HOST` einmal eingehaengt, die Fassungen liegen darin
unter `releases/<stempel>`, und der Link `aktuell` zeigt auf die gueltige - Austausch und Rueckweg sind ein
atomarer Link-Wechsel.

**Variante A (Standard):** Compose-Fragment `deploy/website/caddy-compose-fragment.yml` in die Caddy-Compose
uebernehmen (nur der `volumes`-Eintrag), dann im Ordner der Caddy-Compose `docker compose up -d <dienst>`.
Das erstellt den Caddy-Container neu: wenige Sekunden Unterbrechung aller Seiten. Danach kontrollieren:
`docker exec <caddy> ls /srv/centric-website` (leer, kein Fehler) und `curl -sI https://app.centric-dienstplanung.de | head -1`.

**Variante B (ohne Neustart):** `WEB_DIR_HOST` innerhalb des bereits eingehaengten Sites-Ordners anlegen, z. B.
`$SITES_DIR_HOST/_centric-website`, und `export WEB_ROOT_CONTAINER=/etc/caddy/sites/_centric-website`.
Nur zulaessig, wenn die `import`-Zeile aus der Ausgabe oben auf `*.caddy` endet (ein Ordner darf nicht
mitgeladen werden). Sonst Variante A.

## Hinweise

- `website-ausliefern.sh` aendert nur `centric-dienstplanung.de.caddy` im Sites-Ordner und `WEB_DIR_HOST`.
  Vorher legt es eine Sicherung aller `.caddy`-Dateien unter `WEB_DIR_HOST/sicherung/<stempel>` an;
  `caddy validate` laeuft vor dem `caddy reload`; ein Fehler an irgendeiner Stelle stellt den alten Zustand her.
- Das Skript bricht ab, wenn die App vorab nicht 200 liefert, wenn `index.html`, `404.html` oder `assets/` im
  dist fehlen oder wenn der Container das Verzeichnis nicht sieht - jeweils ohne Aenderung.
- Die Site-Datei erwartet, dass der Haupt-`Caddyfile` die Sites einbindet (die App-Seite funktioniert so
  schon). Die Content-Security-Policy ist gegen den echten dist-Inhalt geprueft (keine Inline-Skripte,
  keine externen Ressourcen).
- Test ohne Server: `npm run pruefung:website` (Attrappen fuer docker und curl). Das ersetzt nicht die
  Gegenprobe auf dem VPS.
- Alte Fassungen (`releases/`, je ca. 2 MB) und Sicherungen werden nicht automatisch geloescht.
