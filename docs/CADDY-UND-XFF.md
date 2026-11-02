# Caddy und X-Forwarded-For

Stand 2026-11-02 (WP-32). Grundlage: Quelltext dieses Repositorys. Die
laufende Caddy-Konfiguration auf dem VPS (`/opt/proxy/Caddyfile`,
`/opt/proxy/sites/app.centric-dienstplanung.de.caddy`) wurde **nicht**
gelesen — kein Zugriff auf den VPS in diesem Arbeitspaket. Aussagen über
den laufenden Caddy sind deshalb Bedingungen, keine Befunde.

## 1. Wie der Server die Herkunft bestimmt

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

**B-XFF-1 (mittel):** Der Anwendungsserver vertraut `X-Forwarded-For`
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
