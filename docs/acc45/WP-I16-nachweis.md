# WP-I16 — Nachweis: Betriebssteuerung, Betriebsrat-Pause (Variante A), Notschalter

Branch `intelligence/wp-i16-pause` (von `origin/integration/release-v4`, Basis `af583d6c`) · Prozessstufe L3 · Umfangsklasse SICHERHEIT-QUALITAET · Stand 2026-11-25.
**Gebaut und getestet, nicht aktiviert, nicht als rechtlich freigegeben dargestellt.** Der Schalter `CENTRIC_KI_BR_PAUSE` steht auf AUS (Vorgabe, nirgends gesetzt, auch nicht in CI); `CENTRIC_KI_MODUS` ist weiterhin nirgends verdrahtet; keine Intelligence-Funktion ruft die Steuerung.

## Entscheidungsgrundlage
Betreiberentscheidung P2-8, Variante A (2026-11-25): Der Betriebsrat darf Intelligence in seinem Zuständigkeitsbereich **pausieren**; jede Änderung wird protokolliert; die Rollenvergabe darf die Schutzmaßnahme nicht umgehen; die normale Dienstplanung bleibt funktionsfähig; Wiederaktivierung durch die Leitung unter den geltenden Freigaberegeln. Konkrete produktive Rechte und endgültige Wiederaktivierungsregeln erst nach rechtlicher Prüfung (daher Schalter, Vorgabe AUS).

## Repo-Ist und Verhältnis zu PR #238
- Im Basisstand fehlte alles (`git grep` auf `kiSteuerung`, `ki-steuerung`, `KI_PAUSIERT`: nur Gateway-Notschalter I13/I15 und Dokumente). Vorhanden und **nicht** doppelt gebaut: Gateway-Notschalter `server/lib/intelligence/gateway/schalter.mjs` (Prozess `CENTRIC_KI_MODUS` und Laufzeit, beide genau „an“, fail closed), Positivliste, Kostenschutz (I15).
- #238 (Branch `feature/wp-i16-transparenz`, 3 Commits, 1094 Commits hinter der Basis) war inhaltlich brauchbar, aber nicht mergebar: Konflikte in `daten.mjs`, `rechte.mjs`, `einstellungen.jsx`, `einstellungen.js`, `RECHTEMATRIX.md`; und es setzte die **Gegenrichtung** um (nur Betriebsrat setzt und hebt auf, Leitung nie). Übernommen wurde der Schlussstand der Dateien (Kern, Transparenz, Oberfläche, Tests: 79 Tests liefen auf der neuen Basis unverändert grün), die Konflikte wurden von Hand aufgelöst, danach auf Variante A umgebaut. **Empfehlung: #238 schließen**, ersetzt durch diese Arbeit (Branch `intelligence/wp-i16-pause`).

## Was gebaut ist (Delta zu #238)
| Bereich | Umsetzung |
|---|---|
| Rechte | Leitung: Hauptschalter, Funktionen, Frage, Pause **aufheben**. Betriebsrat: Pause **setzen**, nur hinter `CENTRIC_KI_BR_PAUSE=true` (Vorgabe AUS; aus = 403 wie bisher). Betriebsrat hebt nie auf, Leitung setzt nie (außer mittelbar: Antwort „ja“ auf die Frage). Alle anderen Rollen, Demo und Betreiber: nie. Kein Teilweg, kein Löschlauf für den Betriebsrat. |
| Aufheben = Compare-and-set | Die Leitung muss den Stempel (`am`) der gesehenen Pause mitschicken. Eine veraltete oder blinde Kopie (Oberfläche schickt den ganzen Betrieb zurück) hebt eine neuere Pause des Betriebsrats nie auf. Ein unlesbarer Pausenstand ist ohne Stempel aufhebbar (kein Dauerzustand). |
| Rollenvergabe (roles.assign) | `betriebsratKontenSperre` in `rollenwechselErlaubt` (`rechte.mjs`; deckt `PUT /api/bestand`, Import, Teilweg und Wiederherstellen): Bei aktiver Pause (auch bei unlesbarem Pausenstand, auch ohne den Schalter) lassen sich Betriebsrat-Zugänge nicht anlegen, auf die Rolle umstellen, davon wegstellen, entfernen, deaktivieren, mit Austritt versehen oder anonymisieren (403). Ohne aktive Pause gelten die bisherigen Regeln; jede Änderung an Betriebsrat-Zugängen steht als Zahl (`betriebsrat-konten +n -m`, keine Person) im Betriebsprotokoll. |
| Protokoll | Jede Änderung (Schalter, Frage, Pause setzen/aufheben mit Rolle und Personenkennung im Betriebsstand, ohne Person und Inhalt im Betriebsprotokoll `ki-steuerung`). Wann/Wer setzt der Server; mitgeschickte Werte zählen nie. |
| Dienstplanung | Die Pause wirkt nur in `intelligenceErlaubt`/`intelligenceEntscheidung`; Plan-, Zeit- und Personendaten werden nicht berührt (Handler-Test: andere Personenänderung bei Pause 200). |
| Oberfläche | Leitung: „Pause aufheben“ (mit Stempel); Betriebsrat: „Pause setzen“ (kein Aufheben); weiter hinter `KI_STEUERUNG_PROZESS = "aus"` („nicht verfügbar“). |
| Notschalter | Bereits vorhanden (I13/I15): Prozess + Laufzeit, beide genau „an“. Die hier gebaute `intelligenceErlaubt` ist die Quelle für die Laufzeitebene je Betrieb und Funktion (Hauptschalter, Funktion, Frage, Pause). Ein **Betreiber-Notschalter je einzelnem Betrieb oder nur für die Opus-Stufe** (Plan I16) ist nicht gebaut: braucht einen Betreiberschreibweg; siehe offene Fragen. |

