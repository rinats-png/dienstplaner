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

## Offene Entscheidungen (Delta-Review, dritte Nachbesserung; nicht geändert)
a. **Notausgang Betreiber bei aktiver Pause:** `zugang-sperren` ist für den Betreiber mitgesperrt. Empfehlung des Reviewers: Sperren und Widerruf aus Sicherheitsgründen erlauben und protokollieren, nur Anlegen und Umstellen sperren.
b. **Schreibweg der Leitung:** Die Antwort „ja“ auf die Frage nach der Vertretung setzt die Pause; dieser Weg liegt hinter keinem Schalter.
c. **Betreiberweg `POST /api/zugaenge`:** ohne Pausenprüfung.
d. **Art. 15 `vonPerson`:** Auskunftspflicht der Personenkennung im Pausenstand (siehe oben).
e. **Betrieb/Raum löschen** entfernt die Pause.

## Nachbesserung 3 (Messung)
V4-3b: Fixture `v4-radiusstufen-basis.json` und das Siegel „frühere Schnitte“ (`39a960cf…`) stehen wieder auf dem ursprünglichen Stand. Die neue Datei `src/ansichten/ki-steuerung.jsx` steht stattdessen in einer ausdrücklichen Ausnahmeliste „neu seit der Basis, ohne Literale“ (`NEU_SEIT_BASIS`, genau diese eine Datei) in `v4-3b-querschnitt-1/2.test.js`; geprüft wird, dass sie nicht in der Fixture steht und 0 Form-/Farbliterale hat. Messwerte tragen den begründeten Aufschlag (Dateien/Sichtbar/Zeilen/Inline-Stile) für diese eine Datei; jede Datei mit Basis bleibt byte-gleich.
