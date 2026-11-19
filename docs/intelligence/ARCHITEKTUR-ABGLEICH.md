# CENTRIC Intelligence – Architekturabgleich (WP-I10)

Stand: 2026-11-03 · Geprüfter Stand: `origin/integration/centric-complete` @ `5a263dd` · Art: **Doku und Entwurf, kein Produktcode, keine Tests ausgeführt außer der Statusprüfung.**
Paket: WP-I10 (Strang `intelligence`, Plan: [`../acc45/INTELLIGENCE-ENTWICKLUNGSPLAN.md`](../acc45/INTELLIGENCE-ENTWICKLUNGSPLAN.md) Abschnitt 5, Block P). Aufwand laut Plan 2–4 PT (Schätzung).
Quellen: [`CENTRIC-INTELLIGENCE.md`](CENTRIC-INTELLIGENCE.md) (Fassung 7, hat Vorrang), [`INTELLIGENCE.md`](INTELLIGENCE.md), `CENTRIC-Intelligence-Spezifikation-1-0.docx` (Teil B: Abschnitte 23–43, Text extrahiert und gelesen), [`../acc45/INTELLIGENCE-ABGLEICH.md`](../acc45/INTELLIGENCE-ABGLEICH.md), `docs/BETRIEBSHANDBUCH.md`, `deploy/*`, `server.mjs`, `server/lib/*`, `server/funktionen/*`, `werkzeug/ablage-sicherung.mjs`.

**Rahmen.** CENTRIC Intelligence ist technisch zur Umsetzung freigegeben (E-21i). Echte Modellaufrufe mit personenbezogenen Daten bleiben gesperrt, bis die Rechts- und Datenschutzfreigaben vorliegen (Plan Abschnitt 8). Dieses Dokument legt keine Anbieter-Zugangsdaten an und benötigt keine. Alle Rechts- und Vertragsfragen (DSGVO, AVV, DSFA, EU-KI-Verordnung, Mitbestimmung) stehen hier nur als **„zu prüfen“**; es werden keine Rechtsgrundlagen behauptet.
Kennzeichnung der Aussagen: **[Beleg]** = im Repo-Stand gelesen (Fundstelle genannt) · **[Entwurf]** = Vorschlag dieses Abgleichs, noch nicht beschlossen · **[zu messen]** = erst im Betrieb oder im Paket feststellbar.

## 0. Kernaussagen

1. **Der Stack der Spezifikation Teil B ist nicht der Stack der Produktion.** Teil B setzt Netlify Functions v2, `@netlify/blobs`, Hintergrund- und Zeitplanfunktionen sowie optional Redis voraus. Produktion ist **ein Node-Prozess in einem Docker-Container auf einem VPS hinter Caddy**, mit Dateiablage, Raumsperre und Prozesssperre; es gibt kein `netlify/`-Verzeichnis, kein Redis und keine Hintergrundfunktionen [Beleg: `server.mjs`, `server/lib/ablage.mjs`, `deploy/compose.yml`, `package.json` ohne Netlify-/Redis-Abhängigkeit]. Die **Konzepte** der Spezifikation (Gateway, Prüfer, Faktenpaket, Fingerprint, Limits, Zustandsautomaten) bleiben tragfähig; ihre **Hülle** (Funktionsaufteilung, Speicher, Zähler, Zeitpläne, interner Aufruf) wird ersetzt.
2. **Zwei Befunde mit Wirkung auf die Paketplanung**, die Plan und Spezifikation nicht kennen:
   - Das Docker-Bild enthält nur `server/`, `server.mjs` und `dist/`, **nicht `src/`** [Beleg: `Dockerfile` COPY-Zeilen]. Eine „Decision Engine in `src/engine/`, auch serverseitig verfügbar“ (Plan I12, Spezifikation 29) ist so nicht ausführbar. Das vorhandene Muster ist umgekehrt: gemeinsamer Code liegt in `server/lib/*.mjs`, `src/` importiert ihn (`src/regelbaukasten.js`, `src/regelregister.js`, `src/schutzkonflikte-hook.js`). **Entscheidung AD-06** folgt diesem Muster (Abschnitt 1.2).
   - `werkzeug/ablage-sicherung.mjs` bricht die Sicherung ab, wenn ein Store nicht in `STORES` eingeordnet ist [Beleg: Kopfkommentar, `STORES`]. Ein neuer Store für Intelligence ohne diese Einordnung würde **jede Sicherung stoppen**. Zusätzlich enthalten Ergebnis- und Auftragsdaten Alias-Karten (Personenbezug) und gehören nicht in die Sicherung. **Entscheidung AD-11.**
3. **Der Kern bleibt unabhängig.** Sämtlicher Intelligence-Code liegt in neuen Dateien; der Rechenkern importiert nie aus `server/lib/intelligence/`; ein KI-Ausfall ändert nichts an Planung, Prüfung, Ersatzliste (Abschnitt 2.3, 2.5).
4. **Direkt nach I10 startfähig sind I11 und I12** (parallel, getrennter Dateibesitz); I13 braucht beide (Abschnitt 3.1).

## 1. Teil 1 – Spezifikationsbaustein ↔ heutiger Stack

### 1.1 Der heutige Stack in Stichworten (Ist, mit Fundstelle)

| Thema | Ist-Stand | Fundstelle |
|---|---|---|
| Laufzeit | ein Node-22-Prozess; lädt alle Dateien in `server/funktionen/` und ruft sie unter dem `config.path` auf (Web-`Request` → `Response`); sonst statische Auslieferung | `server.mjs` (Kopf, `funktionenLaden`, `routeFuer`) |
| Funktionen heute | `anmeldung`, `daten`, `einrichten`, `kalender`, `lage`, `registrierung`, `starten`, `zustellung`; `/api/*` gehört `daten.mjs`; **genaue Pfade haben Vorrang vor Präfixen** | `server/funktionen/*`, `server.mjs` `routeFuer` |
| Zeitgrenzen | `requestTimeout` 60 s, `headersTimeout` 20 s; Caddy `response_header_timeout` 60 s; Rumpfgrenze 6 MB | `server.mjs`, `deploy/caddy/Caddyfile.vorlage` |
| Container | Speicher 512 MB, `read_only`, nur `/tmp` (tmpfs) und `/data` beschreibbar, Nutzer 1000, kein veröffentlichter Port, Bild nur per Digest | `deploy/compose.yml` |
| Ablage | Dateien unter `CENTRIC_DATEN` (`/data`), je Store ein Verzeichnis; API wie `@netlify/blobs` (`get`, `getWithMetadata`, `set`, `setJSON`, `delete`, `list`) plus `setJSONWennNeu`; Schreiben atomar (temporäre Datei, fsync, umbenennen); `etag` wird geliefert, **bedingtes Schreiben über etag gibt es nicht** | `server/lib/ablage.mjs` |
| Nebenläufigkeit | Raumsperre (ein Schreiber je Raum, Zeitgrenze, Wächter), Prozesssperre (ein Prozess je Ablage; zweiter Container startet nicht) | `server/lib/raumsperre.mjs`, `server/lib/prozesssperre.mjs` |
| Bestand | Lesen `bestandLesen`/`bestandLesenStreng(store, raum)`, Schreiben `bestandSchreiben` mit Standzeiger, Scherben und Journal | `server/lib/bestand.mjs` |
| Bremsen | `bremse(art, kennung, ziel)` mit Arten und `GRENZEN`; Stempel-Lastgrenzen (WP-47); `protokoll(...)` ins Betriebsprotokoll (Store `centric-spur`, 30 Tage) | `server/lib/schutz.mjs` |
| Rechte/Sichten | Rollen `betreiber`, `leitung`, `planer`, `subplaner`, `mitarbeiter`, `betriebsrat` (plus Sicht der Schichtverantwortung); serverseitige Matrix und **Positivlisten-Sichten** (WP-43, H8+) | `server/lib/rechte.mjs`, `server/lib/sicht.mjs`, `RECHTEMATRIX.md`, `docs/acc45/wp43-nachweis.md` |
| Regelregister/Schutzprüfung | eine Schutzprüfung auf dem Server, Regelregister mit Quelle, Fundstelle, Prüfstatus; Regelbaukasten (4 von 8 Regelarten) | `server/lib/schutzpruefung.mjs`, `fachpruefung.mjs`, `regelgeltung.mjs`, `regelbaukasten.mjs`, `src/regelregister.js` |
| Überwachung | `/gesund` mit Stufen ok/warnung/kritisch, Alarm über optionalen Webhook; Prüfungen Sperre, Ablage, Platz, Sicherung, Löschlauf, Fehlerzähler | `server/lib/gesund.mjs`, `docs/BETRIEB-UEBERWACHUNG.md` |
| Zeitläufe | kein Cron: täglicher Löschlauf per `setTimeout`/`setInterval` im selben Prozess, `unref()`, fängt Fehler ab | `server.mjs` (Löschlauf) |
| Konfiguration/Geheimnisse | `.env` auf dem VPS (Rechte 600) über `env_file`; Geheimnisse nie im Repo; `pruefung:doku` verlangt, dass **jede vom Server gelesene Umgebungsvariable** im Betriebshandbuch und in `.env.example` steht | `docs/BETRIEBSHANDBUCH.md` §2, §5, `pruefungen/doku.test.js` |
| Sicherung | `STORES` mit Klassen A (zwingend), B (sinnvoll), C (nicht gesichert); unbekannter Store bricht ab | `werkzeug/ablage-sicherung.mjs` |
| Löschfristen | Aufbewahrungs- und Datenschutzlauf (Plandaten 24 Monate, Stammdaten 6 Monate nach Austritt, Gründe 3 Monate), Löschlauf für Testbetriebe | `server/lib/aufbewahrung.mjs`, `datenschutzlauf.mjs`, `aufraeumen.mjs`, `raumloeschung.mjs` |
| Frontend | `src/App.jsx` (≈ 25.000 Zeilen), CSP `connect-src 'self'` (kein Anbieter im Browser) | `server.mjs` `SICHERHEIT` |

