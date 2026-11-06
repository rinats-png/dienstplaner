# WP-I15 (Teilstand) – Nachweis: Kostenschutz, Limits, Deadline, Notschalter

Branch `feature/intelligence-gateway` · Agent: Sonnet · Stand 2026-11-06 · **Teilstand: nur Prozessspeicher, nur gegen die Attrappe.**
Gehört zu [`wp-i13-nachweis.md`](wp-i13-nachweis.md); Quelle der Startwerte: `docs/intelligence/CENTRIC-INTELLIGENCE.md` 7.2–7.5 und 6.8.

## Statusstufen (ehrlich)

| Stufe | Stand |
|---|---|
| implementiert | **teilweise** — Zähler im Speicher; keine Persistenz, keine Alarme, kein `schutz.mjs`-Eintrag |
| lokal getestet | **ja** — `intelligence-gateway-limits.test.js` 29 Tests, `intelligence-gateway-kern.test.js › Kosten- und Ratenschutz` (7 Tests) |
| reviewt / integriert / produktiv | **nein** |

## Dateien

`server/lib/intelligence/gateway/{limits,audit,schalter,router,codes}.mjs`, Tests `pruefungen/intelligence-gateway-{limits,kern}.test.js`. Nicht geändert: `schutz.mjs`, `gesund.mjs`, `werkzeug/**`.

## Was umgesetzt ist (Spez. 7)

| Regel | Umsetzung | Test |
|---|---|---|
| Eingabegrenzen je Vorgang 20.000 / 60.000 / 150.000 Token; darüber nie kürzen, ablehnen | `groesseAusTokens`, `KI_GROESSE` | limits › Größen |
| IE: klein 1, mittel 3, groß 7; eine Aktion zählt einmal unabhängig von der Stufenzahl | `IE_JE_GROESSE`, `erweitern` | limits › Größen; kern › Eskalation hilft |
| Person: 30/h und 200/Tag (Planer, Leitung); Klasse A 60/h | `personJeStunde/-Tag`, `klasseAJeStunde` | limits › Sicherheitslimits |
| Dieselbe Anfrage höchstens 5 × in 10 Minuten (Runaway-Schutz) | Fingerprint-Zähler | limits, kern |
| Betrieb: Tageslimit 25 % des Monatskontingents (ohne A) | `tageslimitAnteil` | limits › Kontingent |
| ab 100 %: D angehalten (Reserve nur B/C); ab 110 %: nur noch A | `_geschaeft` | limits › „ab 100 % …“ |
| Klasse A wird nie aus Kostengründen gesperrt (Hinweis `ueberKontingent` ab 150 %) | `_geschaeft` | limits, kern |
| Plattform gesamt: Tagesbudget (weich, Nicht-A) und **absolutes Tagesdach (auch A)** | `gesamtTagesIE`, `gesamtHartTagesIE` | limits, kern |
| Parallele Vorgänge je Betrieb begrenzt | `parallelJeBetrieb` | limits, kern |
| Zeit: globale Deadline, je Stufe Frist, Wiederholung nur bei ausreichender Restzeit, Zeitüberschreitung → nächste Stufe | `gateway.zeiten` | anbieter, kern › Anbieterausfall |
| Notschalter: Prozess + Laufzeit, Vorgabe aus, fail closed, jeder Aufruf neu gelesen | `schalter.mjs` | limits › Notschalter; kern › Inert |
| Degradierter Modus: Anbieterausfall/Prüferfehler → Rückfall-Antwort, nie Ausnahme; Kern unberührt | `gateway.mjs` | kern › Anbieterausfall |
| Opus-Stufe allein abschaltbar | `hoechsteStufe` | kern › Prüfer |

## Invarianten (Prüfgrundlage)

- **B1** Kein Aufruf ohne erfolgreiche Reservierung; Reservierung vor Datenlesen und Anbieteraufruf.
- **B2** Eine Aktion zählt einmal (IE) unabhängig von der Zahl der Stufen; wurde nichts geliefert (nur technische Fehler), gehen die IE zurück (genau einmal). Prüferabweisung zählt (der Anbieter hat geliefert).
- **B3** Sicherheitslimits (Rate je Person, Wiederholungsschutz, Parallelität, Größe) gelten für jede Klasse, auch A.
- **B4** Geschäftslimits sperren Klasse A nie; nur das absolute Tagesdach `gesamtHartTagesIE` (Notbremse) sperrt auch A.
- **B5** Personenzähler nur im Speicher, Schlüssel = Hash, keine Ausgabe je Person (Betriebsvereinbarung § 6); `stand()` liefert nur Summen je Betrieb.
- **B6** Zeitfehler (NaN, rückwärts) sperren; ohne Kostendeckel (`betriebKontingentIE`, `gesamtTagesIE`, `gesamtHartTagesIE`) lässt sich `Limits` nicht bauen; eine Rolle ohne Limit-Eintrag (Beschäftigte/F9) ist gesperrt.
- Zähler sind in der Größe begrenzt (5000 Schlüssel, danach Aufräumen oder Ablehnung — kein unbegrenztes Wachstum).
- **U1–U3** Protokoll: Weißliste, Pflichtstartereignis, spätere Ereignisse stören nie.

