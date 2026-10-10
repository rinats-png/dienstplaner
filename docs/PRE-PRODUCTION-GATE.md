# Pre-Production-Gate — Release-Candidate-Aufräumen

| | |
|---|---|
| Datum | 2026-10-10 |
| Ausgangsstand | `7a385d19` (Phase A.1 auf Staging bestanden, siehe [PHASE-A1-STAGING-REPORT.md](PHASE-A1-STAGING-REPORT.md)) |
| Branch | `fix/pre-production-cleanup` |
| `main` | unverändert `223dd385` |
| Production | unverändert |

Es gibt keine Architekturänderung, kein neues Feature und keine Änderung an der Sitzungslogik.

---

## 1. Altbefunde: Ursache und Bewertung

Alle vier Befunde bestanden schon vor Phase A.1. Das Frontend ist zwischen 223dd385 und 7a385d19
identisch; beide Bilder liefern dasselbe Bundle.

### A — Dialog „Person hinzufügen“: Fokus springt nach dem ersten Zeichen auf „Fertig“

**Ursache.** `Sheet` (`src/App.jsx`) führt den Fokus in einem `useEffect` mit den
Abhängigkeiten `[open, onClose]`. Die Aufrufer übergeben `onClose` als Pfeilfunktion, also bei
jedem Rendern eine neue. Jeder Tastendruck in einem Feld des Blatts rendert neu, und dann:

1. Der Effekt räumt auf und gibt den Fokus zurück.
2. Er läuft neu und setzt den Fokus auf das erste fokussierbare Element im Blatt — „Fertig“.
3. Nebenbei wird das Blatt im Escape-Stapel neu eingereiht.

**Betroffen** ist jedes `Sheet` mit Eingabefeldern, nicht nur dieser Dialog.

**Nicht betroffen** sind `RechtFenster` und `Konfliktfenster`: Sie haben dasselbe Muster,
enthalten aber keine Eingabefelder. Ein erneuter Fokus auf den Rahmen stört dort keine Eingabe.
`Fenster` wird nirgends gerendert.

| Frage | Antwort |
|---|---|
| Risiko | mittel: Formulare in Blättern sind praktisch nur mit der Maus und Zeichen für Zeichen bedienbar |
| Security | nein |
| Datenintegrität | nein; was im Feld steht, wird unverändert gespeichert |
| nur UX | ja, aber zentrale Bedienung (Personal anlegen u. a.) |
| vor Production beheben | **ja** |

**Behebung.** `onClose` liegt in einer Ref; der Effekt hängt nur noch an `open`. Escape (am Blatt
und am Dokument), Tab-Falle und Fokusrückgabe beim Schließen bleiben unverändert.

### B — `kalender.mjs`: 500 ohne Protokoll

**Ursache.** Der `catch` des Handlers antwortete `{ fehler: "Serverfehler" }` mit 500 und
verwarf die Ursache. `daten.mjs` und `zustellung.mjs` schreiben sie dagegen ins App-Protokoll
(`centric-spur`, Art `fehler`).

| Frage | Antwort |
|---|---|
| Risiko | niedrig; Fehler im Kalender-Feed bleiben unsichtbar |
| Security | indirekt (Beobachtbarkeit), kein Leck |
| Datenintegrität | nein |
| nur UX | nein; Betrieb und Diagnose |
| vor Production beheben | empfohlen, weil risikoarm |

**Behebung.** Der `catch` protokolliert wie `daten.mjs`. Nach außen bleibt es generisch, ohne
Interna. Der Feed-Pfad trägt das Geheimnis; protokolliert wird nur `kalender/feed`.

### C — `POST /kalender/daten` prüft die Termine nicht

**Ursache.** Gespeichert wurde jede Liste, die ein Array war (höchstens 800 Einträge). Ein
Termin ohne Uhrzeit oder mit kaputtem Datum fiel erst beim Feed-Abruf auf — als 500.

**Bei der Untersuchung zusätzlich gefunden:** Kennung, Datum und Uhrzeit gingen ungeprüft in
ICS-Zeilen, und `esc()` ließ `\r` durch. Mit Zeilenumbrüchen in diesen Feldern ließen sich
eigene Zeilen (z. B. `ATTENDEE`) in den Feed schreiben. Betroffen ist nur der Feed, den die
angemeldete Person selbst befüllt; über Betriebe hinaus wirkt das nicht. Außerdem führte kaputtes
JSON im Rumpf zu 500 statt 400.

| Frage | Antwort |
|---|---|
| Risiko | niedrig; Feed-Ausfall, Zeileninjektion nur in den eigenen Feed |
| Security | niedrig (Eingabevalidierung, ICS-Injektion in eigene Daten) |
| Datenintegrität | gering; ungültige Termine wurden gespeichert |
| nur UX | nein |
| vor Production beheben | empfohlen, weil risikoarm und eindeutig definierbar |