## Tests (rot → grün)
Rot (vor dem Code, Datei `pruefungen/intelligence-steuerung.test.js`): 8 von 51 fielen aus dem richtigen Grund (Leitung hebt nicht auf; Betriebsrat hebt auf; `kiBetriebsratPauseAn` fehlt; `betriebsratKontenSperre`/`-Zeilen` fehlen; Rollenvergabe-Gruppe). Danach grün. Angepasste bestehende Tests aus #238 (jeweils wegen der Umkehr der Richtung, nicht abgeschwächt): „Antwort ja“, „veraltete Kopie: Leitung mit aufgehobener Pause“, „Pause aufheben“, „Leitung kann die Pause nicht umgehen“, „unbekannte Funktion/Müll“ (Leitung hat jetzt ein Pausenrecht: Müll wird abgewiesen, für Planung ohne Wirkung), Oberfläche (Knöpfe je Rolle), Handler (Reihenfolge und Rollen).

## Ergebnisse (lokal, TZ=UTC, --maxWorkers=1)
| Lauf | Ergebnis |
|---|---|
| `pruefungen/intelligence-steuerung{,-handler,-oberflaeche}.test.js` | 94 Tests grün (Kern 53, Handler, Oberfläche) |
| `release-pruefung.test.js` (vollständig) | 301 grün (nach Korrektur: kein `ssotPakete` im UNFERTIG-Eintrag; die erste Fassung ließ G8 und 7 Folgetests scheitern) |
| `rechtematrix*`, `rollenvergabe`, `kunde-abloesung`, `rb1`, `rb3` | 952 grün, 5 übersprungen (vorhandene Skips) |
| `routen-inventar` | 10 grün (mit `--hookTimeout=180000`: der 10-s-Standard reicht auf dem Laptop nicht) |
| `doku`, `sicht`, `schichtverantwortung`, `rb2`, `rb5` | grün nach Nachtrag der Variable in `.env.example` (doku verlangt sie dort); 205 Tests |
| `acc45-status` | 30 grün; `status-schreiben` ausgeführt |
| `werkzeug/verdrahtung-pruefen.mjs`, `werkzeug/ci-abdeckung.mjs`, `tsc -p jsconfig.json`, `eslint` (geänderte Dateien) | ok |
| `inventur-konsole.test.js` | **nicht vollständig gelaufen** (120 Tests, bash-lastig, auf dem Laptop über 10 Minuten); Generator `inventur-konsole-bauen.mjs --pruefen` ok. Eine Zeile mehr im Skript und neue Sollwerte in `INVENTUR-KONSOLE.md` (vom Generator `--bauen`; **Betreiber-Sollwerte ändern sich, wie bei jeder Änderung von `.env.example`**). Vollständiger Lauf bleibt der CI. |

Nicht ausgeführt: Vollläufe, Browser, `wp48-teilweg`, `abnahme-*`, `selbstservice` (CI).

### Mutationen je Schutz einzeln (je 94 Tests der drei Dateien)
| Mutation | Ergebnis |
|---|---|
| M1 Schalter-Gate im Kern entfernt | gefangen (1) |
| M2 `rechte.mjs` reicht Schalter immer `true` durch | gefangen (1) |
| M3 Handler-Gate ohne Schalter / M3b Teilweg offen | **überlebt**: bewusst doppelte Schicht — ohne Schalter liefert `zusammenfuehren` ohnehin `null` (403), der Teilweg lehnt den Betriebsrat in der eigenen Kette ab. Kein eigener Test für die Einzelschicht. |
| M4 Leitung darf Pause setzen | gefangen (2) |
| M5 Betriebsrat darf Pause aufheben | gefangen (6) |
| M6 Compare-and-set entfernt | gefangen (3) |
| M6b unlesbarer Pausenstand nicht aufhebbar | gefangen (1) |
| M7 Konten-Sperre nie aktiv | gefangen (6) |
| M8 Konten-Sperre nicht in `rollenwechselErlaubt` | gefangen (6) |
| M9 Konten-Schlüssel nur `id` (Deaktivieren, Austritt, Anonymisieren unbemerkt) | gefangen (1) |
| M10 unlesbarer Pausenstand zählt nicht als Pause (Konten) | gefangen (1) |
| M11 Konten-Änderung nicht protokolliert | gefangen (2) |
| M12 Schalter: jeder Wert außer „false“ schaltet ein | gefangen (2) |
| M13 Demo-Betriebsrat (erste Schicht in `kiPauseDurchBetriebsrat`) | **überlebt**: zweite Schicht `darfRecht` (`sitzung.demo !== true`) fängt es; Test „Demo-Betriebsrat“ bleibt grün |
| M14 Konten-Sperre prüft immer „keine Pause“ | gefangen (6) |
| M15 Aufheben auch ohne aktive Pause (Doppel-Aufheben) | zuerst **überlebt**, dann Test ergänzt („erneutes Aufheben ändert nichts“), danach gefangen (1) |
| M16 Antwort „ja“ setzt keine Pause | gefangen (5) |
| M17 `intelligenceEntscheidung` ignoriert die Pause | gefangen (4) |
| M18 Sperre ignoriert neu angelegte Betriebsrat-Konten | gefangen (3) |


