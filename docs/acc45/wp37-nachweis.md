# WP-37 PWA-Feinschliff – Nachweis

Branch `acc45/ui/wp37-pwa-feinschliff` (Basis `origin/integration/centric-complete`).
Test: `pruefungen/pwa.test.js` (`npm run pruefung:pwa`, im Gate `npm run pruefung`).

## Akzeptanzkriterien

| Kriterium | Befund vorher | Umsetzung | Test |
|---|---|---|---|
| Verknüpfungen wirksam | Das Manifest nennt `/?ansicht=meine` und `/?ansicht=krank`, die Oberfläche wertete den Parameter nirgends aus: beide öffneten nur die Startansicht. | `src/verknuepfung.js` (feste Liste, genau ein Parameter, sonst nichts) und ein Effekt in `src/App.jsx` (einmal je Aufruf nach der Anmeldung, Parameter wird aus der Adresszeile entfernt). Ansicht nur, wenn sie in der eigenen Navigation samt Rechten steht; „krank“ öffnet die eigene Krankmeldung wie der Knopf der Tab-Leiste, nicht für den Betreiber. | jede Verknüpfung des Manifests führt zu einem Ziel; Fremdes/Doppeltes/Groß-/Kleinschreibung/Betreiber-Ansicht → kein Ziel; Quelltextprüfung der Einbindung |
| SW-Fassung aus dem Bau | `FASSUNG = "v4"` von Hand gezählt. | Quelle trägt den Platzhalter `__CENTRIC_BUILD__`; `werkzeug/sw-fassung.mjs` (Vite-Plugin `closeBundle`) setzt einen SHA-256-Kurzhash über sw.js-Quelle, Dateinamen und Größen aller Bau-Dateien sowie index.html und Manifest ein. Fehlt der Platzhalter, bricht der Bau ab. `.dockerignore` gibt das Werkzeug für den Docker-Bau frei (sonst wäre `COPY . .` ohne die Datei gescheitert). Lokal gebaut: `dist/sw.js` trägt eine 12-stellige Fassung. | stabil bei gleichem Inhalt, anders bei anderem Bauteilnamen, Abbruch ohne Platzhalter, Einbindung in vite.config, Freigabe in .dockerignore |
| Cache bei Rollenwechsel leer | Geleert wurde nur beim Abmelden. Wer ohne Abmelden (Reiter geschlossen, gemerktes Gerät) an eine andere Person ging, bekam bei fehlendem Netz den Bestand der vorherigen Person. Zudem brach das Löschen ab, wenn `navigator.serviceWorker` fehlt (die direkte Löschung stand im selben `try`). | (a) `offlineCacheLeeren()` in `src/speicher.js`, getrennte `try`-Blöcke, bei Anmeldung und Demozugang vor dem Setzen des Tokens und beim Abmelden. (b) Im Dienstarbeiter ist der Bestand an die Sitzung gebunden (nur SHA-256 des Authorization-Wertes im Kopf, nie die Kennung); offline wird er nur der gleichen Sitzung gezeigt, ohne Sitzung nie. | Anmeldung, Demozugang und Abmelden (ohne SW-Schnittstelle) leeren `centric-daten-*`; fremde/keine Sitzung erhält offline nichts; keine Kennung im Klartext im Speicher; Nachricht `daten-loeschen` |

## Weitere Sicherheitsbefunde im Dienstarbeiter (gleiche Datei, mit behoben)

- **Navigationsanfragen:** Jede Navigation (auch `/einrichten`, `/kalender/…`, `/zustellung`, `/lage`, `/starten`) wurde unter `/` als Gerüst gespeichert und offline an Stelle der App gezeigt, auch Fehlerseiten und Weiterleitungen. Jetzt nur `/` und `/index.html`, und nur bei `ok`, ohne Weiterleitung, `text/html`. Serverseitige Seiten gehen unmittelbar ans Netz.
- **Bestand nur mit Sitzung und `ok`** gespeichert.
- Unverändert (WP-07-Vertrag): `/api/` außer `GET /api/bestand` wird nie abgefangen; Nicht-GET nie; keine Authentifizierungs- oder Schreib-Antwort im Cache (getestet: `POST /api/anmelden`, `PUT /api/bestand`, `POST /api/abmelden`, `GET /api/anmelden`, `GET /api/stempeln`). `pruefungen/stempelpuffer.test.js` (Vertrag WP-07) läuft unverändert grün; kein bestehender Test wurde geändert.

## Rot → grün

Commit `bf194d6` (nur der Test, gegen den alten Stand): 13 von 17 rot, 4 grün (WP-07-Vertrag und Vorhandenes: Schreiben nie abfangen, Nachricht `daten-loeschen`, Fehlerantwort nicht speichern, keine Kennung im Klartext). Nach der Umsetzung: 17/17 grün. Lokal zusätzlich `auslieferung.test.js` und `stempelpuffer.test.js` grün (43 Tests).