**Behebung.**
- Strenges Schema, das genau die Form abbildet, die die Anwendung baut (`kalenderTermine` in `App.jsx`):
  - **ganztägig:** `datum` und `bis`, wobei `bis` nach `datum` liegt;
  - **Dienst:** `datum`/`von` und `endDatum`/`bisZeit`; `endDatum` ist derselbe Tag oder bei Nachtdiensten der Folgetag; „24:00“ ist als Dienstende erlaubt;
  - Kennung `[A-Za-z0-9_.:-]{1,120}`; Texte höchstens 200 Zeichen.
- Ungültige Eingaben ergeben 400 mit Feld und Stelle; gespeichert wird dann nichts.
- Kaputtes JSON ergibt 400; der Rumpf ist auf 1 MB begrenzt.
- `esc()` maskiert auch `\r`.
- „24:00“ wird im ICS zu 00:00 des Folgetags (ICS kennt keine Stunde 24).
- Altdaten aus der Zeit vor der Prüfung: Ungültige Termine fehlen im Feed, statt ihn scheitern
  zu lassen.

### D — Unlesbares `t:` ergibt 500 statt 401

**Ursache.** Wenn eine Sitzungsdatei vorübergehend nicht gelesen werden kann (Rechte, E/A),
wirft die Ablage. Der zentrale Prüfpunkt fängt das nicht als „nicht angemeldet“ ab. Der Handler
antwortet generisch mit 500 und protokolliert die Ursache. Die Datei wird nicht gelöscht, es gibt
keinen Rückfall auf eine andere Autorität, und nach der Erholung ist die Sitzung wieder gültig
(Phase A.1, Abschnitt 12).

**Bewertung der Semantik.** Der Client meldet sich bei **jedem** 401 sofort ab und verwirft das
Merkmal (`src/speicher.js`, `ruf()`: `if (a.status === 401) abmelden(true)`). Ein 401 bei einem
vorübergehenden Lesefehler würde also eine gültige Sitzung beenden — die Person müsste sich neu
anmelden, obwohl nichts ungültig ist. Ein 500 lässt sie stehen; die nächste Anfrage nach der
Erholung gelingt.

Fail closed gilt in beiden Fällen: Es wird nichts erlaubt. 401 behauptet aber etwas, das der
Server nicht weiß („diese Sitzung gilt nicht“). 500 sagt die Wahrheit („ich konnte es nicht
prüfen“).

| Frage | Antwort |
|---|---|
| Risiko | keines; Verhalten ist korrekt |
| Security | nein; fail closed |
| Datenintegrität | nein |
| nur UX | — |
| vor Production beheben | **nein, nicht ändern** |

**Entscheidung.** Keine Änderung. Die Semantik von 500 ist hier richtig; 401 wäre eine
Verschlechterung, weil der Client eine gültige Sitzung verwürfe. Die Sitzungslogik bleibt damit
unverändert, und die Regression aus Phase A.1 (F1/F3/R1/F4, 36-Minuten-Tests) gilt weiter.
(Denkbar wäre später 503 statt 500; das ist kosmetisch und gehört nicht in dieses Gate.)

---

## 2. Tests

**A (lokal, echter Server auf `localhost` mit Wegwerfdaten, Browser):**
- „Ömer-Jürgen“ vollständig getippt, mit Tab weiter, „Äßling-Weiß“ vollständig getippt.
- Tab führt weiter zur Funktionsauswahl.
- Hinzufügen schließt das Blatt; der Fokus kehrt zum auslösenden Knopf zurück.
- Nach dem Neuladen steht die Person in der Liste; serverseitig gespeichert, UTF-8 korrekt.
- Escape schließt das Blatt weiterhin. Keine Konsolenfehler.

**B/C:** neue Prüfung `pruefungen/kalender.test.js`, 33 Fälle, am echten Handler. Sie ist in
`npm run pruefung` und im CI-Gate (`pruefung.yml`) eingetragen.
- **Gültig:** Dienst, Nachtdienst, ganztägig, Dienstende 24:00; Feed als ICS mit Umlauten.
- **Ungültig:** fehlende Pflichtfelder, falsches Datum (30. Februar, Monat 13, Wort),
  falsche Uhrzeit (25:00, 6:00, 12:60), Ende vor Beginn, Enddatum zu weit, Kennung mit
  Zeilenumbruch, falsche Typen, über 800 Termine — jeweils 400; gespeichert wird nichts.
- Kaputtes JSON und ein Array als Rumpf ergeben 400.
- Zeilenumbrüche in Texten werden maskiert; es entstehen keine neuen ICS-Zeilen.
- Altdaten mit ungültigen Terminen: Der Feed liefert 200 ohne sie.
- Fehler im Handler: nach außen 500 ohne Interna, im Protokoll mit Ursache, ohne Geheimnis.

**Gegenprobe:** Gegen den alten Handler scheitern 32 von 33 Fällen. Der eine verbleibende prüft
gültige Termine und kann dort nicht scheitern. Die Prüfung hat außerdem einen Fehler im ersten
Entwurf der Validierung gefunden (ein ungültiges Datum warf), bevor er ausgeliefert wurde.
