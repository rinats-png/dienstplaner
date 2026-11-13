# Abnahme V4 Strang A: Betrieb, Rollen, Personal, Plan, Mandanten

> **Lokale Integrationsabnahme, keine vollständige Staging-Abnahme.** Alle Ergebnisse stammen aus einer lokal gestarteten,
> isolierten Instanz (`server.mjs` auf 127.0.0.1, Wegwerf-Datenordner, `NODE_ENV=development`, nur synthetische Daten).
> Was nur in einem produktionsähnlichen Staging nachweisbar ist, steht in Abschnitt 5. Staging, VPS und Produktion wurden
> weder berührt noch geprüft.

Auftrag: Betreiberauftrag 2026-11-13 „Vollständige Staging- und Release-Abnahme“, Strang A = Bereiche 1–5 und 11.
Stand: 2026-11-13.

| | |
|---|---|
| Geprüfter Stand (Beginn) | `integration/release-v4` @ `0638c10185c0171da3cc1d2ae4a2195adf9c42f4` |
| Geprüfter Stand (Ende) | derselbe Code plus die Prüfungen dieses PR (Zweig `feature/abnahme-v4-strang-a`, Commit im PR); kein Produktivcode geändert |
| Umgebung | Windows 11, Node 24.18.0, Git Bash; `npm ci` im eigenen Worktree; Playwright 1.64.1 Chromium headless |
| Server je Lauf | vitest: `server.mjs` auf vom System vergebenem Loopback-Port (`pruefungen/hilfen/port.mjs`, nie 3999); Playwright: 127.0.0.1:4101 (`E2E_PORT=4101`) |
| Schalter | `CENTRIC_IMPORT_AKTIV` nicht gesetzt (Import aus), `CENTRIC_DEMO`/`CENTRIC_SELBSTSTART`/`CENTRIC_REGISTRIERUNG` im API-Ablauf nicht gesetzt; die Playwright-Suite startet wie bisher mit Demo (global-setup) |
| Daten | nur erfundene Namen und Marker (`MKNORDX7`, `MKSUEDQ4`, `NordMKe2e`, `SuedMKe2e`); Zugangscodes nie ausgegeben (Prüfung „Protokoll enthält keine Zugangscodes“) |

Bewertung: **bestanden** = Test lief und war grün; **nicht bestanden** = lief und war rot; **nicht ausführbar** = lief nicht oder
nicht aussagekräftig (mit Grund). Fehlende Tests zählen nie als bestanden.

## 1. Neue Prüfungen

| Datei | Art | Inhalt | Kosten |
|---|---|---|---|
| `pruefungen/abnahme-a-ablauf.test.js` | vitest, echter `server.mjs` über HTTP | durchgehender Ablauf über zwei Betriebe: Betreiber richtet sich ein → legt zwei leere Betriebe an → je ein Leitungszugang → Leitung konfiguriert → Personal → Einladungen (Planung, 2 Beschäftigte, SV, Betriebsrat) → Schichtmodell (IMP-6, nur API) → Entwurf → Änderung → Freigabe → Beschäftigte sieht; Mandantentrennung mit gefälschten Rümpfen, Kennungen, ETags; Import bleibt 404 | 24 Tests, ca. 40 s |
| `e2e/abnahme-a-ablauf.spec.mjs` | Playwright + axe | derselbe Ablauf im Browser (echte Anmeldeseite): Leitung meldet sich erstmals im leeren Betrieb an, sieht Personal; Beschäftigte sieht den Entwurf nicht; Planung klickt „Plan freigeben“; Beschäftigte (390 px) sieht ihren Dienst; Leitung Süd sieht nichts aus Nord | 6 Tests, nur Projekt `1024x768` (in den anderen 7 übersprungen), ca. 2–3 min inkl. Bau |
| `e2e/global-setup.mjs`, `e2e/umgebung.mjs` | Erweiterung | reicht den synthetischen Betreibercode über `CENTRIC_E2E_BETREIBER` an die Specs (nie ausgegeben) | – |
| `package.json` | Kette | `pruefung:abnahme-a-ablauf` vor `pruefung:wcag-wp40` (Sammelprüfung bleibt zuletzt) | – |
| `.github/workflows/pruefung.yml` | CI | Schritt „Abnahme V4 Strang A“ nach IMP-6 Teil 2; die Spec läuft im bestehenden Job `npm run e2e` mit | – |