## Nicht enthalten — Rest von WP-I15

Persistenz (append-only mit Rollup, Neustart-Verhalten), Bremsart `ki` in `schutz.mjs` `GRENZEN`, Alarme über `gesund.mjs`/Webhook (50/80/100 %, 3×-Mittelwert), Eskalationsquote auf Opus, Dynamik des Plattformbudgets in Euro (Preise ungeklärt → es wird in IE gezählt), Anbieter-Deckel, Lasttest „nicht auf dem Event-Loop“ (heute läuft nur synchrone Zählung), Kontingent je Tarif/Zusatzplaner/Einführungsfenster. Alle Werte sind Konfiguration des Aufrufers; die Startwerte sind Hypothesen (Spez. 7.7).

## Stand nach dem Review und nach dem Persistenz-Paket

Statusstufe „implementiert“: **teilweise** — Persistenz und Alarm-Funktion sind jetzt da, die Verdrahtung (`schutz.mjs`, `gesund.mjs`, Betreiber-Mail) nicht. Tests: `intelligence-gateway-zaehler.test.js` (19) und die erweiterten `limits`/`review`.

### Neu

- **Persistenz** (`zaehlerspeicher.mjs`): append-only Ereignisse `ki:zaehler:ev:<tag>:<t13>-<zufall>` und Rollup `ki:zaehler:roll` über das **injizierte** Ablage-Interface (im Betrieb `getStore("centric-ki-lauf")` aus `server/lib/ablage.mjs`); Zusammenfassen unter der **injizierten** Sperre (im Betrieb `unterRaumsperre(SPERR_RAUM, …)` aus `server/lib/raumsperre.mjs`, Pseudo-Raum `@ki-zaehler`). Das Modul importiert weder Ablage noch Raumsperre (statischer Test). Ereignis: Hash des Betriebs, Tag, Monat, signierte IE — keine Person, kein Raum im Klartext.
- `Limits`: Option `senke`, `dauerhaft(beleg)`, `ladeStand(rollup)` (nur vor dem Gebrauch), `konfig()`.
- **Alarme** (`alarme.mjs`, reine Funktion): Betrieb 70/90/100/110 %, Plattform 80 %/100 %/hartes Dach, Tagesverbrauch über dem Dreifachen des 7-Tage-Mittels. Das Gateway ruft optional `alarmHaken(alarme)` (Fehler im Haken werden verschluckt). Ein Intelligence-Alarm setzt `/gesund` nie auf „kritisch“ — das liegt beim Aufrufer.

### Neue/geänderte Invarianten

- **B7** Ab dem ersten tatsächlichen Anbieteraufruf gilt die Aktion als verbraucht (auch bei Zeitüberschreitung/Fehler, auch beim harten Tagesdach): keine Rückbuchung. Zurück gehen die IE nur, wenn nie ein Aufruf stattfand.
- **B8** Ein Adapter, der Frist/Abbruch überlebt, hält seinen Platz (`laufend`), bis er endet, höchstens `haltenMaxMs` (Vorgabe 5 min).
- **Z1** Ereignisse append-only, ein Schlüssel je Ereignis (kein Lesen-Ändern-Schreiben). **Z2** Zusammenfassen unter der Sperre und idempotent (gefaltete Schlüssel werden vor dem Löschen im Rollup vermerkt; Absturzprobe im Test). **Z3** Rollup ist neu rechenbar, beschädigte Ereignisse werden übersprungen und entfernt. **Z4** Ist die Buchung nicht dauerhaft: Klasse A läuft im Speicher weiter (Hinweis im Protokoll), alle anderen werden abgelehnt (`KI_LIMIT`), **vor** dem Anbieteraufruf.
- Nach einem Neustart: `limits.ladeStand(await zaehler.laden())` stellt Monats-, Tages- und Plattformzähler wieder her (Test: Tageslimit gilt nach Neustart weiter; neuer Tag setzt den Tageszähler zurück).

### Vorschläge, die ich NICHT umgesetzt habe (Dateien gehören anderen Paketen)

