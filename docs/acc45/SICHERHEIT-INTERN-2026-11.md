# Interne Sicherheitsprüfung 2026-11

Stand 2026-11-03 · Branch `acc45/sicherheit/interne-pruefung` (Basis `integration/centric-complete`, 8d21f50).
Auftrag des Betreibers: Bis zum externen Pentest nach dem Pilot sollen alle intern möglichen Prüfungen laufen.
Ein kritischer Fund blockiert jeden Pilot mit echten Nutzerdaten.

Rahmen:
- Geprüft wurde nur lokal (`127.0.0.1`), mit Wegwerfablagen und synthetischen Daten.
- Production, Staging, Secrets, Caddy, DNS und Firewall wurden weder angefasst noch gelesen. Gelesen wurde nur die Caddy-Vorlage im Repo.
- Es gab keine Angriffe auf fremde Systeme. `npm audit` fragt lediglich die öffentliche Registry ab.
- Das Repo ist öffentlich. Deshalb nennt dieses Dokument keine Hosts, IPs, Zugangsdaten, Personendaten oder gefundenen Geheimniswerte.

## Urteil

| | |
|---|---|
| **Kritische Funde** | **keine** |
| **Hohe Funde** | 3 gefunden (SI-01, SI-02, SI-06), **alle behoben** und mit Regressionstest abgesichert |
| **Offene kritische/hohe Funde** | **nein** |
| Offene mittlere Funde | 7, als Paketvorschläge P1–P8 unten. Vor dem Pilot zu entscheiden sind besonders P1 (Sicherungsschlüssel), P2 (Code-Sitzung nach Austritt), P4 (2FA für Leitung/Planung) und P3 (Mailversand aus Testbetrieben). |

## Befundliste

Schwere: kritisch / hoch / mittel / niedrig. „geprüft“ heißt: Der Codepfad wurde Ende zu Ende gelesen. Behobene Funde sind zusätzlich durch einen Test belegt.

### Behoben (je Fehlerklasse zuerst ein roter Regressionstest, dann die Korrektur)

| ID | Schwere | Befund | Fundstelle | Korrektur | Test |
|---|---|---|---|---|---|
| **SI-01** | **hoch** | **SSRF über den Push-Endpunkt.** Beim Anmelden wurde nur „beginnt mit https://“ geprüft. Jede Person mit Push-Recht konnte damit den Server POSTs an beliebige Hosts, Ports und Pfade schicken lassen: Loopback, private Netze, Metadatendienste. Dazu gehören auch Leitungen selbst registrierter Testbetriebe. Die Antwort 404/410 oder Fehler war ein Ein-Bit-Orakel. Wirksam, sobald VAPID gesetzt ist. | `server/funktionen/zustellung.mjs` (anmelden), `server/lib/webpush.mjs` | Neue `server/lib/pushziel.mjs` erlaubt nur https auf Port 443, ohne IP-Literale, ohne Zugangsdaten in der URL und nur die Hosts der Browser-Push-Dienste (FCM, Mozilla, Apple, WNS). Weitere Hosts nur über `CENTRIC_PUSH_HOSTS`; der nie auflösende Name `*.example` nur außerhalb der Auslieferung (`NODE_ENV` ≠ `production`), `*.invalid` nicht mehr. Seit der Zusammenführung mit WP-30 ist `pushziel.mjs` die einzige Positivliste (`webpush.mjs` reicht sie weiter); dazu die Härtung S1 (siehe Nachtrag). Geprüft wird beim Anmelden und noch einmal vor jedem Senden, damit auch Altanmeldungen erfasst sind; diese gelten dann als „erloschen“. | `pruefungen/sicherheit-intern.test.js` SI-01 (Prüffunktion, `sendePush`, echter Handler) |
| **SI-02** | **hoch** | **CSV-Formel-Injektion in Lohn- und DATEV-Exporten.** Namen, Einheiten, Zuschlags- und Lohnartbezeichnungen gingen roh oder nur gequotet in die CSV. Ein Name wie `=HYPERLINK(…)` oder `@…` wird bei Lohnstelle oder Steuerberatung ausgeführt. Ein `;` im Namen verschob außerdem Spalten. | `src/App.jsx` `exportZuschlaege`, `exportCSV`, `datevCSV`, `tabelleCSV` | Alle Textfelder laufen über das vorhandene `csvText` (`src/csvfeld.js`), Zahlen weiter über `csvFeld`. | SI-02 |
| **SI-06** | **hoch** | **Betreibersitzung prägte Betreiber-Codes.** `POST /api/zugaenge` nahm jede Rolle an, auch `betreiber` und erfundene Rollen. Eine einzige gestohlene Betreibersitzung (2 h) wurde so zu einem dauerhaften Betreiberzugang ohne Ablauf. | `server/funktionen/daten.mjs` (zugaenge) | Erlaubt sind nur bekannte Rollen, nie `betreiber`. Eine Abweisung wird protokolliert. Das Protokoll nennt jetzt die vergebenen Rollen. Kleine additive Änderung. Den Rest regelt P6. | SI-06 |
| SI-03 | mittel | **HTML-Injektion im Aushangplan-Druck.** Betriebs-, Einheiten- und Dienstartnamen sowie die Farbe gingen unmaskiert per `document.write` in ein gleich-originiges Fenster. Skripte blockiert die vererbte CSP. HTML- und CSS-Injektion blieben möglich, etwa `<meta refresh>` zu einer Phishing-Seite oder ein gefälschter Planinhalt. | `src/App.jsx` (Aushangplan) | Jede Einsetzung wird maskiert (`h`), die Farbe nur als `#hex` übernommen. | SI-03 |
| SI-04 | mittel | **Push-Klick öffnete fremde Adressen.** Geprüft wurde nur `ziel.startsWith("/")`. Damit gingen `//fremd` und `/\fremd` als fremde Origin durch. Das `ziel` einer Mitteilung schreibt der Client. | `public/sw.js` | Zusammengeführt mit WP-30: `eigenerPfad()` lässt nur einen eigenen Pfad aus `[A-Za-z0-9/_-]` ohne `//` am Anfang zu, sonst `/` — schon beim Anzeigen und noch einmal beim Klick; offene Fenster nur bei `url.startsWith(origin + "/")`. | SI-04 (mit der echten Funktion aus `sw.js`) |
| SI-07 | mittel | **Offline-Bestand blieb ohne Sitzung liegen.** Wurde am Stationsrechner der Reiter geschlossen statt abgemeldet, lag der ganze Betrieb mit Personaldaten bis zur nächsten Anmeldung im Cache Storage. | `src/speicher.js` | Startet die App ohne Token, wird der Datencache sofort geräumt. Das App-Gerüst bleibt, der Stempelpuffer bleibt wie gewollt (WP-07). Rest: P9. | SI-07 |
| SI-08 | mittel | **Keine Pflicht-Sondenprüfung.** Ein neuer Weg in `daten.mjs` oder ein neuer `config.path` lief ohne Matrixzeile und ohne Sonde durch die CI. | Prozess | Neu ist `pruefungen/routen-inventar.test.js`. Er liest alle 47 Wege aus dem Quelltext und verlangt für jeden einen Inventareintrag, eine Zeile in `RECHTEMATRIX.md` (oder eine begründete Lücke mit festgeschriebener Anzahl) und Sonden-Dateien, die den Weg aufrufen. Ein veralteter Eintrag ist ebenfalls rot. | selbst |
| SI-05 | niedrig | **Tabnabbing.** Die Dienstanfrage über WhatsApp, SMS oder Mail öffnete die Fremdseite ohne `noopener`. | `src/App.jsx` | `window.open(url, "_blank", "noopener,noreferrer")` | SI-05 |
| SI-09 | niedrig | **Entwicklungsabhängigkeiten mit 5 hohen Meldungen.** Betroffen sind vite (Dev-Server), brace-expansion, js-yaml, nanoid und source-map-js. Sie sind nicht im Laufzeitbild (`npm ci --omit=dev`) und nicht im Betrieb erreichbar. | `package-lock.json` | `npm audit fix --package-lock-only`, nur Updates innerhalb der semver-Bereiche. Danach meldet `npm audit` gesamt nur noch 6 mittlere Funde in der eslint-Kette; deren Behebung bräuchte eine Major-Version. | `npm run sicherheit:abhaengigkeiten` |