### 1.2 Entscheidungstabelle je Baustein

Entscheidung: **übernehmen** (Konzept und Vertrag unverändert), **anpassen** (Konzept bleibt, Umsetzung auf heutigen Stack), **ersetzen** (Spezifikationsmechanismus entfällt, anderer Mechanismus). Alle Entscheidungen sind **[Entwurf]**; verbindlich werden sie mit der Freigabe dieses Berichts durch den Integrationsagenten.

| Nr. | Baustein (Spezifikation) | Heutiger Stack | Entscheidung | Begründung (Kern) | Paket |
|---|---|---|---|---|---|
| AD-01 | **Gateway** (`ki.mjs`, `/ki/*`, Prüfreihenfolge 28.1, Zustandsautomat 28.2) | Route-Datei in `server/funktionen/` mit `config.path`; Pipeline als Modul | **anpassen** | Eine dünne Route `server/funktionen/ki.mjs` (Pfade `/ki` und `/ki/*`, nicht unter `/api/`, das `daten.mjs` gehört) ruft `server/lib/intelligence/gateway.mjs`. Prüfreihenfolge und Fehlercodes bleiben. Die Antwort bleibt **202 + Auftragskennung + Abfrage**, weil die globale Deadline 120 s über `requestTimeout` und Caddy-Grenze (je 60 s) liegt. Die separate Hintergrundfunktion samt internem HMAC-Aufruf (`KI_INTERN_SCHLUESSEL`) **entfällt**: Der Lauf startet im selben Prozess; es gibt keinen internen HTTP-Aufruf, der zu sichern wäre. | I13 |
| AD-02 | **Router** (Funktion → Startstufe, nur nach oben, Model Registry) | reine Konfiguration + Funktion | **übernehmen** | Reine, deterministische Tabelle in `router.mjs`/`modelle.mjs`; keine Plattformabhängigkeit. Stufenwechsel werden im Verzeichnis der Modelle (CI 8.3) protokolliert. Modellkennungen und Parameter stehen in Konfiguration, nicht im Code (Spez. K-02…K-04). | I13 |
| AD-03 | **Prüfer** (P-01…P-10, Sperrliste, zweistufig) | reine Funktionen | **übernehmen** | Keine Netz-, Speicher- oder Plattformabhängigkeit; vollständig mit der Attrappe testbar. Die Regeln (Zahlen, Zeiten, Kennungen, Reihenfolge, Rechtsangaben, Sperrwörter, Zustände) und Extraktions-Muster der Spezifikation 32.3/32.4 gelten als Ausgangsstand, **sind aber im Paket gegen reale Texte zu testen**. | I13 |
| AD-04 | **Faktenpaket und Alias** (Positivliste, Pseudonymisierung, Leck-Prüfung, Kapselung von Fremdtext) | Sichten `bestandSicht` und Positivlisten in `sicht.mjs`; Bestandslesen `bestandLesenStreng` | **anpassen** | Die Spezifikation baut auf `bestandFuerRolle`/`eigenerMandant`. Heute gibt es die Positivlisten-Sichten je Rolle (WP-43, H8+). Das Faktenpaket entsteht aus der **Sicht der auslösenden Rolle** (nie Rohbestand, nie mehr als die Rolle sehen darf) **und** einer zusätzlichen Positivliste je Funktion; es gilt der **Schnitt** beider, nie die Vereinigung. Alias deterministisch, Alias-Karte nur im Server-Auftrag, **Leck-Prüfung schlägt fail closed zu** (Auftrag wird nicht gesendet). Fremdtext (Freitext, Dateiinhalt) nur in gekapselter Form mit zufälligem Trenner je Auftrag. | I11 |
| AD-05 | **Decision Engine** (Verträge 29, Near-Miss, Faktenberechnung) | Rechenfunktionen stecken in `App.jsx`; teils bereits gemeinsame Server-/Client-Dateien | **anpassen** | Siehe AD-06 zum Ort. Verhaltensgleiche Extraktion, **zuerst Messung der Abhängigkeitsschließung** (Spez. S-07, Werkzeug `werkzeug/engine-schliessung.mjs` ist im Repo nicht vorhanden und wird zum ersten Teilschritt von I12), dann Schnitt in Teilpakete von höchstens etwa 15 Funktionen, falls die Schließung groß ist. | I12 |
| AD-06 | **Ort der Engine** (Spez.: `src/engine/*`, „auch serverseitig verfügbar“) | Bild enthält `server/`, nicht `src/`; Muster: gemeinsamer Code in `server/lib/*.mjs`, Client importiert von dort | **ersetzen (Ort)** | **Engine liegt in `server/lib/engine/*.mjs`** (reines ESM, keine Node- und keine DOM-Abhängigkeit); `src/engine/index.js` ist ein dünner Re-Export für den Client (Muster `src/regelbaukasten.js`). Damit bleibt das Docker-Bild unverändert (Dateibesitz WP-03/B), und „server- und clientseitig gleich“ ist dieselbe Datei. `ENGINE_VERSION` bleibt Pflicht. | I12 |
| AD-07 | **Fingerprint, Ergebnis-Speicher, Decision Context** (Spez. 27, 32.2) | Dateiablage mit atomarem Schreiben; kein bedingtes Schreiben | **anpassen** | Fingerprint (sha256 über kanonisches JSON mit Fakten, Versionen) und Gültigkeitsregeln **unverändert**. Speicherung als eigene Schlüssel je Raum (`ki:erg:<raum>:<fingerprint>`, `ki:ktx:<raum>:<ctxId>`) im Lauf-Store (AD-11). Treffer nur bei identischem Fingerprint und nie über Betriebsgrenzen (Raum steckt im Schlüssel **und** im Fingerprint-Material). Kontexte enthalten nur Zahlen, Regelkennungen, Alias-Referenzen und Versionen, keine Entwurfstexte und keine Klarnamen. | I14 |
| AD-08 | **Kostenschutz, Limits, Deadline, degradierter Modus** (fünf Ebenen, Zähler, Zustandsautomat Kontingentstufe) | `bremse()` und `GRENZEN` in `schutz.mjs`; kein Redis, kein bedingtes Schreiben | **anpassen** | Ebenen und Stufen bleiben. **Zähler ohne Redis und ohne ETag:** je Buchung ein append-only Ereignisschlüssel (konfliktfrei) plus Rollup, der **unter einer Mutex im Prozess** aktualisiert wird; das ist zulässig, weil die Prozesssperre garantiert, dass nur ein Prozess auf der Ablage schreibt. Rollup kann aus den Ereignissen neu gerechnet werden. Bei nicht lesbarem Zähler: Klasse A „erlauben + protokollieren“, B/C/D „Rückfall“ (Spez. R-05). Die Bremsart `ki` je Person kommt als **kleine, getrennte Ergänzung** in `GRENZEN` (Konfliktzone `schutz.mjs`). Alarme gehen über die vorhandene Überwachung (`gesund.mjs`, Webhook), nicht über E-Mail-Neubau. | I15 |
| AD-09 | **Warteschlange und Batch** (Zeitpläne, Anbieter-Batch, Wiederaufnahme) | kein Cron, kein zweiter Prozess; `setInterval` im Server | **ersetzen** | Keine Zeitplan- und Hintergrundfunktionen. Nächtliche Läufe (F4, F11, F12, F15) laufen als **prozessinterner Zeitgeber** nach dem Muster des Löschlaufs, mit Vermerk „letzter Lauf“ und Nachholen nach Neustart. Aufträge werden vor dem Start **im Lauf-Store journalisiert**: Nach einem Neustart (SIGTERM-Frist 8 s) werden `wartet`/`läuft` älter als die Deadline auf `rueckfall` gesetzt, nie still verworfen. Rechenlastige Läufe (F8, F10, F14) gehören **nicht auf den Event-Loop**, sondern in einen `worker_threads`-Worker [Entwurf; Lastmessung in I13/I29]; Kern und Stempeln dürfen nicht stocken. Anbieter-Batch erst mit I29. | I13, I29 |
| AD-10 | **Notschalter und Betriebsrat-Pausierung** (28.1, 39.2; CI 8.2) | Betreiberkonsole, Rechte-Matrix, Überwachung | **anpassen** | Zwei Ebenen: (a) **Prozessschalter** `CENTRIC_KI_MODUS` (aus / attrappe / live), Vorgabe **aus**; Wirkung nach Neustart, sicherer Endzustand, unabhängig vom Store; (b) **Laufzeitschalter** im Steuer-Store (`ki:global`: global, je Funktion, je Betrieb, Opus-Stufe) mit kurzem Cache (höchstens 30 s, Ziel: Wirkung innerhalb einer Minute, Spez. SR-12). Beide **fail closed**: ist der Schalter nicht lesbar, wird nicht aufgerufen. Betriebsrat-Frage bei Einrichtung → `pausiert`, serverseitig erzwungen, bis die Leitung bestätigt; jede Änderung mit Zeit, Rolle, Person im Betriebsprotokoll. Rechte dafür in `rechte.mjs` und `RECHTEMATRIX.md` (Konfliktzone). | I16 |
| AD-11 | **Ablage der KI-Ergebnisse und Audit** (Store `centric-ki`, Aufbewahrung je Schlüssel) | `getStore({ name })`; Sicherung klassiert Stores | **anpassen** | **Zwei Stores statt einem:** `centric-ki` (Steuerung und Abrechnungsnachweise: Schalter, Einstellungen, Rollups, Käufe; dauerhaft, **Sicherungsklasse B**) und `centric-ki-lauf` (Aufträge, Alias-Karten, gespeicherte Ergebnisse, Kontexte, Zeiger, später Dokumente; **Sicherungsklasse C, nicht gesichert**, Personenbezug durch Alias-Karten, nach Wiederherstellung rekonstruierbar bzw. ohne Verlust verwerfbar). Beide Stores **müssen in `STORES` eingeordnet werden**, sonst bricht die Sicherung ab. Audit-Ereignisse (Funktion, Stufe, Prüfstatus, Kennungen, **keine Inhalte**) zusätzlich ins Betriebsprotokoll (`protokoll()`). Raumlöschung und Datenschutzlauf löschen/bereinigen die `ki:*`-Schlüssel des Raums. | I14, I13 |
| AD-12 | **Mandantentrennung** | Raum in jedem Schlüssel; Sitzung liefert Raum und Rolle | **übernehmen** | Mandant, Betrieb, Rolle stammen **immer aus der Sitzung, nie aus dem Rumpf** (Spez. SR-02). Fremde Auftrags-/Kontext-Kennung liefert `KI_NICHT_GEFUNDEN`, nicht „verboten“. Fingerprint enthält den Raum. Test: Zwei Räume, gleiche Fakten, kein Treffer über Raumgrenzen. | I13, I14 |
| AD-13 | **Schlüsselverwaltung** (Anbieter-Schlüssel) | `.env` Modus 600 auf dem VPS, `env_file`; Geheimnisse nie im Repo; Sicherung erfasst nur `/data` | **übernehmen** (mit Verschärfung) | Der Anbieter-Schlüssel steht **nur in der Betreiber-Umgebung (`.env`)**, nie im Repo, nie im Bestand, nie in `/data`, nie im Bild, nie im Log, nie in einer Antwort. Er wird **nur von `anbieter.mjs` gelesen**; Test: kein anderes Modul liest die Variable (statischer Test) und nirgends erscheint sie in Ausgaben. Der Live-Zweig des Anbieters wird **erst in I18** gebaut und lässt sich nur laden, wenn Modus `live`, Schlüssel und Freigabeschalter gesetzt sind. Für I10–I17 wird **kein Schlüssel angelegt oder verwendet**. Neue Variablen sind in `.env.example` (auskommentiert, ohne Wert) und im Betriebshandbuch zu beschreiben, sonst schlägt `pruefung:doku` an. | I13, I18 |
| AD-14 | **Datenhaltung und Löschfristen** (E-16, Fassung 7) | Aufbewahrungs-/Datenschutzlauf, `aufraeumen`-Muster | **anpassen** | Fristen der Spezifikation/CI gelten als **Entwurfswerte** und sind beim Betreiber und beim Datenschutzbeauftragten zu bestätigen (zu prüfen): Aufträge 24 h, Ergebnisse höchstens 30 Tage, Kontexte 90 Tage, Rollups 24 Monate, F7B-Originale nach E-16 (sofort nach Übernahme, höchstens 7 Tage bei offenem Import, 24 h für Audit-Stichprobe). Löschen **technisch erzwungen** durch einen Löschlauf im selben Muster wie `aufraeumen.mjs` (läuft nach Neustart sofort nach, Vermerk „letzter Lauf“, `/gesund` warnt bei Ausbleiben). Alle Fristen konfigurierbar, nicht im Code verstreut. | I14, I27 |
| AD-15 | **Kennzeichnung KI-Inhalte** | Oberfläche; Antwortformat | **übernehmen** | Jede Ausgabe trägt serverseitig ein Pflichtfeld `kennzeichnung` (KI-gestützt, Stufe/Verzeichnis-ID, geprüft ja/nein, `entwurf: true`); die Oberfläche kann es nicht weglassen, ohne dass der Test (jede KI-Ausgabe gekennzeichnet) rot wird. Kennzeichnung auch im Protokoll „vorgeschlagen von CENTRIC, übernommen von …“. | I13, I16, I17 |
| AD-16 | **Transparenzansicht, Erklärblatt, Verzeichnis der Modelle, Betriebsrat-Einsicht** | Ansichten in `App.jsx`; Betriebsrat-Sicht nur lesend, Mindestgruppe 3 für Auswertungen | **anpassen** | Daten kommen aus dem Steuer-Store und dem Verzeichnis der Modelle (Stufenwechsel, Versionen, Datum); Ansicht erst in I16 (Einstellungen) und I36 (Governance). Betriebsrat sieht **nur Zahlen und Texte ohne Personenbezug**, nach der bestehenden Sicht-Logik (`sicht.mjs`, Mindestgruppe `BR_MINDESTGRUPPE`). | I16, I36 |
| AD-17 | **Rechte und Sichten** (Funktion × Rolle × Plan × Bereich × Schalter × SUB-Fenster) | serverseitige Matrix `rechte.mjs`, Sichten `sicht.mjs` | **anpassen** | Eigene Prüfung in `server/lib/intelligence/rechte.mjs` **zusätzlich** zur bestehenden Matrix (Default: verweigern). Neue Rechte in `RECHTEMATRIX.md`. Siehe Abschnitt 3. | I13, I16 |
| AD-18 | **Regelregister und Schutzprüfung als Gegenrechnung** | `schutzpruefung.mjs`, `fachpruefung.mjs`, `regelregister.js`; Horizont 120 Tage | **übernehmen** | Jeder Vorschlag (Ersatz, Tausch, Planänderung) wird vor der Anzeige **von der bestehenden Schutzprüfung gegengerechnet**; Regelkennungen in Erklärungen stammen aus dem Regelregister und dem Faktenpaket, nie vom Modell. `provisional`-Regeln werden nie als geltendes Recht erklärt. | I12, I20, I22 |
| AD-19 | **Überwachung und Betrieb** (39: Kennzahlen, Alarme, Runbooks) | `gesund.mjs`, Webhook, `BETRIEB-UEBERWACHUNG.md`, `INCIDENT-RUNBOOK.md` | **anpassen** | Kennzahlen als zusätzliche Prüfungen in `gesund.mjs` (nur Stufen nach außen, keine Zahlen/Raumnamen); Alarmkanal ist der vorhandene Webhook. **Ein Intelligence-Fehler darf `/gesund` nie auf „kritisch“ setzen**: Der Dienst ist ohne Intelligence gesund (sonst startet Docker neu oder R0 im Deploy). Runbooks (Notschalter, Anbieterausfall, Kostenalarm, Verdacht auf Datenvorfall) in das Betriebshandbuch. | I15, I37 |
| AD-20 | **Konfiguration** (Spez. 37, K-nn) | Umgebungsvariablen + `.env.example` + Betriebshandbuch | **anpassen** | Betriebs-Umgebungsvariablen nur wenige (`CENTRIC_KI_MODUS` und der Schlüssel); die Fachparameter (K-nn: Fristen, Limits, Schwellen, Modellkennungen) in **versionierter Konfigurationsdatei im Repo** (`server/lib/intelligence/konfig.mjs`, Standardwerte), überschreibbar nur im Steuer-Store. Namenskonflikt: In der Spezifikation heißen die Konfigurationsparameter **K-01…K-nn**; die Architekturentscheidungen dieses Berichts heißen deshalb **AD-nn** (Plan I10 nannte „K-01…“). | I13 |
| AD-21 | **Anbieter-Anbindung und Attrappe** (`anbieter.mjs`) | Netzzugriff ausgehend: im Repo nirgends für einen Modellanbieter vorgesehen | **anpassen** | Schnittstelle `anbieter.mjs` mit **Attrappe** (Modi ok, Fehler, Zeitüberschreitung, falsche Zahl, falsche Kennung, Klarname) als einzige Implementierung bis I18. **Kein anderes Modul ruft `fetch`/HTTP für Intelligence auf** (statischer Test). Demo-Räume und Testbetriebe: Attrappe erzwungen. Ausgehender Netzzugriff des Containers zum Anbieter ist **nicht geprüft** und eine Voraussetzung für I18 (Abschnitt 3.3, B-3). | I13, I18 |
| AD-22 | **Frontend-Anbindung** | `App.jsx` + CSP `connect-src 'self'` | **anpassen** | Client spricht nur `/ki/*` desselben Ursprungs; **kein Anbieter und keine Anbieteradresse im Browser** (Test im Muster `gestalt.test`). Neue Dateien unter `src/ki/*`, höchstens kleine Einhängepunkte in `App.jsx` (Abschnitt 2.7). | I17 |

