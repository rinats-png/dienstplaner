# Caddy und X-Forwarded-For

Stand 2026-11-02 (WP-32). Grundlage: Quelltext dieses Repositorys. Die
laufende Caddy-Konfiguration auf dem VPS (`/opt/proxy/Caddyfile`,
`/opt/proxy/sites/app.centric-dienstplanung.de.caddy`) wurde **nicht**
gelesen — kein Zugriff auf den VPS in diesem Arbeitspaket. Aussagen über
den laufenden Caddy sind deshalb Bedingungen, keine Befunde.

> **Nachtrag WP-32b:** B-XFF-1 ist behoben. Abschnitte 1–3 beschreiben den
> Stand **vor** WP-32b und bleiben als Begründung stehen. Was jetzt gilt und
> was beim Ausliefern **Pflicht** ist: Abschnitt 7.

## 1. Wie der Server die Herkunft bestimmt (vor WP-32b)

| Stelle | Was passiert |
|---|---|
| `server.mjs`, `webRequest()` | Übernimmt alle Köpfe der Anfrage. Setzt `x-forwarded-for` auf `req.socket.remoteAddress` **nur, wenn der Kopf fehlt**. Ein mitgeschickter Kopf bleibt unverändert. |
| `server/lib/schutz.mjs`, `herkunft()` | Nimmt den **ersten** Eintrag von `x-forwarded-for`. |
| `server/lib/schutz.mjs`, `kennung()` | Ohne Sitzung: `a:<Prüfsumme der Herkunft>`. Diese Kennung zählt die Bremse je Herkunft, die Notbremse, und sie steht gekürzt im Protokoll. |

Es gibt **keine** Einstellung, welchen Absendern der Server
`x-forwarded-for` glaubt — kein `CENTRIC_VERTRAUTE_PROXYS` oder
Vergleichbares (gesucht in `server/`, `server.mjs`, `deploy/`, allen
Dokumenten). Der Server vertraut dem Kopf ungeprüft, von jedem Absender.

## 2. Kann ein Client X-Forwarded-For fälschen?

### Über Caddy, wie vorgesehen

Caddy (ab 2.5) verwirft ein mitgeschicktes `X-Forwarded-For`, wenn der
Absender nicht in `trusted_proxies` steht, und setzt die Adresse des
Gegenübers ein. Ohne `trusted_proxies` ist der erste — und einzige —
Eintrag beim Server also die echte Client-Adresse. **Dann ist der Kopf nicht
fälschbar.**

Das gilt nur unter drei Bedingungen, die sich ohne Blick auf den VPS nicht
bestätigen lassen:

1. Caddy ist 2.5 oder neuer.
2. In den globalen Optionen steht **kein** `trusted_proxies`, das
   Internet-Adressen abdeckt (`0.0.0.0/0`, oder ein CDN-Bereich, über den
   auch andere Kunden senden können).
3. Die Site setzt `X-Forwarded-For` nicht selbst aus einem Wert, den der
   Client bestimmt (etwa `header_up X-Forwarded-For {http.request.header.X-Forwarded-For}`).

Ist (2) verletzt, **hängt** Caddy an: `X-Forwarded-For: <vom Client>, <echt>`.
`herkunft()` nimmt den ersten Eintrag — also den des Clients.

### Am Proxy vorbei

| Weg | Fälschbar? |
|---|---|
| Aus dem Internet direkt auf Port 3000 | Nein, solange `deploy/compose.yml` keinen Port veröffentlicht (heute so). |
| Aus einem anderen Container im Docker-Netz `proxy` | **Ja.** Jeder Container dort erreicht `centric-dp-web:3000` direkt und kann jeden Kopf setzen. |
| Staging (BEREITSTELLUNG.md 5.5, „nur aus dem Netz proxy“) | **Ja**, aus demselben Grund. |
| Entwicklung, Prüfungen (`node server.mjs` mit offenem Port) | **Ja.** |

### Was eine Fälschung bewirkt

Wer `X-Forwarded-For` bestimmt, bekommt für jeden Wert einen frischen
Zähler. Damit sind **umgehbar**: die Bremse je Herkunft aller Arten
(`anmelden`, `einrichten`, `registrierung`, `starten` …) samt steigender
Sperre, und die Notbremse je Herkunft.