### 1.1 Rot bei Defekt (Mutationsproben, lokal, nie eingecheckt)

| Mutation (vorübergehend, danach `git checkout`) | Erwartet rot | Ergebnis |
|---|---|---|
| `server/lib/planfreigabe.mjs` `istEntwurfstag`: Zeile 75 `return false` (Entwurfsfilter aus) | vitest 5.1, e2e Schritt 2 | vitest: **1 failed** (5.1); e2e: **1 failed** (Schritt 2, `e2e-mutation-entwurfsfilter.log`) |
| `server/funktionen/daten.mjs`: `erwarteterStand: null` statt `etag` (Konfliktprüfung aus) | vitest 11.3 | **1 failed** (11.3) |
| `server/lib/rechte.mjs` `darfPlanFreigeben`: `return typeof rolle === "string"` | vitest 5.3 | **blieb grün (24 passed)**: Die Freigabe der SV scheitert zusätzlich an der Bereichsgrenze des Schreibumfangs, Beschäftigte/Betriebsrat an ihrem Schreibumfang (Verteidigung in der Tiefe). Der Einzelriegel selbst ist durch `pruefungen/rb1-plan-publish.test.js` abgedeckt (Unit), nicht durch diesen Ablauf. |

## 2. Ergebnisse je Bereich

Befehle: vitest einzeln `npx vitest run <datei> --testTimeout=120000 --hookTimeout=120000`; Serverläufe
`node pruefungen/serverlauf.mjs <name>`; Playwright `E2E_PORT=4101 npx playwright test e2e/abnahme-a-ablauf.spec.mjs --project=1024x768`.
Protokolle der Läufe liegen lokal beim Prüfer (nicht eingecheckt, enthalten keine Codes).

Alle Zeilen: Commit `0638c101` (Code), Lauf 2026-11-13 lokal. „neu“ = in diesem PR hinzugefügt.

### Bereich 1 — Betrieb anlegen und konfigurieren

| Test | Befehl | Ergebnis | Beleg | Befund | Restrisiko |
|---|---|---|---|---|---|
| neu: Ablauf 1.1–1.3 (Betreiber legt zwei leere Betriebe an, Doppelanlage 409, ohne Betreibersitzung 401/403, Leitung konfiguriert, Planfreigabe-Pflicht ab Werk) | vitest `abnahme-a-ablauf.test.js` | bestanden (24/24 im Ablauf) | `pruefungen/abnahme-a-ablauf.test.js` Z. 115, 130, 152 | A-4 | Konfiguration nur über API; Einrichtungsassistent im Browser nicht durch neue Spec |
| neu: e2e 0 (erste Anmeldung der Leitung im leeren Betrieb legt ihre Person an) | Playwright | bestanden (6/6) | `e2e/abnahme-a-ablauf.spec.mjs` Z. 79 | A-3 | – |
| erstbefuellung | vitest | bestanden 21/21 | `pruefungen/erstbefuellung.test.js` | – | – |
| betriebsauswahl | vitest | bestanden 51/51 | `pruefungen/betriebsauswahl.test.js` | – | – |
| selbststart-schalter | vitest | bestanden 18/18 | `pruefungen/selbststart-schalter.test.js` | – | – |
| registrierung-schalter, registrierung, registrierung-http | vitest | bestanden 14/14, 62/62, 35/35 | `pruefungen/registrierung*.test.js` | – | öffentliche Selbstregistrierung ab Werk aus (bestätigt) |
| erstbefuellung (HTTP) | `node pruefungen/serverlauf.mjs erstbefuellung` | bestanden 29/29 | `pruefungen/erstbefuellung.mjs` | – | – |