### Offen (Paketvorschläge, nicht umgebaut, weil größer oder Produktentscheidung)

| ID | Schwere | Befund | Fundstelle | Vorschlag |
|---|---|---|---|---|
| **P1** | mittel | **Sicherungsschlüssel überlebt seinen Ersteller.** Ein Schlüssel `sk:` gilt bis zu 365 Tage für `GET /api/vollausgabe`, also den ganzen Betrieb samt Personalakten. Er ist nur an den Betrieb gebunden. Sperre, Entzug der Mitgliedschaft und Herabstufung lassen ihn bestehen. Wer als Leitung ausscheidet, kann ein Jahr lang weiter exportieren. Zwei Prüfer haben das unabhängig festgestellt. | `server/funktionen/daten.mjs` (sicherungsschluessel) | Ersteller (Konto bzw. Code) im `sk:` speichern und beim Lesen wie den Kontoanker prüfen. Mit `zugang-sperren` und dem Entzug der Mitgliedschaft widerrufen. Ersteller in der Liste anzeigen. Höchstdauer senken. |
| **P2** | mittel | **Code-Sitzung überlebt das Entfernen der Person.** Ist die Person aus dem Betrieb gelöscht, fällt `wirksameRolle` auf die Rolle des Codes zurück, und Codes laufen nicht ab. Der Kalenderfeed dagegen wird korrekt widerrufen. | `server/lib/arbeitssitzung.mjs` (Code-Zweig), `server/lib/rechte.mjs` (`wirksameRolle`) | Ist die Person der Sitzung nicht mehr im Betrieb, anonymisiert oder ausgetreten: abweisen und die Sitzung beenden. Zusätzlich `gesperrt` des Codes prüfen. |
| **P3** | mittel | **Mailversand als Relay oder für Phishing.** In einem selbst registrierten Testbetrieb lassen sich Personen-E-Mails frei setzen und Mitteilungen mit freiem Text über den Betreiberabsender verschicken. Einzige Grenze ist die Bremse `zustellen`. Header-Injektion ist nicht möglich, weil der Versand JSON-API nutzt. | `server/lib/versand.mjs`, `server/funktionen/zustellung.mjs` | Kein Mailversand aus Test- und Demoräumen ohne Freigabe, eine Tagesobergrenze je Raum, oder Mail nur an bestätigte Kontoadressen. |
| **P4** | mittel | **Kein zweiter Faktor für Leitung, Planung und Kunde.** Sie sehen Gesundheits-, Bank- und Lohndaten mit einem Faktor: Code mit ca. 56 bit oder Passwort. 2FA gibt es nur für Verwalter und Betreiber. Laut Master-Execution-Vorgabe ist 2FA Pflicht. | `server/lib/zweifaktor.mjs`, `betreiber-zweifaktor.mjs` | TOTP für diese Rollen, mindestens für den Pilot. Bis dahin „Zugang merken“ für Leitung und Betreiber sperren. Für den Betreiber gilt das bereits. |
| **P6** | **hoch** | **Betreiber prägt Leitung-Codes für Kundenräume.** Dafür ist weder frische Anmeldung noch frische 2FA nötig. Technisch bedeutet das vollen Zugriff auf Personendaten der Kunden, entgegen der Zusage in AV §3. Nach SI-06 sind Betreiber-Codes ausgeschlossen. Zusätzlich ist `CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT` in `deploy.sh` nicht erzwungen. | `daten.mjs` (zugaenge) | `frisch()` und einen frischen 2FA-Code verlangen. Leitung-Codes für bestehende Kundenräume nur mit Zustimmung des Kunden oder nur über `/einrichten`. Die 2FA-Pflicht für Betreiber im Deploy erzwingen (Freigabe Betreiber). |
| **P7** | mittel | **Per-IP-Sperre trifft auch gültige Codes.** Die Bremse greift vor der Codeprüfung (8 je 5 min, Sperre bis 2 h). Hinter einem Stations-NAT reicht eine Person mit Tippfehlern, um alle auszusperren. IPv6 wird nicht nach /64 gruppiert; Rotation umgeht die Sperre je IP und füllt die Dienstgrenze. | `daten.mjs` (anmelden), `server/lib/schutz.mjs` | Nur Fehlversuche zählen, gültige Codes trotz gesperrter Herkunft durchlassen (Code+IP als Kennung), IPv6 nach /64 gruppieren. |
| **P8** | mittel | **Workflows teils nicht per SHA gepinnt.** `deploy.yml` (Registry-Login, Build/Push) sowie `sicherheit.yml` (checkout, gitleaks) und `pruefung.yml` nutzen Tags wie `@v3`/`@v4`. `lieferkette.yml` und der neue Job sind per SHA gepinnt. | `.github/workflows/*.yml` | Alle fremden Actions per Commit-SHA pinnen. Bei `deploy.yml` zuerst, wegen der Registry-Zugangsdaten. Die Deploy-Pipeline wurde hier bewusst nicht geändert. |
| P5 | niedrig | **Matrix- und Sondenlücken.** Ohne eigene Zeile in `RECHTEMATRIX.md` sind `/api/abmelden`, `/api/registrierung{,/verifizieren,/passwort}` und `/starten{,/neu}`; sie sind in `routen-inventar.test.js` als Lücken festgeschrieben. Negativ-Sonden mit unberechtigter Rolle fehlen für `zugaenge-uebersicht` (LT/MA), `sicherung`/`sicherungen` (MA/PL), `sicherungsschluessel` GET/DELETE, `/lage` (LT/MA) und `korrektur-antrag` (fremder Stempel). | `RECHTEMATRIX.md`, `pruefungen/` | Zeilen nachtragen und je Weg eine Negativ-Sonde ergänzen. |
| P9 | niedrig | Der Offline-Bestand wird auch ohne „Zugang merken“ gecacht. Nach SI-07 wird er erst beim nächsten Start geräumt. | `public/sw.js`, `src/speicher.js` | Nur bei „merken“ cachen, Marke im Request an den Dienstarbeiter. |
| P10 | niedrig | Eine 503-Antwort gibt den internen Fehlercode zurück (`e.code`, z. B. ENOENT). | `server.mjs` (catch-Block), `zustellung.mjs` | Codes nur aus einer Positivliste weitergeben. |
| P11 | niedrig | Header-Härtung: COOP und CORP fehlen, die CSP hat kein Reporting, `frame-ancestors 'self'` könnte `'none'` sein, und `style-src 'unsafe-inline'` ist wegen der React-Inline-Styles nötig. | `server.mjs` (`SICHERHEIT`) | COOP `same-origin` und CORP `same-origin` ergänzen, `report-to` vorsehen. |
| P12 | niedrig | Caddy-Vorlage: kein `request_body max_size`, `admin off` nicht ausdrücklich gesetzt, kein Hinweis, dass ein späteres Zugriffslog `/kalender/feed/*` schwärzen muss. Ein Zugriffslog ist derzeit nicht aktiv, also landen keine Feed-Geheimnisse im Log. | `deploy/caddy/Caddyfile.vorlage` | Ergänzen, nur mit Freigabe (Caddy ist ausgenommen). |
| P13 | niedrig | Kleinere Client-Punkte: Der clientseitige ICS-Export maskiert CR/LF nicht (der Server-Feed tut es korrekt). `personenAus` baut eine RegExp aus Personennamen; ein `(` legt die Befehlszeile lahm. `href` aus `tarifwerk.quelle` wird ohne Schemaprüfung gesetzt, die CSP verhindert `javascript:`. | `src/App.jsx` | Maskieren bzw. escapen und nur `https:` rendern. |
| P14 | niedrig | scrypt mit N=2^15 (OWASP empfiehlt 2^17; Rehash bei Anmeldung ist vorhanden). Kalenderfeed nur je Geheimnis gebremst (192 bit), nicht je Herkunft. Altcodes ohne `mandantId` fallen auf Betrieb 0 zurück. Raumnamen unterscheiden Groß und Klein, was nur auf einem nicht-Linux-Dateisystem relevant wäre. | `passwoerter.mjs`, `kalender.mjs`, `rechte.mjs`, `ablage.mjs` | N erhöhen, Bremse je Herkunft, keinen Rückfall auf Index 0 und Altcodes vor dem Pilot binden (`/einrichten/bindung`), Raumnamen normalisieren. |
| – | info | Das Code-Alphabet (26 Zeichen) wird per `Byte % 26` gezogen. Die Verzerrung ist minimal, die Entropie bleibt bei ca. 56 bit. Push-Titel erscheinen auf dem Sperrbildschirm und sollten keine Gesundheitsgründe enthalten. | `daten.mjs`, `versand.mjs` | Optional Rejection-Sampling bzw. ein Hinweis in den Texten. |

