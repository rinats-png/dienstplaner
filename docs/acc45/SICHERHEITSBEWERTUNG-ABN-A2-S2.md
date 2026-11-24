# Sicherheitsbewertung ABN-A2 / ABN-S2 (BL-16, ENTSCHEIDUNGSLISTE P1-6)

Stand: 2026-11-24 · Umfangsklasse SICHERHEIT-QUALITAET · Bewertung und Vorschlag, **keine Betreiberentscheidung**

| | |
|---|---|
| Basis | `integration/release-v4` @ `09ca5a2c` |
| Kandidat | `release/rc-2026-11-22` @ `517993ca` (PR #489) — in diesem Paket **unverändert** |
| Produktion (Repo-Stand) | `main` @ `a5b49709` |
| Vorarbeit | `ABNAHME-V4-A2-RISIKOBEWERTUNG.md` (#282, Stand 2026-11-13, Basis `ca45a0a2`, Vergleich mit PR #277) |
| Neue Prüfungen | `pruefungen/abn-a2-s2-sicherheit.test.js` (echte Handler, echte Grenzwerte, feste Uhr, nur Testdaten) |
| Behebung in diesem Paket | ABN-A2 Kernfehler: eigener Commit, nur `server/funktionen/einladung.mjs` (Reihenfolge Rolle → Zähler; **keine** Grenzwertänderung) |
| Gate-Wirkung | G9 (`werkzeug/release-pruefung.mjs`, `g9Befunde`): ABN-A2 und ABN-S2 bleiben P1/BLOCKED, bis der Koordinator den SSOT-Status ändert oder der Betreiber sie in `akzeptierteBefunde` mit `grund` annimmt |

Die Anforderungen aus P1-6 sind: (a) konkrete Grenzwerte, (b) Angriffsbedingungen, (c) Auswirkung, (d) Alternativen, (e) Negativtests. Abschnitt 3 und 4 decken (a) bis (c), Abschnitt 5 (d), Abschnitt 6 (e).

Zeilenangaben beziehen sich auf den Kopf dieses Branches. Wo der Kandidat abweicht, steht es dabei.

---

## 0. Kurzfassung

| | ABN-A2 (Einladungsbremse) | ABN-S2 (Anmeldeflut, S-2) |
|---|---|---|
| Befund | `POST /api/einladung` zählte **vor** der Rollenprüfung gegen `zugaenge` je Raum und gegen die installationsweite Gesamtgrenze (40/10 min). Diese Gesamtgrenze teilen das Zurückziehen von Zugängen und die Betreiberwege. | Eine Flut falscher Zugangscodes aus vielen Herkünften füllt `anmelden:gesamt` (400/5 min) und den Dienst-Deckel (1200/5 min). |
| Angreifer | jede angemeldete Person, auch Beschäftigte, SV, Betriebsrat, Demo | jeder, ohne Konto; ≈ 45 bzw. ≈ 134 Herkunftsgruppen (IPv4-Adresse oder IPv6-/64) |
| Wirkung | eigener Betrieb: Einladen **und** Zurückziehen 30 min (steigend) gesperrt; mit 4 Betrieben: installationsweit Einladen, Zurückziehen und Betreiberwege ≤ 10 min, erneuerbar | Stufe 1: Betreiber-Neuanmeldung und Einlösen 429; Stufe 2: zusätzlich jede Zugangscode-Anmeldung; je ≤ 5 min, erneuerbar |
| Vertraulichkeit/Integrität | nicht betroffen | nicht betroffen (getestet: kein Zugang, kein Orakel) |
| Kandidat `517993ca` / Produktion `a5b49709` | Fehler vorhanden (gleicher Code) | Befund vorhanden (gleicher Code) |
| Schweregrad (vorher) | **Mittel** | **Mittel** |
| Wahrscheinlichkeit | Mittel (Innentäter mit niedrigster Rolle genügt) | Niedrig bis mittel (Herkunftspool nötig; IPv6 billig) |
| Ergebnis dieses Pakets | **BEHOBEN** im Kern (Commit 2); Restrisiko R-A2-1 (Niedrig) und R-A2-2 (Bedienung) bleiben | **nicht behoben**; minimaler Fix beschrieben (S2-b, S2-a) |
| Empfehlung | **BEHEBEN** (dieser PR) + Restrisiko annehmen bis zur Entscheidung über #277/X1 | **TEILWEISE**: für den Pilot Form I mit Auflagen annehmen; S2-b als kleiner Folge-PR, S2-a als eigenes Paket |

---

## 1. Was die Befunde konkret sind (nur Repo-Belege)

### 1.1 ABN-A2

- SSOT: `docs/acc45/work-packages.json`, Eintrag `ABN-A2` (P1, BLOCKED): „Einladungsbremse sperrt die Leitung nicht mehr aus (PR #277 angehalten)“. Betreiber 2026-11-14: #277, S-1, S-2 und X1 bleiben gesperrt bis zu dieser Bewertung.
- Abnahme: `pruefungen/abnahme-a-ablauf.test.js` Test 2.4 hielt den Fehler fest („Nach zehn Einladungsversuchen im Raum ist auch die Leitung gesperrt (429) — auch durch Absagen anderer Rollen verbraucht“).
- Code im Kandidaten (`517993ca`) und in `main`: `server/funktionen/einladung.mjs:107` wählt für `/api/einladung` die Art `zugaenge`; `leitungSitzung` zählt sie in Zeile 76 **vor** `einladungRechtePruefen` (Zeile 116). Kennung `kennung(req, s)` = `s:<Raum>` (`server/lib/schutz.mjs:502-505`).
- Grenzwerte: `GRENZEN.zugaenge` 10 je 600 s, Sperre 1800 s steigend bis 86 400 s, fail-closed (`schutz.mjs:321`); `WEITERE.zugaenge.gesamt` 40 je 600 s (`schutz.mjs:479`).
- Dieselbe Art zählt: Zurückziehen durch Leitung und Betreiber (`server/funktionen/daten.mjs:581`), Betreiberwege `/api/zugaenge` (382), Raumweg (500), Übersicht (550).

### 1.2 ABN-S2

- SSOT: Eintrag `ABN-S2` (P1, BLOCKED): „Flut aus ca. 45 Herkünften sperrt Betreiber-Neuanmeldung und Einladungseinlösung; bei etwa 134 Herkünften auch Leitungen mit gültigem Code“. Vorbestehend, nicht durch die Abnahme V4 eingeführt.
- Code: `POST /api/anmelden` zählt Fehlversuche in `bremse("anmelden", k, zielRaum)` (`daten.mjs:992`); `POST /api/einladung/annehmen` zählt dieselbe Art ohne Ziel (`einladung.mjs:174`).
- Grenzwerte: `GRENZEN.anmelden` 8 je 300 s, Sperre 300 s steigend bis 7200 s (`schutz.mjs:318`); `WEITERE.anmelden` Ziel 40, **Gesamt 400** je 300 s (`schutz.mjs:477`); `NOTGRENZEN.anmelden` 20 je Herkunft, 400 gesamt (`schutz.mjs:1341`); `SPERRVERSUCHE` 8 je Sperre, **Dienst-Deckel 1200** je 300 s (`schutz.mjs:1476-1491`).
- SI-P7-Durchlass: Ein nutzbarer Code (kein Betreiber) geht an Herkunftssperre, Betriebs- und Gesamtgrenze vorbei (`daten.mjs:964-986`), solange der Dienst-Deckel nicht gerissen ist (`gueltigeDurchlassen`, `schutz.mjs:1558-1562`). Betreibercodes nie (`daten.mjs:972`, `eintragV.rolle !== "betreiber"`).
- Kein Ratenlimit vor dem Dienst im Repo (`deploy/` enthält keine Proxy-Ratenbegrenzung; `git grep -i "rate_limit\|limit_req" -- deploy` leer).

---

## 2. Bedrohungsmodell

| Akteur | Fähigkeit | Ziel |
|---|---|---|
| T1 Innentäter niedriger Rolle (Beschäftigte, SV, Betriebsrat, Planung) oder Demo-Besucher | gültige Sitzung in einem oder mehreren Betrieben | Verwaltung stören: Einladen und Zurückziehen blockieren |
| T2 böswillige oder übernommene Leitung | Leitungssitzungen in ≥ 2 bzw. ≥ 4 Betrieben | dasselbe, mandantenübergreifend |
| T3 unangemeldeter Angreifer | Herkunftspool (Botnetz, Proxy-Pool, IPv6-Präfix /56 = 256 × /64) | Betreiber aussperren, Einlösen und Code-Anmeldung verhindern |

Schutzgüter: Verfügbarkeit von Einladen, **Zurückziehen eines Zugangs** (Reaktion auf einen kompromittierten Code), Betreiber-Neuanmeldung, Einlösen. Nicht betroffen: Vertraulichkeit und Integrität der Betriebsdaten (kein Weg erteilt Zugang oder verrät Codes; Abschnitt 6).

Annahmen: ein Prozess je Ablage (`prozesssperre.mjs`), Zähler in der Ablage bzw. im Prozessspeicher; kein Reverse-Proxy-Ratenlimit.

---

## 3. ABN-A2

### 3.1 Angriffsbedingungen und Ablauf (vor der Behebung)

1. **Ein Betrieb (T1):** eine Beschäftigte ruft `POST /api/einladung` 11-mal auf. Jede Antwort ist eine Rollenabsage (403), aber jeder Aufruf zählt gegen `zugaenge:s:<Raum>`. Nach dem 11. Aufruf: Raum 1800 s gesperrt, steigend. Folge: Die Leitung kann nicht einladen und **nicht zurückziehen** (gleicher Raumzähler, `daten.mjs:580-581`).
2. **Installationsweit (T1):** je eine Sitzung niedriger Rolle in 4 Räumen, je 11 Aufrufe ⇒ ≥ 40 in `zugaenge:gesamt`. Folge für **alle anderen Betriebe** und den Betreiber: Einladen, Zurückziehen, `/api/zugaenge`, Raumweg und Übersicht 429 bis Fensterende (≤ 600 s), erneuerbar.
3. Kosten: 44 Anfragen, Sekunden. Spur: Protokoll `einladung · abgewiesen` mit Rolle und Person.

Belegt durch die neuen Prüfungen A2-1, A2-2, A2-4 (rot auf `09ca5a2c`, Abschnitt 6).

### 3.2 Behebung (Commit 2 dieses PR, `server/funktionen/einladung.mjs`)

- Vor der Rollenprüfung zählt `/api/einladung` nur noch `schreiben` je **Person** (`kennungPerson`, `schutz.mjs:514`; 120 je 60 s, Sperre 60 s, keine Gesamtgrenze, `schutz.mjs:346`) — reine Lastgrenze (`einladung.mjs:80`).
- Nach der Rollenprüfung (`einladung.mjs:122`) zählt `zugaenge` je Raum wie bisher (`einladung.mjs:132`), **vor** der frischen Bestätigung (`einladung.mjs:135`). Zahlen, Sperre, Steigerung, fail-closed, Gesamtgrenze: unverändert.
- Was sich **nicht** ändert: Kein Geheimnis wird vor der Rollenprüfung verglichen (N-1); der Rateschutz für Nachweise (Zugangscode, Passwort, Faktor) ist derselbe Zähler mit denselben Zahlen (Prüfung A2-3); der Faktorzähler `zweifaktor` bleibt; alle anderen Wege unverändert.
- Was die Behebung **nicht** ist: Sie ist nicht PR #277. Keine Lockerung von Grenzwerten, kein neuer Zähler je Person für Nachweise, keine Entlastung, X1 nicht umgesetzt. Der Commit ist einzeln entfernbar.

### 3.3 Restrisiko nach der Behebung

| # | Restrisiko | Bedingung | Wirkung | Schwere |
|---|---|---|---|---|
| R-A2-1 | Leitungen aus ≥ 4 Räumen füllen `zugaenge:gesamt` | T2: Leitungssitzungen in 4 Betrieben (je ≤ 11 Beiträge); Betriebe legt nur der Betreiber an, Selbstregistrierung ist aus | wie 3.1 Nr. 2: Einladen, Zurückziehen, Betreiberwege ≤ 600 s, erneuerbar; namentlich protokolliert | **Niedrig** (Prüfung A2-5 hält es fest) |
| R-A2-2 | Die Leitung sperrt sich selbst nach 10 eigenen Aufrufen je Raum und 10 min (mit Rückfrage etwa 5 Einladungen) | Bedienung, kein Angriff | Einrichten eines Betriebs langsam; Umweg Betreiber `/api/zugaenge` (bis 20 je Aufruf) | Bedienung (Test 2.4) |
| R-A2-3 | Eine übernommene Leitung sperrt durch eigene Aufrufe Einladen und Zurückziehen des **eigenen** Raums | T2 in einem Betrieb | eigener Betrieb 1800 s steigend; Betreiber kann zurückziehen, solange R-A2-1 nicht zugleich läuft | Niedrig (wie vorher, keine Verschlechterung) |

R-A2-1 und R-A2-2 sind genau der Gegenstand von #277 und X1 (Abschnitt 5). Die Behebung macht beides nicht schlechter.

### 3.4 Einstufung

- Vorher: **Mittel** — Verfügbarkeit einer Sicherheitsfunktion (Zurückziehen), mandantenübergreifend, schon mit der niedrigsten Rolle.
- Nachher: **Niedrig** (R-A2-1) — braucht Leitungsrechte in 4 Betrieben.

---

## 4. ABN-S2

### 4.1 Angriffsbedingungen und Ablauf

Keine Sitzung, keine Rolle, kein Wissen über Codes. Nur Herkunftsgruppen.

1. **Stufe 1:** 45 Herkünfte × 9 falsche Codes = 405 Anfragen ⇒ `anmelden:gesamt` ≥ 400. Je Herkunft zählen 9 (8 freie + der 9., der sperrt).
2. **Stufe 2:** ≥ 134 Herkünfte × bis zu 17 Anfragen ⇒ mehr als 1200 Sperrversuche ⇒ Dienst-Deckel gerissen, `gueltigeDurchlassen` falsch für alle bis Fensterende. Ein gültiger Code wartet nur, wenn zugleich `anmelden:gesamt` voll ist; bei einer echten Flut dieser Größe ist das immer der Fall (S2-3 belegt die Bedingung).
3. Dauer je Füllung ≤ 300 s (gleitend etwas länger), erneuerbar mit frischen Herkunftsbeiträgen. Eine Herkunft liefert erst nach ihrer Sperre wieder Beiträge (300 s, dann steigend).

### 4.2 Auswirkung (gemessen mit den neuen Prüfungen S2-1 bis S2-3)

| Funktion | Stufe 1 | Stufe 2 |
|---|---|---|
| Betreiber neu anmelden (gültiger Code) | **429** | **429** |
| Leitung/Beschäftigte mit gültigem Zugangscode | 200 (SI-P7) | **429** |
| Einladung einlösen (gültiges Token) | **429** | **429** |
| bestehende Sitzungen (Lesen) | 200 | 200 |
| Kontoanmeldung (E-Mail/Passwort, eigene Art `anmelden-konto`, `schutz.mjs:421`, 493) | frei (anderer Zähler; nicht in diesem Paket erneut geprüft) | frei (dto.) |
| Zurückziehen eines Zugangs | nur mit Sitzung < 20 min (`daten.mjs:208`, 579) | dto. |
| Nach Fensterende | alles frei, Einladung nicht verbraucht | alles frei |

Grenzen des Angriffs (getestet): eine einzelne Herkunft (80 Fehlversuche) sperrt nur sich selbst; kein Fehlversuch erzeugt eine Sitzung; alle 401-Antworten tragen denselben Text (kein Orakel).

### 4.3 Bestehende Gegenmaßnahmen

`schutz.mjs:318` (Herkunft 8/300 s steigend), `:477` (Gesamt 400), `:1341` (Notgrenze im Prozessspeicher), `:1476-1491` (Sperrversuche, Dienst-Deckel), `:650-659` (IPv6 je /64), `daten.mjs:964-986` (SI-P7-Durchlass), `:1131` (zweiter Faktor für Betreibercodes; schützt vor Übernahme, nicht vor Verzögerung), Protokoll `anmelden · gebremst (gesamt)` (`daten.mjs:998`). `herkunftErlaubt` (`schutz.mjs:747-761`) lässt Anfragen ohne `Origin` zu — kein Schutz gegen Skripte (gewollt).

### 4.4 Einstufung

**Mittel.** Unangemeldet, billig mit IPv6, wiederholbar. Trifft die Handlungsfähigkeit des Betreibers ohne offene frische Sitzung und das Onboarding (Einlösen). Gemildert: keine Wirkung auf bestehende Sitzungen, kein Datenabfluss, zeitlich auf Fenster begrenzt.

### 4.5 Warum nicht in diesem Paket behoben (SICHERHEITSBEFUND)

Kein Fix ist klein **und** ohne neue Grenzwertentscheidung:

- **S2-b (klein, empfohlen als Folge-PR):** `POST /api/einladung/annehmen` auf eine eigene Art (z. B. `einladung-annehmen`, je Herkunft 8/300 s steigend, eigene Gesamtgrenze) statt `anmelden`. Das Token hat 256 Bit und ist nicht ratbar. Wirkung: Einlösen unabhängig von der Anmeldeflut; die Einlöseflut füllt `anmelden:gesamt` nicht mehr. Ändern: `einladung.mjs:174`, `GRENZEN`/`WEITERE` in `schutz.mjs`; Prüfung S2-2 kehrt für das Einlösen um. Braucht die Zahl für die neue Gesamtgrenze → Betreiberentscheidung.
- **S2-a (mittel, eigenes Paket mit Review):** Gültiger Betreibercode an `anmelden:gesamt` vorbei wie SI-P7; der zweite Faktor bleibt Pflicht und behält seine Bremse je Geheimnis. Berührt die SI-P7-Gleichzeitigkeitslogik (`sperrAuswertungenAbwarten`) — eigenes Sicherheitsreview nötig.
- **S2-d (Betrieb):** Ratenbegrenzung je IP im Reverse-Proxy und Alarm auf `anmelden · gebremst (gesamt)`. Außerhalb dieses Repos bzw. in `deploy/` (hier gesperrt).

---

## 5. Alternativen

| # | Alternative | Wirkung | Nachteil | Aufwand |
|---|---|---|---|---|
| A2-Fix | Rolle vor Zähler (dieser PR) | T1 entfällt vollständig | R-A2-1/-2 bleiben | klein (umgesetzt) |
| #277 | Zähler je Person, eigene Grenzen für Ausstellen und Nachweise, `zugang-sperren` je Betrieb | zusätzlich R-A2-2 behoben; Zurückziehen unabhängig von Einladungen | lockert Grenzen; S-1 (Nachweis-Gesamtgrenze) neu; Basis veraltet (`ca45a0a2`), muss neu aufgesetzt werden | mittel |
| X1 | in #277: Gesamtgrenze für Nachweise streichen | S-1 entfällt | keine installationsweite Summe für Fehlversuche | klein (auf #277) |
| X-Z | `zugang-sperren` aus der Gesamtgrenze `zugaenge` herauslösen (eigene Art je Betrieb, Zahlen wie heute) | R-A2-1 trifft das Zurückziehen nicht mehr | Entscheidung über Grenzwerte nötig | klein |
| X5 / S2-d | Alarm und Proxy-Ratenbegrenzung | Erkennung in Minuten | verhindert nichts im Fenster | klein (Betrieb) |
| S2-a, S2-b, S2-c, S2-e | siehe 4.5 und `ABNAHME-V4-A2-RISIKOBEWERTUNG.md` §1.2 | | | |

---

## 6. Negativtests (`pruefungen/abn-a2-s2-sicherheit.test.js`)

Echte Grenzwerte (die Datei hebt nichts an; der erste Test prüft die Zahlen). Feste Uhr: `Date` gefälscht, läuft mit; jeder Test beginnt kurz nach einem Fensterbeginn.

| Prüfung | Behauptung | `09ca5a2c` (vorher) | dieser PR |
|---|---|---|---|
| Grenzwerte | Zahlen in Abschnitt 1 stimmen | grün | grün |
| A2-1 | Beschäftigte, Planung, Betriebsrat je 12× → nur 403; Leitung desselben Betriebs lädt ein (200) und zieht zurück (≠ 429) | **rot** (429 ab dem 11. Aufruf) | grün |
| A2-2 | Beschäftigte in 4 Räumen je 12× → fremde Leitung lädt ein und zieht zurück, Betreiber zieht zurück | **rot** | grün |
| A2-3 | Rateschutz unverändert: Leitung mit älterer Anmeldung, falscher Code → 403 bis zur Sperre, dann 429 mit Retry-After > 1700 s; richtiger Code während der Sperre 429 | grün | grün |
| A2-4 | ohne Sitzung (401), gefälschtes Merkmal (401), Demo-Leitung (403) je 12× → echte Leitung lädt ein | **rot** (Demo füllte den Raumzähler) | grün |
| A2-5 | Restrisiko R-A2-1 festgehalten: Leitungen in 4 Räumen → fremde Leitung und Betreiber 429; nach dem Fenster frei | grün | grün |
| S2-1 | eine Herkunft, 80 Fehlversuche: 8 × 401, Rest 429, kein Token; Betreiber und Leitung von anderswo 200 | grün | grün |
| S2-2 | Stufe 1 (45 × 9): kein Token, ein Fehlertext; Betreiber 429, Einlösen 429 (Ist), Leitung 200, Sitzung liest; nach Fensterende Betreiber 200, Einlösen 200 | grün | grün |
| S2-3 | Stufe 2 (Dienst-Deckel gerissen UND `anmelden:gesamt` voll): 90 Herkünfte je 9 Sperrversuche direkt (810, Leitung noch 200), dann 45 Herkünfte × 17 über HTTP (405 in der Gesamtgrenze, 1215 Sperrversuche): Deckel gerissen, kein Token, Leitung 429 (Ist), Sitzung liest; nach Fensterende 200 | grün | grün |

Angepasst: `pruefungen/abnahme-a-ablauf.test.js` Test 2.4 hielt den alten Fehler fest. Neu: Rollenabsagen (3 Rollen je 12×) zählen nicht; die Leitung bekommt erst nach ihren eigenen zehn Aufrufen 429.

Lücken aus #282 §3.4: **G4 ist jetzt geschlossen** (S2-2, S2-3). G1, G2, G3, G5 betreffen den Code von #277 und bleiben dort offen; G6 unverändert (ein Prozess je Ablage).

---

## 7. Empfehlung

1. **ABN-A2: BEHEBEN.** Commit 2 dieses PR mergen (nach unabhängigem Sicherheitsreview). Danach bleibt R-A2-1 (Niedrig). Der Koordinator kann den SSOT-Status nach Review nachziehen; bis zu einer Entscheidung über #277/X-Z bleibt ein Restrisiko, das G9 nur über eine Annahme freigibt.
2. **ABN-S2: TEILWEISE.** Für den Pilot Form I (wenige, bekannte Betriebe, synthetische Daten) mit Auflagen annehmen: Betriebsregel S2-e (Betreiber meldet sich vor Eingriffen an und hält eine frische Sitzung) und S2-d (Alarm auf `anmelden · gebremst (gesamt)`, wenn möglich Proxy-Ratenbegrenzung). S2-b als kleiner Folge-PR vor Pilot Form II; S2-a als eigenes Paket.
3. #277 nicht in der heutigen Form mergen (Basis `ca45a0a2` veraltet). Wenn der Betreiber R-A2-2 beheben will: neu aufsetzen auf diesem Fix, mit X1 und G1/G3/G5.

### 7.1 Annahmetext-Vorschläge für die Freigabedatei (G9, `akzeptierteBefunde`) — NUR VORSCHLAG

Der Betreiber entscheidet und darf den Wortlaut ändern. Dieser PR trägt nichts in die Freigabedatei ein.

```json
{ "id": "ABN-A2", "grund": "Kernfehler behoben (PR acc45/sicherheit/abn-a2-s2-bewertung: Rollenprüfung vor der Einladungsbremse, Grenzwerte unverändert, Negativtests A2-1 bis A2-5). Angenommenes Restrisiko R-A2-1 (Niedrig): Leitungen aus mindestens vier Betrieben können die installationsweite Grenze zugaenge (40/10 min) füllen und Einladen, Zurückziehen und Betreiberwege anderer Betriebe bis zu 10 min verzögern; protokolliert, Betriebe legt nur der Betreiber an. Bedienrestrisiko R-A2-2 (Leitung nach 10 Aufrufen je 10 min gebremst; Umweg Betreiber). Folgeentscheidung #277/X-Z offen." }
```

```json
{ "id": "ABN-S2", "grund": "Vorbestehend, in Produktion gleich. Angenommen für den Pilot Form I: Eine Flut falscher Zugangscodes aus etwa 45 (Stufe 1) bzw. 134 (Stufe 2) Herkünften verzögert für je bis zu 5 min die Betreiber-Neuanmeldung und das Einlösen, ab Stufe 2 auch Code-Anmeldungen; bestehende Sitzungen, Kontoanmeldung, Daten nicht betroffen (Negativtests S2-1 bis S2-3). Auflagen: Betriebsregel frische Betreibersitzung vor Eingriffen (S2-e), Alarm auf 'anmelden · gebremst (gesamt)' (S2-d); S2-b vor Pilot Form II." }
```

---

## 8. Offen für den Betreiber

1. Commit 2 (ABN-A2-Fix) annehmen — ja/nein.
2. ABN-A2 nach dem Fix: Restrisiko R-A2-1 annehmen oder X-Z beauftragen.
3. ABN-S2: Annahme für Pilot Form I mit Auflagen S2-e/S2-d — ja/nein; S2-b-Grenzwert (Vorschlag: je Herkunft wie `anmelden`, Gesamt 200 je 300 s) beauftragen.
4. #277: schließen oder auf diesem Fix neu aufsetzen.

Unabhängiges Sicherheitsreview dieses PR: steht aus (frischer Opus).
