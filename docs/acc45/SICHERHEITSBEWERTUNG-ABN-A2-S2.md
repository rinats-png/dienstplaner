# Sicherheitsbewertung ABN-A2 / ABN-S2 (BL-16, ENTSCHEIDUNGSLISTE P1-6)

Stand: 2026-11-24 · Umfangsklasse SICHERHEIT-QUALITAET · Bewertung und Vorschlag, **keine Betreiberentscheidung**

| | |
|---|---|
| Basis | `integration/release-v4` @ `09ca5a2c` |
| Kandidat | `release/rc-2026-11-22` @ `517993ca` (PR #489) — in diesem Paket **unverändert** |
| `main` (Repo-Stand) | `a5b49709` — Bremsverhalten wie der Kandidat |
| Produktion (deployt) | `274bfa0` (Stand laut Betreiberbericht; Digest hier nicht geprüft) — **anderer Code**, siehe §1.3 |
| Vorarbeit | `ABNAHME-V4-A2-RISIKOBEWERTUNG.md` (#282, Stand 2026-11-13, Basis `ca45a0a2`, Vergleich mit PR #277) |
| Neue Prüfungen | `pruefungen/abn-a2-s2-sicherheit.test.js` (echte Handler, echte Grenzwerte, feste Uhr, nur Testdaten) |
| Behebung in diesem Paket | ABN-A2 Kernfehler: eigener Commit, nur `server/funktionen/einladung.mjs` (Reihenfolge Rolle → Zähler; **keine** Grenzwertänderung) |
| Nachtrag 2026-11-24 | R-A2-1 behoben (Branch `acc45/sicherheit/abn-a2-r-a2-1`, Basis `84e93879`): eigene Zähler für Einladen und Zurückziehen, **keine** neuen Grenzwerte — §3.5 |
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
| Kandidat `517993ca` / `main` `a5b49709` | Fehler vorhanden (gleicher Code) | Befund vorhanden (gleicher Code) |
| Produktion `274bfa0` (§1.3) | nicht vorhanden (`server/funktionen/einladung.mjs` gibt es dort nicht) | **vorhanden und schwerer**: schon Stufe 1 sperrt jede Zugangscode-Anmeldung, auch gültige Leitungscodes |
| Geltung der Annahme | Kandidat bzw. Release v4 | **nur** Kandidat bzw. Release v4, nicht der deployte Stand |
| Schweregrad (vorher) | **Mittel** | **Mittel** |
| Wahrscheinlichkeit | Mittel (Innentäter mit niedrigster Rolle genügt) | Niedrig bis mittel (Herkunftspool nötig; IPv6 billig) |
| Ergebnis dieses Pakets | **BEHOBEN** im Kern (Commit 2); R-A2-1 **behoben** (Nachtrag §3.5) bis auf den Rest R-A2-1R (Niedrig); R-A2-2 (Bedienung) bleibt | **nicht behoben**; minimaler Fix beschrieben (S2-b, S2-a) |
| Empfehlung | **BEHEBEN** (#534 + Nachtrag §3.5); Rest R-A2-1R bis zur Entscheidung über X1 | **TEILWEISE**: für den Pilot Form I mit Auflagen annehmen; S2-b als kleiner Folge-PR, S2-a als eigenes Paket |

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

### 1.3 Deployter Produktionsstand `274bfa0` (Korrektur nach Review #534, A1)

Geprüft mit `git show 274bfa0:…`:

- ABN-A2: `server/funktionen/einladung.mjs` existiert dort nicht. Der Befund besteht in Produktion nicht.
- ABN-S2: vorhanden und **schwerer** als im Kandidaten:
  - `bremse("anmelden", k, zielRaum)` läuft vor jeder Codeprüfung (`daten.mjs:556` auf `274bfa0`). Es gibt keinen SI-P7-Durchlass, keine Sperrversuche, keinen Dienst-Deckel und kein `failClosed` (`schutz.mjs:170`, `:221` auf `274bfa0`: 8/300 s je Herkunft, Gesamt 400/300 s).
  - Herkunft = erster Eintrag von `X-Forwarded-For` (`schutz.mjs:254` auf `274bfa0`), IPv6 nicht je /64 gruppiert, keine Vertrauensliste.
  - Folge: Schon Stufe 1 (≈ 45 Herkünfte × 9) sperrt **jede** Zugangscode-Anmeldung, auch einen gültigen Leitungscode. Mit IPv6 genügt dafür vermutlich ein einziger Host. Ob Caddy `X-Forwarded-For` überschreibt, ist im Repo auf `274bfa0` nicht prüfbar; wenn nicht, reicht ein gefälschter Kopf.
- Die Bewertung, die Tests und die Annahmetexte dieses Dokuments gelten deshalb **nur für den Kandidaten bzw. Release v4**. Für den deployten Stand ist ABN-S2 vorhanden und schwerer; Release v4 verbessert ihn.

---

## 2. Bedrohungsmodell

| Akteur | Fähigkeit | Ziel |
|---|---|---|
| T1 Innentäter niedriger Rolle (Beschäftigte, SV, Betriebsrat, Planung) oder Demo-Besucher | gültige Sitzung in einem oder mehreren Betrieben | Verwaltung stören: Einladen und Zurückziehen blockieren |
| T2 böswillige oder übernommene Leitung | Leitungssitzungen in ≥ 2 bzw. ≥ 4 Betrieben | dasselbe, mandantenübergreifend |
| T3 unangemeldeter Angreifer | Herkunftspool (Botnetz, Proxy-Pool, IPv6-Präfix /56 = 256 × /64) | Betreiber aussperren, Einlösen und Code-Anmeldung verhindern |

Schutzgüter: Verfügbarkeit von Einladen, **Zurückziehen eines Zugangs** (Reaktion auf einen kompromittierten Code), Betreiber-Neuanmeldung, Einlösen. Nicht betroffen: Vertraulichkeit und Integrität der Betriebsdaten (kein Weg erteilt Zugang oder verrät Codes; Abschnitt 6).

Annahmen: ein Prozess je Ablage (`prozesssperre.mjs`), Zähler in der Ablage bzw. im Prozessspeicher; kein Reverse-Proxy-Ratenlimit.

**Voraussetzung für alle Herkunftszahlen (Review #534, A2 d):** `CENTRIC_VERTRAUTE_PROXYS` ist gesetzt (nur Caddys feste Adresse). Ist sie leer, sieht der Dienst nur die Proxy-Adresse: Alle Nutzer teilen sich eine Herkunft, und schon 9 Fehlversuche einer einzigen Person sperren Betreiber-Neuanmeldung und Einlösen. `deploy/deploy.sh:170-171` bricht deshalb ab, wenn der Wert leer ist.

**IPv6 (A2 c):** Wer ein Präfix /56 oder größer hat, verfügt über ≥ 256 getrennt gezählte /64-Gruppen. Ist der Dienst über IPv6 erreichbar, erreicht ein solcher Angreifer Stufe 2 (≥ 134 Gruppen) von einer Maschine aus.

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
| R-A2-1 | Leitungen aus ≥ 4 Räumen füllen `zugaenge:gesamt` | T2: Leitungssitzungen in 4 Betrieben (je ≤ 11 Beiträge); Betriebe legt nur der Betreiber an, Selbstregistrierung ist aus | wie 3.1 Nr. 2: Einladen, Zurückziehen, Betreiberwege ≤ 600 s, erneuerbar; namentlich protokolliert | **BEHOBEN** (§3.5); Rest R-A2-1R |
| R-A2-2 | Die Leitung sperrt sich selbst nach 10 eigenen Aufrufen je Raum und 10 min (mit Rückfrage etwa 5 Einladungen) | Bedienung, kein Angriff | Einrichten eines Betriebs langsam; Umweg Betreiber `/api/zugaenge` (bis 20 je Aufruf) | Bedienung (Test 2.4) |
| R-A2-3 | Eine übernommene Leitung sperrt durch eigene Aufrufe Einladen und Zurückziehen des **eigenen** Raums | T2 in einem Betrieb | eigener Betrieb 1800 s steigend; Betreiber kann zurückziehen, solange R-A2-1 nicht zugleich läuft | Niedrig (wie vorher, keine Verschlechterung) |

R-A2-1 und R-A2-2 sind genau der Gegenstand von #277 und X1 (Abschnitt 5). Die Behebung macht beides nicht schlechter. R-A2-1 ist seit dem Nachtrag behoben (§3.5). R-A2-3 ist gemildert: Einladen und Zurückziehen haben getrennte Zähler, eigene Einladungen sperren das Zurückziehen nicht mehr (A2-5d).

### 3.4 Einstufung

- Vorher: **Mittel** — Verfügbarkeit einer Sicherheitsfunktion (Zurückziehen), mandantenübergreifend, schon mit der niedrigsten Rolle.
- Nach #534: **Niedrig** (R-A2-1) — braucht Leitungsrechte in 4 Betrieben.
- Nach dem Nachtrag (§3.5): **Niedrig** (R-A2-1R, Review #536) — Zurückziehen, Betreiberwege und Ausstellen ohne Nachweis sind von anderen Betrieben unabhängig (auch bei gleichzeitigen Anfragen, G3); installationsweit wartet nur noch das Ausstellen **mit** Nachweis (≤ 600 s), und nur bei Fehlversuchen aus ≥ 4 **Räumen**. Ohne die Abhilfe 3.5 (c) genügte dafür eine einzige Leitung mit gleichzeitigen Anfragen.

### 3.5 Nachtrag 2026-11-24: Behebung R-A2-1 (Betreiberentscheidung 24.11.: keine dauerhafte Risikoannahme)

**Aufwand (Prüfung vor der Umsetzung).** Vollständige Behebung ohne neue Grenzwerte und ohne Änderung der Gesamtgrenze möglich: rund 60 geänderte Zeilen Code in 3 Dateien, dazu Tests und Doku; Schätzung ≤ 1 PT. Damit unter dem Richtwert (≤ 1,5 PT, ≤ 400 Zeilen): umgesetzt.

**Ursache.** Drei Wege teilten eine Art und damit eine installationsweite Grenze `WEITERE.zugaenge.gesamt` (40/600 s): (1) Ausstellen einer Einladung durch die Leitung (`einladung.mjs`), (2) Zurückziehen durch die Leitung (`daten.mjs`, `zugang-sperren`), (3) Betreiberwege (`/api/zugaenge`, Raumweg, Übersicht, Zurückziehen durch den Betreiber). Leitungen aus vier Betrieben füllten (3) über (1) und (2), auch mit gelungenen Einladungen.

**Änderung (`server/lib/schutz.mjs`, `server/funktionen/einladung.mjs`, `server/funktionen/daten.mjs`).** Getrennte Zähler, alle mit genau den Zahlen von `zugaenge` (10/600 s, Sperre 1800 s steigend bis 86 400 s, fail-closed; Prüfung „Grenzwerte“):

| Zähler (Art) | Schlüssel | Wer zählt | installationsweit |
|---|---|---|---|
| `zugaenge` (unverändert) | Betreiberraum | nur noch Betreiberwege und Zurückziehen durch den Betreiber | 40/600 s, wie bisher |
| `zugang-sperren` (neu, X-Z aus #277) | Betrieb (`kennungBetrieb`, aus #277) | Zurückziehen durch die Leitung, nach Rolle und frischer Anmeldung | **keine** |
| `einladung` (neu) | Raum | jeder Aufruf zum Ausstellen nach der Rollenprüfung (wie bisher `zugaenge`) | **keine** |
| `einladung-nachweis` (neu) | Raum | nur Aufrufe **mit** Nachweis (Zugangscode, Passwort, Code aus der App; jede nicht leere Zeichenkette) | 40/600 s, derselbe Wert wie bisher, eigener Zähler |

Regeln für `einladung-nachweis`: gezählt **vor** dem Vergleich (kein Rennfenster). Stimmt der Nachweis, nimmt der Aufruf nur seinen eigenen Gesamtvermerk zurück (`vermerkeZuruecknehmen`, kein Zurücksetzen von Zählern). Prallt der Aufruf an einer Sperre ab, wurde nichts verglichen: Vermerk ebenfalls zurück — das gilt für die schon bestehende Raumsperre (`einladung`), für den Aufruf, der die Sperre von `einladung` auslöst, und seit Review #536 (Abhilfe c) auch für Aufrufe, die an `einladung-nachweis` selbst abprallen (`bremse()` gibt im Sperrpfad die Vermerke als `vermerke` mit; bestehende Aufrufer von `vermerkeZuruecknehmen` sehen weiter kein `zurueck` und ändern sich nicht). Falsche Nachweise bleiben überall gezählt. Ebenfalls gezählt bleibt ein Nachweis, der scheitert, ohne verglichen zu werden (Passwort bei einer Code-Sitzung, Zugangscode unter Faktorpflicht) — streng, je Raum durch die Raumgrenze begrenzt. `einladung-nachweis` läuft **vor** `einladung`: Eine volle Gesamtgrenze verbraucht so nicht den Raumzähler des Opfers (wie bisher prüft `bremse()` die Gesamtgrenze vor dem eigenen Zähler).

**Was gleich bleibt.** Rolle vor Zähler (#534, N-1). Rateschutz je Raum: dieselbe Zahl, dieselbe Folge (A2-3 exakt `[9 × 403, 429]`, Sperre > 1700 s, richtiger Code wartet). Die Rückfrage ohne Nachweis zählt je Raum weiter mit. Gesamtgrenze für Nachweisversuche: weiter 40/600 s. Faktorzähler `zweifaktor`, Lastbremse `schreiben` je Person, Einlösen (`anmelden`): unverändert. Betreiber: unverändert `zugaenge` mit Gesamtgrenze.

**Was sich ändert (bewusst).** Zurückziehen zählt je Betrieb statt je Raum (bei einem Betrieb je Raum gleich). Einladen und Zurückziehen derselben Leitung teilen keinen Zähler mehr (R-A2-3 gemildert). Gelungene Einladungen, Rückfragen und Aufrufe ohne Nachweis erreichen keine installationsweite Grenze mehr. Betreiberwege teilen ihre Gesamtgrenze nicht mehr mit Leitungen; für Rateschutz gegen Fehlversuche ist das keine Lockerung, weil Nachweisversuche weiter installationsweit gedeckelt sind.

**Restrisiko R-A2-1R (Niedrig, Review #536; Ist in A2-5c festgehalten).** Leitungen aus ≥ 4 **Räumen** (der Zähler ist je Raum, `kennung()`) schicken je bis zu 10 Nachweise, die falsch sind oder nicht verglichen werden können ⇒ `einladung-nachweis:gesamt` voll ⇒ in anderen Räumen wartet **nur das Ausstellen mit Nachweis** bis Fensterende (≤ 600 s). Nicht betroffen: Ausstellen mit junger Anmeldung (≤ 5 min), Zurückziehen (Leitung und Betreiber), alle Betreiberwege, Anmelden, Einlösen. Kosten: je Raum danach eigene Sperre 1800 s steigend; erneuern nur mit weiteren Räumen. Spur: nacheinander gesendete falsche Nachweise erscheinen als `einladung · abgewiesen` mit Rolle und Person; gleichzeitig gesendete, die an der Sperre abprallen, nur als `einladung · gebremst` mit der Raumkennung, **ohne** Person. Entspricht S-1 aus #277.

**Korrektur Review #536 (A1) und Abhilfe (c).** Im Stand `541bc983` genügte für R-A2-1R **eine** Leitungssitzung: 60 gleichzeitige falsche Nachweise wurden alle mit 429 abgewiesen, ließen aber ihre Gesamtvermerke stehen; danach wartete die Leitung eines anderen Raums mit **richtigem** Nachweis (429, Retry-After 236 s). Ursache: Die Gesamtgrenze in `bremse()` zählt und vermerkt zuerst, der Sperrpfad gab die Vermerke nicht mit. Abhilfe ohne neue Grenzwerte (2 Stellen, ≈ 15 Zeilen): Der Sperrpfad gibt `vermerke` mit, `einladung.mjs` nimmt sie zurück, wenn `einladung-nachweis` abweist. Danach trägt ein Raum höchstens etwa 10 Gesamtvermerke je Fenster bei, und R-A2-1R verlangt wieder ≥ 4 Räume (Prüfung G1: rot auf `541bc983`, grün danach). Der Rateschutz wird nicht schwächer: Raumzähler, Sperre und Stufe bleiben; zurückgenommen werden nur Vermerke von Aufrufen, die nichts verglichen haben (Prüfung G2: richtige und falsche Nachweise im Wechsel — höchstens 10 Vergleiche je Fenster, kein „Freikaufen“). Vollständig entfiele es nur mit X1 (Gesamtgrenze für Nachweise streichen) oder einer Gewichtung je Betrieb — beides ist eine **Betreiberentscheidung** (§8), hier nicht umgesetzt.

**Einordnung Gleichzeitigkeit (Review #536, A4).** Schon **vor** diesem Nachtrag genügte eine einzige Leitung mit gleichzeitigen Anfragen für das volle R-A2-1: Prüfung G3 (60 Einladungen und 60 Rückzüge gleichzeitig) ergab auf der Basis `84e93879` für Betreiber-Zurückziehen, fremdes Zurückziehen und fremdes Einladen jeweils 429, mit diesem Nachtrag jeweils 200. Ziel- und Gesamtgrenze zählen in `bremse()` weiter über `await` getrennt; nach Abhilfe (c) bleiben davon je Raum nur Vermerke von Aufrufen, die verglichen wurden oder nicht vergleichbar scheiterten. Die vollständige Abdichtung (`GLEICHZEITIG_DICHT` aus #277) gehört zum Folgepaket (§8).

**Nachweis.** Prüfungen A2-5a, A2-5b, A2-5c, A2-5d, A2-5e und „Grenzwerte“ in `pruefungen/abn-a2-s2-sicherheit.test.js`: rot auf `84e93879` (6 von 15), grün mit der Änderung (15 von 15). Nach Review #536 dazu A2-5f, G1, G2, G3 (Tabelle §6). Mutationen: siehe PR-Beschreibung.

**Aus PR #277 übernommen / nicht übernommen.** Übernommen: X-Z (`zugang-sperren` je Betrieb ohne Gesamtgrenze), `kennungBetrieb`, gelungene Einladungen nicht mehr in `WEITERE.zugaenge`, die Nachweis-Erkennung (`mitNachweis`). Nicht übernommen (Folgepaket, Grenzwerte = Betreiberentscheidung): Rateschutz je **Person** (`einladung-nachweis` 10 je Person, Raum 25), Kontingente `einladung-ausstellen` 30 je Person und `einladung-betrieb` 40 je Betrieb (R-A2-2), Entlastung des Personenzählers, `GLEICHZEITIG_DICHT`, X1, G1/G3/G5.

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
| Kontoanmeldung (E-Mail/Passwort, eigene Art `anmelden-konto`, `schutz.mjs:421`, 493) | nach Code frei (anderer Zähler); **nicht geprüft** | dto. |
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
| X-Z | `zugang-sperren` aus der Gesamtgrenze `zugaenge` herauslösen (eigene Art je Betrieb, Zahlen wie heute) | R-A2-1 trifft das Zurückziehen nicht mehr | keine neuen Grenzwerte nötig (Zahlen von `zugaenge`) | klein — **umgesetzt** (§3.5), zusammen mit eigenen Zählern fürs Ausstellen |
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
| A2-3 | Rateschutz unverändert: Leitung mit älterer Anmeldung, Rückfrage + falscher Code: genau 9 × 403, dann 429 (exakt, fällt bei Grenzwert 10 → 11 auf; H2) mit Retry-After > 1700 s; richtiger Code während der Sperre 429 | grün | grün |
| A2-4 | ohne Sitzung (401), gefälschtes Merkmal (401), Demo-Leitung (403) je 12× → echte Leitung lädt ein | **rot** (Demo füllte den Raumzähler) | grün |
| A2-6 | Vorbremse: Beschäftigte 120 Aufrufe in 60 s → 403, Aufruf 121 → 429 (`schreiben` je Person); die Leitung bleibt frei. Mutation „Vorbremse weg“ macht ihn rot (Review #534, H1) | rot (429 schon ab Aufruf 11, Raumzähler) | grün |
| A2-5 (bis Nachtrag) | Restrisiko R-A2-1 festgehalten: Leitungen in 4 Räumen → fremde Leitung und Betreiber 429 | grün | ersetzt durch A2-5a…e |
| A2-5a (Nachtrag) | 4 Leitungen laden je 12× ein und ziehen je 12× zurück → fremde Leitung lädt ein (mit/ohne Nachweis) und zieht zurück, Betreiber zieht zurück | **rot** (`84e93879`) | grün |
| A2-5b (Nachtrag) | 4 Leitungen je 10 Einladungen mit richtigem Nachweis → fremde Leitung mit Nachweis 200 | **rot** | grün |
| A2-5c (Nachtrag, Rest R-A2-1R) | 4 Leitungen je 10 falsche Nachweise → fremde Leitung mit Nachweis 429 (≤ 600 s), ohne Nachweis 200, Zurückziehen und Betreiber frei; 10 weitere Versuche des Opfers verbrauchen seinen Raumzähler nicht | **rot** | grün |
| A2-5d (Nachtrag) | Zurückziehen je Betrieb: 11. Aufruf 429, anderer Betrieb frei; eigene Sperre beim Zurückziehen sperrt das Einladen nicht | **rot** | grün |
| A2-5e (Nachtrag) | Rückfragen ohne Nachweis und Nachweise, die an der eigenen Raumsperre abprallen, füllen die Rategrenze nicht | **rot** | grün |
| A2-5f (Review #536) | zwei Betriebe in einem Raum: Zurückziehen je Betrieb, Ausstellen je Raum | rot (Zurückziehen) | grün; Mutanten „Ausstellen je Betrieb“ und „Zurückziehen je Raum“ rot |
| G3 (Review #536) | eine Leitung, 60 Einladungen + 60 Rückzüge gleichzeitig → fremdes Einladen/Zurückziehen und Betreiber frei | **rot** (alle 429) | grün |
| G1 (Review #536) | eine Leitung, 60 falsche Nachweise gleichzeitig → kein Ausstellen; anderer Raum mit richtigem Nachweis 200 | **rot** (auch auf `541bc983`: 429, Retry-After 236 s) | grün (Abhilfe c) |
| G2 (Review #536) | richtige und falsche Nachweise im Wechsel: höchstens 10 Vergleiche je Fenster (kein Freikaufen) | grün | grün |
| S2-1 | eine Herkunft, 80 Fehlversuche: 8 × 401, Rest 429, kein Token; Betreiber und Leitung von anderswo 200 | grün | grün |
| S2-2 | Stufe 1 (45 × 9): kein Token, ein Fehlertext; Betreiber 429, Einlösen 429 (Ist), Leitung 200, Sitzung liest; nach Fensterende Betreiber 200, Einlösen 200 | grün | grün |
| S2-3 | Stufe 2 (Dienst-Deckel gerissen UND `anmelden:gesamt` voll): 90 Herkünfte je 9 Sperrversuche direkt (810, Leitung noch 200), dann 45 Herkünfte × 17 über HTTP (405 in der Gesamtgrenze, 1215 Sperrversuche): Deckel gerissen, kein Token, Leitung 429 (Ist), Sitzung liest; nach Fensterende 200 | grün | grün |

Angepasst: `pruefungen/abnahme-a-ablauf.test.js` Test 2.4 hielt den alten Fehler fest. Neu: Rollenabsagen (3 Rollen je 12×) zählen nicht; die Leitung bekommt erst nach ihren eigenen zehn Aufrufen 429.

Lücken aus #282 §3.4: **G4 ist jetzt geschlossen** (S2-2, S2-3). G1, G2, G3, G5 betreffen den Code von #277 und bleiben dort offen; G6 unverändert (ein Prozess je Ablage).

---

## 7. Empfehlung

1. **ABN-A2: BEHEBEN.** Commit 2 dieses PR mergen (nach unabhängigem Sicherheitsreview). Danach bleibt R-A2-1 (Niedrig). Der Koordinator kann den SSOT-Status nach Review nachziehen; bis zu einer Entscheidung über #277/X-Z bleibt ein Restrisiko, das G9 nur über eine Annahme freigibt.
2. **ABN-S2: TEILWEISE.** Für den Pilot Form I (wenige, bekannte Betriebe, synthetische Daten) mit Auflagen annehmen: Betriebsregel S2-e (Betreiber meldet sich vor Eingriffen an und hält eine frische Sitzung) und S2-d (Alarm auf `anmelden · gebremst (gesamt)`, wenn möglich Proxy-Ratenbegrenzung). S2-b als kleiner Folge-PR vor Pilot Form II; S2-a als eigenes Paket.
3. #277 nicht in der heutigen Form mergen (Basis `ca45a0a2` veraltet; Konflikt mit #534 in `einladung.mjs` und `package.json`). Wenn der Betreiber R-A2-2 beheben will: neu aufsetzen auf diesem Fix, mit X1 und G1/G3/G5.

### 7.1 Annahmetext-Vorschläge für die Freigabedatei (G9, `akzeptierteBefunde`) — NUR VORSCHLAG

Der Betreiber entscheidet und darf den Wortlaut ändern. Dieser PR trägt nichts in die Freigabedatei ein.

```json
{ "id": "ABN-A2", "grund": "Kernfehler behoben (#534: Rollenprüfung vor der Einladungsbremse) und R-A2-1 behoben (Nachtrag acc45/sicherheit/abn-a2-r-a2-1: eigene Zähler für Einladen und Zurückziehen, Grenzwerte unverändert, Negativtests A2-1 bis A2-6, A2-5a bis A2-5e). Angenommenes Restrisiko R-A2-1R (Niedrig): Leitungen aus mindestens vier Räumen können mit falschen oder nicht vergleichbaren Nachweisen die Rategrenze für Nachweise (40/10 min) füllen; dann wartet in anderen Betrieben nur das Ausstellen mit Nachweis bis zu 10 min; Zurückziehen, Betreiberwege und Ausstellen mit junger Anmeldung bleiben frei; protokolliert. Bedienrestrisiko R-A2-2 (Leitung nach 10 Aufrufen je 10 min gebremst; Umweg Betreiber). Folgepaket ABN-A2-Folge (#277-Rest, X1) offen." }
```

```json
{ "id": "ABN-S2", "grund": "Vorbestehend; in Produktion 274bfa0 vorhanden und schwerer (dort sperrt schon Stufe 1 jede Zugangscode-Anmeldung); die Annahme gilt nur für den Kandidaten bzw. Release v4. Angenommen für den Pilot Form I: Eine Flut falscher Zugangscodes aus etwa 45 (Stufe 1) bzw. 134 (Stufe 2) Herkünften verzögert für je bis zu 5 min die Betreiber-Neuanmeldung und das Einlösen, ab Stufe 2 auch Code-Anmeldungen. Ein Angreifer mit IPv6-Präfix /56 oder größer erreicht Stufe 2 von einer Maschine aus, falls der Dienst über IPv6 erreichbar ist. Die Zahlen setzen eine gesetzte CENTRIC_VERTRAUTE_PROXYS voraus; ist sie leer, sperren schon 9 Fehlversuche einer Person Betreiber-Neuanmeldung und Einlösen (deploy.sh erzwingt den Wert). Bestehende Sitzungen und Daten nicht betroffen (Negativtests S2-1 bis S2-3); Kontoanmeldung nach Code nicht betroffen (eigener Zähler), in diesem Paket nicht geprüft. Auflagen: Betriebsregel frische Betreibersitzung vor Eingriffen (S2-e), Alarm auf 'anmelden · gebremst (gesamt)' (S2-d); S2-b vor Pilot Form II." }
```

---

## 8. Offen für den Betreiber

1. Commit 2 (ABN-A2-Fix) annehmen — ja/nein.
2. ABN-A2 nach dem Fix: ~~Restrisiko R-A2-1 annehmen oder X-Z beauftragen~~ — entschieden 24.11. (keine dauerhafte Risikoannahme), R-A2-1 behoben (§3.5). Offen: Rest R-A2-1R — X1 (Gesamtgrenze für Nachweise streichen) oder Gewichtung je Betrieb, oder Rest annehmen. Empfehlung: annehmen bis zum Folgepaket (Niedrig, nur Ausstellen mit Nachweis ≤ 600 s, nur durch Fehlversuche aus ≥ 4 Räumen; Spur bei gleichzeitigen Anfragen ohne Person).
2a. Folgepaket „ABN-A2-Folge“ (nicht in diesem Nachtrag, Grenzwerte = Betreiberentscheidung, Vorschläge aus #277, **vorläufig**). Noch nicht übernommene Punkte aus #277:
   - Nr. 5/6: Rateschutz je Person (`einladung-nachweis` 10 je Person, Raum 25, Gesamt 40), Entlastung nur eigener Vermerke, Rückfrage ohne Nachweis zählt nirgends;
   - Nr. 7: Kontingente `einladung-ausstellen` 30 je Person und `einladung-betrieb` 40 je Betrieb (R-A2-2: Leitung lädt 25 in Folge ein);
   - Nr. 11: `GLEICHZEITIG_DICHT` (Parallelitätsschutz der Ziel-/Gesamtgrenze);
   - Nr. 12: Gleichzeitigkeitstests in `pruefungen/bremse-lokal.test.js` (anmelden, anmelden-konto, registrierung: keine vorzeitige Sperre, gestaffelt ohne Doppeltzählung) — gehören zu Nr. 11;
   - Nr. 13: Testdateien `pruefungen/einladungsbremse.test.js` und `pruefungen/einladung-global-grenze.test.js` (prüfen das Design aus Nr. 5–7; hier durch A2-5a…f und G1–G3 für R-A2-1 ersetzt);
   - Nr. 14: Dokument `docs/acc45/ABNAHME-V4-A2-GLOBALE-GRENZE.md` (liegt nur auf dem Branch von #277; gültige Teile stehen in §3.5);
   - Nr. 15: G1, G3, G5 (Parallelität `zugang-sperren`/`einladung-betrieb`), X1. Nutzungsszenario für die Entscheidung: Eine Leitung richtet einen Betrieb mit 25 Personen in einer Sitzung ein (25 Einladungen in ≤ 10 min); heute schafft sie 10 je 10 min (mit Rückfrage etwa 5), danach 30 min Sperre. Mit 30/40 schafft sie 25 in Folge; bei 5 gleichzeitig einrichtenden Betrieben je 25 entsteht keine installationsweite Wirkung, weil gelungene Einladungen seit diesem Nachtrag keine Gesamtgrenze mehr erreichen.
3. ABN-S2: Annahme für Pilot Form I mit Auflagen S2-e/S2-d — ja/nein; S2-b-Grenzwert (Vorschlag: je Herkunft wie `anmelden`, Gesamt 200 je 300 s) beauftragen.
4. #277: schließen oder auf diesem Fix neu aufsetzen. #277 konfligiert mit #534 in `server/funktionen/einladung.mjs` und `package.json` (Review #534, H6). Die Bewertung empfiehlt Neuaufsetzen (§7 Nr. 3); die Wahl ist eine Betreiberfrage.

Unabhängiges Sicherheitsreview #534 (Opus, Kopf `06c23e9c`): FREIGEGEBEN MIT AUFLAGEN, kein Blocker am Code. Auflagen A1, A2, H1, H2, H6 im Folgecommit umgesetzt.