### 1.3 Spezifikations-Prüfaufträge S-01…S-07 neu gefasst

Die sieben Prüfaufträge der Spezifikation (Abschnitt 42) stammen aus einer Netlify-Annahme. Hier die Fassung für den heutigen Stack mit Ergebnis aus dem Repo und Rückfalllösung.

| Nr. | Frage heute | Ergebnis aus dem Repo-Stand | Rückfall / was bleibt zu tun |
|---|---|---|---|
| S-01 | Welche Laufzeit-, Hintergrund-, Zeitplan- und Streaming-Möglichkeiten hat der **eigene Node-Server**? | **Beantwortet [Beleg]:** keine Hintergrund- oder Zeitplanfunktionen im Produkt; Zeitläufe nur als prozessinterne Zeitgeber (Löschlauf); `requestTimeout` 60 s und Caddy 60 s. Langes Warten über eine einzige Anfrage ist **nicht** möglich. | **Entscheidung AD-01/AD-09:** 202 + Abfrage, prozessinterner Lauf, Journal im Lauf-Store, Worker für Rechenläufe. **Zu messen [zu messen]:** Ereignisschleifen-Last durch parallele Läufe unter 512 MB (Lasttest in I13/I15). |
| S-02 | Parameter der Modellkennungen (erzwungenes Werkzeug, Temperatur, Cache, Batch, Dokumenteingabe), Verarbeitungsort, Aufbewahrung | **Nicht aus dem Repo beantwortbar** (Anbieterauskunft). | Bleibt **I18**, extern. Rückfall wie Spezifikation: JSON-Antwort mit Validierung (P-01) und Wiederholversuch; Parameter nur in Konfiguration. |
| S-03 | Bedingtes Schreiben (ETag) der Ablage? | **Beantwortet [Beleg]:** nein; es gibt nur atomares Ersetzen und `setJSONWennNeu`. Parallele Schreiber desselben Schlüssels sind innerhalb des Prozesses über Mutex/Raumsperre geordnet; ein zweiter Prozess ist durch die Prozesssperre ausgeschlossen. | **AD-08:** append-only Ereignisse + Rollup unter Prozess-Mutex; Rollup neu rechnen bei Verdacht. Kein Redis nötig. |
| S-04 | Passt eine Excel-Bibliothek in CSP und Bundle? | **Offen**; `package.json` enthält keine Excel-Bibliothek [Beleg]. | Bleibt **I19**: Prüfung Größe/Lizenz/Browser-Build; Rückfall CSV-Export mit Hinweistext. |
| S-05 | Ist Redis verfügbar? | **Beantwortet [Beleg]:** nein, weder im Compose noch in den Abhängigkeiten. | Zähler über Dateiablage (AD-08). Redis wird **nicht** eingeführt. |
| S-06 | Maximale Upload-Größe an die Funktion? | **Teilweise [Beleg]:** Rumpfgrenze 6 MB im Server (`RUMPF_MAX`), kein Upload-Code; Container ist `read_only` (nur `/tmp` und `/data` beschreibbar), Speicher 512 MB. | Bleibt **I27** (F7B): eigene Strecke mit eigener, kleinerer Grenze, Quarantäne in `/data` (nicht in `/tmp`, wegen Speicher); Sicherungsklasse C; Größenlimit bei Entwurf der Strecke festlegen. |
| S-07 | Größe der Abhängigkeitsschließung der Engine-Funktionen in `App.jsx`? | **Offen [zu messen]**; `werkzeug/engine-schliessung.mjs` existiert nicht. | **Erster Teilschritt von I12** (Messen, dann Schnitt in Teilpakete ≤ 15 Funktionen; Reihenfolge nach Phase). |