## Ergebnisse je Prüfpunkt

Alle Befehle laufen im Repo-Wurzelverzeichnis. Die neuen Werkzeuge liegen unter `werkzeug/sicherheit/` und laufen in der CI im Job `interne-pruefung` von `.github/workflows/sicherheit.yml`.

### 1. Statische Analyse

`npm run sicherheit:statik` (`werkzeug/sicherheit/statik.mjs`)

- **ESLint** (129 Dateien in src/ und server/) lief mit den Kernregeln no-eval, no-implied-eval, no-new-func, no-script-url, no-proto und no-extend-native, für src/ zusätzlich react/no-danger, react/jsx-no-target-blank und react/jsx-no-script-url. Ergebnis: **0 Verstöße.** `eslint-plugin-security` ist nicht installiert; die Musterliste deckt dessen Kernfälle ab.
- **Harte Muster:**
  - eval, `new Function`, String-Timer, `dangerouslySetInnerHTML`, `innerHTML`/`outerHTML`, `insertAdjacentHTML`, `javascript:`-URLs, `child_process`/`vm`, unsichere Deserialisierung, abgeschaltetes TLS, CORS `*`: jeweils **0**.
  - `document.write`: 2 Stellen. Beide sind Druckfenster, die nach SI-03 alles maskieren; sie stehen begründet in der Freigabeliste.