## Offene Fragen (nicht eigenmächtig entschieden)
1. **Wiederaktivierungsregel:** Die Leitung hebt allein auf (Variante A). Soll bei „Frage = ja“ eine Bestätigung des Betriebsrats nötig sein, eine Mindestpausenzeit oder eine Begründung? Heute: keine; die Leitung kann eine Betriebsrat-Pause jederzeit aufheben (protokolliert, mit Rolle).
2. **Vier-Augen / Sperren für Betriebsrat-Konten:** Es gibt im Repo keinen zweiten Freigabeweg für Rollenvergabe (nur Vier-Augen bei Kontowiederherstellung WR-3). Gebaut wurde die Sperre **bei aktiver Pause** plus Protokoll. Offen bleibt: Nach dem Aufheben kann die Leitung Betriebsrat-Konten weiter anlegen, ändern und entfernen (protokolliert, aber nicht blockiert); ein „nur der Betreiber ändert Betriebsrat-Konten“ oder eine Betriebsrat-Bestätigung wäre ein neuer Freigabeweg und braucht eine Entscheidung. Ebenso: darf die Leitung überhaupt Betriebsrat-Konten vergeben (Unabhängigkeit des Betriebsrats)?
3. **Zuständigkeitsbereich:** Die Pause gilt je Betrieb (Mandant), nicht je Einheit. Reicht das für Betriebe mit mehreren Betriebsratsgremien?
4. **Betreiber-Notschalter je Betrieb/Opus-Stufe** (Plan I16) und die **Verdrahtung** von `CENTRIC_KI_MODUS` und von `intelligenceErlaubt` in F3/F6/F7A/F9/F15: Betreiberfreigabe, nicht Teil dieses Auftrags.
5. **Information der Beschäftigten** („welche Funktionen sind an“): bleibt bei „nein“ (Plan schweigt).
6. **Rechtliche Prüfung:** Das Betriebsrat-Schreibrecht und die Wiederaktivierung sind erst nach der Prüfung produktiv zu schalten; bis dahin `CENTRIC_KI_BR_PAUSE` nicht setzen (eingetragen in `RELEASE-UNFERTIG.json`, `.env.example`, Betriebshandbuch).