## 2. Teil 2 – Schnittstellen-Skizze

### 2.1 Modulgrenzen

Nur **neue Dateien**; keine Abhängigkeit von `src/App.jsx`; kein Import aus `server/lib/intelligence/` in den Rechenkern.

```text
server/lib/engine/                 Rechenkern (KEIN Modell, KEIN Netz) – WP-I12
  index.mjs, kern-*.mjs            verhaltensgleich aus App.jsx; ENGINE_VERSION
  vertrag.mjs                      Fassade: personTag, besetzung, pruefen, ersatzKandidaten, nearMiss, …
src/engine/index.js                Re-Export für den Client (dünn)

server/lib/intelligence/           Modellintegration – WP-I11, I13–I16
  konfig.mjs                       Standardwerte (K-nn), Versionen
  sitzung.mjs                      Rolle/Raum/Betrieb/Person aus der Sitzung (nie aus dem Rumpf)
  rechte.mjs                       Funktion × Rolle × Plan × Bereich × Schalter × SUB-Fenster (Default: verweigern)
  faktenpaket.mjs                  Positivliste je Funktion ∩ Sicht der Rolle        (I11)
  alias.mjs                        Alias-Vergabe, Rücktausch, Leck-Prüfung           (I11)
  kapsel.mjs                       Fremdtext-Kapselung (Prompt-Injection)             (I11)
  schemas.mjs                      Ausgabe-/Eingabeschemata, kleiner Validator
  pruefer.mjs                      P-01…P-10, Sperrliste, Satzbausteine
  router.mjs, modelle.mjs          Funktion → Startstufe, Verzeichnis der Modelle
  anbieter.mjs                     Schnittstelle + Attrappe; Live-Zweig erst I18
  gateway.mjs                      Pipeline 28.1, Zustandsautomat 28.2, Deadline
  speicher.mjs                     Zugriff auf centric-ki / centric-ki-lauf, Schlüsselbildung
  ergebnis.mjs                     Fingerprint, Ergebnis-Speicher, Kontext (I14)
  limits.mjs, zaehler.mjs          fünf Ebenen, Rollup, Deadline-Verwaltung (I15)
  schalter.mjs                     Notschalter, Funktionsschalter, Pausierung (I16)
  loeschlauf.mjs                   Fristen (I14)
  prompts/*.mjs                    versionierte Anweisungen je Funktion (ab I18/I20)
server/funktionen/ki.mjs           dünne Route /ki, /ki/* (I13)
src/ki/*                           Client: Aufruf, Hooks, Texte, Komponente „KI-Entwurf“ (I17)
pruefungen/ki-*.test.js            Tests (Attrappe, Property-Tests, Angriffstests)
```