- **Zum Sichten**, alle von Hand geprüft:
  - `__proto__`, `Object.assign` aus dem Rumpf, RegExp aus Variablen auf dem Server: 0. Auf dem Client P13.
  - fs-Pfad aus Variablen: 1, `ablage.mjs`. Der Schlüssel wird byteweise %-kodiert, sodass `.`, `/`, `\`, `:`, NUL und `%` nicht durchkommen; Länge ≤ 200. Kein Traversal.
  - Serverseitige Abrufe: 5.
    - Resend und Redis-REST: feste bzw. aus der Umgebung gesetzte URL.
    - Alarm-Webhook: aus der Umgebung, mit `redirect: "error"`.
    - Web Push: SI-01.
  - Open Redirect auf dem Server: keine Weiterleitungen.
  - Auf dem Client: `location.href` nur auf eine `mailto:`-Hilfe, `window.open` an 3 Stellen (2 Druckfenster, 1 nach SI-05), `postMessage` nur vom Client an den Dienstarbeiter.
  - `JSON.parse` auf Rohtext: 11 Stellen, alle in try/catch mit Größengrenze (`RUMPF_MAX` 6 MB, beim Einlesen in `server.mjs` durchgesetzt). Kein Reviver, also keine Prototype Pollution: `__proto__` aus JSON wird eine eigene Eigenschaft, und die Stellen kopieren nicht per tiefem Merge.
- **Pfad-Traversal statisch** (`server.mjs`): `decodeURIComponent`, Ablehnung von NUL, `path.normalize`, Präfixprüfung gegen `dist/`. In Ordnung.

### 2. Abhängigkeiten

`npm run sicherheit:abhaengigkeiten` (`werkzeug/sicherheit/abhaengigkeiten.mjs`)

- **Lockfile v3, 379 Pakete:** alle aus `registry.npmjs.org` mit sha512-Integrität, keine git-, file- oder http-Quellen. `package.json` und die Lockfile-Wurzel stimmen überein. Installationsskripte haben nur `esbuild` (vite) und `fsevents` (optional, macOS).
- **`npm audit --omit=dev`** (Laufzeit: react, react-dom, web-push, Schriftart): **0 Schwachstellen.**
- **`npm audit` gesamt:**
  - Vorher 13 (5 hoch, 8 mittel), alle in Entwicklungswerkzeugen.
  - Nach SI-09 noch 6 mittel (minimatch über eslint/eslint-plugin-react, nur über eine Major-Version behebbar). Erreichbar sind sie nur beim Lint lokal oder in der CI, nicht im Betrieb.
- **Vorhandene Lieferketten-Workflows:**
  - `sicherheit.yml`: `npm audit` mit Gate für Laufzeit ab hoch, gitleaks, Musterliste.
  - `lieferkette.yml`: Trivy prüft das Bild (CRITICAL/HIGH mit Fix), zusätzlich `caddy validate`. Actions per SHA, Basisbilder im Dockerfile per Digest.
  - Lücke: P8.

### 3. Geheimnisse

`npm run sicherheit:geheimnisse` (`werkzeug/sicherheit/geheimnisse.mjs`; `--nur-arbeitsstand` für den Arbeitsbaum)

- Geprüft wurde die gesamte Historie (`git log -p --all`): 801 Commits und rund 496 000 Diff-Zeilen. Die Muster decken PEM, AWS, GitHub, Slack, Stripe, Resend, Anthropic/OpenAI, Google, JWT, VAPID-privat, URLs mit Zugangsdaten und Zuweisungen an Geheimnis-Variablen ab.
- **Es gibt keinen echten Fund.** Vier Treffer sind begründete Fehlalarme und stehen mit Grund in der Freigabeliste:
  - die PEM-Kopfzeile als Prüfmuster eines Leck-Tests,
  - feste CI-Prüfwerte in zwei Workflows und einem Prüfskript.
- Die Ausgabe nennt nie Werte. Zusätzlich läuft gitleaks in `sicherheit.yml`.

### 4. Authentifizierung und Autorisierung

Unabhängiges Review (Opus, nur lesend) plus eigene Tests.

- **Rechtematrix gegen Routen:** Es gibt 47 Wege, ermittelt aus `config.path`, aus jedem `pfad === …` und aus den PFADE-Listen. Dazu kommt `/gesund`, inline in `server.mjs`, öffentlich, Einzelheiten nur über Loopback. Alle 47 stehen im Inventar, und jeder hat mindestens eine Sonden-Datei. 41 haben eine Matrixzeile, 6 sind begründete Lücken (P5). Die Pflicht-Sondenprüfung gibt es jetzt (SI-08).
- **Rollen-Eskalation:**
  - Über `PUT /api/bestand` blockiert: `rollenwechselErlaubt`/`pruefeRollenwechsel` verhindern eine Selbst- oder Höherstufung. Die Ausnahme für leere Räume gilt nur für die erste Person.
  - Über `/api/zugaenge` gab es eine Eskalation zu „Betreiber“; behoben (SI-06).
  - Unbekannte Rollen werden überall abgewiesen (fail-closed).
- **IDOR:** PUT nimmt genau einen Betrieb an, und zwar den eigenen. Die Position des Betriebs wird gegen seine Kennung geprüft. Sperren, Sicherungen, Wiederherstellung, Kalender und Zustellung arbeiten im Bereich der Sitzung. Die Auskunft über Dritte bekommt nur die Leitung, und nur für den eigenen Betrieb.
- **Sitzungen:**
  - 32 Zufallsbytes, gespeichert nur als SHA-256.
  - Gültig 12 h, für den Betreiber 2 h, Leerlaufende nach 30 min. Autorität und Aktivität sind getrennt.
  - Konto-Login widerruft die alte Sitzung. Epoche, Generation und Codesperre beenden Sitzungen.
  - Offen: P2.
- **Cookie:** `__Host-`, HttpOnly, Secure, SameSite=Strict, Path=/.
- **CSRF/Origin:** Kontowege nutzen `herkunftStreng` (Sec-Fetch-Site, Origin Pflicht bei POST, Abgleich mit `CENTRIC_BASIS`). Alle anderen Wege arbeiten mit Bearer-Token oder Geheimnis, CSRF greift dort nicht.
- **Brute Force:**
  - Bremsen für Code-Login, Konto-Login, 2FA, Registrierung, Verifizierung, Passwort setzen und Selbststart, jeweils fail-closed, dazu eine Notbremse im Speicher.
  - Vergleiche über Hash bzw. `timingSafeEqual`.
  - Für unbekannte Adressen läuft ein Schein-scrypt, für unbekannte Codes gilt eine feste Verzögerung.
  - Offen: P7.
- **Betreiberwege:**
  - Die destruktiven Wege verlangen `frisch()`.
  - Abschalten der Betreiber-2FA verlangt einen frischen Code.
  - Verwalter-2FA ist Pflicht, sobald ein Verwalterschlüssel sie hat.
  - Offen: P6.

### 5. Mandantentrennung

Unabhängiges Review (Opus, nur lesend) plus eigene Tests.

- **Raum und Betrieb** stammen in allen Nutzerwegen aus der serverseitigen Sitzung. Der Client wählt nur an diesen Stellen mit:
  - Betreiberwege,
  - `betriebWaehlen` (gegen Mitgliedschaft, Generation und Person geprüft),
  - Login (der Raum kommt aus dem Codedatensatz).
- **Dateipfade:**
  - Schlüssel werden byteweise %-kodiert und auf 200 Zeichen begrenzt, Store-Namen per Regex geprüft.
  - Raumnamen enthalten kein `:`. Deshalb kann sich kein Präfix wie `scherbe:`, `sicherung:` oder `push:` mit einem anderen Raum überschneiden.
- **Journal und Scherben:**
  - Schlüssel entstehen nur serverseitig aus `s.bestand` und der Mandantenkennung.
  - Das Journal spielt nur Schritte ab, die der Server selbst gebaut hat.
  - Sicherung und Wiederherstellung sind auf Raum und Betrieb begrenzt. A kann B nicht überschreiben.
- **Feeds:** Das Geheimnis hat 192 bit und wird nur als Hash gespeichert. Ein Feed ist an Person, Betrieb und Herkunft gebunden, wird bei jedem Abruf neu geprüft und bei Ungültigkeit endgültig widerrufen. Er enthält nur eigene Dienste. Die ICS-Maskierung ist korrekt.
- **Mail/Push:**
  - Push-Register `push:<raum>:<mandantId>:<person>`, Empfänger nur aus dem eigenen Betrieb.
  - SSRF behoben (SI-01). Offen: P3.
- **Exporte:** Vollausgabe und Auskunft sind auf den eigenen Betrieb beschränkt. Geheimnisse anderer Personen (Kalender, Push, IBAN, Notfallkontakt) werden entfernt.
- **Ergebnis:** Kein Zugriff über Mandantengrenzen gefunden.

### 6. Abgleich mit den OWASP Top 10 (2021)

| Kategorie | Ergebnis | Beleg |
|---|---|---|
| A01 Broken Access Control | 1 hoch behoben (SI-06); offen P6 (hoch), P1, P2 (mittel) | Prüfpunkte 4 und 5, `routen-inventar.test.js`, Rechtematrix-Tests |
| A02 Cryptographic Failures | ok; P14 (scrypt-N) niedrig | Tokens 256 bit gehasht, Codes und Feeds gehasht, gepfeffert, HSTS, `__Host-`-Cookie |
| A03 Injection | 1 hoch (CSV, SI-02) und 1 mittel (HTML, SI-03) behoben; kein SQL, kein eval, ICS-Feed maskiert | Prüfpunkt 1, SI-02/03 |
| A04 Insecure Design | offen P3 (Mail-Relay), P4 (2FA), P7 (NAT-Sperre) | Befundliste |
| A05 Security Misconfiguration | ok mit P10–P12 (niedrig) | Header in `server.mjs`, Caddy-Vorlage, keine Sourcemaps, App-Port nicht veröffentlicht |
| A06 Vulnerable Components | Laufzeit 0; Entwicklung 5 hoch behoben (SI-09), 6 mittel offen | Prüfpunkt 2, Trivy im Workflow |
| A07 Identification & Authentication Failures | Bremsen, Sitzungsbindung und Rotation ok; offen P4, P7 | Prüfpunkte 4 und 8 |
| A08 Software & Data Integrity Failures | Lockfile-Integrität ok, Sicherungen mit SHA-256-Manifest; offen P8 (Action-Pins) | Prüfpunkte 2 und 9 |
| A09 Logging & Monitoring Failures | Protokoll ohne Tokens, Codes und Klartext-IP; Feed-Pfad geschwärzt; 5xx-Zähler und Alarm-Webhook; Rollen im Zugangsprotokoll ergänzt (SI-06) | Prüfpunkt 7 |
| A10 SSRF | 1 hoch behoben (SI-01) | SI-01 |

### 7. Datenlecks

Unabhängiges Review (Opus, nur lesend).

- **Logs:**
  - Keine Tokens, Passwörter, Codes, E-Mails oder Klartext-IPs.
  - `server.mjs` protokolliert die URL ohne Query und mit geschwärztem Feed-Pfad.
  - `protokoll()` speichert nur Rolle, Personenkennung und eine gekürzte Herkunft.
- **Fehlerantworten:**
  - Nach außen nur „Interner Fehler“ bzw. „Serverfehler“; `e.message` landet nur im Protokoll.
  - Den Prüflink-Token gibt es nur, wenn `NODE_ENV` nicht `production` ist; Bild und Compose setzen `production`.
  - Rest: P10.
- **Cache:**
  - Alle Antworthelfer setzen `no-store`.
  - Ausnahmen: die Demo-Liste (`public, 60 s`) und der Feed (`private`).
  - ETags gibt es nur für statische Dateien, Sourcemaps sind aus.
- **Header:** CSP mit `script-src 'self'` ohne `unsafe-inline`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'self'`, HSTS, nosniff, Referrer-Policy, Permissions-Policy. Rest: P11.
- **Service Worker:**
  - Er fängt nur GET `/api/bestand` ab, nie Schreibzugriffe und nie fremde Origins.
  - Der Cache ist an die Sitzung gebunden und wird bei Abmelden, Anmelden und Fassungswechsel geleert.
  - Nach SI-07 wird er zusätzlich beim Start ohne Sitzung geleert. Rest: P9.
  - Der Push-Klick ist behoben (SI-04).
