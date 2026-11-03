# WP-16 Pausen und Monatsabschluss — Nachweis

Branch `acc45/time/wp16-pausen-und-monatsabschluss`, abgezweigt von `origin/integration/centric-complete` (741c844; enthält
WP-06, WP-07, WP-13, WP-14, WP-17, WP-20, WP-27, WP-47). Lokale Läufe unter Windows 11, Node 24.18; maßgeblich ist die
Linux-CI.

Akzeptanz: Pausenerfassung, ArbZG-Mindestpause-Warnung; Abschluss sperrt Ist; Wiederöffnen protokolliert.

## Pausenerfassung und Mindestpause

- **Erfassung beim Ausstempeln** (`POST /api/stempeln`, `art: "ende"`, optional `pause` in Minuten). Die Pause gehört zum
  **Original** des Stempels (`einstempeln[k].pause`; über das Speichern unveränderlich, WP-06 — geprüft) und steht an der
  Ist-Zeit (`erfassung[k].pause`). Die Ist-Rechnung (`istZeitFuer`, WP-14 C4) nimmt sie vor der Pause der Dienstart.
  Ohne Angabe bleibt alles wie bisher (Pause der Dienstart).
- **Ungültige Angabe kostet nie den Stempel:** keine ganze Zahl 0–180 oder nicht kürzer als die gestempelte Anwesenheit →
  gespeichert ohne Pause, Kennzeichen `PAUSE_UNGUELTIG`.
- **Offline-Puffer (WP-07):** Das Ereignis trägt die Pause (`stempelpuffer.js` `erfassen`, `rumpfFuer`; nur beim Ende).
- **Selbstauskunft** (`/api/zeit-bestaetigen`) nimmt ebenfalls eine Pause an (0–180, kürzer als die Anwesenheit, sonst 422).
- **Oberfläche:** Stempeluhr und mobile Stempelfläche zeigen beim Ausstempeln „Pause (min)“, vorbelegt mit der Pause der
  geplanten Dienstart. Die Meldung nach dem Ausstempeln nennt einen Pausenhinweis.
- **Mindestpause = Hinweis, keine Sperre.** Eine Rechnung (`server/lib/regelwerk.mjs` `pausePflicht(h, jugendlich)`):
  § 4 ArbZG (mehr als 6 h: 30 min, mehr als 9 h: 45 min) unverändert; neu für Jugendliche **§ 11 JArbSchG** (mehr als 4,5 h:
  30 min, mehr als 6 h: 60 min). Wiederverwendet in `zeitregeln.mjs` `regelHinweise` (Stempeln, Korrektur, Antrag,
  Selbstauskunft; Alter über `schutzpruefung.mjs` `alterAm`) und in der Prüfungsansicht der Oberfläche (`pauseGenuegt`). Keine
  zweite Rechenlogik. Die Antwort trägt `hinweise`; eine **angegebene**, zu kurze Pause bekommt zusätzlich das Kennzeichen
  `PAUSE_ZU_KURZ` am Stempel (sichtbar in den Stempelbefunden). Ohne Angabe nur der Hinweis in der Antwort — sonst trüge jeder
  Bestandsstempel ohne Pause ein Kennzeichen.
- **Nebenbefund behoben:** `pruefZeitFuer` (`src/istdaten.js`, Prüfungsansicht „Ruhepause zu kurz“) rechnete mit der Pause der
  Dienstart, auch wenn eine Pause erfasst war (seit WP-14 möglich). Jetzt dieselbe Regel wie `istZeitFuer`.

## Monatsabschluss

Ablage: `m.monatsabschluss["JJJJ-MM"] = { abgeschlossen, am, wer, abdruck?, verlauf: [...], abgewiesen? }` im Kern des
Betriebs (`server/lib/monatsabschluss.mjs`). `abdruck` ist eine SHA-256-Prüfsumme der Ist-Daten des Monats (Stempel und
Erfassung, Schlüssel geordnet) zum Abschluss. SHA-256 ist in reinem JS umgesetzt, weil die Datei über `sicht.mjs` auch ins
Oberflächen-Bündel geht; gegen `node:crypto` geprüft.

