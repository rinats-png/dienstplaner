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