- **Exporte:**
  - CSV behoben (SI-02).
  - DSGVO-Auskunft nur für die eigene Person bzw. für die Leitung im eigenen Betrieb, mit Bremse, Protokoll, `attachment` und `no-store`.
  - Die Vollausgabe entfernt Geheimnisse anderer Personen.

### 8. Rate-Limiting: Last- und Bremstests

Lokal, synthetische Daten, schwache Maschine (Celeron N4120, 4 Kerne, Windows-Dateiablage), Profil „kurz“.

- **`node pruefungen/serverlauf.mjs bremse`** (HTTP gegen einen frischen lokalen Server): **6/6 bestanden.**
  - Nacheinander greift die Grenze ab dem 9. Versuch (Grenze 8), und kein Versuch hatte Erfolg.
  - 60 gleichzeitige Versuche: alle mit 429 beantwortet, 0 × 200.
- **`vitest run pruefungen/bremse-lokal.test.js`** (zusammen mit `sitzungsbindung.test.js`): 83/83 bestanden. `bremse-wp47.test.js` und `stempel-429-client.test.js` laufen in der CI (`pruefung:bremse-wp47`); lokal wurde `stempel-429-client` mit den Speicherschicht-Tests ausgeführt (bestanden).
- **`node werkzeug/last/lauf.mjs --profil kurz --nur S4,S1`** (WP-28/47):
  - **S4 Anmeldung mit Bremse:** 46/46 gültige Anmeldungen aus vielen Herkünften kamen durch (0 % Fehler, p95 1,9 s). Ein Rater bekam ab dem 9. Versuch 429, bei 8 × 401 und 0 Treffern. Die Dienstgrenze für Anmeldungen wurde bei 455 gültigen Versuchen nicht ausgelöst, denn seit WP-47 zählen dort nur Fehlversuche.
  - **S1 Schichtwechsel 200/min:** 0 verlorene Stempel. 438 × 503 (Raumsperre über der Zeitgrenze) und 2 × 500 mit dennoch gespeichertem Stempel.
  - Das ist der bekannte WP-28-Befund zur Windows-Dateiablage: Dateizugriffe sind dort 20- bis 100-mal langsamer als unter Linux, siehe `wp28-nachweis.md` §3 und Befund 7. Es ist kein Sicherheitsbefund. Für den Pilot gilt die Messung unter Linux bzw. in der CI.