### Bereich 2 — Benutzer und Rollen einrichten

| Test | Befehl | Ergebnis | Beleg | Befund | Restrisiko |
|---|---|---|---|---|---|
| neu: 2.1 Betreiber vergibt Leitungszugang, nie Betreiberzugang (400), Beschäftigte ohne Person (400) | vitest | bestanden | Z. 138 | – | – |
| neu: 2.2 Leitung lädt Planung, 2 Beschäftigte, SV, Betriebsrat ein; Annahme; Anmeldung mit richtiger Rolle und Person | vitest | bestanden | Z. 191 | – | Faktorpflicht (Produktion) nicht im Ablauf |
| neu: 2.2b Altrolle kunde nicht vergebbar; Kundenraum nach Ersteinrichtung gesperrt (409 `kundenraum_gesperrt`) | vitest | bestanden | Z. 207 | – | – |
| neu: 2.3 zweiter Zugang je Person 409; BR, Beschäftigte, SV laden nicht ein (403) | vitest | bestanden | Z. 217 | – | – |
| neu: 2.4 Einladungsbremse je Raum | vitest | bestanden (hält den Befund fest) | Z. 229 | **A-2 (P2)** | siehe Befund |
| zugaenge-anlegen | vitest | **nicht ausführbar** — lokal fehlt `jq` (Skript `werkzeug/zugaenge-anlegen.sh` bricht mit „jq fehlt“ ab; 7 failed) | Protokoll beim Prüfer | – | läuft in der CI (Linux mit jq); lokal kein Nachweis |
| zugaenge-frischer-faktor, zugaenge-vorlauf-produktion | vitest | bestanden 16/16, 1/1 | `pruefungen/zugaenge-*.test.js` | – | – |
| einladungen, einladungen-oberflaeche | vitest | bestanden 77/77, 17/17 | `pruefungen/einladungen*.test.js` | – | – |
| rollenvergabe, rollen-eintritt, rollen-failclosed | vitest | bestanden 24/24, 10/10, 17/17 | `pruefungen/rollen*.test.js` | – | – |
| rollen-zweifaktor, rollen-zweifaktor-merken | vitest | bestanden 40/40, 7/7 | `pruefungen/rollen-zweifaktor*.test.js` | – | – |

### Bereich 3 — Personal anlegen (Import gesperrt)

| Test | Befehl | Ergebnis | Beleg | Befund | Restrisiko |
|---|---|---|---|---|---|
| neu: 3.1 Leitung legt Personal an (PUT `/api/bestand`) | vitest | bestanden | Z. 170 | A-4 | – |
| neu: 3.2 Import aus: alle fünf Wege `/api/import/{upload,analyse,vorschau,uebernahme,verwerfen}` → 404 für Leitung, Betreiber und ohne Sitzung (`CENTRIC_IMPORT_AKTIV` nicht gesetzt) | vitest | bestanden | Z. 180 | – | – |
| neu: e2e 1 Leitung sieht Personal ihres Betriebs | Playwright | bestanden | Spec Z. 105 | A-5 | axe auf „Personal“ erst nach PR #272 |
| import-schalter | vitest | bestanden 34/34 | `pruefungen/import-schalter.test.js` | – | – |
| personendaten, person-eintritt, bestand-personalnummer, speicher-personalnummer | vitest | bestanden 11/11, 38/38, 11/11, 2/2 | `pruefungen/…` | – | – |

### Bereich 4 — Schichtmodelle zuordnen (IMP-6, nur API)