**Nicht umgehbar** bleiben die Dimensionen, die nicht an der Herkunft
hängen: `WEITERE.*.ziel` (je Betrieb bzw. je Adresse), `WEITERE.*.gesamt`,
`NOTGRENZEN.*.gesamt`, die Zählung je Sitzung (`kennung()` mit Sitzung) und
die neue Zwei-Faktor-Bremse **je Verwalterschlüssel** (WP-32, siehe unten).
Sie deckeln den Schaden, ersetzen die Grenze je Herkunft aber nicht: Ein
gezielter Angriff auf einen einzelnen Betriebscode bliebe unter
`anmelden.ziel` (40 je 5 Minuten), ein verteilter unter `gesamt`.

## 3. Befund

**B-XFF-1 (mittel, behoben in WP-32b, Abschnitt 7):** Der Anwendungsserver vertraut `X-Forwarded-For`
ungeprüft und nimmt den ersten (am leichtesten zu fälschenden) Eintrag.
Ein Proxy-Netz-Vertrauen gibt es nicht. Hinter einem Caddy in der
Grundeinstellung ist das unschädlich; jeder Absender im Netz `proxy` und
jede künftige `trusted_proxies`-Zeile macht die Herkunftsbremse umgehbar.

Nicht in WP-32 behoben — `server/lib/schutz.mjs` (`herkunft()`) und
`server.mjs` gehören einem anderen Arbeitspaket. Empfohlene Änderung dort:

1. Neue Variable `CENTRIC_VERTRAUTE_PROXYS` (Liste von Adressen/CIDR, z. B.
   das Subnetz des Netzes `proxy` oder genau die Adresse des
   Caddy-Containers).
2. In `webRequest()`: Ist `req.socket.remoteAddress` nicht vertraut, wird
   ein mitgeschicktes `x-forwarded-for` **verworfen** und durch
   `remoteAddress` ersetzt. Ist er vertraut, bleibt der Kopf.
3. In `herkunft()`: den **letzten** Eintrag nehmen (den der vertraute Proxy
   angehängt hat), nicht den ersten.
4. Ohne gesetzte Variable: niemandem vertrauen (fail-closed). Für den
   heutigen Betrieb heißt das: Variable in `.env` auf das Proxy-Subnetz
   setzen, **bevor** die Änderung ausgeliefert wird — sonst zählt die Bremse
   alle Anfragen unter der Adresse des Caddy-Containers.
5. Prüfung: Anfrage mit gefälschtem Kopf von nicht vertrauter Adresse →
   Zähler unter `remoteAddress`; von vertrauter Adresse → letzter Eintrag.

## 4. Was diese Vorlage dagegen tut

`deploy/caddy/Caddyfile.vorlage`:

- **kein** `trusted_proxies` (Begründung als Kommentar bei den globalen
  Optionen),
- `header_up X-Forwarded-For {remote_host}`: Caddy überschreibt den Kopf mit
  der Adresse seines unmittelbaren Gegenübers — unabhängig davon, ob später
  jemand `trusted_proxies` einträgt. Der Server sieht dann genau einen
  Eintrag, und „erster“ und „letzter“ sind derselbe.
- Sicherheitsköpfe nur ergänzend (`?`), weil `server.mjs` sie bereits
  setzt, einschließlich der CSP.

Damit ist der Weg **über Caddy** fest, unabhängig von der Caddy-Version ab
2.7. Der Weg **am Proxy vorbei** bleibt offen, bis B-XFF-1 im Server
behoben ist.

## 5. Zwei-Faktor und XFF

Die Zwei-Faktor-Bremse (`GRENZEN.zweifaktor`, WP-32) zählt je
Verwalterschlüssel **und** je Herkunft. Wer die Herkunft fälscht, umgeht
nur die zweite Zählung; je Schlüssel bleibt es bei fünf Versuchen je fünf
Minuten mit steigender Sperre.

## 6. Einspielen (Nutzerfreigabe nötig)

Nicht Teil von WP-32 — braucht Zugriff auf den VPS und eine Freigabe:

1. Laufende Fassung sichern:
   `cp /opt/proxy/sites/app.centric-dienstplanung.de.caddy{,.vor-wp32}`.
2. Unterschiede zur Vorlage ansehen (`diff`), bewusst entscheiden.
3. Globale Optionen in `/opt/proxy/Caddyfile` auf `trusted_proxies` prüfen
   (Abschnitt 2, Bedingung 2) und Caddy-Version notieren
   (`docker exec caddy caddy version`).
4. `docker exec caddy caddy validate --config /etc/caddy/Caddyfile`
5. `docker exec caddy caddy reload --config /etc/caddy/Caddyfile`
6. Probe: `curl -sI https://app.centric-dienstplanung.de/gesund` — genau
   ein `strict-transport-security`, kein `server`-Kopf; Anmeldung
   funktioniert.
