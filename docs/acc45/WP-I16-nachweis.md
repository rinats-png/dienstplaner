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