| Test | Befehl | Ergebnis | Beleg | Befund | Restrisiko |
|---|---|---|---|---|---|
| neu: 4.1 Leitung legt Modell an und ordnet ab dem Planmonat zu (bis Vortag Betriebsmodell); Wann/Wer/Version vom Server, gefälschte Werte verfallen | vitest | bestanden | Z. 235 | – | – |
| neu: 4.2 Planung darf zuordnen; Beschäftigte, SV, BR ändern nichts (Status 200/403, Stand unverändert) | vitest | bestanden | Z. 247 | – | – |
| neu: 4.3 rückwirkende Zuordnung abgewiesen | vitest | bestanden | Z. 265 | – | – |
| imp6-mehrfachmodelle | vitest | bestanden 90/90 | `pruefungen/imp6-mehrfachmodelle.test.js` | – | Zuordnung wirkt nicht auf die Planrechnung (Entscheidung) |
| import-schichtmodelle-imp6 | vitest | bestanden 26/26 | `pruefungen/import-schichtmodelle-imp6.test.js` | – | – |

### Bereich 5 — Dienstpläne erstellen, ändern, veröffentlichen

| Test | Befehl | Ergebnis | Beleg | Befund | Restrisiko |
|---|---|---|---|---|---|
| neu: 5.1 Entwurf; Beschäftigte sehen ihn nicht | vitest | bestanden (Mutation: rot) | Z. 277 | – | – |
| neu: 5.2 Entwurf ändern (Ruhezeit beachtet: Spät→Früh am Folgetag wird gesperrt, deshalb zwei Tage Abstand) | vitest | bestanden | Z. 285 | – | – |
| neu: 5.3 ohne plan.publish keine Freigabe (SV 403; Beschäftigte/BR 200 oder 403, nichts gespeichert) | vitest | bestanden | Z. 293 | – | Einzelriegel siehe 1.1 |
| neu: 5.4/5.5 Planung und Leitung veröffentlichen; Beschäftigte sehen den Plan | vitest | bestanden | Z. 307, 320 | – | – |
| neu: e2e 2–4 Entwurf unsichtbar → „Plan freigeben“ im Browser → Beschäftigte (390 px) sieht Dienst; axe auf Monatsplan (Fläche `plan-planer`) und Mein Plan (`plan-mitarbeiter`) | Playwright | bestanden (Mutation Entwurfsfilter: rot) | Spec Z. 116, 126, 141 | – | Raster-Klicks nicht belegt |
| rb1-plan-publish | vitest | bestanden 55/55 | `pruefungen/rb1-plan-publish.test.js` | – | – |
| entwuerfe, entwuerfe-oberflaeche | vitest | bestanden 68/68, 18/18 | `pruefungen/entwuerfe*.test.js` | – | – |

### Bereich 11 — Mandantentrennung und Berechtigungen