### 9. Sicherung und Wiederherstellung

- **`npm run sicherheit:wiederherstellung`** (`werkzeug/sicherheit/wiederherstellung-uebung.mjs`, mit den vorhandenen `ablage-sicherung.mjs` und `ablage-pruefen.mjs`): **12/12 Schritte bestanden.**
  1. Synthetische Ablage mit 2 Betrieben, 40 Personen, 720 Planeinträgen über 6 Monate und einem Zugangscode.
  2. Fingerabdruck (SHA-256) vor der Sicherung.
  3. Sicherung erzeugt und geprüft (Manifest mit SHA-256).
  4. Eine Kopie mit einem gekippten Bit wird als beschädigt erkannt.
  5. Datenverlust simuliert (Store gelöscht): Bestand und Code sind weg.
  6. Die Wiederherstellung mit fremdem Pfeffer wird abgelehnt.
  7. Wiederherstellung mit `--ersetzen`: Der Fingerabdruck ist identisch, der Code wieder auffindbar, `ablage-pruefen` meldet nichts.
  8. Der Altinhalt wurde nach `.vor-wiederherstellung-*` gelegt, nicht gelöscht.
- **In-App-Sicherungen:** `sicherungen.test.js` und `wiederherstellung-schutz.test.js` bestanden. `sicherung-ablage.test.js` bestand im Einzellauf mit 14/14 (siehe Zwischenstand unten).
- Die Übung läuft in der CI im Job `interne-pruefung`.