**Importregeln (testbar):** (1) `server/lib/engine/**` importiert nichts aus `intelligence/`; (2) nur `anbieter.mjs` greift auf Netzwerk und auf den Schlüssel zu; (3) nur `speicher.mjs` greift auf die KI-Stores zu; (4) `intelligence/**` schreibt **nie** in den Bestand der Kernanwendung, sondern nur in die eigenen Stores; (5) kein Modul importiert `src/App.jsx`. Eine Prüfung über den Importgraph (reine Textprüfung) macht diese Regeln zur CI-Pflicht.

### 2.2 Datenverträge (Entwurf, JSON Schema 2020-12, gekürzt)

Alle Objekte: `additionalProperties: false`. Versionsfelder sind Pflicht, damit der Fingerprint jede Änderung erkennt. Die Schemata sind **Entwurf v0.1** und werden in I11/I13 mit realen Funktionen geprüft und versioniert.

**Faktenpaket** (Kern → Modell-Eingabe; bereits pseudonymisiert; enthält weder Raum noch Klarname noch Alias-Karte):

```json
{
  "$id": "faktenpaket-0.1",
  "type": "object",
  "required": ["schemaVersion", "funktion", "versionen", "zeitraum", "fakten"],
  "additionalProperties": false,
  "properties": {
    "schemaVersion": { "const": "0.1" },
    "funktion": { "enum": ["F1","F2","F3","F4","F5","F6","F7A","F8","F9","F10","F11","F12","F14","F15","F16","F17"] },
    "versionen": {
      "type": "object",
      "required": ["engine", "regelstand", "tarifstand"],
      "additionalProperties": false,
      "properties": {
        "engine": { "type": "string" }, "regelstand": { "type": "string" }, "tarifstand": { "type": "string" }
      }
    },
    "zeitraum": {
      "type": "object", "required": ["von", "bis"], "additionalProperties": false,
      "properties": { "von": { "type": "string", "format": "date" }, "bis": { "type": "string", "format": "date" } }
    },
    "fakten": {
      "type": "array", "maxItems": 500,
      "items": {
        "type": "object", "required": ["id", "art", "wert"], "additionalProperties": false,
        "properties": {
          "id": { "type": "string", "pattern": "^[a-z0-9_.:-]{1,64}$" },
          "art": { "enum": ["zahl", "zeit", "datum", "zustand", "kennung", "satzbaustein"] },
          "wert": { "type": ["number", "string", "boolean"] },
          "einheit": { "enum": ["min", "h", "tage", "personen", "prozent", "anzahl"] },
          "alias": { "type": "string", "pattern": "^P[0-9]{1,4}$" },
          "regel": {
            "type": "object", "required": ["regelId", "pruefstatus"], "additionalProperties": false,
            "properties": {
              "regelId": { "type": "string" }, "fundstelle": { "type": "string" },
              "pruefstatus": { "enum": ["geprueft", "provisional", "hinweis"] }
            }
          }
        }
      }
    },
    "fremdtext": {
      "type": "array", "maxItems": 20,
      "items": {
        "type": "object", "required": ["kapselId", "text"], "additionalProperties": false,
        "properties": { "kapselId": { "type": "string" }, "text": { "type": "string", "maxLength": 4000 } }
      }
    }
  }
}
```

**Anfrage** (Client → Gateway; kein Raum, keine Rolle, kein Betrieb, kein Faktenpaket vom Client):

```json
{
  "$id": "anfrage-0.1",
  "type": "object",
  "required": ["funktion", "eingabe"],
  "additionalProperties": false,
  "properties": {
    "funktion": { "type": "string" },
    "eingabe": { "type": "object", "description": "je Funktion eigenes Eingabeschema; unbekannte Felder verboten" },
    "bezug": {
      "type": "object", "additionalProperties": false,
      "properties": { "datum": { "type": "string", "format": "date" }, "personId": { "type": "string" }, "schichtId": { "type": "string" } }
    },
    "sprache": { "enum": ["de"], "default": "de" },
    "idempotenz": { "type": "string", "maxLength": 64 }
  }
}
```
`bezug.personId` ist nur ein **Verweis**; der Server prüft ihn gegen Bereich und Sicht der Sitzung und ersetzt ihn durch einen Alias.

**Antwort** (Gateway → Client; Rücktausch der Aliase erst im Server nach bestandenem Prüfer):

```json
{
  "$id": "antwort-0.1",
  "type": "object",
  "required": ["status", "auftragId", "kennzeichnung"],
  "additionalProperties": false,
  "properties": {
    "status": { "enum": ["wartet", "laeuft", "fertig", "rueckfall", "fehler"] },
    "auftragId": { "type": "string" },
    "ctxId": { "type": "string" },
    "ergebnis": { "type": "object", "description": "je Funktion; Texte als Satzbausteine + Parameter oder geprüfter Text; Personen als {{person:<id>}}" },
    "kennzeichnung": {
      "type": "object", "required": ["kiGestuetzt", "entwurf", "geprueft"], "additionalProperties": false,
      "properties": {
        "kiGestuetzt": { "const": true },
        "entwurf": { "const": true },
        "veroeffentlicht": { "const": false },
        "geprueft": { "type": "boolean" },
        "verzeichnisId": { "type": "string" }
      }
    },
    "rueckfall": {
      "type": "object", "required": ["code"], "additionalProperties": false,
      "properties": { "code": { "type": "string", "pattern": "^KI_[A-Z_]+$" }, "text": { "type": "string" } }
    }
  }
}
```
Die Antwort enthält **kein** Feld, mit dem ein Plan veröffentlicht oder geschrieben wird. Eine Übernahme ist eine **getrennte, normale Aktion des Menschen** über den vorhandenen Rechte- und Auditpfad mit erneuter Schutzprüfung.

**Prüfergebnis** (Prüfer → Gateway/Kontext; enthält Kennungen und Zahlen, keine Texte):

```json
{
  "$id": "pruefergebnis-0.1",
  "type": "object",
  "required": ["version", "ergebnis", "versuche", "regeln"],
  "additionalProperties": false,
  "properties": {
    "version": { "const": "0.1" },
    "ergebnis": { "enum": ["bestanden", "wiederholen", "rueckfall"] },
    "versuche": { "type": "integer", "minimum": 1, "maximum": 2 },
    "regeln": {
      "type": "array",
      "items": {
        "type": "object", "required": ["code", "ok"], "additionalProperties": false,
        "properties": {
          "code": { "enum": ["P-01","P-02","P-03","P-04","P-05","P-06","P-07","P-08","P-09","P-10"] },
          "ok": { "type": "boolean" },
          "verstoesse": { "type": "array", "items": { "type": "string", "maxLength": 80 } }
        }
      }
    },
    "gegenrechnung": {
      "type": "object", "additionalProperties": false,
      "properties": { "geprueft": { "type": "integer" }, "abweichungen": { "type": "integer" } }
    }
  }
}
```
Verstoßtexte nennen **Kennungen, nie Werte aus Personendaten**; Wiederholhinweise an das Modell enthalten keinen Personenbezug (Spez. 28.2).