### Abschließen und Wiederöffnen (`POST /api/monatsabschluss`)

| Aktion | Wer | Regeln |
|---|---|---|
| `abschliessen` | Leitung, Planung, Kundenrolle (`staff.edit` + Vollschreibrecht; `rechte.mjs` `abschlussRecht`) | nur vergangene Monate (422); schon abgeschlossen 409; **offene Korrekturanträge sperren** (409 `ABSCHLUSS_ANTRAEGE_OFFEN`); unvollständige Stempel oder Ist-Zeiten zur Prüfung → 409 `ABSCHLUSS_PRUEFFAELLE` mit Zahlen, mit `trotzPrueffaellen: true` abgeschlossen und im Verlauf vermerkt; optionaler Vermerk ≤ 500 Zeichen |
| `wiederoeffnen` | **nur Leitung** und Kundenrolle (`org.edit`) | Grund 10–500 Zeichen (422); nicht abgeschlossen 409; Verlauf mit `abdruckGleich` (Ist seit dem Abschluss unverändert?) |

Jeder Schritt steht im Verlauf am Monat (`id`, `art`, `am`, `wer {personId, name, rolle}`, `grund`, `abdruck`) und im
Betriebsprotokoll (Spur: Monat, Ausgang, Rolle und Person; Wiederöffnen mit Grund). Beide unter der Raumsperre am frisch
gelesenen Stand (WP-02) in einem Schreibvorgang (WP-45). Verlauf höchstens 200 Schritte je Monat.

### Abschluss sperrt Ist — alle Schreibwege, serverseitig

| Weg | Verhalten im abgeschlossenen Monat |
|---|---|
| `POST /api/stempeln` | 409 `MONAT_ABGESCHLOSSEN` (Tag aus `stempelZiel`, also auch das Ende eines Nachtdiensts vom letzten Monatstag). Nichts am Monat ändert sich; **der Stempel wird für die Leitung am Abschluss vermerkt** (`abgewiesen`: Person, Tag, Art, Zeit, offline, Ereigniskennung — je Kennung einmal; Prüfsumme unverändert). Eine Wiederholung (Idempotenz WP-07) wird vorher erkannt. Ein KONFLIKT-Kennzeichen an einem alten Vorgang in einem abgeschlossenen Monat wird nicht gesetzt. |
| Offline-Puffer (WP-07) | 409 ist für den Puffer eine endgültige Absage: das Ereignis bleibt **sichtbar abgelehnt mit Grund** auf dem Gerät („… nicht gespeichert — die Leitung sieht ihn am Monatsabschluss; nach dem Wiederöffnen lässt er sich erneut senden“), wird nicht in Schleife wiederholt und nicht verworfen (nur durch „Zur Kenntnis“). Nach dem Wiederöffnen: „Erneut senden“ → genau ein Stempel mit der ursprünglichen Kennung und Erfassungszeit (Abnahme gegen die echte Serverfunktion). |
| `POST /api/zeit-bestaetigen` (Selbstauskunft) | 409, vor jeder anderen Prüfung |
| `POST /api/stempel-korrektur` (WP-06) | 409 |
| `POST /api/korrektur-antrag` (WP-14) | 409 |
| `POST /api/korrektur-entscheiden` (WP-14) | 409 für genehmigen, ablehnen und zurückziehen |
| `PUT /api/bestand` | Ist-Zeit oder Stempel des Monats ändern, anlegen oder löschen → 403 `MONAT_ABGESCHLOSSEN`, nichts gespeichert (Rollen mit Vollsicht; eingeschränkte Rollen schreiben `erfassung`/`einstempeln` ohnehin nicht roh). Ausnahme wie WP-06: Löschlauf nach Ablauf der Aufbewahrungsfrist. Der Abschluss selbst kommt **immer aus dem gespeicherten Stand** (`abschlussAusGespeichert`, Leitung/Planung/Kunde und Schichtverantwortung; Beschäftigte und Betreiber schreiben das Feld ohnehin nicht) — über das Speichern lässt sich kein Monat öffnen oder schließen. |
| `POST /api/wiederherstellen` | Abschlussstand bleibt der heutige; in heute abgeschlossenen Monaten bleiben Stempel und Ist-Zeiten wie heute (`abschlussBeiWiederherstellung`, nach `stempelBeiWiederherstellung`, vor den Fristen WP-26) |
| `POST /api/bestand-anlegen` | nur für neue Räume (409 bei belegtem Raum) — kein Eingriff in bestehende Monate |
| Datenschutzlauf / Löschlauf | darf abgelaufene Ist-Daten auch in abgeschlossenen Monaten löschen (Löschpflicht geht vor, Art. 5 Abs. 1 lit. e DSGVO); `abdruckGleich` zeigt das beim Wiederöffnen |
| Werkzeuge (`werkzeug/*`) | arbeiten außerhalb des Servers direkt auf der Ablage (wie bei WP-06 dokumentiert) |

