# WP-32 — Lieferkette, Infrastruktur, Betreiber-2FA: Nachweis

Branch `acc45/infra/wp32-lieferkette-2fa`, Basis `integration/centric-complete` (56c73d0).
Kein Zugriff auf VPS, Produktion oder Repository-Einstellungen.

## 1. Basisbild per Digest

`Dockerfile`: alle drei `FROM` auf
`node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914`
(Multi-Arch-Index, erstellt 2026-10-21, Alpine 3.24). Ermittelt ohne lokales Docker
über die Registry-API von Docker Hub (Kopf `docker-content-digest` der Manifestliste
`library/node:22-alpine`). Kommentar im Dockerfile nennt Datum und Erneuerungsweg
(Dependabot, Ökosystem `docker`).

Zusätzlich: npm, npx, corepack und yarn im Endbild entfernt (siehe 2).

## 2. Image-Scan

`.github/workflows/lieferkette.yml` (push, pull_request, montags 04:17 UTC, von Hand):

- Job `bild-scan`: Bild bauen (`load`), Trivy-Bericht über alle Schweregrade (hält nicht
  auf), dann Gate `HIGH,CRITICAL` mit `ignore-unfixed`, `.trivyignore`.
  `aquasecurity/trivy-action@ed142fd0…` (v0.36.0, signierter Tag, nach dem
  Tag-Umhängen vom März 2026 erschienen, pinnt seine eigenen Abhängigkeiten per SHA),
  Trivy `v0.70.0`. Checkout, Buildx, Build-Push ebenfalls per SHA.
- Job `caddy-vorlage`: `caddy validate` der Vorlage mit `caddy:2-alpine@sha256:e70b164d…`
  (2.11.7).

`npm audit --omit=dev` bleibt in `sicherheit.yml`, nicht gedoppelt.

### Befunde des ersten Laufs (Bild mit npm, Commit dde2b79, Run 41511202780)

| Schwere | Anzahl | Wo |
|---|---|---|
| CRITICAL | 0 | — |
| HIGH | 10 | alle in `/usr/local/lib/node_modules/npm/…`: brace-expansion (5), ip-address, pacote (2×, einmal unter metavuln-calculator), picomatch, sigstore |
| MEDIUM | 12 | ebenfalls nur npm-Abhängigkeiten |
| LOW | 1 | ebenso |
| Alpine-Pakete | 0 | |
| `app/node_modules` (Laufzeit) | 0 | |

Behebung: npm/npx/corepack/yarn aus dem Endbild entfernt — zur Laufzeit ruft das Bild
nur `node` (CMD, HEALTHCHECK, Gate-Proben per `docker exec … node`). Keine Ausnahme in
`.trivyignore`. Ergebnis nach der Änderung: siehe Abschnitt „CI“.

## 3. Dependabot

`.github/dependabot.yml`: npm (Gruppen Laufzeit/Entwicklung, minor+patch),
github-actions (eine Gruppe), docker (eine Gruppe, keine Hauptversion von Node);
wöchentlich montags 05:00 Europe/Berlin; Ziel `integration/centric-complete`.

## 4. Branch-Schutz

Nicht gesetzt. `docs/BRANCH-SCHUTZ.md`: Regeln für `main` und
`integration/centric-complete`, Pflicht-Checks namentlich (`pruefen`,
`abhaengigkeiten`, `geheimnisse`, `muster`, `bild-scan`, `caddy-vorlage`, `shellcheck`,
`compose`, `skripte`), fertiger `gh api`-Befehl, Prüf- und Rücknahmebefehl.
Stand vorher: `main` ungeschützt (`404 Branch not protected`).

## 5. Caddy und X-Forwarded-For

`deploy/caddy/Caddyfile.vorlage` und `docs/CADDY-UND-XFF.md`. Laufende Caddy-Konfiguration
nicht gelesen.