| Test | Befehl | Ergebnis | Beleg | Befund | Restrisiko |
|---|---|---|---|---|---|
| neu: 11.1 jede Rolle sieht nur ihren Betrieb (Marker fremder Betriebe nie in der Antwort) | vitest | bestanden | Z. 331 | – | – |
| neu: 11.2 gefälschte Rümpfe (fremder Betrieb, fremde Kennung, zwei Betriebe; Planung mit Süd-Kennung) abgewiesen, Nord unverändert | vitest | bestanden | Z. 342 | – | – |
| neu: 11.3 ETag: derselbe Monat gleichzeitig → 409; ohne/ungültig → 409; nichts überschrieben | vitest | bestanden (Mutation: rot) | Z. 363 | – | – |
| neu: 11.4 Einladung fremder Person 404; Betreiber-Token liest keinen Kundenbetrieb | vitest | bestanden | Z. 381 | – | – |
| neu: 11.5 Betriebsrat schreibt nie (403); Beschäftigte ändern keinen fremden Dienst | vitest | bestanden | Z. 389 | – | – |
| neu: e2e 5 Leitung Süd sieht in Personal und Monatsplan nichts aus Nord | Playwright | bestanden | Spec Z. 150 | – | – |
| mandanten, mandanten-session | vitest | bestanden 65/65, 28/28 | `pruefungen/mandanten*.test.js` | – | – |
| rechtematrix, rechtematrix-zeilen | vitest | bestanden 64/64, 747/747 | `pruefungen/rechtematrix*.test.js` | – | – |
| sicht-planung-leitung, betreiber-sicht, abnahme-a-b | vitest | bestanden 43/43, 16/16, 25/25 | `pruefungen/…` | – | – |
| RB-1..RB-5: rb1 (s. Bereich 5), rb2-krankmeldung, rb3-kunde-ohne-publish, rb4-krankmeldung-benachrichtigung, rb5-klaerung | vitest | bestanden 73/73, 44/44, 35/35, 41/41 | `pruefungen/rb*.test.js` | – | Regeln unverändert (kein Produktivcode geändert) |
| Serverläufe mandanten, sicht-planung-leitung, betreiber-sicht, verwaltungswege | `node pruefungen/serverlauf.mjs <name>` | bestanden 22/22, 19/19, 13/13, 16/16 | `pruefungen/*.mjs` | – | – |

### Zählung

- Vorhandene Prüfungen: 37 vitest-Dateien und 5 Serverläufe ausgeführt; **41 bestanden**, **0 nicht bestanden**,
  **1 nicht ausführbar** (`zugaenge-anlegen`: jq fehlt lokal).
- Neue Prüfungen: vitest `abnahme-a-ablauf` 24/24 bestanden (zweimal: Einzellauf und Sammellauf); Playwright 6/6 bestanden
  (Lauf 5). Vorläufe der neuen Spec waren rot, bis die Befunde A-3, A-4 und A-5 eingegrenzt waren. Lauf 3 scheiterte an der
  E2E-Einrichtung (Flake, s. Restrisiken), die Wiederholung lief.
- `npm run lint` grün, `npm run pruefung:typen` grün (rc 0), `npm run pruefung:ci-abdeckung` grün (8/8),
  `npm run pruefung:acc45-werkzeuge` grün (59 bestanden, 1 übersprungen).

## 3. Befunde