**Nach dem Wiederöffnen** sind Korrekturen wieder Ereignisse am Stempel (WP-06) und tragen `nachWiederoeffnung` (Kennung des
Verlaufsschritts) — direkt und über die Genehmigung eines Antrags. Das Original bleibt; die Folge Abschluss → Wiederöffnung
(Grund) → Korrektur (vorher/nachher, wer, wann, Grund) → neuer Abschluss (neue Prüfsumme) ist vollständig nachvollziehbar.

**WP-27:** Die Betriebsrat-Auswertung bleibt unberührt. Getestet: Mai abgeschlossen und ausgegeben, wiedergeöffnet, eine Zeit
korrigiert, erneut abgeschlossen → dasselbe eingefrorene Ist (`brist:`), Hinweis `istKorrigiert`.

### Datenschutz (H8+), Rechtematrix

- `sicht.mjs` Positivkatalog: `monatsabschluss: [R(abschlussStatus), R(abschlussStatus)]` — Beschäftigte, Betriebsrat und
  (über die Spalte) Schichtverantwortung bekommen je abgeschlossenem Monat nur `{abgeschlossen: true}`. Wer, Wann, Grund,
  Verlauf, Prüfsumme und abgewiesene Stempel (mit Person) nur Planung und Leitung (samt Kundenrolle, Vollausgabe). Betreiber:
  nichts (eigene Positivliste).
- `RECHTEMATRIX.md` Abschnitt 1: zwei neue Zeilen „Monatsabschluss: Status“ und „Monatsabschluss: Wer, Wann, Grund …“
  (Fußnote ²⁹), jede Zelle sondiert in `pruefungen/rechtematrix-zeilen.test.js`. Abschnitt 2: Zeile
  `POST /api/monatsabschluss` mit Rechte-Sonde je Rolle (`abschlussRecht`) und der Sonde „über das Speichern öffnen oder
  setzen — abgewiesen oder wirkungslos“ für MA, SV, PL, LT, KU, BT; Zeile `/api/stempeln` um die Pause ergänzt.
- `rollen-failclosed.test.js`: unbekannte Rolle → 403 auch für `/api/monatsabschluss`.

### Oberfläche

- Stempelbefunde (`Monatsabschluss`, nur `staff.edit`): Stand des Monats, „Monat abschließen“ (vergangener Monat; bei
  Prüffällen Rückfrage, dann „trotzdem“), „Wiederöffnen“ mit Grund nur für `org.edit`, Verlauf mit Grund, abgewiesene Stempel.
  Nach dem Serverweg wird der gespeicherte Stand samt ETag nachgeladen (`serverstandNachladen`, wie `stempelUebernehmen`).
- „Meine Stempel“ (`KorrekturKarte`): im abgeschlossenen Monat „Monat abgeschlossen — Korrektur nur nach Wiederöffnen durch
  die Leitung“ statt „Korrektur beantragen“.

