# WP-47 — Bremsenkonzept für den Echtbetrieb: Nachweis

Branch `acc45/security/wp47-bremsen`, Basis `integration/centric-complete` d5b27bd. Grundlage: die Befunde 1–5 aus
[wp28-nachweis.md](wp28-nachweis.md) (Linux-CI, zwei `voll`-Läufe). Sicherheitsrelevant: Der Schutz gegen Raten und
Missbrauch wird nicht abgeschwächt (Abschnitt 4).

## 1. Was geändert wurde

| WP-28-Befund | Vorher | Jetzt |
|---|---|---|
| 1 Schreibbremse 120/min je Raum (P1) | Stempel, Planung und alle Schreibvorgänge teilten sich 120/min je Raum; ab dem 121. Stempel eines Betriebs 429 | **Stempeln hat eigene Lastgrenzen** (`GRENZEN.stempeln`, `GRENZEN["stempeln-raum"]`): 10/min **je Person** und ein **Raumdeckel nach Betriebsgröße** (Abschnitt 2). `schreiben` (120/min je Raum) bleibt für Planänderungen und gilt nicht mehr fürs Stempeln |
| 2 50 Planende ≈ 100 PUT/min im selben Raum (P2) | Stempel verbrauchten dasselbe Kontingent | gelöst durch die Trennung: PUT hat sein Kontingent allein |
| 3 Anmelden: 40 je Betrieb und 5 min zählen auch gelungene (P1) | von 277 ehrlichen Anmeldungen kamen 40 durch | **Gelungene Anmeldungen nehmen ihre Vermerke bei Ziel und Gesamt zurück** (`entlasten(art, kennung, b)`); Fehlversuche bleiben gezählt. Dazu eine **Lastgrenze für gelungene Anmeldungen je Betrieb** (1000 je 5 min) |
| 4 Dienstweit 400 je 5 min zählt gelungene (P2) | greift bei ≈ 400 ehrlichen Anmeldungen | wie 3: nur Fehlversuche zählen |
| 5 Lesebremse 300/min schützt große Bestände nicht (P2) | – | **Backlog** (Abschnitt 6) — nicht sauber begründbar |

Jede Abweisung durch eine Lastgrenze trägt `Retry-After` (`zuVielAntwort`), wird als `429-last` für `/gesund` gezählt
(Warnung ab 20 in 15 min, `CENTRIC_GESUND_429_WARNUNG`) und im Betriebsprotokoll als `gebremst` vermerkt. Die Oberfläche
(`src/speicher.js`) wiederholt einen mit 429 abgewiesenen Stempel höchstens zweimal nach Retry-After (je ≤ 15 s) und
sagt sonst ausdrücklich, dass er **noch nicht erfasst** ist. Server und Client kennen das Wort „verloren“ nicht: Bei 429
wurde nichts gespeichert (WP-02-Garantie unverändert — der Zweig kehrt vor dem Lesen des Bestands zurück).

## 2. Die Werte und ihre Herleitung

Alle aus dem Nachweis WP-28 (Linux-CI, zwei Läufe; Abschnitt 2.2 dort).