| Nr. | Klasse | Bereich | Befund | Reproduktion | Umgang |
|---|---|---|---|---|---|
| A-2 | P2 | 2 | Die Einladungsbremse zählt **je Raum** (`server/funktionen/einladung.mjs` Z. 76 und 107: `bremse("zugaenge", kennung(req, s))`, `kennung` = `s:<raum>`; Grenze `zugaenge` 10 Versuche je 10 min, Sperre 30 min steigend, `server/lib/schutz.mjs` Z. 321). Folgen: (a) Eine Leitung kann beim Einrichten nur etwa zehn Personen einladen, danach 429 für mindestens 30 min. (b) Die Bremse greift **vor** der Rollenprüfung: Absagen an Beschäftigte, SV oder Betriebsrat (403) verbrauchen das Kontingent der Leitung mit. Eine angemeldete Beschäftigte kann so die Einladungen ihres Betriebs sperren (betriebsinterne Verfügbarkeit, keine Datenpreisgabe). | `abnahme-a-ablauf.test.js` 2.4 (Z. 229): nach 6 Einladungen der Leitung + 1 Duplikat + 3 Absagen anderer Rollen erhält die Leitung 429. | **Nur gemeldet, nicht behoben.** Die Bremsgrenzen sind eine Sicherheitsentscheidung (Kennung je Person statt je Raum ändert die Obergrenze für mehrere Leitungen). Vorschlag: Rollenprüfung vor der Bremse, oder Kennung je Person mit eigener Raumobergrenze. Ausweichweg: warten; Betreiber stellt Zugänge nur bei Ersteinrichtung aus (G.2). Test 2.4 hält den heutigen Stand fest und ist bei einer Änderung anzupassen. |
| A-3 | P2 | 2 | Ein Leitungscode **ohne Person** in einem Betrieb, der Personen, aber **keine aktive Leitungsperson** hat, landet in der Oberfläche auf dem Rollenwähler der Vorführfassung („Vorführfassung — du bist bereits angemeldet“, „Zur Betreiberkonsole“, „Als Planer anmelden …“), obwohl der Zugang kein Demozugang ist (`src/App.jsx` Z. 1141–1213: ohne passende Person keine Sitzung → `Anmeldung`). Serverseitig keine Rechteausweitung (das Token bleibt `leitung`; Betreiberwege prüfen `rolle === "betreiber"`), aber irreführend. | Erster Lauf der Spec: Betrieb über API mit Planung und Beschäftigter, ohne Leitungsperson befüllt, dann Leitungscode im Browser → Rollenwähler (Seitenabbild beim Prüfer). Gleiches tritt ein, wenn die einzige Leitungsperson ausscheidet oder inaktiv wird. | Gemeldet. Behebung (klare Meldung statt Rollenwähler, wie für personengebundene Codes in Z. 1166) braucht eine Produktentscheidung, wie ein Leitungszugang ohne Person dann in den Betrieb kommt. Die Spec nutzt den echten Weg (erste Anmeldung im leeren Betrieb). |
| A-4 | P3 | 1/3 | Der Server nimmt eine Dienstart ohne `mindest` an (PUT `/api/bestand`); die Oberfläche stürzt danach ab („Cannot read properties of undefined (reading 'fr')“, `src/lib/fachlogik.js` Z. 831 u. a.). Über die Oberfläche selbst entsteht keine solche Dienstart (Assistent setzt `mindest`). | Zweiter Lauf der Spec mit Dienstart ohne `mindest` → Fehlerbildschirm. | Gemeldet. Betrifft API-Schreiber (künftiger Import, Werkzeuge). Vorschlag: Gestaltprüfung der Dienstart serverseitig oder defensive Oberfläche. |
| A-5 | P2 | 2/3 | axe (WCAG 2.2 AA) auf „Personal“ der Leitung: **`select-name` (critical)** — die Rollenauswahl je Zeile hat keinen Namen. Zusätzlich `label-content-name-mismatch` (serious, experimentell; dasselbe Muster wie die begründeten WP-40-Ausnahmen). | Erster axe-Scan der Fläche (bisher von keiner Prüfung gescannt). | `select-name` **behoben in eigenem PR #272** (`fix/personal-rollenauswahl-name`, rot vorher/grün nachher, `pruefungen/personal-rollenauswahl-name.test.js`). `label-content-name-mismatch` → WP-40-Nacharbeit. Bis #272 gemergt ist, scannt die Spec „Personal“ nicht mit axe. |

Kein P0- und kein P1-Befund. Keine Datenpreisgabe zwischen Betrieben, keine Rechteausweitung gefunden.

Beobachtung (kein Befund): Ein älterer ETag ist kein Konflikt, solange inzwischen ein **anderer** Monat geändert wurde —
`bestandSchreiben` führt je Monat zusammen (bewusst, `daten.mjs` „Zwei Planer, die an verschiedenen Monaten arbeiten,
kollidieren dadurch nicht mehr“). Ein ETag ohne Wert, mit Buchstaben oder negativ: 409. Derselbe Monat: 409, nichts überschrieben.

## 4. Restrisiken

- **Produktionsmodus nicht im Ablauf:** Der Ablauf läuft mit `NODE_ENV=development`, also ohne Pflicht zum zweiten Faktor für
  Betreiber, Leitung und Planung. Die Faktorpflicht prüfen getrennt `rollen-zweifaktor*`, `zugaenge-frischer-faktor`,
  `zugaenge-vorlauf-produktion`; ein durchgehender Ablauf mit Faktor ist hier nicht belegt.