1. **`server/lib/schutz.mjs` `GRENZEN`** (WP-I15 verlangt die Bremsart `ki` je Person; die Datei ist unverändert). Vorschlag:
   ```js
   ki:        { versuche: 30, fenster: 3600, sperre: 600 },   // je PERSON, Spez. 7.3 (Planer/Leitung 30/h)
   "ki-raum": { versuche: 90, fenster: 900,  sperre: 900 },   // je Raum, Runaway-Schutz „3 × übliche Frequenz in 15 Minuten“ (Startwert, im Pilot messen)
   ```
   ohne `failClosed` (ein Zählerfehler darf die Anwendung nicht lahmlegen; das Gateway entscheidet selbst fail closed für Nicht-A). Die Bremse wäre die zweite, prozessübergreifende Schicht neben den Speicherzählern des Gateways.
2. **`server/lib/raumloeschung.mjs` / `datenschutzlauf.mjs`**: `await ergebnisSpeicher.raumLoeschen(raum)` bei der Raumlöschung; `await ergebnisSpeicher.aufraeumen()` im Datenschutzlauf (Modus aus `datenschutzModus()` an `erzeugeErgebnisSpeicher({ modus })` reichen; Vorschau bleibt Vorgabe).
3. **`server/lib/gesund.mjs`**: ein Intelligence-Block nur als Hinweis (nie „kritisch“), gespeist aus `limits.stand`/`alarmeBerechnen`.
4. **`werkzeug/ablage-sicherung.mjs` `STORES`**: `centric-ki-lauf` als Klasse C (nicht gesichert); die Zähler gehören dorthin (neu rechenbar).

### Weiter offen

Euro-Tagesbudget und Preise (ungeklärt), Anbieter-Deckel, Lasttest „nicht auf dem Event-Loop“, Kontingent je Tarif/Zusatzplaner/Einführungsfenster, Zeitzone der Tagesgrenzen (UTC), Tageswerte der letzten sieben Tage für `KOSTEN_DREIFACH` (der Aufrufer muss sie liefern).

## Delta-Review von 6354ff5 — Zähler-Persistenz (Befunde 1–3, 9, 11)

Tests: `intelligence-gateway-review2.test.js` (Zähler-Teil) und die korrigierten `zaehler`-Tests.

- **Z5 (kritisch, fail open behoben)** Lesefehler am Rollup oder beschädigter/fremder Rollup: `zusammenfassen()`/`laden()` **werfen**, schreiben nichts und löschen nichts. Nur ein wirklich fehlender Rollup (`null`) beginnt leer. Zuvor: ein einziger Lesefehler setzte alle Kostenzähler auf 0, nachdem die Ereignisse schon gelöscht waren. Der Test, der „beschädigter Rollup → neu beginnen“ festschrieb, prüft jetzt das sichere Verhalten (Rollup unverändert, Ereignis bleibt).
- **Z6** E/A-Fehler beim Lesen eines Ereignisses brechen ab (nichts geändert, Ereignis bleibt liegen). Gelöscht wird nur, was erfolgreich gelesen wurde und ungültig ist; ein verschwundener Schlüssel wird übersprungen.
- **Z7** Buchung und Rückbuchung mit gleichem Zeitstempel: jedes Ereignis trägt eine laufende Folgenummer je Beleg (`…-<n6>-<zufall>`), und die Summen werden **nicht** zwischendurch gekappt (kommutativ); gekappt wird erst beim Laden. Test: 200 Läufe ohne aufgeblähten Zähler; Rückbuchung vor Buchung wird später ausgeglichen.
- **B9** `dauerhaft()` hat eine Frist; ein hängender Zählerspeicher blockiert keinen Vorgang (Nicht-A: abgelehnt).
- **Betriebsvoraussetzung Single-Instance (Befund 11)**: Die Zähler im Prozessspeicher sind pro Prozess maßgeblich; der persistierte Stand wird nur beim Start geladen (`ladeStand`). **Mehrere gleichzeitige Prozesse/Instanzen dürften jeweils das volle Kontingent verbrauchen** und sind deshalb nicht zulässig (das Produktionsbild ist ein Node-Prozess in einem Container). Wer das ändert, muss vor jeder Nicht-A-Buchung den persistierten Stand einbeziehen (Rollup lesen und Ereignisse addieren, unter der Raumsperre) — das ist bewusst nicht gebaut, weil es die Buchung auf den Ablagezugriff serialisiert; siehe `wpI-offene-fragen.md` Nr. 25.

- Runde 3 (e6d1fc5): Z8 strenger Rollup, Z9 Rückbuchung nur nach dauerhafter Buchung, E9 Löschlauf nur bei erfolgreichem Lesen, G16 Schalter-Takt ohne Überlappung; Einzelheiten und Lease-Idee in `wp-i13-nachweis.md` (Abschnitt Runde 3).