## Tests

| Datei | Inhalt |
|---|---|
| `pruefungen/monatsabschluss.test.js` (23, neu) | jeder Schreibweg im abgeschlossenen Monat (Stempeln offline Beginn, Ende eines Nachtdiensts, Selbstauskunft, Korrektur, Antrag, Entscheidung ×3, PUT ändern/anlegen/löschen für Leitung, Planung, Kunde; Rundreise 200; offener Monat weiter 200; Abschluss über PUT wirkungslos, SV-Rundreise; veraltete Kopie nach dem Abschluss überschreibt ihn nicht); Rechte Abschließen/Wiederöffnen je Rolle inkl. Betreiber; 409/422-Fälle; Prüffälle und „trotzdem“; offener Antrag sperrt; Wiederöffnen mit Grund, Korrektur mit `nachWiederoeffnung`, neuer Abschluss mit neuer Prüfsumme; Kundenrolle; Protokoll; Datenschutz je Rolle; Wiederherstellen; **Offline-Puffer gegen die Serverfunktion** (abgelehnt, sichtbar, nach Wiederöffnen erneut gesendet → ein Stempel); **Rennen** Abschluss ↔ Stempel (6 Läufe, beide Reihenfolgen): Prüfsumme stimmt immer, der Stempel liegt davor oder ist abgewiesen und vermerkt |
| `pruefungen/monatsabschluss-lib.test.js` (13, neu) | Bibliothek: Prüfsumme (Reihenfolge egal, Inhalt nicht), SHA-256 gegen `node:crypto`, offene Punkte, Wiederöffnen, Vermerk, Wächter für PUT (Vollsicht, veraltete Kopie, Löschlauf), Wiederherstellen, Sicht; **WP-27** `istKorrigiert` nach Wiederöffnen und Korrektur |
| `pruefungen/monatsabschluss-oberflaeche.test.js` (6, neu) | gerendert: Leitung (Wiederöffnen, Verlauf, abgewiesen), Planung (kein Wiederöffnen; „Monat abschließen“), laufender Monat, SV/BR/MA nichts, KorrekturKarte im abgeschlossenen Monat, Pausenfeld in Stempeluhr und mobil |
| `pruefungen/pausenerfassung.test.js` (13, neu) | `pausePflicht` mit Schwellen (6/9 h, Jugend 4,5/6 h), Hinweise § 4 ArbZG / § 11 JArbSchG an der Schwelle, `pruefZeitFuer`, Puffer trägt die Pause; gegen die Serverfunktion: Pause am Original und an der Ist-Zeit (8 h), zu kurz → Hinweis + `PAUSE_ZU_KURZ`, aber bestätigt; Jugendliche; ohne Angabe wie bisher; ungültig (Text, negativ, > 180, ≥ Anwesenheit) → gespeichert mit `PAUSE_UNGUELTIG`; PUT ändert die Pause nicht (403); offline mit Pause; Selbstauskunft mit Pause |
| `pruefungen/rechtematrix-zeilen.test.js` (+ Zeilen, + Abschnitt-2-Sonden) | siehe oben |

Alle vier neuen Dateien stehen in `pruefung:zeiterfassung` (CI-Gate).

### Rot vorher (Commit 860f2cb, nur Prüfungen; `server/lib/monatsabschluss.mjs` noch nicht vorhanden)

67 rot, die Bibliotheksprüfung lädt nicht. Rot aus dem gemeinten Grund, u. a.: Stempel im abgeschlossenen Monat gespeichert
(200), Selbstauskunft/Korrektur/Antrag/Entscheidung 200, PUT-Änderung 200, Wiederherstellen setzt den Oktober zurück, Weg
`/api/monatsabschluss` unbekannt, Sicht ohne Feld (28 Matrixzellen), Pause nicht gespeichert, keine Jugend-Regel, Pausenfeld
fehlt. Grün auf dem alten Stand blieben nur Fälle, die bestehendes Verhalten festhalten (§ 4 ArbZG unverändert, Zellen „–“).