| Grenze | Wert | Herleitung |
|---|---|---|
| `stempeln` je Person | **10/min**, Sperre 15 s (vorher 30 s, Review-Auflage M4, Abschnitt 9) | Eine Person stempelt zweimal am Tag; ein Stapel nach Funkloch ein paar Mal. Zehn je Minute lassen jeden ehrlichen Fall durch und halten ein Gerät in der Schleife auf sein eigenes Kontingent. |
| `stempeln-raum`, bis 1000 Personen | **900/min** | Obergrenze je Raum ohne Bremse 1923–2062/min (Haltedauer 29–31 ms); **Hälfte der kleinsten Obergrenze** ≈ 960 → 900. |
| … bis 2000 Personen | **240/min** | Obergrenze 483–1263/min (48–124 ms); Hälfte des schlechteren Laufs = 240. Ein Drittel der Belegschaft in 5 min (667 Personen) = 133/min liegt darunter. |
| … darüber (gemessen 4000) | **200/min** | Obergrenze 403–736/min (82–149 ms); Hälfte des schlechteren Laufs ≈ 200. |
| Größe unbekannt (Neustart, noch kein Zugriff) | 240/min | vorsichtige mittlere Stufe, bis der erste Zugriff die Personenzahl liefert (`raumGroesse` in `daten.mjs`, gemerkt beim Lesen, Schreiben und Stempeln; nur eine Zahl). |
| `anmelden-erfolg` je Betrieb | **1000 je 5 min**, Sperre 60 s | Ein Betrieb mit 2000 Personen, ein Drittel am Schichtbeginn ≈ 670 in 5 min; Anmeldung kostet ohne scrypt ≈ 35 ms (WP-28 S4). Reine Lastbremse für die Sitzungsablage. |
| `anmelden-code` je Code | **20 je 5 min**, Sperre 300 s | Review-Auflage M1 (Abschnitt 9): vor der Betriebsgrenze; niemand meldet sich zwanzigmal in fünf Minuten neu an. |
| `gesund` `429-last` | Warnung ab 20 in 15 min | wenige Abweisungen sind kein Befund; eine Häufung ja. |

Der Deckel ist nicht aus der Missbrauchsabwehr abgeleitet, sondern aus der **Rechenleistung des einen Prozesses**; er
steht bewusst unter der gemessenen Obergrenze, damit die Warteschlange vor der Raumsperre (Zeitgrenze 15 s, dann 503)
nie aufläuft.

### Warum die Lastbremse im Prozessspeicher zählt

Die erste Fassung ließ Stempeln wie alle Arten über `bremse()` laufen (ein Vermerk als Datei je Anfrage, Listen des
Verzeichnisses, zwei Aufrufe je Stempel). Auf dem Entwicklungs-Laptop fiel dadurch `datenintegritaet` R1 (50 gleichzeitige
Stempel) mit `SPEICHERN_BELEGT` um: Die zusätzlichen Dateizugriffe vor der Raumsperre verlängerten die Warteschlange
(WP-28 hatte bereits gezeigt, dass je Stempel-Anfrage rund 15 `fsync` anfallen). Die Lastgrenzen zählen deshalb **nur im
Speicher** (`lastbremse()` in `schutz.mjs`): kein Vermerk in der Ablage, keine Ausfallmöglichkeit, ein Neustart leert sie —
für eine Grenze, die nichts Geheimes schützt, ohne Folgen. Alles, was etwas Geheimes schützt (Anmelden, Einrichten,
zweiter Faktor, Zugänge, Registrierung), bleibt bei `bremse()` mit Ablage, Fail-closed (WP-46) und Notbremse.
Nebeneffekt: Ein Stempel kostet jetzt **weniger** Dateizugriffe als vorher (eine Bremsdatei weniger).

## 3. Anmelden: wie gelungene Anmeldungen zurückgenommen werden

`bremse()` vermerkt jeden Versuch **zuerst** (Schreiben-dann-Zählen, wegen des Schwarms), auch bei Ziel und Gesamt. Neu gibt
sie die Schlüssel dieser Vermerke zurück (`zurueck`). Nach einer **gelungenen** Anmeldung löscht `entlasten(art, kennung, b)`
genau diese Vermerke — nie die anderer Versuche. Folgen:

* Eine Welle gelungener Anmeldungen belegt weder `ziel` (40 je Betrieb) noch `gesamt` (400).
* Fehlversuche bleiben gezählt, ein Erfolg dazwischen löscht sie nicht (Test, Mutant M3).
* Gleichzeitige, noch nicht entschiedene Versuche zählen bis zum Ergebnis mit; mehr als 40 in derselben Sekunde in
  *denselben* Betrieb sehen daher eine kurze Bremse. Bei 35 ms je Anmeldung und seriellem Eintreffen am Server ist das
  eine Größenordnung über jeder beobachteten Welle (Lauf WP-28: 8 parallele Anmelder).