**Fehlercodes** (Gateway-Pipeline, übernommen und ergänzt): `KI_NICHT_ANGEMELDET`, `KI_ROLLE`, `KI_FENSTER`, `KI_NOTSCHALTER`, `KI_AUS`, `KI_PAUSIERT` (Betriebsrat-Pausierung, **neu**), `KI_PLAN`, `KI_BREMSE`, `KI_EINGABE`, `KI_PAUSE` (Kontingent), `KI_PRUEFER`, `KI_ANBIETER`, `KI_ZEIT`, `KI_NICHT_GEFUNDEN`. Alle Antworten `cache-control: no-store`, keine Cookies, Fehler als `{ "fehler": "Text", "code": "KI_…" }`.

### 2.3 Fehler- und Ausfallverhalten (Abnahmepflicht)

| Lage | Verhalten | Kern |
|---|---|---|
| Modus `aus`, Notschalter, Pausierung, Deckel erreicht, Anbieter nicht erreichbar, Zeitüberschreitung, Prüfer scheitert zweimal | `rueckfall` mit Code und Hinweistext („Zusätzliche Intelligence-Vorschläge sind gerade nicht verfügbar.“); Fakten ohne KI-Text; keine Abbuchung | **Planung, Prüfung, Ersatzliste, Stempeln unverändert** |
| Steuer-Store oder Zähler nicht lesbar | Klasse A: erlauben + protokollieren; B/C/D: Rückfall; Notschalter-Zustand nicht lesbar: **kein Aufruf** (fail closed) | unverändert |
| Prozess-Neustart während eines Laufs | Aufträge `wartet`/`läuft` älter als Deadline → `rueckfall` (kein stilles Verwerfen); Löschlauf holt nach | unverändert |
| Fehler im Intelligence-Modul (Ausnahme) | wird **an der Route abgefangen**, antwortet `rueckfall`; wirft nie in den Server-Prozess; `/gesund` bleibt unbeeinflusst (AD-19) | unverändert |
| Deadline (120 s) überschritten | Abfrage-Endpunkt setzt `fehler`/Rückfall; kein verspätetes Ergebnis wird angezeigt | unverändert |

Abnahmetest (I13/I15): Server mit Attrappe in jedem Fehlermodus gegen die **vorhandenen** Kern-Prüfungen (`pruefung:serverlauf`-Muster); Kernantworten byteweise gleich mit und ohne Intelligence.

### 2.4 Rechte- und Sichtmodell (Entwurf)

Grundsatz: **Default verweigern.** Eine Funktion läuft nur, wenn Rolle, Plan, Betriebsschalter, Bereich, Notschalter, Pausierung und (SUB-Planer) Zeitfenster **alle** erlauben. Die Prüfung liegt auf dem Server (`intelligence/rechte.mjs`) und ergänzt die bestehende Matrix; die Oberfläche darf weniger zeigen, nie mehr.

| Rolle | Auslösen von Funktionen | Anmerkung |
|---|---|---|
| Leitung | laut Spezifikation 7.0 | Betriebsschalter, Einsicht in Verbrauch (nie je Person) |
| Planer | laut 7.0, nur eigener Bereich | |
| SUB-Planer | F1–F3 nur im Zeitfenster eigener Dienst | Fensterformel Spezifikation 25.5 (Vorlauf/Nachlauf/Folgefenster sind Konfigurationswerte K-26…K-28) |
| Schichtverantwortung | **offen, Default nein** | Die Spezifikation kennt diese Sicht nicht; sie sieht seit H8+ nur eigene Stempel und Bereichszeiten ohne Grund. Entscheidung des Betreibers (Abschnitt 3.3, B-5) |
| Mitarbeiter | höchstens Hilfe-Assistent (F9, ohne Betriebsdaten) | in I16 gegen Spezifikation 7.0 zu bestätigen |
| Betriebsrat/Personalrat/MAV | **nie auslösen**; nur lesende Einsicht (Verzeichnis, Zahlen ohne Personen, Protokoll des Betriebs) | passt zur bestehenden Rolle (nur lesend, `rechte.mjs`) |
| Betreiber | **kein Zugriff auf Inhalte**; nur Schalter, Lage ohne Inhalte, Alarme | Notschalter in der Betreiberkonsole mit bestehender Anmeldehärtung (Zwei-Faktor) |

**Positivliste für Faktenpakete** (je Funktion in I11 auszuformulieren; hier die verbindlichen Grenzen):

| Erlaubt (Auszug) | Nie in ein Faktenpaket |
|---|---|
| Dienstarten, Zeiten, Schichtmuster, Zählwerte, Regelbefunde mit Regelkennung/Quelle/Fundstelle/Prüfstatus, Near-Miss-Optionen, Qualifikation **für die konkrete Schicht**, Alias statt Person, „abwesend“ ohne Art | **Klarnamen** (Vor-/Nachname, Kürzel, Personalnummer), E-Mail, Telefon, Adressen, Geburtsdaten, **Abwesenheitsgründe und alle Gesundheitsangaben** (Krankheit, Diagnose, Arztbesuch, Mutterschutz, Schwerbehinderung), Schutzmerkmale, Notizen und Freitexte aus Personenakten, Push-/Kalender-/Zugangsdaten, Verhaltens- oder Fehlzeitenprofile, Lohn- und Vertragsdaten über die für die Regel nötige Stundenzahl hinaus |
| gekapselter Fremdtext (Dateiinhalt) nur bei F7A/F7B unter den Bedingungen aus CI 8.1 | Beschäftigtendaten außerhalb des Bereichs und der Sicht der auslösenden Rolle |

Beweis: Property-Test über **alle** Paketarten (I11): kein Feld außerhalb der Positivliste, kein Klarname des Betriebs, kein Gesundheitsbegriff (inklusive Sperrliste aus Spez. 32.4 und Angriffs-Testsatz) in irgendeinem Faktenpaket, auch nicht nach Alias-Rücktausch-Fehlern.

### 2.5 Trennung Rechenkern ↔ Modellintegration

1. **Der Kern berechnet.** Regeln, Zahlen, Kandidaten, Near-Miss-Optionen, Lösungswege (einzeln durchgerechnet), Konflikte, Kennzahlen: nur `server/lib/engine/**` und die bestehenden Prüfmodule.
2. **Modelle lesen, strukturieren, erklären, schlagen vor.** Ein Modell sieht ausschließlich das Faktenpaket; eine höhere Stufe sieht nicht mehr Daten als eine niedrigere.
3. **Jede kritische Zahl** (Stunden, Zeiten, Anzahlen, Daten, Regelkennungen, Paragrafen) stammt aus dem Faktenpaket oder einer deterministischen Gegenrechnung; der Prüfer verwirft jede fremde Zahl oder Kennung (P-02…P-07).
4. **Kein Modell veröffentlicht einen Plan.** Es gibt keinen Schreibpfad aus `intelligence/` in den Plan oder Bestand; Antworten tragen `entwurf: true`, `veröffentlicht: false`. Übernahme = normale Aktion eines berechtigten Menschen, mit **erneuter** Schutzprüfung und Bestätigungsprotokoll („vorgeschlagen von CENTRIC, übernommen von …“).
5. **Menschen bestätigen**; Rechtswidriges wird durch eine Bestätigung nicht rechtmäßig (Sperrlogik des Servers bleibt maßgeblich, Entscheidung „warnen oder sperren“ liegt bei WP-I1/ACC45-Fragen 4/6/7).
6. **Eine Richtung:** Der Kern kennt Intelligence nicht. Test: Server startet und besteht die Kernprüfungen mit gelöschtem Verzeichnis `server/lib/intelligence/` (nur Route entfernt).

### 2.6 Attrappen-Strategie

- **Attrappe als einziger Anbieter bis I18.** Deterministisch aus dem Faktenpaket (festes Satzmuster je Funktion, keine Zufallswerte); gleicher Fingerprint → gleiche Ausgabe. Fehlermodi per Konfiguration: `ok`, `fehler`, `zeit`, `falsche-zahl`, `falsche-kennung`, `klarname`, `gesundheitsbegriff`, `injektion` (Antwort versucht, Anweisungen auszuführen). Jeder Prüfer- und Gateway-Pfad ist so **ohne Netz und ohne Schlüssel** testbar (CI-Pflicht, Architecture Freeze CI 9).
- **Aufzeichnung/Wiedergabe ohne Personendaten:** Aufgezeichnet wird nur, was ohnehin keinen Personenbezug trägt: Fingerprint, Funktions-/Schemaversionen, Prüfergebnis und die **Antwort auf ein synthetisches Faktenpaket**. Die Aufzeichnung läuft **nur im Testlauf** gegen aus Generatoren erzeugte Betriebe; sie ist im Betrieb abgeschaltet und **verweigert das Schreiben**, wenn die Leck-Prüfung oder der Raumpräfix (kein `demo-`/Testraum) anschlägt. Wiedergabedateien liegen unter `pruefungen/ki-gold/` und enthalten ausschließlich synthetische Daten; ein Test prüft sie gegen die Namensliste der Generatoren und gegen die Sperrliste.
- **Gold-Testsätze aus echten Altplänen** (I21) werden erst nach Anonymisierung und Freigabe aufgenommen; bis dahin nur synthetische Daten.
- **Demo-Räume und Testbetriebe:** Attrappe erzwungen (Spez. SR-14), unabhängig vom Modus.