7. Rückweg: gesicherte Datei zurückkopieren, `caddy reload`.

Die Vorlage wird in CI mit `caddy validate` geprüft
(`.github/workflows/lieferkette.yml`, Job `caddy-vorlage`).

## 7. Seit WP-32b: Vertrauensliste `CENTRIC_VERTRAUTE_PROXYS`

### Verhalten

| Stelle | Was passiert |
|---|---|
| `server.mjs`, Start | `CENTRIC_VERTRAUTE_PROXYS` wird gelesen (Adressen und CIDR-Netze, IPv4/IPv6, durch Komma oder Leerzeichen getrennt). Ein ungültiger Eintrag hält den Start an. Leer: Warnung im Log. |
| `server.mjs`, `webRequest()` | Ersetzt `x-forwarded-for` IMMER durch genau eine Adresse aus `herkunftBestimmen()` (`schutz.mjs`). |
| `herkunftBestimmen()` | Gegenstelle nicht vertraut (oder Liste leer) → die Gegenstelle zählt, der mitgeschickte Kopf wird verworfen. Gegenstelle vertraut → die Kette wird **von rechts** gelesen; die erste nicht vertraute Adresse ist der Client. Steht rechts Unsinn, zählt die Gegenstelle. IPv4-gemappte IPv6-Adressen (`::ffff:a.b.c.d`), Klammern, Zonen und `a.b.c.d:port` werden vereinheitlicht. |
| `herkunft()`, `kennung()`, Bremse, Protokoll | unverändert — sie sehen jetzt nur noch die bestimmte Adresse. |
| Erste Anfrage mit XFF bei leerer Liste | lautes `WARNUNG:` im Log; `/einrichten/umgebung` meldet `vertrauteProxys: false` und eine Warnung, sobald so eine Anfrage kam. |

Handler, die ohne `server.mjs` aufgerufen werden (Prüfungen), lesen wie
bisher den ersten Eintrag — im Betrieb kommt keine Anfrage an `server.mjs`
vorbei.

### Pflichtschritt beim Ausliefern

**Ohne Liste sieht der Server hinter Caddy nur die Adresse des
Caddy-Containers. Alle Nutzer teilten sich eine Herkunft und einen
Bremszähler: acht Fehlversuche irgendwo, und die Anmeldung ist für alle
gesperrt.** Deshalb vor dem ersten Start dieses Stands:

1. Subnetz des Docker-Netzes `proxy` ermitteln:
   `docker network inspect proxy --format '{{(index .IPAM.Config 0).Subnet}}'`
   (z. B. `172.18.0.0/16`).
2. In `/opt/apps/centric-dienstplanung/.env` eintragen:
   `CENTRIC_VERTRAUTE_PROXYS=<Subnetz>`.
3. Nach dem Start im Log: `Herkunft: X-Forwarded-For wird von 1 vertrauten
   Einträgen angenommen.` — und **keine** Zeile `WARNUNG: Anfrage mit
   X-Forwarded-For`.
4. `/einrichten/umgebung`: `vertrauteProxys: true`, keine Warnung dazu.

Strenger (empfohlen, sobald Caddy eine feste Adresse hat): statt des ganzen
Netzes nur Caddys Adresse eintragen. Mit dem Subnetz vertraut der Server
jedem Container im Netz `proxy` — der kann seine Herkunft weiter frei
wählen. Caddys Adresse festlegen geht in dessen Compose-Datei
(`networks: proxy: ipv4_address: …`); das gehört zum Proxy, nicht zu
diesem Repository.

### Prüfungen und CI

- `pruefungen/herkunft-xff.test.js`: reine Funktion (leere Liste, nicht
  vertraute Gegenstelle, Kette von rechts, alle vertraut, Unsinn,
  IPv4-gemappt, IPv6-Netze, ungültige Liste) und über den echten Server:
  gefälschtes XFF ohne Liste → Bremse greift (rot vorher); vertrauter Proxy
  mit verschiedenen Clients rechts → getrennt; links gefälscht → Bremse
  greift (rot vorher); ungültige Liste → Start scheitert.
- Die HTTP-Proben schicken je Fall ein eigenes `X-Forwarded-For`, um sich
  nicht gegenseitig zu bremsen. Dafür ist die Liste dort ausdrücklich
  gesetzt: `pruefungen/serverlauf.mjs` (`127.0.0.1,::1`), Container in
  `pruefung.yml` und `deploy.yml` (`127.0.0.1,::1,172.16.0.0/12` — die
  Docker-Bridge, über die der veröffentlichte Port ankommt).