* Dieselbe Rücknahme für das Konto-Anmelden (`anmelden-konto`, `anmeldung.mjs`); die Notbremse (prozesslokal) nahm
  gelungene Anmeldungen schon vorher zurück (`notentlasten`).

## 4. Der Schutz gegen Missbrauch bleibt

| Schutz | Stand |
|---|---|
| Fehlversuche je Herkunft: 8 je 5 min, steigende Sperre | unverändert (`GRENZEN.anmelden`), Test „acht … der neunte gebremst“ |
| Fehlversuche je Betrieb (`ziel` 40) und dienstweit (`gesamt` 400) | unverändert für Fehlversuche; Mutanten M2/M6 (Vermerk bei Ziel/Gesamt fehlt) machen Tests rot |
| Notbremse (prozesslokal, ohne Ablage) | unverändert (`notbremse`, `notentlasten`) |
| Fail-closed der Hauptbremse (WP-46): Ablagefehler → gesperrt bzw. Prozesszähler | unverändert; die Lastbremse hängt nicht an der Ablage |
| Falsche Codes in einen Betrieb zählen bei `ziel` nur, wenn der Code existiert | unverändert (ein unbekannter Code hat kein Ziel) |
| Zweiter Faktor, Einrichten, Zugänge, Registrierung | unverändert |

**Neu zu beachten:** Wer einen **gültigen** Code hat, kann durch viele gelungene Anmeldungen die Lastgrenze seines Betriebs
(1000 je 5 min) erreichen und für 60 s weitere Anmeldungen dieses Betriebs verzögern. Vorher
begrenzte die Betriebsgrenze „ziel“ (40 je 5 min, auch gelungene Anmeldungen) das ebenfalls — nur eben so eng, dass sie
ehrliche Nutzende traf (WP-28 Befund 3). Die Herkunft wurde schon vorher durch Erfolge entlastet.
Jetzt ist es begrenzt, sichtbar (`429-last`) und endet nach 60 s. Ein gültiger Code ist ohnehin ein Zugang.

**Nach den Review-Auflagen (Abschnitt 9):** Ein einzelner Code kann die Betriebsgrenze nicht mehr erreichen — vorher greift
die Grenze **je Code** (20 je 5 min). Dafür bräuchte es ≥ 50 gültige Codes desselben Betriebs. Eine Abweisung an einer
Lastgrenze entlastet die **Herkunft nicht mehr** (vorher bei der Betriebsgrenze: volle Entlastung wie bei einem Erfolg);
zurückgenommen werden nur die Vermerke dieses Versuchs bei Ziel und Gesamt und der Gesamtzähler der Notbremse.

## 5. Tests

`npm run pruefung:bremse-wp47` (im CI-Schritt „Bremsen im Echtbetrieb (WP-47)“ und im Gesamtlauf `npm run pruefung`):

| Datei | Prüfungen |
|---|---|
| `pruefungen/bremse-wp47.test.js` (24, davon 5 aus Abschnitt 9) | Gelungene Anmeldungen (30 in einen Betrieb bei Grenze 5) alle frei; danach Fehlversuche weiter gebremst (Ziel); Erfolg dazwischen löscht Fehlversuche nicht; Gesamtgrenze (40 Erfolge frei, 12 Fehlversuche, der 13. gebremst); Herkunft 8/9 unverändert; Altaufruf ohne Vermerke; Stempeln je Person (11. gebremst, andere Person frei); Kennung ohne Klartext; Raumdeckel (n frei, dann Sperre, nach Ablauf frei); **Lastbremse schreibt nichts in die Ablage**; Stufen 900/240/200 und Schichtwechsel-Rechnung; **HTTP:** Schichtwechsel mit 130 Personen eines Betriebs alle 200, danach PUT der Planung 200; je Person 429 mit Retry-After und `429-last`; Raumdeckel 429 und nichts gestempelt; Anmeldewelle 40 Anmeldungen bei Betriebsgrenze 10 alle 200; danach zurückgezogene Zugänge: 10 × 403, der 11. 429; falsche Codes 8 × 401, der 9. 429; Lastgrenze gelungener Anmeldungen (200, 200, 200, 429, 429, keine Sitzung) |
| `pruefungen/stempel-429-client.test.js` (7, davon 3 aus Abschnitt 9) | Wiederholung nach Retry-After und Erfolg beim dritten Versuch; Wartezeit höchstens 15 s; nach drei 429 die ehrliche Meldung „NICHT erfasst“; andere Fehler werden nicht wiederholt |
| `pruefungen/gesund.test.js` | `429-last` ab 20 → Warnung, vorher ok, nach dem Fenster wieder ok; Art-Liste |