**Befund B-XFF-1 (mittel):** `server.mjs` übernimmt einen mitgeschickten
`X-Forwarded-For` unverändert, `herkunft()` nimmt den ersten Eintrag; eine
Proxy-Vertrauensoption (`CENTRIC_VERTRAUTE_PROXYS` o. Ä.) gibt es nicht. Hinter Caddy
ohne `trusted_proxies` unschädlich; aus dem Docker-Netz `proxy`, in Staging und bei jeder
künftigen `trusted_proxies`-Zeile ist die Bremse je Herkunft umgehbar. Nicht behoben
(`schutz.mjs`/`server.mjs` gehören einem anderen Paket); Vorschlag in
`docs/CADDY-UND-XFF.md`, Abschnitt 3. Die Vorlage setzt `X-Forwarded-For {remote_host}`
und damit den Weg über Caddy fest.

## 6. Zwei-Faktor für Betreiberzugänge

### Umfang und Abgrenzung

Umgesetzt für **Verwalterschlüssel** (`/einrichten`, `server/lib/verwalter.mjs`) —
benannte Konten und Ursprungsschlüssel `CENTRIC_ADMIN`. Das ist der Zugang, der
Betreibercodes anlegt, Zugänge sperrt und Codes bindet.

**Nicht** umgesetzt für die Anmeldung mit einem Zugangscode der Rolle `betreiber`
(Betreiberkonsole): Sie läuft über `/api/anmelden` in `server/funktionen/daten.mjs`, nicht
über `anmeldung.mjs` (dort gibt es keinen Betreiberpfad — nur Account-Anmeldung per
E-Mail). `daten.mjs` liegt außerhalb dieses Pakets. Der Baustein
`server/lib/zweifaktor.mjs` ist dafür wiederverwendbar (`zweifaktorStand`,
`zweifaktorPruefen` mit eigener id je Code); nötig wäre dort: Code-Feld im Rumpf von
`/api/anmelden`, Prüfung vor `sitzungAnlegen`, Einrichtung für die eigene Sitzung.

### Verfahren

- TOTP nach RFC 6238 mit `node:crypto`: HMAC-SHA-1, 30 s, 6 Stellen, ±1 Schritt.
- Kein Code zweimal: zuletzt angenommener Schritt gespeichert, nur spätere gelten;
  Prüfen und Fortschreiben unter einer Sperre je Schlüssel (ein Prozess je Container).
- Geheimnis: 160 Bit, AES-256-GCM in der Ablage, Schlüssel per HKDF aus
  `CENTRIC_PFEFFER`. Ohne Pfeffer kein Einrichten; ein nicht entschlüsselbares
  Geheimnis gilt als nicht bestanden.
- Einrichten: `POST /einrichten/zweifaktor {aktion:"beginnen"}` gibt Geheimnis (Base32)
  und `otpauth://`-Adresse genau einmal zurück; `{aktion:"bestaetigen", zweifaktor}`
  aktiviert mit dem ersten Code und gibt zehn Wiederherstellungscodes einmal zurück
  (gespeichert als HMAC mit dem Pfeffer, je einmal gültig).
- Pflicht nach Einrichtung: jeder Pfad von `/einrichten` verlangt Code
  (`zweifaktor` im Rumpf oder Kopf `x-centric-zweifaktor`), Wiederherstellungscode oder
  Nachweis (`x-centric-zweifaktor-nachweis`; mit Code geholt, 15 Minuten, nur dieser
  Schlüssel). `CENTRIC_ZWEIFAKTOR_PFLICHT=1` lässt Schlüssel ohne zweiten Faktor nur
  noch an `/einrichten/zweifaktor`.
- Abschalten: `DELETE /einrichten/zweifaktor` nur mit frischem Code oder
  Wiederherstellungscode, nie mit Nachweis.
- Bremse: `GRENZEN.zweifaktor = {versuche: 5, fenster: 300, sperre: 900, steigend,
  max: 86400, failClosed: true}` — einziger Eingriff in `schutz.mjs`. Gezählt je
  Schlüssel und je Herkunft; meldet die Bremse einen Ablagefehler, antwortet
  `/einrichten` mit 503. Ein unlesbarer Zwei-Faktor-Stand ebenfalls 503.