## Review- und CI-Befunde zu PR #563 (Stand 2026-11-25, Folge-Commit)
| # | Befund | Fix | Test (rot → grün) | Mutation |
|---|---|---|---|---|
| 1 | CI `pruefen-b`: „veraltete Kopie: Leitung mit aufgehobener Pause …“ zufällig rot. Compare-and-set beim Aufheben verglich nur `am` (Millisekunden); fielen Aufheben und erneutes Pausieren in dieselbe Millisekunde, hob die veraltete Leitungskopie die neue Pause auf. | Die Pause trägt eine vom Server vergebene Revisionsnummer `nr` (je Setzen, Aufheben, „ja“-Pause +1; nie aus der Anfrage). Aufheben verlangt `am` **und** `nr` der gesehenen Pause (`ki-steuerung.mjs`); die Oberfläche schickt `nr` mit (`t.pause.nr ?? 0`). Eine Pause ohne `nr` (Altbestand) hat `nr` 0; eine ungültige `nr` macht den Pausenstand unlesbar (= pausiert, durch die Leitung aufhebbar). | Neu: „gleicher Zeitstempel (feste Uhr) …“ in `intelligence-steuerung.test.js` ruft `kiSteuerungAnwenden` mit fester Uhr: Aufheben und erneutes Pausieren im selben Millisekundenwert; die veraltete Kopie hebt nicht auf; fehlende, falsche, gefälschte `nr` nie. Rot ohne `nr`-Vergleich, grün mit. Hilfen und Handler-/Oberflächentests schicken `nr` mit (nicht abgeschwächt, nur um das neue Merkmal ergänzt). | `nr`-Vergleich entfernt: gefangen (1). |
| 2 | CI `pruefen-a` inventur-konsole A-8: `INVENTUR-KONSOLE.md` §2 trug die alte Zählhilfe `dc707bf7 …`. | Stelle auf `7fee4bb9 56c538c5 91d58023 a0d70b1e` (= `kurz32` in Blöcken zu 8, aus dem Generator). Generator `werkzeug/inventur-konsole-bauen.mjs`: `--bauen` schreibt die Zählhilfe jetzt mit, `--pruefen` prüft sie (`zaehlhilfe`). | `--pruefen` war vor `--bauen` rot („Sollwert fehlt oder veraltet: `7fee4bb9 …`“), danach grün. | Doku-Zeile zurück auf den alten Wert: `--pruefen` rot. |
| 3 | CI `pruefen-a` v4-3b-querschnitt-1/-2, v4-3b-selbsttest: Zählungen verschoben (33→34 Dateien, 6408→6562 Zeilen). | **Unvermeidbar, nicht durch Umstellen behebbar:** Die neue Datei `src/ansichten/ki-steuerung.jsx` steht nicht in der Zuordnung des V4-Inventars und fällt damit in die Zeile „Querschnitt/Bausteine“. Sie hat keine Form- und keine Farbliterale und liegt Über Baustein auf V4 (`Card`, `Pill`, `Btn`, `Schalter`); verschoben haben sich nur Dateien, Sichtbar, Zeilen, Farbrein (+1), Form erreicht (+1), „Über Baustein“ (+1), „voll“ (+1) und die Inline-Stile (+24, so viele wie die Datei trägt; `vorgaben.jsx` hat 30). Eine Umstellung der Inline-Stile auf Klassen wäre eine neue Stilarchitektur, nicht Umfang dieses PR. Gemessen wird sonst nichts angefasst. Fixture (`pruefungen/fixtures/v4-radiusstufen-basis.json`) mit dem dafür vorgesehenen Werkzeug `werkzeug/v4-radiusstufen-basis.mjs` neu erzeugt: genau zwei neue Einträge (Teil 1 und Teil 2, `sha256: null`, keine Literale, „gab es auf der Basis nicht“). Die Rückrechnung prüft weiter jede Datei mit Basis byte-gleich und stellt für die neue Datei genau fest, dass sie die einzige ohne Basis ist und 0 Literale hat. Das Siegel „frühere Schnitte“ im Selbsttest ändert sich nur um diese zwei Einträge (neuer Wert im Test mit Begründung). | Die drei Test­dateien waren rot (Zählung), danach grün mit den neuen Werten; Werte und Gründe stehen als Kommentar am Ort. | keine eigene Mutation (Messwerte); die bestehenden Wächter laufen unverändert. |
| 4 | MITTEL: Bei aktiver Pause konnte die Leitung Betriebsrat-Zugänge über `POST /api/zugang-sperren` (einzeln, „alle des Betriebs“) zurückziehen und über Einladungen (`einladungAusstellen`, `einladungEinloesen`) für eine bestehende Betriebsrat-Person einen neuen Zugang anlegen. | Wie `betriebsratKontenSperre`: bei aktiver Pause 403, **auch ohne den Schalter**, auch bei unlesbarem Pausenstand; bei „alle des Betriebs“ wird die ganze Anfrage abgewiesen, nichts wird gesperrt. Das Protokoll nennt nur die Zahl der Betriebsrat-Zugänge. Das gilt auch für den Betreiber (wie bei `roles.assign`, dort hat der Betreiber den höchsten Rang und unterliegt der Sperre). Nicht lesbarer Bestand: fail closed. `RECHTEMATRIX.md`, Betriebshandbuch und Kommentar der Sperre entsprechend berichtigt. | Neu: `pruefungen/intelligence-steuerung-zugaenge.test.js` (8 Tests): einzeln, „alle des Betriebs“, ohne Schalter und bei unlesbarem Pausenstand, andere Rollen weiter sperrbar, ohne Pause wie bisher; Einladung ausstellen (403 / 403 bei unlesbarem Stand / andere Rollen ok / ohne Pause ok), Einladung einlösen (vor der Pause ausgestellt, bei Pause 403, kein Zugang), Gegenprobe ohne Pause legt den Zugang an. | Je Weg einzeln: Guard in `zugang-sperren` aus (3 Tests rot), Guard in `einladungAusstellen` aus, Guard in `einladungEinloesen` aus (jeweils gefangen, Zahlen im Bericht). |
| 5 | NIEDRIG | Kommentar `daten.mjs` „setzen und aufheben“ → „setzen“; JSDoc `kiPauseDurchBetriebsrat`: andere Teile werden ignoriert, abgewiesen wird nur eine ungültige Pause; Kommentar `betriebsratKontenSperre`: auch der Betreiber ist gesperrt; SSOT-Beleg „(lokal, nicht gepusht)“ → „PR #563“; Betriebshandbuch: Antwort „ja“ setzt die Pause und damit die Konten-Sperre auch bei Schalter AUS. | – | – |

**Art.-15-Frage (nur geprüft, kein Fix):** Die Selbstauskunft (`server/lib/auskunft.mjs`, `auskunftBauen`) nimmt aus `einstellungen` nur das Modulprotokoll; die Mitarbeitersicht (`eigeneSicht`) trägt `kiSteuerung` nicht (Sicht entfernt es für Beschäftigte). `vonPerson` in `kiSteuerung` (wer die Pause gesetzt oder aufgehoben hat) erscheint daher **nicht** in der eigenen Auskunft eines Betriebsratsmitglieds. Offener Punkt für die rechtliche Prüfung: Ob die Personenkennung im Betriebsstand auskunftspflichtig ist und in die Auskunft gehört (bei Bedarf als eigenes Paket). Gelesen, nicht per Test belegt.

**Offene Punkte:** Das Verhalten des Betreibers bei „zugang-sperren“ unter Pause (Notausgang „alle des Betriebs“ nicht möglich, solange pausiert) ist entsprechend der Vorgabe „Rollenvergabe darf den Schutz nicht umgehen“ gebaut; falls der Betreiber hier eine Ausnahme braucht, ist das eine Entscheidung. Eine bei Pause abgewiesene Einlösung verbraucht die Einladung (wie „Rolle geändert“); die Leitung stellt nach dem Aufheben neu aus.