Die Tests mit Grenzwerten verkleinern sie vorübergehend (`WEITERE.anmelden.*`, `GRENZEN["anmelden-erfolg"]` sind Objekte,
die der Test ändert und zurücksetzt); die Mechanik ist dieselbe.

**Mutanten** (jeweils einzeln eingebaut, die genannten Tests liefen rot, danach zurückgenommen):

| # | Mutant | Rot |
|---|---|---|
| M1 | `entlasten` nimmt die Vermerke nicht zurück | 4: „30 gelungene“, „Fehlversuche weiter“ (Folge), Anmeldewelle, zurückgezogene Zugänge |
| M2 | **Fehlversuche bei Ziel nicht mehr gezählt** | 3: Fehlversuche weiter gebremst, Erfolg löscht sie nicht, zurückgezogene Zugänge |
| M3 | Erfolg löscht alle Vermerke des Ziels (statt der eigenen) | 1: „Erfolg dazwischen nimmt Fehlversuche nicht zurück“ |
| M4 | Stempeln zählt wieder über `schreiben` je Raum | 2: Schichtwechsel (130), je Person |
| M5 | Raumdeckel entfernt | 1: Raumdeckel schützt |
| M6 | **Fehlversuche bei Gesamt nicht mehr gezählt** | 1: Gesamtgrenze |
| M7 | Lastgrenze gelungener Anmeldungen entfernt | 1: Lastgrenze |

Regression: `bremse-lokal`, `anmeldung-http`, `accountanmeldung`, `herkunft-xff`, `betreiber-zweifaktor`, `gesund`, `doku`,
`geo`, `istdaten`, `dsgvo-server`, `datenintegritaet` laufen grün; `datenintegritaet` R1 (50 gleichzeitige Stempel) ist auf dem Laptop **unter paralleler Last** zeitabhängig (bekannt aus
WP-12, B-3) und einzeln grün. Der Notbremse-Zählertest in `anmeldung-http` („lässt gelungene Anmeldungen nicht auf die
Gesamtgrenze zählen“) war im ersten Parallellauf um eine Runde daneben (139 statt 138, 142 statt 141) und im Lauf danach
grün; vermutet wird das gleitende Fenster bei langsamem Rechner, nicht weiter untersucht — die CI auf Linux entscheidet.

## 6. Linux-CI: Lasttest-Szenarien Schichtwechsel und Anmeldewelle

Wiederholt wurden S1 (Schichtwechsel, 200 Stempel/min über 10 min auf zwei Betriebe, dazu **ein Betrieb mit 200 Stempeln/min**)
und S4 (Anmeldung mit Bremse; Phase A: 277 gültige Codes in **einen** Betrieb, Phase B: 455 über 13 Betriebe) mit
`werkzeug/last/lauf.mjs --profil voll --nur S1,S4` auf einem Linux-Runner. Ergebnis: Abschnitt 7. Der Lasttest-Workflow selbst liegt weiter nur auf dem Branch von WP-28; der Lauf entstand über einen temporären
Branch (`acc45/security/wp47-lasttest-tmp`, nicht zu integrieren) mit einem Push-Auslöser.