### 2.7 Konfliktzonen mit ACC45 / WP-19

| Zone | Wer sonst dort arbeitet | Umgang |
|---|---|---|
| `server/lib/regelbaukasten.mjs`, `src/regelbaukasten.js`, `src/regelregister.js` | **WP-19** (Andockpunkt A3), I3 (Baukasten 4 → 8 Arten), später I25/I26 | I10–I17 **berühren die Dateien nicht**. I3 stimmt sich mit WP-19.x ab; ein Schreiber zur Zeit. Intelligence liest nur über die öffentliche Schnittstelle. |
| `src/App.jsx` | I2, I4, I5, I7–I9, I12 (Ausschneiden), I17 (Einhängepunkte), später viele | **I12 allein schneidet aus; währenddessen keine zweite App.jsx-Änderung** (JSON: Annahme `appJsxNachWP39Frei`). Einhängepunkte von I17 sind klein und erst nach I12. |
| `server/lib/rechte.mjs`, `RECHTEMATRIX.md`, `server/lib/sicht.mjs` | I4, I16, ACC45-Rechtearbeit | Neue Rechte nur als eigene, kleine Ergänzung; vorher Stand von `integration/centric-complete` holen; Opus-Review. |
| `server/lib/schutz.mjs` (`GRENZEN`) | ACC45 (Bremsen) | I15 ergänzt **nur** die Bremsart `ki`; keine Änderung an bestehenden Arten. |
| `server/lib/gesund.mjs` | ACC45 (WP-05) | I15 ergänzt Prüfungen; bestehende Stufenlogik unverändert; Intelligence setzt nie „kritisch“. |
| Datenmodelle/Migration (`src/migration.js`, Betriebsdaten) | WP-19, I4 | I10–I17 brauchen **keine** Änderung am Betriebsdatenmodell (eigene Stores). Interne Vorgaben (I4) sind getrennt. |
| `server/lib/bestaetigungen.mjs`, `planfreigabe.mjs` | I1, I9 | I10–I17 nicht beteiligt. |
| `werkzeug/ablage-sicherung.mjs` (`STORES`) | Agent B (WP-04) | **Eine Zeile je Store** durch I13/I14; Abstimmung mit dem Besitzer. |
| `.env.example`, `docs/BETRIEBSHANDBUCH.md` | Agent B/0 | Neue Variablen dort beschreiben (Pflicht wegen `pruefung:doku`). |
| `server.mjs`, `Dockerfile`, `deploy/**` | Agent A/B (WP-02/03) | **Nicht ändern**: Routen werden automatisch geladen; Engine in `server/lib/` braucht kein Docker-Update (AD-06). Ein Worker oder ausgehender Netzzugriff wäre eine Abstimmung mit Agent B. |
| Dateibesitz laut `docs/acc45/AGENTS.md` | Agent 0 besitzt `docs/acc45/**` | Dieses Dokument liegt in `docs/intelligence/`; Änderungen an Plan und JSON nur gekennzeichnet und minimal (Abschnitt 4). |

## 3. Teil 3 – Abhängigkeiten, Startfolge, Risiken, offene Entscheidungen

### 3.1 Abhängigkeiten und Startfolge innerhalb von Intelligence

Stand `work-packages.json`: I10 ist `READY` (Abhängigkeit E-21i erledigt). Ohne I10 sind schon startbereit die Kernpakete I2, I3, I6 (Block K); sie hängen nicht an I10.

```text
I10 ──┬─► I11 (Faktenpaket)  ──┐
      │                        ├─► I13 (Gateway, Attrappe, Router, Prüfer) ─┬─► I14 (Fingerprint/Speicher)
      └─► I12 (Decision Engine)┘                                            ├─► I15 (Limits/Deadline) ─► I16 (Steuerung/Transparenz)
                                                                            └─► I17 (Oberfläche Grundlage)
```

| Paket | Startbar nach | Parallel zu | Dateibesitz (neu) | Konfliktzonen | Modell (Entwicklung) |
|---|---|---|---|---|---|
| **I11** | I10 und WP-43 (integriert) | I12, I2, I3, I6 | `server/lib/intelligence/{faktenpaket,alias,kapsel,schemas}.mjs`, `pruefungen/ki-fakten*.test.js` | nur lesend `sicht.mjs` | **Opus** (sensible Daten, Art. 9) |
| **I12** | I10 und WP-11, WP-22 (integriert) | I11, I3, I6 (nicht I2, nicht andere App.jsx-Arbeit) | `server/lib/engine/**`, `src/engine/index.js`, `werkzeug/engine-schliessung.mjs` | **`src/App.jsx` (allein)** | Sonnet; Review Sonnet; Opus nur bei Datenkonflikten |
| **I13** | I11 **und** I12 | I2, I3, I6 | `server/lib/intelligence/{konfig,sitzung,rechte,pruefer,router,modelle,anbieter,gateway,speicher}.mjs`, `server/funktionen/ki.mjs`, `pruefungen/ki-*.test.js`; eine Zeile `STORES` | `werkzeug/ablage-sicherung.mjs`, `.env.example`, Betriebshandbuch | Sonnet; Review **Opus** (Sicherheitsgrenze) |
| **I14** | I13 | I15, I17 | `ergebnis.mjs`, `loeschlauf.mjs`, Tests | `STORES`, Raumlöschung/Datenschutzlauf (Anschluss) | Sonnet; Review **Opus** |
| **I15** | I13, WP-05 (integriert) | I14, I17 | `limits.mjs`, `zaehler.mjs`, Tests | `schutz.mjs` GRENZEN, `gesund.mjs` | Sonnet; Review **Opus** |
| **I16** | I13 **und** I15 | I14, I17 | `schalter.mjs`, Betreiberkonsole-Anteil | `rechte.mjs`, `RECHTEMATRIX.md`, `App.jsx` (klein) | **Opus** (Rechte/Mitbestimmung) |
| **I17** | I13 (und praktisch nach I12 wegen `App.jsx`) | I14, I15 | `src/ki/*`, kleine Einhängepunkte | `App.jsx` (klein) | Sonnet |

**Direkt nach I10 startfähig: I11 und I12.** Sie lassen sich parallel bearbeiten, weil ihr Dateibesitz disjunkt ist. Damit I11 nicht auf I12 warten muss, wird **in I11 zuerst der Vertrag** (`faktenpaket-0.1`) und die Positivliste gegen eine **Faktenquelle-Schnittstelle** (`fakten(funktion, sicht) → Faktenliste`) gebaut, die I12 später mit echter Engine-Berechnung füllt; bis dahin liefern Test-Generatoren die Fakten. Dieser Vertrag wird aus Abschnitt 2.2 übernommen und in I11 eingefroren (Architecture Freeze, E-18).
**Reihenfolgeempfehlung:** I11 + I12 → I13 → I14/I15/I17 parallel → I16.
**Kritischer Pfad** laut JSON: I10 → I12 → I13 → I17 → I19 → I27 → I37; Aufschub von I12 verschiebt alles.
Pro Zeitpunkt höchstens drei schreibende Agenten (Rechner 4 Kerne, 11,8 GB, `docs/acc45/AGENTS.md`); eine `App.jsx`-Konfliktzone zugleich.

### 3.2 Risiken