- Antworten: Verwalterliste nennt nur `zweifaktor: true|false`; `umgebung` nennt nur
  `zweifaktorPflicht`. Das Geheimnis liegt nicht im Bestand eines Betriebs und damit in
  keiner Betriebssicherung, keinem Export und keiner Sicherungsanzeige.
- Oberfläche: `src/betreiber-2fa.jsx` (Betreiberkonsole → „Zwei-Faktor“: Schlüssel,
  Code, Stand, Einrichten, Bestätigen, Abschalten). In `src/App.jsx` nur Import,
  Navigationseintrag und Einhängepunkt (3 Stellen).

### Prüfungen

`pruefungen/zweifaktor.test.js` (`npm run pruefung:zweifaktor`, CI-Schritt
„Zwei-Faktor für Verwalterschlüssel“), 30 Tests (25 in 83c019b, 5 aus den Review-Auflagen):

| Gruppe | Inhalt |
|---|---|
| RFC 4226 | zehn HOTP-Referenzwerte (Anhang D) |
| RFC 6238 | sechs TOTP-Referenzwerte SHA-1, acht Stellen (Anhang B), sechsstellige Kürzung |
| Base32/otpauth | bekannter Wert, Hin-und-zurück, Parameter |
| Fenster | ±1 angenommen, ±2 nicht; Wiederholung abgewiesen; älterer nach neuerem abgewiesen; Unsinn |
| Handler | Stand ohne 2FA; falscher Schlüssel 401; Einrichten; Bestätigen falsch/richtig; Pflicht auf allen Pfaden inkl. Anlegen; Wiederverwendung im Gültigkeitsfenster; Wiederherstellungscode einmal; Nachweis (nicht für Abschalten, nicht für fremden Schlüssel, abgelaufen nach 15 min); Verwalterliste ja/nein; **kein Geheimnis und kein Wiederherstellungscode in irgendeiner späteren Antwort, kein Klartext/Base64/Hex des Geheimnisses in der Ablage**; Abschalten nur mit gültigem Code |
| Bremse | Eintrag `failClosed`; fünf falsche Codes aus fünf Herkünften → auch der richtige 429; unlesbarer Stand → 503 |
| Pflichtschalter | ohne 2FA nur `/einrichten/zweifaktor`, nach Einrichten wieder alles |
| Oberfläche | Ansicht rendert, kein Geheimnis ohne Abfrage |

Rot auf altem Stand: Mit `server/funktionen/einrichten.mjs` aus 56c73d0 scheitern alle
14 Handler-, Bremsen- und Pflichtprüfungen (Pfad `zweifaktor` unbekannt → 404); ohne
`server/lib/zweifaktor.mjs` scheitert die ganze Datei beim Import.

Lokal zusätzlich grün: `rollen-failclosed`, `altcodes`, `sitzungsinventar`,
`mitgliedschaftsgeneration`, `bremse-lokal`, `sitzungsaufraeumen`, `oberflaeche-render`,
`rechtematrix`, `serverlauf verwalter` (31/31), `tsc`, `eslint` (0 Fehler), `vite build`.

## CI

| Commit | Prüfung | Sicherheit | Betrieb: Deploy-Skripte | Lieferkette |
|---|---|---|---|---|
| dde2b79 (2FA, Bild noch mit npm) | abgelöst | grün 41511202686 | grün 41511202677 | **rot** 41511202780 — Gate: 10 HIGH in npm (erwarteter Nachweis, dass das Gate greift) |
| ae27079 (Bild ohne npm, Caddy, Doku) | grün 41511743562 (darin „Zwei-Faktor für Verwalterschlüssel“ 25/25 und alle Container-Prüfungen gegen das Bild ohne npm) | grün 41511743386 | grün 41511743365 | grün 41511743379 — Trivy: 0 Befunde in allen Schweregraden (Alpine 3.24.3 und node-pkg); `caddy validate`: „Valid configuration“ |

`Betrieb Sicherung` startet auf diesem Branch nicht (Pfad- und Branchfilter des
Workflows).

## Review-Auflagen (M1, N1, N2, H1)