## 7. Ergebnis des Linux-Laufs

Lauf auf Linux-Runner (AMD EPYC 9V45, 4 vCPU, 16 GB, Node 22; Run 41619667917, Stand 18a9d8b = WP-47 4f0739c + WP-28),
Profil `voll`, S1 und S4; Rohdaten: [`wp47-rohdaten/ci-s1-s4-nach-wp47.json`](wp47-rohdaten/ci-s1-s4-nach-wp47.json).
Der Runner-Typ weicht von den WP-28-Läufen ab (andere CPU); die Streuung zwischen Runnern war dort 456 / 988 ms.

| Messung | WP-28 (vorher, Linux) | WP-47 (nachher, Linux) |
|---|---|---|
| Schichtwechsel 200/min × 10 min, 2 Betriebe à 1000: Fehlerquote | 0 % | 0 % (2000/2000 × 200) |
| … p50 / p95 / p99 | 268–367 / **456–988** / 508–1410 ms | 158 / **282** / 330 ms |
| … verlorene Stempel | 0 | 0 |
| **Ein Betrieb, 200 Stempel in einer Minute** | **120 × 200, 80 × 429 (40 %)** | **200 × 200, 0 × 429**; p95 150 ms |
| Anmeldewelle: gültige Codes in **einen** Betrieb (Betriebsgrenze 40) | 40 × 200, 237 × 429 (von 277) | **285 × 200, 0 × 429** |
| Anmeldung über 13 Betriebe (455), Gesamtgrenze 400 | 351–354 × 200, 101–104 × 429 | **455 × 200, 0 × 429** |
| Rateversuche einer Herkunft (30 falsche Codes) | 8 × 401, ab dem 9. 429 | 8 × 401, ab dem 9. 429 (22 × 429) — **unverändert** |

Die Schichtwechsel-Last blieb dabei ohne Fehler und mit p95 unter dem Zielwert von 500 ms (Testplan 3.6); wegen der
Streuung zwischen Runnern ist das ein Lauf, keine Zusage.

## 8. Backlog und Folgepunkte

1. **Lesebremse nach Bestandsgröße (WP-28 Befund 5) — Backlog „WP-47b“.** Nicht sauber begründbar: Die gemessene Kenngröße ist
   die **Antwortgröße**, und gemessen wurde ein einziger Punkt (4,6 MB ≈ 0,4 s Rechenzeit, ein Kern bei ≈ 200 Antworten/min).
   Eine Grenze je Raum nach Größe ließe sich nur auf diesen Punkt und eine lineare Annahme stützen, und die eigentliche Grenze
   ist der **gemeinsame** Kern: Mehrere große Betriebe zusammen überlasten ihn, auch wenn jeder unter seinem Raumlimit
   bleibt. Sauber wäre ein prozessweites Budget für Antwortbytes (z. B. MB je Sekunde) mit Antwort 429/503 und Retry-After,
   dazu gemessen an 3–4 Größen. Bis dahin: Betriebe über ≈ 2000 Personen sind laut WP-28 ohnehin nicht Ziel der Dateiablage.
2. **P3 `ENOENT` in `quelleAnsehen` (`werkzeug/ablage-sicherung.mjs`, WP-04):** `stat` auf eine zwischen `readdir` und
   `stat` ersetzte Datei bricht die Sicherung mit `ENOENT` ab, statt in die Wiederholungsschleife (3 Versuche) zu gehen
   (unter Windows unter Last in allen Läufen beobachtet). Vorschlag: `ENOENT` dort wie eine Änderung behandeln und neu
   versuchen. Nicht Teil dieses Pakets.
3. **`zeit-bestaetigen` (Beschäftigte bestätigen Zeiten) zählt weiter über `schreiben` je Raum.** Es ist keine Schichtwechsel-
   Spitze (Tag danach, einzeln); sollte es zur Spitze werden, zeigt `429-last`/das Protokoll es nicht, weil es hier nicht
   mitzählt. Falls gewünscht: dieselbe Lastbremse je Person.