### 10. Security-Header, Caddy-Vorlage, CSP

- **Anwendung (`server.mjs`, `SICHERHEIT`):**
  - CSP `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'; object-src 'none'`.
  - HSTS 1 Jahr mit Subdomains, `X-Frame-Options SAMEORIGIN`, nosniff, `strict-origin-when-cross-origin`, Permissions-Policy (Geolocation nur self).
  - Die Header gelten für jede Antwort, die keinen eigenen gleichnamigen Header setzt.
- **Caddy-Vorlage** (nur gelesen):
  - Automatisches HTTPS.
  - Header nur ergänzend (`?`), ohne Abschwächung. `Server` und `X-Powered-By` werden entfernt.
  - `X-Forwarded-For` wird mit `{remote_host}` überschrieben; dazu passt die XFF-Vertrauensliste der Anwendung.
  - Kein Zugriffslog. Zeitgrenzen gesetzt. Die Vorlage wird in der CI validiert.
  - Rest: P12.
- **Bewertung:** solide. `style-src 'unsafe-inline'` ist ein bekannter Kompromiss wegen der React-Inline-Styles; Skripte bleiben streng. Verbesserungen: P11.

## Zwischenstand und Kennzeichnung

- 2026-11-03, Zwischenstand: Kritische Funde gab es nicht. Drei **hohe** Funde (SI-01 SSRF, SI-02 CSV-Injektion, SI-06 Betreiber-Codes) wurden sofort gekennzeichnet und im selben Branch behoben.
- Hinweis zu `sicherung-ablage.test.js`: Der erste lokale Lauf parallel zu einem anderen Testlauf hatte 2 Zeitüberschreitungen (60 s bzw. 45 s). Der Einzellauf danach bestand mit **14/14**. Das Werkzeug `ablage-sicherung.mjs` ist in diesem Branch unverändert; es handelte sich um Last auf der Maschine, nicht um einen Fehler.

## Reproduzieren

```sh
npm ci
npm run sicherheit:statik              # Prüfpunkt 1
npm run sicherheit:abhaengigkeiten     # Prüfpunkt 2 (Netz zur Registry; --ohne-audit für nur Lockfile)
npm run sicherheit:geheimnisse         # Prüfpunkt 3 (ganze Historie, ohne Werte)
npm run pruefung:sicherheit-intern     # Regressionstests SI-01…07 + Routen-Inventar (Prüfpunkte 4/5/7)
node pruefungen/serverlauf.mjs bremse  # Prüfpunkt 8 (HTTP, lokal)
node werkzeug/last/lauf.mjs --profil kurz --nur S4,S1   # Prüfpunkt 8 (Last, lokal)
npm run sicherheit:wiederherstellung   # Prüfpunkt 9
```

Lokal auf schwacher Maschine immer nur einzelne Testdateien mit `--testTimeout=120000 --hookTimeout=120000`; die Gesamtsuite läuft in der CI.