- **Altrolle `kunde`:** Im neuen Betrieb nicht vergebbar (Betreiber 400, Leitung 403, nach Ersteinrichtung 409). Ihre Regeln
  (RB-3) prüfen nur die Unit-/Handlertests `rb3-kunde-ohne-publish`, `rb1-plan-publish`, `mandanten`.
- **Schichtmodell-Zuordnung wirkt nicht auf die Planrechnung** (IMP-6 ohne Aktivierung, Entscheidung); geprüft ist nur das
  Speichern, Prüfen und Schützen über die API.
- **Plan erstellen/ändern im Browser** ist nicht durch Klicks im Raster belegt, nur über die API; im Browser belegt sind
  Anmeldung, Sicht, Freigabe-Knopf und die Sicht der Beschäftigten.
- **Einladungsweg im Browser** (Leitung erzeugt Einladung in der Oberfläche, Annahme-Seite) ist nicht durch die neue Spec belegt;
  die API-Wege sind belegt, die Oberfläche durch `einladungen-oberflaeche.test.js` (Render, ohne Browser).
- Die E2E-Einrichtung (`global-setup.mjs`, Demo-Bestand) scheiterte in 1 von 6 lokalen Läufen mit „Demo-Bestand ohne aktive
  Person der Rolle mitarbeiter“ (vor jedem Test, unverändert seit WP-33); Wiederholung grün. Siehe Abschnitt 2.

## 5. Nur in produktionsähnlichem Staging nachweisbar

Für die Bereiche 1–5 und 11 bleibt lokal **unbewiesen**:

| Thema | Was genau unbewiesen bleibt |
|---|---|
| Docker-Bild | Ob der Ablauf mit dem gebauten Bild (`npm ci --omit=dev`, Nutzer, Dateirechte am Datenvolume, `NODE_ENV=production`) genauso läuft; insbesondere Ablage unter Linux (Groß-/Kleinschreibung der Raumnamen, `KR-ALT`-Fall), Rechte auf dem Volume nach Neustart. |
| Caddy als Reverse Proxy | Herkunft (`X-Forwarded-For` nur von Caddy, `CENTRIC_VERTRAUTE_PROXYS` auf die feste Caddy-Adresse) und damit die Bremsen je Herkunft und je Raum (A-2) unter realer Verteilung; Herkunftsprüfung (`herkunftErlaubt`, Origin) mit echtem Hostnamen; Größenbegrenzung der Rümpfe vor dem Server. |
| TLS | Sitzungs- und Merkmalscookies mit `Secure`, HSTS, kein gemischter Inhalt; Anmeldung, Einladungslink und Annahme über HTTPS mit echtem Zertifikat. |
| Realistische Umgebung | Zweiter Faktor als Pflicht (Produktion) im ganzen Ablauf: Betreiber legt Betrieb an und Zugänge mit frischem Faktor, Leitung/Planung richten den Faktor ein, Einladungen mit Bestätigung per Faktor; Mail- und Push-Zustellung der Mitteilung „Plan freigegeben“ an echte Postfächer/Geräte; Uhrzeit und Zeitzone des Hosts (Berlin, Tageswechsel, Monatswechsel für Entwurfstage). |
| Echte Android-/iOS-Geräte | Anmeldung mit Code auf dem Telefon, „Mein Plan“ nach der Freigabe (hier nur Chromium mit 390 px), Bildschirmleser (TalkBack/VoiceOver) auf Personal und Monatsplan, PWA-Installation und Service Worker (in Playwright gesperrt), Tastatur/Autofill bei Einladungsannahme. |
| Mandantentrennung unter Last | Gleichzeitige Schreiber mehrerer Betriebe auf derselben Ablage (Raumsperre über Prozesse/Neustarts), Zwischenspeicher eines Proxys (kein Ausliefern fremder Antworten). |