4. **429 an anderen Stellen der Oberfläche:** Wiederholt wird nur das Stempeln. Alle anderen Aufrufe zeigen den Satz des
   Servers („Bitte in … erneut versuchen“). Ein Offline-Stapel (WP-07) existiert in diesem Stand nicht; er sollte 429 wie
   hier behandeln (Retry-After abwarten, nicht verwerfen).
5. **Stempelzeit bei Wiederholung:** Die Zeit ist die des Servers beim Eintreffen; nach zwei Wiederholungen bis ≈ 36 s
   später als das Tippen (2 × 15 s + 20 % Streuung). Für Schichtwechsel unerheblich, für Minutengenauigkeit im Streitfall zu erwähnen.
6. **Raumgröße:** Der Deckel kennt die Personenzahl erst nach dem ersten Zugriff seit dem Start (davor 240/min). Bei einem
   1000-Personen-Betrieb direkt nach einem Neustart und einer Spitze in der ersten Sekunde gilt kurz 240 statt 900;
   die erste Anfrage setzt die Größe, danach greift 900.
7. **Mehr als eine Instanz:** Die Lastbremse zählt je Prozess. Mit mehreren Instanzen wäre jede für sich zuständig — wie die
   Raumsperre. Für den vorgesehenen Betrieb (eine Instanz) ohne Folge.

## 9. Review-Auflagen (Opus-Review: integrierbar mit Auflagen)

Stand: Merge von `integration/centric-complete` (442527b) in den Branch (A1), danach ein Commit mit Tests und Umsetzung.
Für jeden Punkt liefen die neuen Tests **zuerst rot** gegen den Stand vor der Umsetzung (8 von 31 rot in
`bremse-wp47` + `stempel-429-client`, jeweils aus dem erwarteten Grund), danach grün.

| Auflage | Umsetzung | Test (rot vorher → grün) |
|---|---|---|
| **A1** Merge Integrationsstand | Einziger Konflikt `package.json`, Sammelzeile `pruefung`: Schritte **vereinigt** — Branch 91, Integration 92 (neu: `acc45-werkzeuge`, `wiederherstellen-ui`), Ergebnis **93** (`bremse-wp47` direkt nach `bremse-lokal`), keine verloren, keine doppelt | – |
| **M1** Lastgrenze je Betrieb von einem Code ausschöpfbar | Neue Lastgrenze `anmelden-code` (20 je 5 min, Sperre 300 s) je Code (`kennungCode(fund.schluessel)`, Hashwert) **vor** der Betriebsgrenze. Abweisung: nur die eigenen Ziel-/Gesamtvermerke zurück (`vermerkeZuruecknehmen`) und der Gesamtzähler der Notbremse (`notentlasten(…, { nurGesamt: true })`); die **Herkunft bleibt gezählt**. Dasselbe jetzt auch an der Betriebsgrenze (vorher volle Entlastung) | „ein Code in der Schleife sperrt nur sich selbst“: 60 Anmeldungen eines Codes (Betriebs- und Zielgrenze auf 30 verkleinert) → 20 × 200, 40 × 429 mit Retry-After ohne Sitzung; danach anderer Code und Leitung desselben Betriebs 200. „Abweisung je Code entlastet die Herkunft nicht“: 8 Abweisungen aus einer Adresse, danach bremst `bremse("anmelden")` diese Herkunft |
| **M2** Jede 429 der Stempel-Lastbremse schrieb eine Protokolldatei | `lastbremse` meldet `neu: true` nur für die Abweisung, die die Sperre setzt; nur dann `protokoll(…)`. `ereignis("429-last")` weiter bei jeder. Gleich bei den Lastgrenzen der Anmeldung | 40 Stempel einer Person bei festgehaltener Uhr → 30 × 429, **genau 1** Protokollzeile „stempeln (Person)“, `429-last` = 30 |
| **M3** Lastgrenze der Anmeldung nach `bestandLesen` | Beide Lastgrenzen vor `bestandLesen`; Kennung des Betriebs aus dem Konto `bestand|mandantId` statt aus der Bindungsprüfung | Betriebsgrenze 2: der dritte Code bekommt 429, und `bestandLesen` wird für den Raum **nicht** aufgerufen (gezählt über `vi.mock` mit unveränderter Funktion) |
| **M4** Sperre 30 s länger als die Wartezeit des Clients (15 s); keine Streuung | Sperre je Person **15 s**. Client: `wartezeitMitStreuung` = Retry-After (≤ 15 s) × (1 + 0,2 × Zufall) — nie kürzer als Retry-After, höchstens 20 % länger (vorher fest + 0–1 s) | Server: `GRENZEN.stempeln.sperre ≤ 15`, nicht steigend; Client: 10 s → 10 000/11 000/≤ 12 000 ms, an der Obergrenze 16 500 ms; `stempeln` wartet mit Streuung (≈ 12 s bei Zufall ≈ 1) |
| **N1** Stempelknopf während der Wiederholung wieder frei | Stempeluhr und mobile Stempelfläche: `Promise.resolve(akt.stempeln(…)).finally(() => setLaeuft(false))` | Quelltextprüfung (wie die übrigen Oberflächenprüfungen): kein `akt.stempeln(…); setLaeuft(false)`, zwei Stellen mit Warten |
| **N4** 130-Personen-Schichtwechseltest zeitabhängig | Uhr festgehalten (`imFrischenFenster`, nur `Date`), Stempeltag aus der festgehaltenen Uhr; der Test prüft, dass die Uhr stillstand | Gegen den Stand vor WP-47 (Stempeln über `bremse("schreiben")`) **rot**: alle 130 im selben Fenster, ab dem 121. 429 |