## Restrisiken

- **Kein externer Pentest.** Er folgt nach dem Pilot. Geschäftslogik-Missbrauch, Timing und DoS wurden nur stichprobenhaft geprüft.
- **Die Sicht-Feldlisten innerhalb eines Betriebs** (`sicht.mjs`, je Rolle) wurden hier nicht erneut vollständig durchgesehen. Sie sind über `rechtematrix-zeilen.test.js` und die Sicht-Tests abgedeckt.
- **Die Betriebsumgebung** (Firewall, Caddy-Instanz, Secrets, Backups außer Haus auf dem VPS) wurde bewusst nicht geprüft, sie ist ausgenommen. `CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT` und `CENTRIC_VERTRAUTE_PROXYS` müssen in Production gesetzt sein.
- **P6 (hoch) und die mittleren Funde P1–P4, P7, P8 bleiben offen** (Pakete SI-P1 … SI-P8 in `docs/acc45/work-packages.json`), bis sie als Paket umgesetzt oder vom Betreiber bewusst akzeptiert sind. P1, P2 und P4 betreffen Daten ausgeschiedener Personen bzw. die Stärke der Anmeldung. Sie gehören vor die Freigabe des Pilots mit echten Daten.
- **Die Bremsen** zählen ohne Redis (`REDIS_REST_*`) nicht atomar. Der Gleichzeitigkeitstest fängt trotzdem alles ab (60/60), eine scharfe Grenze braucht aber den atomaren Zähler.

## Nachtrag: Zusammenführung mit WP-30 und Review der Sicherheitsfixes (2026-11-04)

WP-30 (Mail und Push in Produktion) hatte die Push-SSRF-Abwehr unabhängig ein zweites Mal gebaut. Beide Fassungen sind zusammengeführt; ein Review (Opus) der Sicherheitsfixes ergab dabei:

| ID | Schwere | Befund | Behebung | Test |
|---|---|---|---|---|
| **S1** | **hoch** | **Umgehung der Push-Positivliste durch Parser-Unterschiede.** Geprüft wurde mit `new URL`, `web-push` 3.6.x verbindet über den alten `url.parse`. `https://127.0.0.1;.push.apple.com/x` oder `https://169.254.169.254'.push.apple.com/…` galten als Apple-Host, verbanden aber zu 127.0.0.1 bzw. dem Metadatendienst; `https:fcm.googleapis.com/x` (ohne `//`) hat für `url.parse` keinen Host (Verbindung zu localhost). | `server/lib/pushziel.mjs`: Adresse beginnt wörtlich mit `https://`, nur sichtbares ASCII ohne Rückstrich; Hostname nur aus `[a-z0-9-]`-Labels; beide Parser müssen denselben Hostnamen, kein Konto und höchstens Port 443 liefern. | `sicherheit-intern.test.js` SI-01 „S1“ (Proben gegen beide Parser, Gegenprobe, dass die Proben den Unterschied wirklich zeigen) |
| S2 | mittel | `*.example`/`*.invalid` waren auch in der Auslieferung erlaubt. | `*.example` nur bei `NODE_ENV` ≠ `production` (WP-30-Semantik), `*.invalid` gestrichen. | SI-01 „S2“, `mail-push-anbieter.test.js` |
| S3 | niedrig | `csvText` setzte Text mit Komma oder Tabulator nicht in Anführungszeichen. | `src/csvfeld.js`: auch bei `,` und Tabulator umschlossen. | SI-02 „S3“, `br-auswertung.test.js` |
| S4 | mittel | `routen-inventar.test.js` war umgehbar: nur `pfad === "x"` erkannt; `'x'`, `"x" === pfad`, `switch (pfad) { case "x": }` blieben grün, Kommentare zählten als Sonde, `/gesund` fehlte. | Kommentare werden vor der Suche entfernt (Code und Sonden), alle Vergleichsformen erkannt, `server.mjs` (`/gesund`) einbezogen, Laufzeitprüfung (unbekannter Unterweg → 404 mit Sitzung, 401/404 ohne). Dabei aufgefallen: `/zustellung/status` (WP-30) fehlte im Inventar; drei Sonden nannten ihren Weg nur im Kommentar und sind ersetzt. | `routen-inventar.test.js` |
| S5 | niedrig | `werkzeug/sicherheit/geheimnisse.mjs`: ein Platzhalter irgendwo in der Zeile unterdrückte jeden Treffer der Zeile. | Unterdrückung nur für den Treffer selbst; alle Treffer einer Regel einzeln geprüft; erkennbare Prüfwerte (`nur-zum-pruefen` …) gelten als Platzhalter. | `sicherheit-intern.test.js` „Geheimnis-Werkzeug“ |
| S6 | niedrig | `sw.js`: offenes Fenster per `url.includes(origin)` gesucht. | `url.startsWith(origin + "/")`. | SI-04 |

Nicht gebaut, sondern als Pakete geführt (`docs/acc45/work-packages.json`): SI-P1 (Sicherungsschlüssel), SI-P2 (Code-Sitzung nach Entfernen), SI-P3 (Mailversand aus Testräumen), SI-P4 (2FA für Leitung/Planung/Kunde), SI-P5 (Matrix-/Sondenlücken), **SI-P6 (Betreiber-Leitungscodes ohne frische Anmeldung, hoch)**, SI-P7 (Herkunftssperre/IPv6), SI-P8 (Actions per SHA).