## Entschiedene Punkte (Delta-Review, dritte Nachbesserung; entschieden durch die Betreiberentscheidungen vom 2026-11-26, umgesetzt in WP-I16 Teil 2, siehe unten)
a. **ENTSCHIEDEN und umgesetzt (Teil 2, Nr. 1).** Notausgang Betreiber bei aktiver Pause: `zugang-sperren` ist für den Betreiber mitgesperrt. Empfehlung des Reviewers: Sperren und Widerruf aus Sicherheitsgründen erlauben und protokollieren, nur Anlegen und Umstellen sperren.
b. **ENTSCHIEDEN und umgesetzt (Teil 2, Nr. 2).** Schreibweg der Leitung: Die Antwort „ja“ auf die Frage nach der Vertretung setzt die Pause; dieser Weg liegt hinter keinem Schalter.
c. **ENTSCHIEDEN und umgesetzt (Teil 2, Nr. 3).** Betreiberweg `POST /api/zugaenge`: ohne Pausenprüfung.
d. **GEPRÜFT (Teil 2, Nr. 4; Rechtsbewertung bleibt offen).** Art. 15 `vonPerson`: Auskunftspflicht der Personenkennung im Pausenstand (siehe oben).
e. **ENTSCHIEDEN (Teil 2, Nr. 5; keine Änderung nötig).** Betrieb/Raum löschen entfernt die Pause.

## Nachbesserung 3 (Messung)
V4-3b: Fixture `v4-radiusstufen-basis.json` und das Siegel „frühere Schnitte“ (`39a960cf…`) stehen wieder auf dem ursprünglichen Stand. Die neue Datei `src/ansichten/ki-steuerung.jsx` steht stattdessen in einer ausdrücklichen Ausnahmeliste „neu seit der Basis, ohne Literale“ (`NEU_SEIT_BASIS`, genau diese eine Datei) in `v4-3b-querschnitt-1/2.test.js`; geprüft wird, dass sie nicht in der Fixture steht und 0 Form-/Farbliterale hat. Messwerte tragen den begründeten Aufschlag (Dateien/Sichtbar/Zeilen/Inline-Stile) für diese eine Datei; jede Datei mit Basis bleibt byte-gleich.


---

## WP-I16 Teil 2 — Betreiberentscheidungen 2026-11-26 (Branch `intelligence/wp-i16-teil-2`, lokal, nicht gepusht)
Prozessstufe L3, Umfangsklasse SICHERHEIT-QUALITAET. Nur synthetische Daten; keine `.github/workflows`-Änderung; Schalter `CENTRIC_KI_BR_PAUSE` bleibt AUS (nirgends gesetzt); kein neuer Weg, keine neue Route.

### Modell: zwei getrennte Pausen (Folgeentscheidung zu Nr. 2)
Die Betreiberentscheidung zur Rückfrage legt fest: Die Betriebsrat-Konten-Sperre löst **ausschließlich eine bestehende Betriebsrat-Pause** aus, nicht allein eine Leitung-Pause; keine Pause überschreibt oder hebt die andere auf. Umsetzung (`server/lib/ki-steuerung.mjs`): Neben `kiSteuerung.pause` (Betriebsrat, oder die durch die Antwort „ja“ gesetzte Einrichtungspause; unverändert: Setzen Betriebsrat hinter dem Schalter, Aufheben nur Leitung mit gesehenem `am`+`nr`) gibt es `kiSteuerung.leitungPause` mit eigenem Stempel (`aktiv`, `am`, `nr`, `vonRolle`, `vonPerson`). Die Leitung setzt und hebt sie auf, ohne den Schalter; Aufheben wieder als Compare-and-set (`am` UND `nr`; ein unlesbarer Stand ist ohne Stempel aufhebbar). Der Betriebsrat und alle anderen Rollen berühren sie nie. Die Leitung setzt `pause` nie. Ereignisse im Betriebsstand/-protokoll: `leitungspause-gesetzt`/`-aufgehoben` (nur Art, Ziel, Rolle). Wirkung: `intelligenceEntscheidung` verlangt BEIDE Pausen aus (unlesbare Stände beider zählen als pausiert, fail closed). Die Konten-Sperre (`betriebsratKontenSperre`, `zugang-sperren`, `POST /api/zugaenge`, Einladungen) nutzt neu `kiBrPauseAktiv` (nur `pause`, unlesbar = aktiv); `kiPauseAktiv` meint jetzt „Intelligence pausiert“. Sicht: Betriebsrat sieht `leitungPause` ohne Personenkennung; `transparenz` führt `leitungPause` als Geschwisterfeld. **Folge zur Beachtung:** Die durch die Antwort „ja“ gesetzte Pause liegt in `pause` und löst daher weiterhin die Konten-Sperre aus (wie im Handbuch beschrieben); sie trägt aber den Stempel der Leitung. Eine Oberflächenschaltfläche „eigene Pause setzen“ für die Leitung gibt es noch nicht (Schreibweg und Sicht stehen; die Oberfläche bleibt hinter `KI_STEUERUNG_PROZESS = "aus"`).