**Brute-Force-Schutz:** nicht abgeschwächt. Herkunft 8/5 min, Ziel, Gesamt, Notbremse und Fail-closed unverändert; entlastet
wird die Herkunft weiterhin **nur bei Erfolg** (an den Lastgrenzen jetzt strenger als vorher, Test oben). Die bestehenden Tests
„acht … der neunte gebremst“, „Fehlversuche weiter gezählt“, „Gesamtgrenze“ bleiben unverändert grün.

**Mutanten** (einzeln eingebaut, gezielter Test, danach zurückgenommen; alle getötet):

| # | Mutant | Rot |
|---|---|---|
| R1 | Grenze je Code entfernt | M1 (beide Tests) |
| R2 | Grenze je Code mit voller Entlastung (`entlasten` + `notentlasten`) statt nur Vermerken | M1 Herkunft |
| R3 | Grenze je Code ohne Rücknahme der Vermerke | M1 Schleife (Ziel des Betriebs füllt sich) |
| R4 | Grenze „je Code“ zählt je Betrieb | M1 Schleife |
| R5 | Protokoll bei jeder 429 | M2 |
| R6 | `lastbremse` meldet auch bei bestehender Sperre `neu` | M2 |
| R7 | `bestandLesen` vor der Lastgrenze | M3 |
| R8 | Sperre je Person wieder 30 s | M4 Server |
| R9 | Client ohne Streuung (fest + 0–1 s) | M4 Client |
| R10 | Streuung verkürzt die Wartezeit | M4 Client (3 Tests) |
| R11 | mobile Stempelfläche gibt den Knopf sofort frei | N1 |
| R12 | Stempeln wieder über `bremse("schreiben")` (Stand vor WP-47) | N4 Schichtwechsel (130) |

Gezielte Tests nach der Umsetzung: `bremse-wp47` (24), `stempel-429-client` (7), `gesund`, `accountanmeldung`,
`anmeldung-http` — 5 Dateien, 177 Tests grün.