### Nachher (lokal, Windows)

- Neue Dateien und `rechtematrix-zeilen`: 666/666.
- `pruefung:zeiterfassung` (alle 15 Dateien): grün.
- Weitere 29 Dateien mit Bezug (rechtematrix, sicht*, rollen-failclosed, sicherungen, wiederherstellung-schutz, dsgvo-server,
  aufbewahrung, regelwerk, istdaten, br-auswertung, betreiber-sicht, leserechte, schichtverantwortung, stempel-datenschutz,
  vollausgabe, verwaltungswege, schutzmerkmale-sicht, oberflaeche-render, geo, datenschutz-schutz, mandanten,
  wiederherstellen-ui, fachpruefung-server, abnahme-a-b, datenintegritaet): 962/962.
- `tsc -p jsconfig.json` sauber; eslint (geänderte Dateien) ohne Fehler.

### Angepasste bestehende Prüfungen (nicht abgeschwächt)

- `korrekturworkflow.test.js` „C3 Mutterschutz und Jugendschutz“: Der Fall „Tagdienst ohne Hinweis“ einer 16-Jährigen
  (08:00–16:00) hatte 30 min Pause. Nach § 11 JArbSchG sind über 6 h 60 min nötig; mit der neuen, richtigen Regel käme ein
  Pausenhinweis. Die Prüfung meint „keine Nacht-Hinweise am Tag“; die Pause ist jetzt 60 min. Die Aussage bleibt, sie ist
  nur rechtlich korrekt.
- `rollen-failclosed.test.js`: zusätzlich `/api/monatsabschluss` (beide Aktionen).
- `rechtematrix-zeilen.test.js`: Import über den Namensraum (damit eine fehlende Funktion auf dem alten Stand rot statt
  Ladefehler ist), neue Zeilen und Sonden.

Eigene neue Prüfungen nach dem ersten Lauf korrigiert (Testfehler, keine Aufweichung): je Stempel eine frische Sitzung
(zwischen Beginn und Ende liegen Stunden ohne Anfrage — die Sitzung verfällt, wie in `offline-stempeln.test.js`); zwei
Uhrzeiten in UTC statt Berlin; eine Schwelle (06:00–15:01 mit 30 min sind netto unter 9 h — jetzt 15:30 ohne und 15:31 mit
Hinweis); die erwartete Zahl abgewiesener Stempel (zwei Abweisungen im Testablauf, beide vermerkt).

## Mutanten

Gezielt gegen die neuen Prüfdateien, je Mutante eine Ersetzung (Skript im Arbeitsverzeichnis, nicht im Repo). Alle 19 gefangen, keine überlebt.

| Mutante | Ergebnis (rote Tests) |
|---|---|
| Sperre stempeln entfernt | gefangen (4) |
| Sperre zeit-bestaetigen entfernt | gefangen (2) |
| Sperre stempel-korrektur entfernt | gefangen (2) |
| Sperre korrektur-antrag entfernt | gefangen (1) |
| Sperre korrektur-entscheiden entfernt | gefangen (1) |
| Sperre PUT entfernt | gefangen (1) |
| PUT: Löschen im abgeschlossenen Monat erlaubt | gefangen (3) |
| Wiederherstellen: Abschluss nicht berücksichtigt | gefangen (1) |
| Rechte: Wiederöffnen mit staff.edit (Planung) | gefangen (4) |
| Rechte: Wiederöffnen ohne Prüfung im Weg | gefangen (4) |
| Wiederöffnen ohne Grund | gefangen (4) |
| Sicht: Details an Beschäftigte | gefangen (5) |
| Pausenschwelle ArbZG > 6 → >= 6 | gefangen (2) |
| Pausenschwelle ArbZG > 9 → > 10 | gefangen (5) |
| Pausenschwelle Jugend 4,5 → 6 | gefangen (3) |
| Jugendliche wie Erwachsene | gefangen (2) |
| Pause beim Stempeln nicht an der Ist-Zeit | gefangen (3) |
| Abgewiesener Stempel nicht vermerkt | gefangen (3) |
| Speichern: Abschluss aus der Übermittlung (Leitung/Planung/Kunde; Rückfüllung ohne abschlussAusGespeichert) | gefangen (10; von Hand, weil die Zeile zweimal vorkommt) |