| Auflage | Umsetzung | Test (rot auf 83c019b) |
|---|---|---|
| **M1a** Nachweis/Code konnte Verwalterschlüssel anlegen | `POST`/`DELETE /einrichten/verwalter` verlangen einen frischen Code oder Wiederherstellungscode, nie einen Nachweis (`nurCode`). | „Nachweis: …“ — Anlegen und Sperren mit Nachweis → 401, kein Schlüssel entsteht |
| **M1b** neuer Schlüssel ohne 2FA = Weg um den zweiten Faktor | Automatische Pflicht: Sobald irgendein nutzbarer Verwalterschlüssel (nicht gesperrt, nicht abgelaufen, oder der gesetzte Ursprungsschlüssel) einen aktiven zweiten Faktor hat, kommt jeder Schlüssel ohne eigenen nur noch an `/einrichten/zweifaktor` (`verwalterZweifaktorIrgendwo`, fail-closed bei Ablagefehler). Unabhängig von `CENTRIC_ZWEIFAKTOR_PFLICHT`, das die Pflicht schon vor dem ersten eingerichteten Faktor setzt. | „M1: Anlegen mit frischem Code; der neue Schlüssel …“ — GET/POST auf allen Pfaden 403 `einrichten`; „Abschalten …“ — nach dem eigenen Abschalten bleibt die Pflicht, solange ein anderer Schlüssel 2FA hat |
| **N1** Nachweise in der Sicherung, Altlasten | `werkzeug/ablage-sicherung.mjs`: `centric.ohne` um `zweifaktor-nachweis:`. Abgelaufene Nachweise werden beim Ausstellen und bei jeder fehlgeschlagenen Nachweisprüfung gelöscht. | „N1: Nachweise gehen nicht in die Sicherung“; „Nachweis …“ — nach Ablauf keine Nachweisdatei mehr |
| **N2** Nachweis überlebt Neueinrichtung; Abschalten schluckt Listenfehler | Jede Bestätigung erzeugt eine `generation`; der Nachweis trägt sie und gilt nur, solange sie gleich ist. `zweifaktorAbschalten` liest zuerst die Nachweise und wirft bei einem Listenfehler, bevor etwas gelöscht wird; `/einrichten` antwortet dann 503, der Faktor bleibt. | „N2: ein Nachweis gilt nach Abschalten und Neueinrichten nicht mehr“ (alter Nachweis-Eintrag zurückgespielt → 401); „N2: Abschalten scheitert …“ |
| **H1** prozesslokale Sperre | Dokumentiert in `zweifaktor.mjs`: Ein Prozess je Ablage sichert `lib/prozesssperre.mjs` (O_EXCL plus Puls); mehrere Instanzen bräuchten Vergleichen-und-Setzen. | — |
| **H1** GCM ohne AAD | Umgesetzt: Kapsel Fassung 2 mit AAD `zweifaktor:<id>`; Fassung 1 bleibt lesbar und wird beim nächsten Schreiben (Code-Prüfung, Bestätigung) auf Fassung 2 gehoben. | „H1: Kapsel ist an ihre id gebunden …“ |

## Nötige Nutzerfreigaben

1. Branch-Schutz setzen (`docs/BRANCH-SCHUTZ.md`) — erst nachdem WP-32 auf dem
   jeweiligen Branch liegt.
2. Caddy-Vorlage einspielen (`docs/CADDY-UND-XFF.md`, Abschnitt 6) — VPS-Zugriff.
3. Zwei-Faktor für den eigenen Verwalterschlüssel einrichten (Betreiberkonsole →
   Zwei-Faktor, oder `curl` gegen `/einrichten/zweifaktor`), Wiederherstellungscodes
   offline ablegen; danach optional `CENTRIC_ZWEIFAKTOR_PFLICHT=1` in `.env`.
   Hinweis: `werkzeug/zugaenge-anlegen.sh` schickt keinen zweiten Faktor mit — mit
   eingerichtetem 2FA braucht es einen Nachweis im Kopf (Skriptanpassung in einem
   späteren Paket).
4. Behebung B-XFF-1 in `schutz.mjs`/`server.mjs` einem Paket zuweisen.
5. 2FA für die Betreibercode-Anmeldung (`daten.mjs`) einem Paket zuweisen.
