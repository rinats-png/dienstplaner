# CI-Flackertests stabilisiert: Nachweis

Branch `acc45/qa/ci-flakes`, Basis `origin/integration/centric-complete` (d2d3f7a). Keine Prüfaussage wurde
abgeschwächt: Es kommen nur Warten auf eine Bedingung und ein freier Port hinzu.

## Beobachtet

Aus den fehlgeschlagenen CI-Läufen der „Prüfung“ (`gh run view --log-failed`):

| Lauf | Meldung |
|---|---|
| 41582979903, 41577801798, 41593987226 | `sitzungsbindung.test.js` „die Arbeitssitzung überlebt ihre Anmeldung nicht: gueltigBis ist gekappt“: `Schritt 20 / 21 / 10: expected 401 to be 200` |
| 41590335868 | `herkunft-xff.test.js`: `Server startet nicht: listen EADDRINUSE 0.0.0.0:44946` |
| 39730965033 | `server.test.js`: `Server kam nicht hoch: listen EADDRINUSE 0.0.0.0:39134` |
| 38861519550, 38864097663 (alt) | `accountanmeldung.test.js` „endet nach zwölf Stunden“: `nach 31 Zugriffen: expected false to be true` |

Der Punkt „kalender-rechte DTSTAMP“ war schon behoben und ist hier nicht Teil.

## Ursachen

**1. `sitzungsbindung`: Fortschreiben der Aktivität ohne `await`.**
`accountsitzungen.mjs` (und `sitzungen.mjs`) schreiben `zuletzt` bewusst ohne `await` fort: Die Anfrage soll nicht auf die
Platte warten. Die Prüfung springt mit der falschen Uhr (`uhr.vor(28 * MINUTE)`) und fragt sofort wieder. Kommt der
Schreibvorgang des vorigen Schritts nach dem Lesen des nächsten an, ist `zuletzt` zwei Schritte alt, also über
30 Minuten, und die Sitzung stirbt an der **Untätigkeit** statt an der Frist (401 statt 200). Das passiert nur unter
Last und an wechselnden Schritten (10, 20, 21). Im Betrieb liegen zwischen zwei Zugriffen Sekunden bis Minuten, nie ein
Uhrsprung. Kein Produktfehler.

**2. `accountanmeldung` „endet nach zwölf Stunden“: dieselbe Ursache.**
Die Prüfung hat dafür schon `warteAufZuletzt` (seit den alten Läufen oben; in den neueren Läufen grün). Deren Budget
(12 Anläufe zu 40 ms = 0,5 s) ist auf einem ausgelasteten Läufer knapp.

**3. Ports.**
Fünf Prüfungen zogen ihren Port mit `30000 + Math.floor(Math.random() * 20000)`:
`server`, `herkunft-xff`, `gesund`, `deploy-automatik`, `zugaenge-anlegen`. Das kollidiert aus zwei Gründen. Die
Prüfungen laufen in getrennten Prozessen nebeneinander, und der Bereich überdeckt den Ephemeral-Bereich des Systems
(Linux ab 32768): Auch die ausgehenden Verbindungen der Prüfung selbst belegen dort Ports. Dazu kam ein stilleres
Problem: Antwortet auf dem gezogenen Port schon der Server einer anderen Prüfung, bekam `/gesund` ein „ok“, und die
Prüfung lief gegen den falschen Server weiter, während der eigene längst abgestürzt war.

## Umsetzung

- `pruefungen/hilfen/szenario.mjs`: `Z.aktivitaetAbwarten({ keks, token })` wartet auf die Bedingung („`zuletzt` ist bei der
  jetzigen Uhrzeit angekommen“), ein Lesevorgang je Anlauf (unter Windows scheitert das atomare Umbenennen, solange gelesen
  wird), höchstens 150 Anläufe. Kommt es nie an, wirft die Prüfung.
- `sitzungsbindung.test.js`: Aufruf nach jedem Uhrsprung in den drei Schleifen (28-Minuten-Schritte, 10-Minuten-Schritte,
  29-Minuten-Dauerbetrieb). Die Behauptungen sind unverändert.
- `accountanmeldung.test.js`: Anläufe von 12 auf 100 (Obergrenze, keine feste Wartezeit).
- `pruefungen/hilfen/port.mjs`: `freierPort()` (das Betriebssystem vergibt den Port) und `serverStarten(...)`:
  - „bereit“ heißt: eigener Prozess lebt, hat „läuft auf Port“ ins Log geschrieben und `/gesund` antwortet;
  - bei EADDRINUSE neuer Versuch mit neuem Port (höchstens fünfmal), jeder andere Fehler bricht sofort ab.
- Umgestellt: `server`, `herkunft-xff`, `gesund`, `deploy-automatik`, `zugaenge-anlegen`.
- Produktcode unverändert.

## Mutantentest

Die Prüfaussagen bleiben scharf. Mit den Änderungen (lokal, je Mutant nur die betroffenen Tests, danach per
`git checkout` zurückgenommen):

| Mutant | Datei | Ergebnis |
|---|---|---|
| Kappung der Arbeitssitzung auf die Account-Sitzung entfernt (`Math.min(dauerFuer(rolle), asBis - jetzt())` → `dauerFuer(rolle)`) | `betriebsauswahl.mjs` | „gueltigBis ist gekappt“ **rot** |
| absolute Frist 12 h → 24 h (`DAUER`) | `accountsitzungen.mjs` | „die absolute Frist bleibt: zwölf Stunden Dauerbetrieb enden“ **rot** |
| Untätigkeitsgrenze 30 → 90 Minuten (`RUHE`) | `accountsitzungen.mjs` | „31 Minuten echte Untätigkeit machen den Kontext ungültig“ **rot** |
| ohne Mutant | — | alle drei grün |

Beobachtung ohne Folge für diese Arbeit: `accountanmeldung.test.js` „endet nach einer halben Stunde Untätigkeit“
springt um `AS.RUHE + MINUTE`, also um die Konstante, die der Mutant ändert; er folgt dem Mutanten und bleibt grün. Die
30 Minuten sind in `sitzungsbindung` festgenagelt (siehe Tabelle). Der Test wurde nicht verändert.

## Lokal

`sitzungsbindung` (62), `accountanmeldung`, `herkunft-xff`, `gesund`, `server`, `deploy-automatik` grün. Bekannte
Windows-Ausnahmen wie bisher: `zugaenge-anlegen` (7, `jq` fehlt) und `server` „hört auf SIGTERM sauber auf“. eslint ohne
Befund.

## CI

Auf 0aaa694: „Prüfung“ (Lauf 41612621854) dreimal in Folge grün — Versuch 1 aus dem Push, Versuch 2 und 3 als
vollständiger Neustart des Workflows (nicht nur der fehlgeschlagenen Jobs). Dazu Sicherheit 41612621975, Betrieb:
Deploy-Skripte 41612621904 und Lieferkette 41612621857 grün.

Offen: Dass ein Flackertest nie wieder rot wird, beweisen drei Läufe nicht. Die Ursachen sind beseitigt (Wartebedingung
statt Uhr, vom Betriebssystem vergebene Ports); bleibt ein Fehler, zeigt die Meldung jetzt, ob die Aktivität nie ankam
(`zuletzt erreichte … nicht`) oder der Server nicht hochkam (`Server kam nicht hoch (Port …)` mit dem Log).