### Entscheidungen → Umsetzung → Test → Mutation
| Nr. | Entscheidung | Umsetzung | Test (rot → grün) | Mutation (je Schutz einzeln, gefangen) |
|---|---|---|---|---|
| 1 | Betreiber darf kompromittierte Betriebsrat-Zugänge sperren, auch bei aktiver oder unlesbarer Pause; Pause bleibt; Protokoll Pflicht; Leitung bleibt gesperrt | `server/funktionen/daten.mjs` (`zugang-sperren`): bei `gesperrtDurchPause` und `sB.rolle === "betreiber"` wird gesperrt; vorher eine Protokollzeile „Sicherheitssperre durch Betreiber: n Betriebsrat-Zugang bei aktiver Pause“ (nur Art und Zahl); sonst 403 wie bisher. Nur Sperren: Pause und Stand werden nicht angefasst; Anlegen/Umstellen bleiben gesperrt. | `intelligence-steuerung-zugaenge.test.js`, Gruppe „Nr. 1“: einzeln, „alle des Betriebs“ (ohne Schalter; eigener Zugang bleibt), unlesbarer Stand (Stand unverändert), Leitung 403, ohne Pause keine „Sicherheitssperre“-Zeile, Pause (`nr`, `aktiv`) unverändert, keine Person/kein Code im Protokoll. Rot vor der Änderung: 5 Tests (403 statt 200; Nr. 3 gleichzeitig). | M1 Ausnahme für alle Rollen (2 Tests rot), M2 Ausnahme entfernt (4), M3 ohne Protokollzeile (3) |
| 2 | Leitung setzt EIGENE Pause ohne Schalter; BR-Befugnisse bleiben an Freigabe/Schalter; Folgeentscheidung: getrennte Pausen, Konten-Sperre nur bei BR-Pause | siehe Modell oben | `intelligence-steuerung.test.js`: Leitung setzt `leitungPause` ohne Schalter (Server stempelt, mitgeschickte Werte zählen nie, alle Funktionen gesperrt); nur Leitung (nicht Demo) darf, alle anderen Rollen nie; Aufheben nur mit `am`+`nr` (blind, falsche `nr` wirkungslos); (1) Leitung-Pause überschreibt bestehende BR-Pause nicht; (2) Aufheben der Leitung-Pause beseitigt BR-Pause nicht und umgekehrt, Intelligence pausiert, solange eine aktiv ist, beide in einer Anfrage aufhebbar; unlesbare `leitungPause` pausiert, sperrt aber keine Konten; (3) Konten-Sperre nur bei BR-Pause (nur Leitung: frei; BR: gesperrt; beide: gesperrt; nach Aufheben der Leitung-Pause weiter gesperrt; nach Aufheben der BR-Pause frei). `intelligence-steuerung-handler.test.js`: über PUT /api/bestand ohne Schalter; Betriebsrat hebt nie auf; Leitung setzt `pause` nie. `intelligence-steuerung-zugaenge.test.js` „Nr. 2“: bei reiner Leitung-Pause sperrt die Leitung Betriebsrat-Zugänge (200), Einladung für Betriebsrat-Person und `POST /api/zugaenge` gehen (200); mit BR-Pause (auch zusätzlich, auch nach Aufheben der Leitung-Pause) 403. | M8 Leitung ohne Recht auf `leitungPause` (8 rot), M9 Betriebsrat hebt BR-Pause auf (4), M10 Konten-Sperre bei jeder Pause (1), M11 Intelligence ignoriert Leitung-Pause (3), M12 Aufheben der Leitung-Pause hebt BR-Pause mit auf (2), M13 Setzen überschreibt BR-Pause (5), M14 ohne Compare-and-set (1), M15 Konten-Sperre ignoriert unlesbaren BR-Stand (1), M16 unlesbare Leitung-Pause pausiert nicht (1) |
| 3 | `POST /api/zugaenge` hält die Pausenschutzregeln ein | `daten.mjs`: nach der Raumprüfung, VOR Kundenraumschutz und Ersteinrichtungsvermerk: neue Betriebsrat-Codes bei aktiver BR-Pause (auch ohne Schalter, auch unlesbarer Stand) → 403, ganze Anfrage abgewiesen, nichts entsteht; Protokoll nur die Zahl. | Gruppe „Nr. 3“: 403 bei Pause, ohne Schalter, unlesbar; gemischte Anfrage (nichts entsteht, Zahl im Protokoll); Gegenprobe andere Rollen und aufgehobene Pause 200. Rot vor der Änderung: 2 Tests (200 statt 403). | M4 ohne Prüfung (2), M5 nur mit Schalter (2), M6 ignoriert unlesbaren Stand (2), M7 prüft nur den ersten Eintrag (1) |
| 4 | Art. 15 / `vonPerson`: nur prüfen | Keine Codeänderung. `auskunftBauen` nimmt aus `einstellungen` nur das Modulprotokoll; `kiSteuerung` (auch `vonPerson`, `leitungPause`) erscheint in der eigenen Auskunft eines Betriebsratsmitglieds **nicht**. Rechtsbewertung nicht getroffen. | `intelligence-steuerung.test.js`, Gruppe „Art. 15“: Auskunft (mit und ohne eigene Sicht) enthält weder `kiSteuerung` noch `vonPerson` noch Pausen-Ereignisse. Test grün ohne Codeänderung (reine Prüfung). | – |
| 5 | Betriebslöschung bleibt Betreiber-Hoheitsakt | Keine Änderung. Löschung berücksichtigt bestehende Lösch-/Aufbewahrungs-/Sicherheitsanforderungen; die KI-Pause wird im laufenden Betrieb nicht umgangen. Geprüft (Lehre #561/#563): Wiederherstellen trägt `kiSteuerung` (beide Pausen) aus dem jetzigen Stand zurück (`sicherungen.mjs`, Test „Wiederherstellen aus einer alten Sicherung…“) und läuft durch `rollenwechselErlaubt`; Import/Übernahme läuft über `zusammenfuehren`; `bestand-anlegen` ersetzt keinen belegten Raum (409) und verwirft `kiSteuerung` neuer Betriebe; der Betreiber schreibt über `PUT /api/bestand` nur kaufmännische Felder. | Gruppe „Nr. 5“: Betreiber-PUT entfernt weder Pause noch Betriebsrat-Personen; `bestand-anlegen` auf belegten Raum 409, Pause bleibt. Der Löschlauf (Aufbewahrungsfristen) anonymisiert Personen nach gesetzlichen Fristen und lässt die Steuerung unberührt; er läuft als Systemlauf ohne Rollenvergabe. | – |

### Testzahlen (lokal, TZ=UTC, `--maxWorkers=1`)
Siehe Bericht des Koordinators; Dateien: `intelligence-steuerung{,-handler,-oberflaeche,-zugaenge}.test.js` (Kern 62, Handler 12, Zugänge 20, Oberfläche), danach die angrenzenden Suiten (rechtematrix*, rollenvergabe, prozess-wachen, die `zugang-sperren`/`api/zugaenge`-Tests).

### Offene Rückfragen
Keine verbleibenden für die Betreiberentscheidungen. Hinweis: Die „ja“-Pause liegt in `pause` (Betriebsrat-Schutzwirkung, Konten-Sperre); sollte sie als Leitung-Pause behandelt werden, wäre die Konten-Sperre bei „ja“ entfallen. Das wurde nicht entschieden und bleibt wie bisher dokumentiert. **→ Inzwischen entschieden, siehe Teil 3.**

---

## WP-I16 Teil 3 — Leitung-„ja“ = Leitung-Pause (Betreiberentscheidung 2026-11-26, spät; Branch `intelligence/wp-i16-leitung-ja`, lokal, nicht gepusht)
Entscheidung (verbindlich): Die durch die Leitung ausgelöste Antwort „ja“ wird als Leitung-Pause (`leitungPause`) geführt, sofern keine ausdrücklich beschlossene stellvertretende Betriebsrat-Pause vorliegt. Die Leitung kann durch eine eigene Pause die Betriebsrat-Konten-Sperre nicht auslösen. Bestehende Betriebsrat-Pausen, ihre Schutzwirkung und die Sicherheitssperre des Betreibers bleiben unverändert.

**Klassifikation:** Leitung-„ja“ → `leitungPause`: umgesetzt. Stellvertretende Betriebsrat-Pause: **Entscheidung nötig** — im Repo gibt es dafür kein Datenfeld, keinen Beschlussvermerk und keinen Schreibweg (`git grep stellvertret` trifft nur WR-3/Kontowiederherstellung). Es wurde nichts erfunden; der einzige bestehende Weg zur Betriebsrat-Pause (`kiPauseDurchBetriebsrat`, Betriebsrat selbst, hinter `CENTRIC_KI_BR_PAUSE`) bleibt unverändert.

### Invarianten (vor der Umsetzung festgelegt)
| # | Invariante |
|---|---|
| I1 | Zustände: `pause` = Betriebsrat-Pause (setzt nur der Betriebsrat hinter dem Schalter; im Altbestand auch die früher durch „ja“ gesetzte Pause). `leitungPause` = Leitung-Pause (setzt die Leitung ausdrücklich oder mittelbar über „ja“). Eine stellvertretende Betriebsrat-Pause gibt es nicht als Zustand. |
| I2 | „ja“ (nur Leitung, nicht Demo; `vorher !== "ja"`) setzt `leitungPause` (aktiv, `nr`+1, Stempel der Leitung, Ereignis `leitungspause-gesetzt`/Ziel `einrichtung`), außer sie ist schon aktiv (dann kein neuer Stempel, kein Ereignis). `pause` wird dabei nie geschrieben, auch nicht wenn sie aufgehoben ist oder fehlt. |
| I3 | Konten-Sperre (`betriebsratKontenSperre`, `zugang-sperren`, `POST /api/zugaenge`, Einladungen) nur über `kiBrPauseAktiv` = `pause` aktiv oder unlesbar. Leitung-Pause (auch die „ja“-Pause) löst sie nie aus und beseitigt sie nie. |
| I4 | Intelligence pausiert, solange eine der beiden Pausen aktiv oder unlesbar ist. Bei Antwort „ja“ zusätzlich: frei erst, wenn mindestens eine Pause vorhanden und ausdrücklich aufgehoben ist (`leitungPause` oder Altbestand `pause`); sonst `KI_PAUSIERT` (fail closed). |
| I5 | Aufheben beider Pausen nur durch die Leitung, als Compare-and-set auf `am`+`nr` der gesehenen Pause; der Betriebsrat hebt nie auf. Aufheben der einen berührt die andere nie. |
| I6 | Altbestand (`pause` mit Stempel `leitung` aus einem früheren „ja“): keine Migration, keine Umdeutung beim Lesen oder bei anderen Schreibvorgängen — die Konten-Sperre bleibt bestehen, bis die Leitung diese Pause wie bisher aufhebt (Schutzwirkung nicht schwächer). |
| I7 | Protokoll: jedes Setzen/Aufheben als Ereignis im Betriebsstand (Rolle, Personenkennung) und im Betriebsprotokoll nur Art, Ziel, Rolle. Betreiber-Sicherheitssperre unverändert. |

### Schreibwege und Umgehungen (zusammenhängend geprüft)
- Wer kann „ja“ setzen: nur die Leitung (Recht `frage`; Planung, Kunde, Schichtverantwortung, Beschäftigte, Betriebsrat, Betreiber und Demo nie — bestehende Tests unverändert). Der Betriebsrat kann mit einer mitgeschickten Frage nichts ändern (bestehender Test „der Betriebsrat ändert sonst nichts“). Der Betreiber schreibt über `PUT /api/bestand` nur kaufmännische Felder.
- Import, Teilweg, Wiederherstellen: laufen über `zusammenfuehren`/`rollenwechselErlaubt` — derselbe Kern, keine eigene „ja“-Logik.
- Oberfläche (`src/ansichten/ki-steuerung.jsx`, weiter hinter `KI_STEUERUNG_PROZESS = "aus"`): zeigt „pausiert“, wenn eine der beiden Pausen aktiv ist; „Pause aufheben“ der Leitung hebt zuerst genau die Leitung-Pause auf (mit ihrem Stempel), sonst die Betriebsrat-Pause — nie beide mit einem Klick. Der Betriebsrat kann bei reiner Leitung-Pause zusätzlich seine eigene Pause setzen. Zeilenzahl der Datei unverändert (154; V4-3b-Messung bleibt gleich).
- Transparenz (`transparenz.mjs`): führt `leitungPause` bereits als Geschwisterfeld — keine Änderung nötig.
- Einladungen und `POST /api/zugaenge`, `zugang-sperren`: nutzen `kiBrPauseAktiv` — keine Codeänderung; Wirkung per End-zu-End-Test belegt.

### Widerspruch zu bestehender fachlicher Vorgabe (benannt, nicht still umgangen)
Der Plan (`INTELLIGENCE-ENTWICKLUNGSPLAN.md`, I16) und der frühere Kommentar im Kern sahen vor: „ja“ → keine Modellaufrufe, **bis der Betriebsrat bestätigt**. Das war schon in Teil 1/2 nicht so umgesetzt (die Leitung hebt allein auf, offene Frage 1). Mit dieser Entscheidung entfällt zusätzlich die Schutzwirkung „ja“ → Konten-Sperre: Nach „ja“ und vor einer eigenen Pause des Betriebsrats kann die Leitung Betriebsrat-Zugänge anlegen, ändern und zurückziehen (protokolliert). Handbuch und Rechtematrix sagten bisher ausdrücklich „ja setzt die Pause und damit die Konten-Sperre“ — berichtigt. Bewertung im Rahmen der rechtlichen Prüfung (offene Frage 1/2/6).

### Tests (rot → grün)
Rot vor dem Code: 10 Tests (4 Dateien) aus dem richtigen Grund (`pause` statt `leitungPause`, Konten-Sperre bei „ja“, Freigabe nur über `pause`, Oberfläche ohne Leitung-Pause, End-zu-End `zugang-sperren` nach „ja“). Wegen der Entscheidung angepasst (nicht abgeschwächt, Richtung umgestellt): „Antwort ja“, „Leitung kann die Pause nicht umgehen“ (zusätzlich: BR-Pause unverändert), Schalter-Test, Betriebsprotokoll (`leitungspause-gesetzt einrichtung (leitung)`), Konten-Sperre bei „ja“ (jetzt frei, mit BR-Pause gesperrt), Handler „ja ohne Schalter“. Neu: „ja“ bei bestehender BR-Pause, „ja“ bei schon aktiver Leitung-Pause, Altbestand, „ja“ ohne aufgehobene Pause (fail closed), Oberfläche Leitung-Pause, Zugänge End-zu-End (Stand aus dem echten Schreibweg; Altbestand 403). Unverändert grün (Gleichwertigkeit): alle reinen BR-Pause-, Betreiber-Sicherheitssperre-, `POST /api/zugaenge`- und Einladungstests.

### Mutationen (je Schutz einzeln, Quelle nach jedem Lauf wiederhergestellt und verglichen; 4 Dateien `intelligence-steuerung*`)
| Mutation | Ergebnis |
|---|---|
| M1 „ja“ setzt wieder `pause` | gefangen (8) |
| M2 „ja“ setzt keine Pause | gefangen (7) |
| M3 Freigabe bei „ja“ nur über aufgehobene `pause` | gefangen (2) |
| M4 „ja“ ohne aufgehobene Pause frei | gefangen (1) |
| M5 „ja“ stempelt aktive Leitung-Pause neu | zuerst **überlebt**, Test ergänzt, danach gefangen (1) |
| M6 „ja“ verwirft bestehende BR-Pause | gefangen (3) |
| M7 Konten-Sperre auch bei Leitung-Pause | gefangen (7) |
| M8 Oberfläche hebt zuerst die BR-Pause auf | gefangen (1) |
| M9 Oberfläche zeigt Leitung-Pause nicht | gefangen (1) |

### Nicht umgesetzt (Scope Freeze; Hinweise)
- `POST /api/zugaenge`: zusätzlich die Rolle der Person prüfen (Code-Rolle ≠ Betriebsrat, Person Betriebsrat) — Code in diesem Teil nicht berührt, offen.
- `zugang-sperren`: Protokollzeile „erfolg“ der Betreiber-Sicherheitssperre steht laut Entscheidung Nr. 1 VOR dem Sperren; ein Umstellen auf „erst nach dem Sperren“ widerspräche dem Wortlaut „Protokollzeile VOR dem Sperren“ — Klärung nötig (z. B. „begonnen“ vorher, „erfolg“ danach). Nicht berührt.
- Migration des Altbestands (`pause` mit Stempel `leitung` aus früherem „ja“) zu `leitungPause`: bewusst nicht gemacht (würde die Konten-Sperre still lösen); falls gewünscht, Entscheidung nötig.