## Offene Entscheidungen

- **Wer darf abschließen?** Umgesetzt: Leitung, Planung, Kundenrolle (wer Stempel korrigiert, schließt ab). Alternative: nur
  Leitung. Wiederöffnen: nur Leitung (Auftrag).
- **Wiederöffnungsfrist:** keine Frist umgesetzt — die Leitung kann jeden abgeschlossenen Monat wiederöffnen (mit Grund,
  protokolliert, Prüfsumme). Vorschlag: nach Ablauf des Lohnlaufs (z. B. 3 Monate) nur mit Zusatzbestätigung oder gar nicht.
- **Was sperrt der Abschluss außerdem?** Umgesetzt: Ist (Stempel, Erfassung, Korrekturen, Anträge, Selbstauskunft).
  Abwesenheiten, Plan (`abweichungen`) und Konten sind nicht gesperrt; sie wirken über das Stundenkonto auf abgeschlossene
  Monate. Entscheidung: auch Abwesenheiten eines abgeschlossenen Monats sperren?
- **Prüffälle beim Abschluss:** Offene Korrekturanträge sperren immer; unvollständige Stempel und Ist-Zeiten zur Prüfung nur
  mit ausdrücklichem „trotzdem“. Soll der Abschluss mit Prüffällen ganz gesperrt sein?
- **Pausenerfassung als Minuten beim Ausstempeln**, nicht als eigene Stempel „Pause Beginn/Ende“. Eigene Pausenstempel
  (Lage der Pause, § 4 Satz 2 ArbZG: Abschnitte von mindestens 15 Minuten, Jugendliche nicht länger als 4,5 h ohne Pause)
  wären ein Folgepaket (Puffer, Idempotenz je Ereignis, Oberfläche).
- **Kennzeichen nur bei angegebener Pause:** Ohne Angabe gibt es den Hinweis nur in der Antwort; die Prüfungsansicht der
  Oberfläche zeigt „Ruhepause zu kurz“ ohnehin.
- **Abgewiesene Stempel am Abschluss** tragen Person, Tag und Zeit; sie unterliegen keiner eigenen Löschfrist (höchstens 200
  je Monat). Vorschlag: mit der Frist der Gründe (`gruendeMonate`) im Datenschutzlauf räumen.
- **Veraltete Kopien nach einem Abschluss:** Der Abschluss ändert den Kern des Betriebs. Eine Oberfläche, die vorher geladen
  hat, bekommt beim nächsten Speichern den bekannten Kern-Konflikt (409, „Stammdaten geändert“) und lädt neu — wie bei jeder
  anderen Kern-Änderung durch andere. Der Abschluss selbst wird dabei nie überschrieben (getestet).

## Konflikterwartung

`server/funktionen/daten.mjs` (PUT, Stempeln, Korrektur-/Antragswege, neuer Weg), `server/lib/rechte.mjs`
(`abschlussRecht`, zwei Zeilen in `zusammenfuehrenKern`), `server/lib/sicht.mjs` (eine Katalogzeile + Import),
`server/lib/sicherungen.mjs` (eine Stelle beim Wiederherstellen), `src/App.jsx` (Stempeluhr, MStempel, KorrekturKarte,
StempelBefunde, Aktionen, Export-Zeile), `src/speicher.js`, `src/stempelpuffer.js`, `RECHTEMATRIX.md` (zwei Zeilen
Abschnitt 1, Fußnote ²⁹, eine Zeile Abschnitt 2), `package.json` (`pruefung:zeiterfassung`). `rechte.mjs`/`sicht.mjs` sind
Konfliktzone (bis WP-10 frei, dann Agent C) — die Änderungen sind klein und additiv.