## Mutanten (je einer, jeweils getötet, Quelle danach wiederhergestellt)

| Mutant | gestorben durch |
|---|---|
| Sitzungsbindung im SW entfernt | „Bestand nur dem Gerät derselben Sitzung“ |
| Navigation für alle Pfade abfangen/speichern | „Seiten des Servers … nicht gespeichert“ |
| Anmeldung leert Cache nicht | „Anmeldung leert … vorherigen Person“ |
| Bestand auch bei Fehlerantwort speichern | „Fehlerantworten des Bestands werden nicht gespeichert“ |
| Platzhalterprüfung im Bau entfernt | „swStempeln bricht ab …“ |

## Berührte Dateien

`public/sw.js`, `src/speicher.js`, `src/verknuepfung.js` (neu), `src/App.jsx` (Import + ein Effekt vor den bedingten Returns), `vite.config.js`, `werkzeug/sw-fassung.mjs` (neu), `.dockerignore`, `package.json` (Skript `pruefung:pwa` + Eintrag im Gate), `pruefungen/pwa.test.js` (neu).

## Offene Abnahme (nicht im Labor prüfbar)

- Echtgeräte iOS (Safari, „Zum Home-Bildschirm“) und Android (Chrome): Installierbarkeit, Langdruck-Verknüpfungen „Meine Schichten“ und „Krank melden“ (auf iOS werden Manifest-Verknüpfungen nicht angeboten), Maskierbare Icons, Start im Standalone-Modus.
- Verhalten bei Aktualisierung der Fassung auf einem Gerät mit altem Dienstarbeiter (`v4`): `skipWaiting`/`claim` und Löschen alter `centric-*`-Speicher im `activate`; im Browser zu bestätigen.
- Offline-Start mit echtem Funkloch nach Anmeldung als andere Person.

## Review-Auflagen (Opus-Review), umgesetzt

- **A1** `pruefung:pwa` als eigener Schritt in `.github/workflows/pruefung.yml`; der Test prüft den Schritt.
- **A2** Verknüpfung „Meine Schichten“ für reine Mitarbeitende im Schichtdienst: Die Mobilschale kennt keine Ansichten, nur Reiter. `verknuepfungAnwenden` liefert dafür `mobilTab: "plan"` (wie die bestehende Abbildung `meine` → `plan` in der Mobilschale), `MobilSchale` bekommt `startTab` und zieht nach, auch wenn sie schon gezeichnet ist.
- **A3** Logik als reine Funktion `verknuepfungAnwenden` plus `ohneVerknuepfung` in `src/verknuepfung.js`; `verknuepfungFuer(sitz, ziel)` in `src/App.jsx` (exportiert) nutzt echte Navigation und Rechte. Getestet je Rolle: Betreiber (nichts), Mitarbeitende im Schichtdienst (Reiter plan, Krank), Betriebsrat und Schichtverantwortung (Ansicht), Leitung, Planung und Geschäftszimmer (`imSchichtdienst: false`) ohne Recht auf „meine“ (nichts), Krank für alle Personen im Betrieb.
- **N1** Plugin nutzt `writeBundle` (`order: "post"`) statt des Schlusssignals; ein fehlgeschlagener Bau behält seine eigene Fehlermeldung. Ausgabeordner aus der aufgelösten Konfiguration.
- **N2** Neue SW-Tests: Gerüst nicht aus Weiterleitung, nicht aus Nicht-HTML; Offline-Antwort ohne Sitzungsmarke; `activate` verwirft alte `centric-*`-Speicher (Migration von `v4`), fremde Namen bleiben.
- **Info/Folgepunkt:** Alte Reiter können nach einem Fassungswechsel auf nicht mehr vorhandene Bauteile (Chunk-404) stoßen; ein Hinweis „neu laden“ bei `controllerchange` ist ein Folgepunkt.

Mutanten dieser Runde (alle getötet): Rechtefilter der Navigation entfernt; Betreiber-Krank erlaubt; `replaceState` entfernt; `ohneVerknuepfung` ohne Löschen; `mobilTab` entfernt; `startTab` nicht übernommen; `!netz.redirected` entfernt; Content-Type-Prüfung entfernt; `activate` löscht nicht; Sitzungsmarke bleibt in der Offline-Antwort; Schlusssignal statt `writeBundle`; CI-Schritt entfernt. Ein erster Lauf ließ drei überleben (Rechtefilter wegen Zeilenende-Muster nicht angewandt, Betreiber-Krank nur über die Zusammensetzung, `startTab`-Effekt); dazu Tests ergänzt, danach getötet.