| Nr. | Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|---|
| R-1 | **I12: Extraktion aus 25.000-Zeilen-`App.jsx`** (Schließung unbekannt, S-07) | Verzug, Regression, Konflikte mit ACC45 | Messen zuerst; Teilpakete ≤ 15 Funktionen; alle bestehenden Tests unverändert grün; kein paralleles Bearbeiten von `App.jsx` |
| R-2 | Engine-Ort `src/` vs. `server/` (Bild enthält nur `server/`) | Engine auf dem Server nicht ladbar | AD-06; Test im Bild (`pruefung:auslieferung`-Muster, Container-HTTP-Prüfung) |
| R-3 | Neuer Store nicht in `STORES` | **Sicherung bricht ab**, unbemerkt bis zum nächsten Lauf | AD-11; Test, dass `centric-ki*` klassiert sind; CI `ablage-sicherung`-Prüfung |
| R-4 | Prozessinterne Läufe unter 512 MB und auf dem Event-Loop | Stempeln/Planung stocken; Lauf bei Neustart verloren | Worker für Rechenläufe, Begrenzung der Parallelität (Bremse `ki`), Journal + Rückfall, Lasttest vor Piloten [zu messen] |
| R-5 | Deadline 120 s gegen 60-s-Grenzen (Server, Caddy) | falsche Annahme „eine Anfrage reicht“ | 202 + Abfrage (AD-01); Test der Abfrage über die Grenze |
| R-6 | Zähler ohne Redis/ETag | doppelte oder verlorene Buchungen bei Absturz | append-only Ereignisse, Rollup neu rechenbar, Toleranz 2 % für Warnstufen, strikte Idempotenz nur für Käufe (I35 bedingt) |
| R-7 | Prompt Injection über Freitext/Dateiinhalt | falsche Anweisungen, Datenabfluss | Kapselung mit zufälligem Trenner, Eingabewarnung, Angriffs-Testsatz, Prüfer, **kein Schreibpfad**, kein Werkzeugzugriff des Modells auf Daten |
| R-8 | Klarname/Gesundheitsbegriff im Faktenpaket | schwerer Datenschutzverstoß | Schnitt aus Sicht und Positivliste, Leck-Prüfung fail closed, Property-Test, Opus-Review, kein Live-Aufruf ohne Freigaben |
| R-9 | Ausgehender Netzzugriff vom Container nicht geklärt | I18 nicht ausführbar oder Umgehung durch Eigenbau | Frühe Klärung (Abschnitt 3.3, B-3); einziger Egress-Punkt `anbieter.mjs`; Freigabe über Betreiber |
| R-10 | Konfigurationsvariablen ohne Doku | `pruefung:doku` rot | Pflicht im Paket: `.env.example` + Betriebshandbuch |
| R-11 | Drift zwischen Spezifikation (Netlify-Namen, Pfade, `netlify/lib/ki`) und Code | Agenten bauen nach alter Vorlage | Dieser Bericht gilt für Teil B; Übergabevorlage je Paket nennt ausdrücklich „server/lib/intelligence, nicht netlify/lib/ki“ |
| R-12 | Rechtliche Freigaben fehlen (AVV, DSFA, KI-VO-Einordnung, Mitbestimmung) | kein produktiver Betrieb | Modus Vorgabe `aus`; echte Aufrufe mit Personendaten bleiben gesperrt; Rechtsfragen bleiben „zu prüfen“ |
| R-13 | Namenskollision K-nn (Konfiguration) / „K-01…“ im Plan | Verwechslung | Entscheidungen heißen AD-nn (Abschnitt 1.2) |
| R-14 | Schichtverantwortung/Betriebsrat-Sicht in KI-Pfaden nicht vorgesehen | unbeabsichtigter Zugriff | Default verweigern, Test „Rolle ohne Recht → `KI_ROLLE`“ je Rolle |

### 3.3 Offene Entscheidungen des Betreibers (nur echte)

Keine Rechtsfragen werden hier „entschieden“; DSGVO, AVV, DSFA, EU-KI-Verordnung und Mitbestimmung bleiben **zu prüfen** (Plan Abschnitt 8) und sind keine Entscheidungen dieses Dokuments.

| Nr. | Entscheidung | Wann nötig | Bemerkung |
|---|---|---|---|
| B-1 | **Anbieter und Zugangsweg einschließlich Region** (direkter Anbieterzugang oder über eine Cloud-Plattform; Verarbeitungsregion) | vor I18; für I10–I17 nicht nötig | Entspricht E-10 der Dokumente; Fassung 7 nennt Anthropic und die Cloud-Variante nur als Möglichkeiten. Vertragliche Zusicherungen sind **zu prüfen**. |
| B-2 | **Budget und Limits**: Monatsdeckel beim Anbieter, Startwerte der fünf Ebenen (CI 7.7 liefert Vorschläge), Budget für den Pilot | vor I15-Abnahme und I18 | Kontingentmodell/Preise nicht jetzt (I35 bedingt). |
| B-3 | **Ausgehender Netzzugriff** des Containers zum Anbieter (Firewall, Freigabe, Protokollierung) | vor I18 | Betrifft `deploy/`-Besitz (Agent B). |
| B-4 | **Wer schaltet den Notschalter** und über welchen Alarmkanal werden Kosten-/Sicherheitsalarme gemeldet (vorhandener Webhook oder anderer)? | vor I16-Abnahme | Betreiberkonto mit Zwei-Faktor ist vorhanden. |
| B-5 | **Darf die Sicht der Schichtverantwortung Intelligence-Funktionen nutzen** (Default: nein) und welche Funktionen für Mitarbeiter (nur F9)? | vor I16-Abnahme | Produkt- und Rechtefrage. |
| B-6 | **Bestätigung der Löschfristen** für Ergebnisse, Kontexte, Rollups (Entwurfswerte 30 Tage/90 Tage/24 Monate) | vor I14-Abnahme, endgültig vor Pilot | Mit Datenschutzbeauftragtem zu prüfen. |

## 4. Teil 4 – Konsequenzen für den Plan

Der Abgleich verlangt **konkrete Änderungen** an den Akzeptanzkriterien von WP-I10 bis WP-I17 in [`../acc45/INTELLIGENCE-ENTWICKLUNGSPLAN.md`](../acc45/INTELLIGENCE-ENTWICKLUNGSPLAN.md). Sie stehen dort, mit „(WP-I10: …)“ gekennzeichnet; Übersicht:

| Paket | Änderung |
|---|---|
| I10 | Entscheidungen heißen AD-nn (nicht K-nn); Bericht liegt vor |
| I11 | Quelle = Sicht der Rolle ∩ Positivliste; Alias-Karte nur Server; Leck-Prüfung fail closed; Verzeichnis `server/lib/intelligence/` |
| I12 | Ort `server/lib/engine/` mit Re-Export; Messung der Schließung (S-07) als erster Teilschritt; Docker-Bild enthält `src/` nicht |
| I13 | Route `/ki`, `/ki/*`; 202 + Abfrage; kein interner Hintergrundaufruf; Lauf-Journal und Rückfall nach Neustart; Netz/Schlüssel nur in `anbieter.mjs`; Importregeln als Test; `STORES`, `.env.example`, Betriebshandbuch |
| I14 | zwei Stores, Sicherungsklassen, Anschluss an Raumlöschung/Datenschutzlauf, Löschlauf |
| I15 | Zähler ohne Redis/ETag (Ereignisse + Rollup unter Mutex); Bremsart `ki`; Überwachung ohne „kritisch“ durch Intelligence |
| I16 | zwei Schalterebenen (Prozess und Laufzeit), fail closed, Wirkung innerhalb einer Minute |
| I17 | CSP unverändert, kein Anbieter im Browser, Test |

## 5. Anhang – Annahmen und Grenzen dieses Abgleichs

- Gelesen wurden Plan, Abgleich, Fassung 7, `INTELLIGENCE.md`, Spezifikation Teil B (Abschnitte 24–28, 32, 37–38, 42; übrige Abschnitte nur überflogen, **Abschnitt 7.0 nur teilweise ausgewertet**), Betriebshandbuch und die genannten Quelldateien. Keine Tests liefen außer der Statusprüfung; Laufzeitannahmen sind als **[zu messen]** gekennzeichnet.
- Der Spezifikation fehlt ein Belegstand zu Anbieter-Parametern (S-02) und Excel-Bibliothek (S-04): beides bleibt offen.
- Nicht geprüft: Netzwerkregeln des VPS, tatsächliche Last, Wirkung eines Workers unter 512 MB, Kosten.
- Rechtliche Richtigkeit der Repo-Dokumente ist nicht geprüft; es wurden keine Rechtsgrundlagen ergänzt.
