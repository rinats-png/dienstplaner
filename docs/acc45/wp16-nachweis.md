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
Betriebs (`server/lib/monatsabschluss.mjs`). `abdruck` ist eine SHA-256-Prüfsumme der Ist-Daten des Monats (Stempel,
Erfassung und — seit der Review-Auflage H1 — das eingefrorene Ist, Schlüssel geordnet) zum Abschluss. Sie ist eine
**Änderungsanzeige**, kein Manipulationsschutz: Wer direkt auf die Ablage schreibt, kann sie neu berechnen; sie zeigt beim
Wiederöffnen (`abdruckGleich`), ob sich das Ist am Server vorbei oder durch den Löschlauf geändert hat. SHA-256 ist in reinem
JS umgesetzt, weil die Datei über `sicht.mjs` auch ins Oberflächen-Bündel geht; gegen `node:crypto` geprüft.

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
- `stempel-429-client.test.js` (Auflage N1, Quelltextprüfung): Das Muster für den gesperrten Stempelknopf erlaubt jetzt den fünften Wert (die Pause beim Ausstempeln). Die Aussage — gesperrt, bis das Stempeln samt Wiederholungen fertig ist, in Stempeluhr und mobiler Fläche (genau 2 Treffer) — bleibt unverändert. Rot im ersten CI-Lauf 41659840303.
- `oberflaeche-selbstservice.test.js` „Stempeln“ (Quelltextprüfung): Anker `stempeln: async (pid, datum, art, koord, pause = null)` und Muster `SP.stempeln(datum, art, koord(, pause)?)` — gleiche Aussage (Serverantwort übernommen, Fehler nur gemeldet). Rot im CI-Lauf 41660308323.
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

## Auflagen aus dem unabhängigen Review (Opus, Urteil „integrierbar mit Auflagen“)

Je Auflage: Prüfung zuerst rot auf dem Stand davor, dann die Änderung, dann Mutanten. Keine bestehende Prüfung
abgeschwächt, keine Funktion gekürzt.

### M1 — instabile Prüfung (vor Merge)

`monatsabschluss.test.js` prüfte die GET-Antwort der Beschäftigten mit `not.toMatch(/…|ma-1/)`. Die Korrektur am eigenen
Stempel trägt legitim `nachWiederoeffnung: "ma-<Hex>"` — bei Hex-Beginn „1“ (etwa jeder 16. Lauf) rot. Jetzt
`"ma-1"` mit Anführungszeichen (genau die Kennung des Oktober-Abschlusses). Rot bestätigt mit erzwungenem Präfix `ma-1`
(Kennung im Server vorübergehend `ma-1<Hex>`), danach mit demselben erzwungenen Präfix grün — der schlechteste Fall ist
damit abgedeckt, unabhängig vom Zufall. Wiederholungsnachweis: `monatsabschluss.test.js` 50-mal hintereinander (ganze
Datei, weil die Prüfung am Ablauf davor hängt; nach dem Merge, Windows lokal): **50/50 grün**.

CI (Linux) nach Merge von `integration/centric-complete` (Kopf 51c52bb): Prüfung 41677628577, Sicherheit 41677628599,
Lieferkette 41677628847, Deploy-Skripte 41677629145 — alle grün, ohne Wiederholung.

### H1 — abgeschlossener Monat über den Plan änderbar (Blocker Produktion)

Gewählt: die bevorzugte Lösung — **das Ist wird beim Abschluss eingefroren**; Plan-Korrekturen bleiben möglich.

- `server/lib/isteinfrieren.mjs` (neu): `istEinfrieren(m, monat)` rechnet am gespeicherten, vollständigen Stand je Person und
  Tag, was ins Ist eingeht — mit **derselben** Rechnung wie die Oberfläche: `istZeitFuer`/`ungeplanterDienst`
  (dafür `src/istdaten.js` → `server/lib/istdaten.mjs`, `src/istdaten.js` reicht weiter wie `src/regelwerk.js`), die
  Planrechnung wie `personTag` (Schichtfolge mit Teilzeit, Abweichung, **Posten** — `postenBesatzung` und `mindestFuer`
  ebenfalls dorthin verschoben, die Oberfläche benutzt sie von dort; die Feiertage dafür nach `server/lib/feiertage.mjs`),
  Abwesenheit. Eintrag je Tag: `{ da: Dienstart wie an dem Tag (ohne Besetzungsvorgaben), std, e?: erfasst, p?: zur
  Prüfung }` oder `{ a: [Abwesenheitsarten], pl?: geplant, w: Wochenstunden }`; kein Eintrag = weder Dienst noch Abwesenheit.
- Ablage: neues Monatsfeld `m.istEingefroren["personId|JJJJ-MM-TT"]`, je Monat in der Scherbe (`scherben.mjs`
  `MONATSFELDER`; ein Betrieb ohne das Feld bekommt es beim Zusammensetzen nicht) — der Kern wächst nicht.
- Teil der Ist-Felder des Abschlusses (`IST_FELDER`): in der **Prüfsumme**, über `PUT /api/bestand` nicht änderbar (403
  `MONAT_ABGESCHLOSSEN` bei Änderung; mitgeschickt oder weggelassen immer der gespeicherte Stand,
  `abschlussAusGespeichert`), **Wiederherstellen** behält Abschluss und Freeze von heute (nie den der Sicherung).
- **Wiederöffnen verwirft den Freeze** und protokolliert im Verlauf `istNeu`: wie viele Personentage das neu gerechnete Ist
  vom eingefrorenen abweicht (ohne Personen; Oberfläche: „Ist an N Personentagen seit dem Abschluss geändert“).
- **Verbraucher** (alle Fundstellen von `istZeitFuer`/`istDauer`/`personTag` mit Stundenbezug, per grep): eine Stelle
  `istTag(m, p, d)` in `src/App.jsx` — im abgeschlossenen Monat nur der Freeze. Darüber laufen `istStunden`
  (Stundenkonto, Lohnausgabe, Zwölf-Monats-Verlauf, Abrechnungsdaten), `zuschlagStunden`/`zuschlagWert` (Zuschläge-CSV,
  DATEV), `datevSaetze` (auch Bereitschafts- und Rufstunden), `ausgleichPruefen` (§ 3 ArbZG), die Prüfungsansicht
  (Pause/Tagesgrenze), `UngeplantHinweis`. Die Selbstauskunft („Zeiten bestätigen“, `offeneErfassung`) bietet keine Tage
  abgeschlossener Monate mehr an. **Betriebsrat-Auswertung** (WP-27, Server): das Ist abgeschlossener Monate aus dem Freeze
  (bestätigt erfasste Tage, Stunden aus `istZeitFuer`). Rein planbezogene Rechnungen (Besetzung, Ruhezeit nach Plan,
  Nachtarbeitnehmer-Zählung, Vollexport des Dienstplans) bleiben beim Plan.
- **Sicht** (`sicht.mjs`): wie die Erfassung — Beschäftigte nur eigene Tage, Betriebsrat nichts, Schichtverantwortung eigene
  und Bereich am Tag (Abwesenheitsart im Bereich wie bei den Abwesenheiten: sensible Arten als „abwesend“). Rollen ohne
  Zugang rechnen wie bisher „nicht verfügbar“ (`istVerfuegbar` vor dem Freeze).
- Löschfrist: wie die Erfassung (Plandatenfrist, `aufbewahrung.mjs` `PLAN_FELDER`); in der Auskunft (Art. 15).

Prüfungen (`pruefungen/monatsabschluss-ist.test.js`, neu, im Gate `pruefung:zeiterfassung`; gegen die echte
Serverfunktion, gerechnet mit den Funktionen der Oberfläche auf dem ausgelieferten Stand): Sonden P1/P2 als Prüfung
(F → N durch die Planung 200, Pause N → 0 durch die Leitung 200, Urlaub im Oktober 200 — Konto, Ist, Zuschläge, DATEV,
Ausgleich bleiben exakt wie zum Abschluss, 29./30.10. je 7,5 h; Gegenprobe ohne Freeze 8,0 h); eigene Sicht der
Beschäftigten; Betriebsrat ohne Freeze; Freeze über PUT nicht änderbar; Wiederöffnen (`abdruckGleich` true, `istNeu` 4,
danach neues Ist, neuer Abschluss mit neuer Prüfsumme); Prüfsumme deckt den Freeze (am Server vorbei geändert →
`abdruckGleich` false); Wiederherstellen (Sicherung mit altem Freeze → Freeze von heute); Betriebsrat-Auswertung (Pause
der Dienstart geändert: abgeschlossen gleich, wiedergeöffnet anders); Planrechnung Server = `personTag` für alle
Personen und Tage der drei Demobetriebe (mit Posten) und eingefroren dasselbe Ist/Zuschläge/DATEV wie offen gerechnet.

### M2 — abgewiesene Stempel: Löschfrist, Auskunft, Personenlöschung

- Frist der Gründe (`gruendeMonate`): `aufbewahrung.mjs` `vorschau` zählt (`abgewiesen`, in `gesamt` und im
  Berichtstext), `raeumen` entfernt Einträge vor dem Stichtag und die Zähler abgelaufener Monate — im serverseitigen
  Datenschutzlauf (Modus aus/vorschau/an wie bisher). Hinweis: Der Löschlauf aus der Oberfläche speichert über PUT; dort
  gilt der gespeicherte Abschlussstand, die abgewiesenen Stempel räumt dann der nächste Serverlauf.
- Auskunft (`auskunft.mjs`): `abgewieseneStempel` (Monat, Tag, Art, Zeit, offline, Eingang, Anzahl; nur Gezähltes als
  `nurGezaehlt`) und `istEingefroren` der Person — nichts von anderen.
- Anonymisierung oder Entfernen einer Person: beim Speichern (`abschlussAusGespeichert`) und im Löschlauf (fällige
  Anonymisierung) gehen ihre abgewiesenen Stempel und Zähler mit (`abschlussPersonenRaeumen`); die anderer bleiben.

### M3 — Fluten der abgewiesenen Stempel

- Je Person, Tag und Art **ein** Eintrag (`anzahl` zählt hoch, höchstens 10), je Person höchstens 20 Einträge, darüber nur
  ein Zähler je Person (`abgewiesenGezaehlt`, höchstens 99). An den Grenzen kein Schreibvorgang mehr (dasselbe Objekt
  zurück). Je Person und Monat also höchstens rund 300 Schreibvorgänge (dazu die Bremse je Person); niemand verdrängt die
  Einträge anderer (die Gesamtgrenze 200 wirkt erst bei mehr als zehn fluteden Personen).
- **Abweichung vom Vorschlag „> 48 h nicht vermerken oder nur zählen“, begründet:** Ein Offline-Stempel, der Tage später
  ankommt, ist genau der Fall, für den der Vermerk existiert (Gerät offline, Monat inzwischen abgeschlossen); die Leitung
  braucht Person, Tag und Zeit, um über das Wiederöffnen zu entscheiden. Bestehende Prüfungen halten das fest (Puffer
  vom 30.10., gesendet am 05.11.). Solche Einträge sind jetzt gekennzeichnet (`alt`, Oberfläche: „erst nach über 48 Stunden
  gesendet“) und zählen unter dieselbe Obergrenze — das Fluten ist damit begrenzt, ohne echte Fälle zu verlieren.

### M4 — Testlücken (Verhalten stimmte)

Drei Prüfungen gegen die überlebenden Mutanten: `abdruckGleich` false nach Änderung am Ist (Erfassung gelöscht, Stempel
geändert); KONFLIKT am alten Vorgang (B6.3): im abgeschlossenen Monat unberührt, im offenen gesetzt (Gegenprobe);
Selbstauskunft mit Pause gleich und länger als die Anwesenheit (120/150 min bei 2 h) → 422, 119 min → 200.

### Niedrig

- Prüfsumme heißt im Nachweis und im Quelltext **Änderungsanzeige** (kein Manipulationsschutz bei direktem Ablagezugriff).
- `speicher.stempeln`: eine Pause, die keine Zahl ist, wird nicht gesendet (vorher `NaN` → im JSON `null`); geprüft in
  `stempel-429-client.test.js`.
- Abschluss mit laufendem Dienst vom Monatsletzten: Die Meldung (409 `ABSCHLUSS_PRUEFFAELLE`) erklärt, dass das Ausstempeln
  noch zu diesem Monat gehört und nach dem Abschluss abgewiesen würde (`offen.nachtOffen`).

### Rot vorher (Stand 8be5f3a, vor den Änderungen H1/M2/M3/Niedrig; neue Prüfungen dagegen gelaufen)

`git checkout 8be5f3a -- server src`, dann `monatsabschluss-ist`, `monatsabschluss-lib`, `stempel-429-client`:
**20 rot, 21 grün** (41). Rot aus dem gemeinten Grund: kein `istEingefroren` nach dem Abschluss; Sonden P1/P2 ändern das
Ist (29./30.10. 8,0 h, Urlaub gutgeschrieben); Selbstauskunft bietet Oktobertage an; BR-Ist ändert sich mit der Pause der
Dienstart; kein `istNeu`; Fluten ohne Obergrenze (25 Einträge, kein Zähler), keine Zusammenfassung, kein `alt`;
Vorschau/Löschlauf zählen und räumen nichts; Anonymisierung lässt die Einträge; Auskunft ohne abgewiesene Stempel und
Freeze; Meldung ohne Hinweis auf den laufenden Dienst; NaN-Pause gesendet. Die Konsistenzprüfung Server ↔ `personTag`
ist dort rot, weil es das Modul noch nicht gibt. Danach `git checkout HEAD -- server src`, Arbeitsstand sauber.

### Mutanten (Auflagen)

Skript im Arbeitsverzeichnis (nicht im Repo), je Mutante eine oder zwei Ersetzungen, gezielte Prüfdatei.
**23 Mutanten, 23 gefangen** (H1-11 überlebte zuerst; Prüfung um die Bereitschafts-DATEV-Zeile ergänzt, danach gefangen).

| Mutante | Ergebnis |
|---|---|
| H1-1 Freeze in `istTag` ignoriert (Konto, Lohn, DATEV, Zuschläge, Ausgleich) | gefangen (3) |
| H1-2 Prüfsumme ohne Freeze | gefangen (2) |
| H1-3 Wiederherstellen übernimmt den Freeze der Sicherung | gefangen (3) |
| H1-4 Speichern übernimmt den Freeze aus der Übermittlung | gefangen (2) |
| H1-5 Wiederöffnen verwirft den Freeze nicht | gefangen (1) |
| H1-6 Abschluss friert nicht ein | gefangen |
| H1-7 Sicht: Freeze an alle Rollen | gefangen (1) |
| H1-8 Betriebsrat-Auswertung ignoriert den Freeze | gefangen (1) |
| H1-9 Serverplanung ohne Posten | gefangen (1) |
| H1-10 Selbstauskunft bietet Tage abgeschlossener Monate an | gefangen (1) |
| H1-11 DATEV Bereitschaft/Ruf am Freeze vorbei | erst überlebt → Prüfung ergänzt → gefangen (1) |
| M2-1 Vorschau zählt abgewiesene nicht | gefangen (1) |
| M2-2 Löschlauf entfernt abgewiesene nicht | gefangen (2) |
| M2-3 Anonymisierung/Entfernen lässt abgewiesene stehen | gefangen (1) |
| M2-4 Auskunft ohne abgewiesene Stempel | gefangen (1) |
| M2-5 Auskunft ohne eingefrorenes Ist | gefangen (1) |
| M2-6 Freeze nicht im Plan-Löschlauf | gefangen (1) |
| M3-1 keine Obergrenze je Person | gefangen (4) |
| M3-2 nicht zusammengefasst | gefangen (1) |
| M3-3 `anzahl` ohne Obergrenze | gefangen (1) |
| M3-4 Zähler ohne Obergrenze | gefangen (1) |
| N-1 `speicher.stempeln` sendet NaN-Pause | gefangen (1) |
| N-2 Meldung ohne Hinweis auf laufenden Dienst | gefangen (1) |
| M4: `abdruckGleich` immer true / KONFLIKT-Wächter entfernt / Selbstauskunft Pause ≥ Anwesenheit | je gefangen (1) |

### Angepasste bestehende Prüfungen

- `monatsabschluss.test.js` (M1): Muster `"ma-1"` statt `ma-1` — schärfer, nicht schwächer (trifft die Kennung genau).
- Keine weitere bestehende Prüfung geändert. Die Quelltextprüfung in `ungeplante-dienste.test.js` (Zeile mit
  `ungeplantAm`) gilt unverändert — die Zeile steht jetzt in `istTag`, der einen Stelle für alle Ist-Rechnungen.

## Offene Entscheidungen

- **Wer darf abschließen?** Umgesetzt: Leitung, Planung, Kundenrolle (wer Stempel korrigiert, schließt ab). Alternative: nur
  Leitung. Wiederöffnen: nur Leitung (Auftrag).
- **Wiederöffnungsfrist:** *Entschieden (Betreiber, 2026-11-03; siehe Nachtrag):* keine starre Frist; nach bestätigtem
  Lohnexport kein einfaches Wiederöffnen mehr (409 `KORREKTUR_ERFORDERLICH`), Revisionsprozess folgt mit WP-16c.
  Bisheriger Stand: keine Frist umgesetzt — die Leitung kann jeden abgeschlossenen Monat wiederöffnen (mit Grund,
  protokolliert, Prüfsumme). Vorschlag: nach Ablauf des Lohnlaufs (z. B. 3 Monate) nur mit Zusatzbestätigung oder gar nicht.
- **Was sperrt der Abschluss außerdem?** Umgesetzt: Ist (Stempel, Erfassung, Korrekturen, Anträge, Selbstauskunft).
  Abwesenheiten, Plan (`abweichungen`) und Dienstarten bleiben änderbar — seit der Auflage H1 wirken sie aber **nicht mehr**
  auf das Ist eines abgeschlossenen Monats (eingefrorenes Ist, siehe unten). Weiter offen (Alternative aus dem Review, nicht
  umgesetzt): Plan, Abwesenheiten und Dienstart-Zeiten eines abgeschlossenen Monats zusätzlich sperren? Dagegen spricht:
  Dienstarten gelten für alle Monate, Plan-Korrekturen (Dokumentation) sollen möglich bleiben.
- **Soll (Vertragsstunden) im abgeschlossenen Monat:** Eingefroren ist das Ist samt Gutschrift bezahlter Abwesenheit (mit
  den Wochenstunden zum Abschluss). Das Soll (`sollStunden`: Wochenstunden, Feiertage, Beschäftigungszeitraum) und
  Betriebseinstellungen (Nachtfenster, Zuschlagssätze, Lohnarten) werden weiter aktuell gerechnet. Eine rückwirkende
  Änderung der Wochenstunden ändert also den Saldo eines abgeschlossenen Monats. Entscheidung: Soll und Einstellungen
  ebenfalls einfrieren? *Erledigt mit dem Nachtrag (M-neu-2): Soll, Zuschläge, Nachtdienste, Lohnarten, Zuschlagsregeln
  und Zugehörigkeit sind eingefroren.*
- **Prüffälle beim Abschluss:** Offene Korrekturanträge sperren immer; unvollständige Stempel und Ist-Zeiten zur Prüfung nur
  mit ausdrücklichem „trotzdem“. Soll der Abschluss mit Prüffällen ganz gesperrt sein?
- **Pausenerfassung als Minuten beim Ausstempeln**, nicht als eigene Stempel „Pause Beginn/Ende“. Eigene Pausenstempel
  (Lage der Pause, § 4 Satz 2 ArbZG: Abschnitte von mindestens 15 Minuten, Jugendliche nicht länger als 4,5 h ohne Pause)
  wären ein Folgepaket (Puffer, Idempotenz je Ereignis, Oberfläche).
- **Kennzeichen nur bei angegebener Pause:** Ohne Angabe gibt es den Hinweis nur in der Antwort; die Prüfungsansicht der
  Oberfläche zeigt „Ruhepause zu kurz“ ohnehin.
- **Abgewiesene Stempel am Abschluss:** erledigt mit der Auflage M2 (Frist der Gründe, Auskunft, Anonymisierung) und M3
  (Obergrenze je Person). Offen nur: Offline-Zeiten, die älter als 48 h ankommen, stehen gekennzeichnet in der Liste statt
  nur gezählt (Begründung unten) — so gewollt?
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

Mit den Review-Auflagen dazu: `src/istdaten.js` → `server/lib/istdaten.mjs` (Weiterleitung bleibt), neu
`server/lib/isteinfrieren.mjs` (mit `mindestFuer` und `postenBesatzung` aus `src/App.jsx`) und `server/lib/feiertage.mjs`
(Feiertage aus `src/App.jsx`), `server/lib/scherben.mjs` (`MONATSFELDER` + `istEingefroren`), `server/lib/aufbewahrung.mjs`,
`server/lib/auskunft.mjs`, `server/lib/br-auswertung.mjs`, `server/lib/sicht.mjs` (eine Katalogzeile, eine SV-Regel),
`src/App.jsx` (`istTag` und seine Verbraucher, Monatsabschluss-Anzeige, Export-Zeile: `demobestand`, `sollStunden`,
`ausgleichPruefen`, `offeneErfassung` für die Prüfungen), `src/speicher.js` (Pause), `package.json` (`pruefung:zeiterfassung`
+ `monatsabschluss-ist.test.js`).

## Zusammenführung mit WP-14b/27b/23b

Merge (kein Rebase, kein Force-Push) von `origin/integration/centric-complete` 92a3b97 (WP-23b #64, WP-27b #65, WP-14b #66) in
den WP-16-Kopf 0f14e9a. Konflikte in sechs Dateien; alles Übrige (u. a. `rechte.mjs`, `sicht.mjs`, `korrekturworkflow.mjs`,
`zeitregeln.mjs`, `RECHTEMATRIX.md`, `src/App.jsx`) zusammengeführt ohne Konflikt und nachgesehen.

### Ist-Rechnung: eine Datei

Beide Seiten hatten `src/istdaten.js` nach `server/lib/istdaten.mjs` verschoben (WP-16 Review H1 für das eingefrorene Ist,
WP-27b für die Betriebsrat-Auswertung). Gegenüber der gemeinsamen Basis (`src/istdaten.js` 764b1ab) war der Unterschied klein
und überschneidungsfrei: WP-16 änderte nur `pruefZeitFuer` (erfasste Pause vor der der Dienstart), WP-27b nur den Importpfad
(`regelwerk.mjs`), WP-14b `zurPruefung` (ZEITUMSTELLUNG), `bestaetigungsGrund`, `ohnePlanDauerNull` in `pruefHinweis` und
`Math.max(0, …)` in `istZeitFuer`. Ergebnis: **`server/lib/istdaten.mjs` = Stand der Integration + die WP-16-Änderung an
`pruefZeitFuer`**; `src/istdaten.js` bleibt die reine Weiterleitung (`export * from "../server/lib/istdaten.mjs"`, Kopfkommentar
nennt beide Gründe). `istTag`/Freeze (`src/App.jsx`), `feiertage.mjs`, `mindestFuer`/`postenBesatzung` (`isteinfrieren.mjs`)
waren nicht betroffen. Neue Prüfung (`istdaten.test.js`, Auflage aus dem WP-27b-Review): `src/istdaten.js` enthält außer dem
Kommentar genau die Weiterleitung; die Serverfassung trägt die Änderungen beider Pakete.

Das eingefrorene Ist rechnet damit ebenfalls nie negativ (`istZeitFuer` mit `Math.max(0, …)`) und erkennt ZEITUMSTELLUNG als
Prüffall (`p: 1` im Freeze, Abschluss ohne „trotzdem“ gesperrt — `zurPruefung` zählt ihn).

### Betriebsrat-Auswertung

WP-27b hat das Ist der Auswertung auf `istZaehlen` (eine Stelle, `istZeitFuer`) umgestellt und ungeplante Dienste (WP-13)
aufgenommen; WP-16 liest für abgeschlossene Monate das eingefrorene Ist. Zusammengeführt: Im abgeschlossenen Monat zählt nur
der Freeze (bestätigt erfasste Tage, `e: 1`, Stunden wie zum Abschluss mit `istZeitFuer` gerechnet — **auch ungeplante
Dienste**, denn `istEinfrieren` friert sie mit `ungeplanterDienst` ein); die Erfassung des Tages wird dann nicht noch einmal
gezählt (`ist = null`, beide Zweige — mit und ohne Plan). Im offenen Monat unverändert WP-27b. Der dauerhafte Freeze der
**Ausgabe** (`brist:<raum>:<betrieb>:<monat>`, WP-27b) bleibt nötig und widerspricht dem nicht: Er hält fest, was der
Betriebsrat einmal gesehen hat (auch über Wiederöffnen und Korrektur hinweg, Hinweis `istKorrigiert`); der Monatsfreeze hält
fest, was im Lohn steht. Die Zahlen beider stammen aus derselben Rechnung wie `istTag`/Stundenkonto; die dokumentierte
Abweichung bleibt der Anrechnungsfaktor (die Auswertung zählt Stunden ungewertet).

### Protokoll (Spur) nach WP-14b M1

Die WP-16-Zeilen schrieben Person|Tag bzw. den Tag in die Spur. Jetzt nur Monat, Ausgang, Kennung, Zahlen:
`Monat abgeschlossen <JJJJ-MM>` (PUT), `stempeln <art>: Monat abgeschlossen <JJJJ-MM>[ · offline]`,
`Stempelkorrektur: Monat abgeschlossen <JJJJ-MM>`, `Korrekturantrag[ entscheiden]: Monat abgeschlossen <JJJJ-MM>`,
`Zeit bestätigen: Monat abgeschlossen <JJJJ-MM>`; abgewiesener Abschluss mit `spurGrund` (ohne Uhrzeiten); Wiederöffnen
`Monatsabschluss <JJJJ-MM> wiedergeöffnet <Kennung> · Grund im Verlauf` — der Grund ist Freitext und steht nur im Verlauf am
Monat (sichtbar für Planung und Leitung). Person, Tag und Zeit eines abgewiesenen Stempels stehen weiter am Abschluss
(`abgewiesen`). Die `/lage` filtert zusätzlich mit `spurFuerBetreiber` (WP-14b, unverändert).
Prüfungen (`monatsabschluss.test.js`): neue Prüfung „Spur ohne Personenbezug“ (alle Monatsabschluss- und Monat-abgeschlossen-
Zeilen ohne Person|Tag, ohne Tag, ohne Uhrzeit; Betreiber-Sicht ohne `person`) — rot mit einer Zeile `… <person>|<tag> …`
(Mutante), grün danach. Angepasst (schärfer): Die bestehende Prüfung erwartete den Grund des Wiederöffnens in der Spur; jetzt
erwartet sie die Kennung und prüft, dass der Grund in **keiner** Zeile steht.

Vorbestehende Zeilen außerhalb von WP-16 (`stempeln <art> <tag>: schon gestempelt`, `Zeit bestätigen <tag>: …`,
`Stempel-Integrität <person|tag>`) sind nicht Teil dieses Pakets; die Betreiber-Lage maskiert Person|Tag und Uhrzeiten dort
über `spurFuerBetreiber`, ein bloßer Tag bleibt sichtbar (offen, siehe unten).

### Selbstauskunft wie Korrektur (WP-14b M2/M4, Review-Befund F8)

`selbstauskunftPruefen` (`server/lib/zeiterfassung.mjs`): Die Pause wird mit `pauseZuLang(start, ende, pause, datum)` an der
wirklichen Dauer des Tages gemessen (Frühjahrsnacht: 01:00–04:00 sind 2 h), auch bei „wie geplant“. **Beginn = Ende** wird
abgewiesen (422, dieselbe Meldung `BEGINN_GLEICH_ENDE` wie Korrektur und Antrag; die Konstante steht jetzt in
`zeiterfassung.mjs` und wird von `stempelintegritaet.mjs` weitergereicht), Ausnahme: geplanter 24-Stunden-Dienst (Dienstart
Beginn = Ende). Vorher zählte 22:00–22:00 an einem Nachtdienst-Tag 24 h. Ein ZEITUMSTELLUNG-Prüffall kann über die
Selbstauskunft nicht entstehen oder bestätigt werden: Sie nimmt nur Tage ohne Erfassung an (409 „schon erfasst“).
Prüfungen (`pausenerfassung.test.js`, 2 neu): rot mit der alten Bedingung (Mutante: `pause >= dauer`, ohne Beginn=Ende-Sperre),
grün danach.

### Stempeln, Korrektur, Antrag (zusammengeführt)

- `daten.mjs` Stempeln: WP-16-Pause (`pauseMin`, `PAUSE_UNGUELTIG`/`PAUSE_ZU_KURZ`, Hinweise) **und** WP-14b `ZEITUMSTELLUNG`
  (`uhrAbweichend`); alle Zweige der Erfassung in `mitPause(…)`, Marken `ungeplant` (auch bei DAUER_NULL/ZEITUMSTELLUNG),
  `DAUER_NULL`, `ZEITUMSTELLUNG`, `OFFLINE_PRUEFEN` erhalten. ZEITUMSTELLUNG wird vor der Pause bestimmt: Aus Uhrzeiten, die die Dauer
  nicht wiedergeben (Dauer 0 oder Herbstnacht), entstehen keine Pausenhinweise und kein `PAUSE_ZU_KURZ` (sonst „23:50 h ohne
  45 min Pause“ bei 50 gemessenen Minuten); die angegebene Pause steht trotzdem am Prüffall. Prüfung `serverdatum.test.js`
  (neu, gegen die Serverfunktion; rot ohne die Bedingung, grün danach). Reihenfolge unverändert: Idempotenz (WP-07) → Tag (`stempelZiel`)
  → Monatsabschluss-Sperre → Geo (`positionGrund`) → Schreiben; im PUT Fachprüfung vor `stempelSichern`.
- `stempelintegritaet.mjs` `korrekturAnhaengen`: Ereignis trägt `nachWiederoeffnung` (WP-16) **und** `selbstfreigabe` (WP-14b);
  Zeitumstellungssperre und `pauseZuLang(…, datum)` aus WP-14b. Monatsabschluss-Sperre (409 `MONAT_ABGESCHLOSSEN`) für Korrektur,
  Antrag und Entscheidung im Weg (`daten.mjs`) vor der Bibliothek; Antrag mit wirksamer Pause und Zeitumstellung, Genehmigung
  „überholt“ 409 (WP-14b) unverändert.
- Importe `daten.mjs`: `freigabeRuecknahmen` (WP-23b) und `abschlussRecht` (WP-16); `regelHinweise` (WP-16) und
  `uhrDauerAbweichend`, `spurGrund`, `spurHinweise` (WP-14b).
- `package.json`: `pruefung:zeiterfassung` vereinigt — Basis 11 Dateien, WP-16 16, Integration 13, jetzt **18** (+5 WP-16:
  monatsabschluss, -lib, -oberflaeche, -ist, pausenerfassung; +2 WP-14b: stempel-fachpruefung, korrektur-nachtrag). Sammelzeile
  `pruefung` auf allen Seiten 97 Schritte, unverändert 97. Skripte insgesamt 146 = 146.
- `RECHTEMATRIX.md`: Fußnoten ²⁷ (WP-23), ²⁸ (WP-20), ²⁹ (WP-16) je einmal; WP-14b-Klarstellung N4 und WP-23b-Absätze erhalten.

### Angepasste bestehende Prüfungen (Zusammenführung, nicht abgeschwächt)

- `monatsabschluss-lib.test.js` „Mai abgeschlossen, ausgegeben; wiedergeöffnet …“: Die Speicher-Ablage der Prüfung hatte nur
  `setJSON`. Seit WP-27b (B2/B3) friert die Auswertung atomar ein (`setJSONWennNeu`) und nur, solange der Kern des Raums besteht
  (`kern:<raum>`) — sonst fail-closed ohne Ist (`istStunden: null`, rot nach dem Merge). Die Prüf-Ablage bekommt beides wie
  `br-auswertung.test.js` (`testAblage`); Erwartungen (25,5 vorher und nachher, `istKorrigiert`) unverändert.
- `monatsabschluss.test.js` Spur: siehe oben (schärfer).
- Neu in `monatsabschluss-lib.test.js`: ungeplanter bestätigter Dienst im abgeschlossenen Monat zählt in der
  Betriebsrat-Auswertung genau einmal (29,5 h / 4, nicht 33,5 / 5) und bleibt nach einer Planänderung gleich — rot mit der
  Mutante „Erfassung auch im abgeschlossenen Monat zählen“ (`ist` ohne `fz === undefined`), grün danach.

### Tests lokal nach dem Merge (Windows, einzeln, `--testTimeout=120000 --hookTimeout=120000`)

Alle grün: istdaten 35, serverdatum 16, korrektur-nachtrag 23, korrekturworkflow 25, monatsabschluss 25, monatsabschluss-ist 10,
monatsabschluss-lib 24, monatsabschluss-oberflaeche 6, offline-stempeln 33, stempelpuffer 22, br-auswertung 72,
stempel-integritaet 89, stempel-fachpruefung 7, rechtematrix 63, rechtematrix-zeilen 621, entwuerfe 68, sicht 30, doku 5,
stempel-429-client 8, oberflaeche-selbstservice 25, pausenerfassung 16, zeiterfassung 40, ungeplante-dienste 23, stempeln 10.
Nach der letzten Quelländerung (`daten.mjs`, Hinweise in der Herbstnacht) die betroffenen Dateien noch einmal: grün.
`tsc -p jsconfig.json` sauber; eslint der geänderten Dateien ohne Fehler (nur die drei vorbestehenden Warnungen in `daten.mjs`);
`werkzeug/vorpruefung.mjs --paket WP-16`: keine harten Verstöße.

### Offen nach der Zusammenführung

- Vorbestehende Spur-Zeilen außerhalb von WP-16 nennen den Tag (`stempeln <art> <tag>: …`, `Zeit bestätigen <tag>: …`,
  `Selbstauskunft Zeiten: <tag>`) bzw. Person|Tag (`Stempel-Integrität`). In der Betreiber-Lage sind Person und Person|Tag
  maskiert, ein bloßer Tag nicht. Nach der M1-Regel gehörten sie ebenfalls bereinigt — eigenes kleines Paket (WP-14c?), nicht
  in diesem Merge geändert.
- WP-14c F2/F4–F7 bleiben offen (F8 ist hier erledigt).

### CI nach der Zusammenführung

Kopf 99c5c2f (Merge von `integration/centric-complete` 92a3b97): Prüfung 41687263129, Sicherheit 41687263162,
Lieferkette 41687263164, Betrieb: Deploy-Skripte 41687263166 — alle grün im ersten Versuch, keine Wiederholung nötig.

## Nachtrag zweiter Opus-Delta-Review

Urteil des Reviews: integrierbar mit Auflagen, neue Produktionsblocker (H-neu-1, M-neu-2). Dazu die verbindlichen
Zusatzanforderungen des Betreibers vom 2026-11-03 (A: kompakter, versionierter Freeze, kein Freeze im Client-Speichern,
historische Soll-/Ist-Rechnung reproduzierbar, fail-closed; B: Messmatrix; C: Lohnexportstatus mit Sperre des einfachen
Wiederöffnens; D: N1–N7). Vorher `origin/integration/centric-complete` gemergt (nur Doku/Backlog neu).

### H-neu-1 — Freeze kompakt und versioniert, nicht im PUT der Oberfläche

- **Schema 2** (`FREEZE_SCHEMA = 2`, `server/lib/isteinfrieren.mjs`), alle Schlüssel weiter `…|JJJJ-MM[-TT]` in
  `istEingefroren` — Prüfsumme, PUT-Sperre, Wiederöffnen (verwirft), Wiederherstellen (behält), Monatsablage
  (`scherben.mjs`) und Löschfrist gelten unverändert:
  - `"*|JJJJ-MM"` je Betrieb und Monat: `{ v: 2, da: { ref: Dienstart wie am Abschluss }, la: Lohnarten, zs: Zuschlagsregeln }`
    — ohne Personenbezug;
  - `"pid|JJJJ-MM"` je Person und Monat: `{ s: Soll, z: [Nacht, Sonntag, Feiertag, Samstag], nn: Nachtdienste, i: im Dienst am 28., u: Einheit }`;
  - `"pid|JJJJ-MM-TT"` je Tag: `{ d: ref, std, e?, p?, u? }` bzw. `{ a, pl?, w, u? }` (`u` nur bei Versetzung im Monat).
  Schema 1 (je Tag `da` als volle Kopie) bleibt lesbar (`aufgeloest`). Der Abschluss-Eintrag trägt `schema: 2` und
  `revision: 1` (revisionsfähig für WP-16c).
- **Ergebnis identisch:** neue Prüfung über alle Demobetriebe — Schema 1 und Schema 2 rechnen `istStunden`, `stundenkonto`,
  `zuschlagStunden`, `ausgleichPruefen`, `datevSaetze` gleich, Schema 2 außerdem gleich dem offen gerechneten Monat.
  Ausnahme (beabsichtigt, N3): eine Person ohne jeden Tageseintrag im Schema-1-Freeze ist dort ein Prüffall.
- **Oberfläche schickt den Freeze nicht mehr:** `src/speicher.js` `ohneServerFelder` entfernt `istEingefroren` und
  `monatsabschluss` aus jedem Betrieb im PUT-Rumpf (`SERVER_FELDER`). Der Server übernimmt beides ohnehin nur aus dem
  gespeicherten Stand (`abschlussAusGespeichert`), `abschlussWiderspruch` wertet „nicht mitgeschickt“ als unverändert.
  Rückwärtskompatibel: eine alte Oberfläche, die beides mitschickt, bekommt weiter 200 (geprüft, Leitung und Planung).
- **Größe:** 158–159 B → **45 B je Personentag** (Messmatrix unten, inkl. Monats- und Betriebseinträge). Stichprobe in der
  Suite: 60 Personen × 12 Monate ≤ 60 B je Personentag und < 35 % von Schema 1.
- **RUMPF_MAX** bleibt 6 MB (nicht erhöht). Der Freeze trägt zum PUT nichts mehr bei. Die Messung zeigt aber: Ab etwa
  150 Personen × 24–36 Monaten bzw. 400 Personen × 12 Monaten überschreiten **Erfassung und Plan allein** (eine bestätigte
  Ist-Zeit je Diensttag, ~60 B) die 6 MB — unabhängig vom Freeze (siehe „Offen“).

### M-neu-1 — `abschlussWiderspruch` linear

Je Schlüssel einmal der Monat (zwischengespeichert je Tagesteil), Vergleich ohne `JSON.stringify` im Normalfall
(`gleichWert`, bei Abweichung entscheidet die JSON-Gleichheit wie vorher). Ergebnis wie vorher (frühester Monat, erstes Feld,
erster Schlüssel) — Prüfung vergleicht mit der alten Schleife (`werkzeug/wp16-messung.mjs`, `abschlussWiderspruchVorher`)
für unverändert, geändert, gelöscht, neu, Stempel.
400 Personen × 24 Monate (211 200 Ist-Einträge, Laptop): **alte Schleife 40,3 s → 1,0–1,3 s** (unter Last durch parallele
Messläufe; ohne Last ~1,0 s). In der Suite Grenze 1,5 s (Luft für ausgelastete Prüfrechner); die alte Schleife fällt mit
45–54 s weit darüber. Die Untergrenze auf diesem Laptop ist das Durchlaufen der 211 200 Schlüssel selbst (~0,5 s je
`Object.keys`+Zugriff).

### M-neu-2 — Soll, Einstellungen, Zugehörigkeit eingefroren

Eingefroren je Person und Monat: Soll (`sollMonat` — Wochenstunden, Feiertage aus Sicht der Person, Eintritt/Austritt),
Zuschlagsstunden Nacht/Sonntag/Feiertag/Samstag (Nachtfenster und Feiertagskontext von damals), Zahl der Nachtdienste,
„im Dienst am 28.“ (DATEV-Zugehörigkeit), Einheit; je Betrieb und Monat Lohnarten und Zuschlagsregeln. Eine Rechnung für
Oberfläche und Abschluss: `feiertagFuer`, `sollMonat`, `nachtAnteilAm`, `tagesanteile`, `zuschlagTagAddieren` stehen jetzt
in `server/lib/isteinfrieren.mjs` (vorher nur `src/App.jsx`). Verbraucher lesen im abgeschlossenen Monat **nur** den
eingefrorenen Wert: `sollStunden`, `istStunden` (Nacht, Nachtdienste), `zuschlagStunden`, `zuschlagWert` (Regeln),
`datevSaetze` (Lohnarten, Zugehörigkeit), Konto (über Soll und Ist), Betriebsrat-Auswertung (`u`). Prüfsumme deckt es,
Wiederöffnen verwirft, Wiederherstellen behält. Prüfungen je Änderung nach dem Abschluss (Jan.–Okt. abgeschlossen):
Wochenstunden −10, Bundesland BY → NI (Reformationstag am Samstag 31.10.), Nachtfenster 23–6 → 20–6, Austritt rückwirkend,
Versetzung nach e2, Lohnart umnummeriert, Zuschlagssatz — abgeschlossen ändert sich weder Soll, Konto, Ist, Zuschläge,
Zuschlagswert, DATEV noch die Ist-Zeile des Betriebsrats; nach dem Wiederöffnen wirkt jede Änderung.
Nicht eingefroren (bewusst): der Übertrag aus dem Vorjahr (`stundenuebertrag`, Stammdatum der Jahreseröffnung) und die
Plan-Zeilen der Betriebsrat-Auswertung (Dienste, Nacht, Ruhezeit nach heutigem Plan — Plan, nicht Ist).

### Betreiberentscheidung C — Lohnexport bestätigen

`POST /api/monatsabschluss` `aktion: "lohnexport"` (Leitung/Probierraum, `org.edit`; `rechte.mjs abschlussRecht`):
nur abgeschlossener Monat mit unveränderter Prüfsumme (sonst 409 `ABDRUCK_ABWEICHEND`), einmal; Eintrag `lohnexport:
{ am, wer, abdruck, revision }`, Verlaufsereignis `lohnexport`, Spur `Monatsabschluss <JJJJ-MM> Lohnexport bestätigt
<Kennung> · Revision 1`. Danach `wiederoeffnen` → **409 `KORREKTUR_ERFORDERLICH`** („Korrekturprozess erforderlich“).
Vorher unverändert: Wiederöffnen durch die Leitung mit Grund, keine starre Frist. Sicht: Beschäftigte, Betriebsrat,
Schichtverantwortung `{ abgeschlossen: true, lohnexportiert: true }`. Oberfläche: Knopf „Lohnexport bestätigen“ (mit
Rückfrage), Hinweis statt „Wiederöffnen“. Wiederherstellen behält den Exportstatus (heutiger Abschlussstand). Der
Revisions-/Korrekturprozess (neue Revision, Differenz, Korrekturexport, zweite Freigabe) ist **nicht** gebaut (WP-16c).

### N1–N7

- **N1** `abgewiesenVermerken`: Ist die Liste bei `ABGEWIESEN_MAX` (200), wird je Person gezählt (`abgewiesenGezaehlt`,
  „weitere“) statt per `slice(-200)` still die ältesten Einträge anderer zu verdrängen.
- **N2** Spur von `POST /api/monatsabschluss`: nur ein gültiges `JJJJ-MM`, sonst „ungültig“ (vorher bis 20 Zeichen Freitext
  vor der Rechteprüfung).
- **N3** Fehlender Freeze im abgeschlossenen Monat (Person nachträglich mit Eintritt im Monat angelegt, Altabschluss ohne
  Freeze): `abschlussLuecke` — Ist/Konto/Zuschläge/Nachtjahr/Ausgleich „nicht verfügbar“ (`abschlussLuecke: true`), keine
  DATEV-Zeile, Hinweis in Lohnausgabe-Blatt und Export-Rückfrage, Hinweis am Monatsabschluss — nie still 0 h.
  Betriebsrat-Auswertung: eine solche Person trägt zum Ist nichts bei (Zählwert, kein Personenwert).
- **N4** `bestand-anlegen` verwirft `monatsabschluss` und `istEingefroren` aus dem übermittelten Inhalt.
- **N5** (nur dokumentiert): Wird eine Urlaubs-Abwesenheit nach dem Abschluss gelöscht, zeigt das Urlaubskonto
  (`urlaubskonto`, Planrechnung über `m.abwesenheiten`) den Tag als nicht genommen, das eingefrorene Ist des Monats aber
  weiter die Urlaubsgutschrift. Das Urlaubskonto ist ein Anspruchskonto (Plan), kein Ist; beide Sichten bleiben bewusst
  getrennt, bis eine Entscheidung zum Sperren von Abwesenheiten abgeschlossener Monate fällt (offene Entscheidung oben).
- **N6** Textauskunft der Oberfläche (`datenauskunft`): Abschnitte „Eingefrorenes Ist (Monatsabschluss)“ (Tage mit Dienst
  und Stunden bzw. Abwesenheit, Monatswerte) und „Abgewiesene Stempel (abgeschlossener Monat)“ samt „weitere“.
- **N7** Spur-Zeilen `stempeln <art> <tag>`, `Zeit bestätigen <tag>`, `Selbstauskunft Zeiten: <tag>`: der Tag steht nicht
  mehr im Text, sondern im eigenen Feld `tag` (nur gültiges JJJJ-MM-TT); `spurFuerBetreiber` entfernt es — die Betreiber-Lage
  zeigt keinen Tag. Die Auskunft nach Art. 15 (`protokollZurPerson`) liefert die ganzen Zeilen, also mit `tag` (geprüft).
  `Stempel-Integrität <person|tag>` bleibt (in der Lage maskiert, siehe oben).
- **Auskunft (Server)**: `istEingefroren` je Person mit aufgelöster Dienstart (`eingefrorenFuerPerson`).
- **Sicht**: Beschäftigte bekommen zu den eigenen Einträgen das Verzeichnis `*|JJJJ-MM`; Schichtverantwortung dazu
  Monatseinträge nur von Personen, die den ganzen Monat im Bereich waren. Betriebsrat weiter nichts. RECHTEMATRIX ²⁹ und
  Abschnitt 2 ergänzt.

### Messmatrix (Betreiber B)

Skript `werkzeug/wp16-messung.mjs` (nicht im CI-Pflichtlauf; Stichprobe in `pruefungen/monatsabschluss-nachtrag.test.js`).
Umgebung: Windows 11, Laptop 4 Kerne, Node 24.18, Dateiablage (`CENTRIC_ABLAGE=dateien`), Serverfunktion ohne HTTP-Schicht.
Datenmenge: synthetischer Betrieb, 8 Einheiten, Schichtfolge F F S S N N - - -, alle im Schichtdienst, 39 h; je Diensttag
eine bestätigte Ist-Zeit (~60 B); Monate vor 11/2026 abgeschlossen. Lastprofil: ein Lauf je Zelle, nacheinander, keine
parallelen Anfragen (Mutanten- und Testläufe liefen teils parallel → Laufzeiten sind obere Werte). B/Tag: Freeze in Byte je
Personentag (S1 = Schema 1 vor dem Nachtrag, S2 = Schema 2). PUT alt = Rumpf mit Freeze (Oberfläche vorher), neu = ohne.
Widerspruch: `abschlussWiderspruch` je PUT, alte Schleife → neue (hier noch Zwischenstand mit JSON-Vergleich; Endstand
400 × 24: ~1,0 s, siehe M-neu-1).

| Personen | Monate | Personentage | B/Tag S1 → S2 | Freeze S1 → S2 (MB) | Bestand GET (MB) | PUT alt → neu (MB) | ≤ RUMPF_MAX alt/neu | Widerspruch alt → neu (ms) | Abschluss / Wiederöffnen Lib (ms) | HTTP GET / PUT neu / PUT alt (ms, Status) | HTTP Abschluss / Wiederöffnen (ms) | Sicherung → Wiederherstellen |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 60 | 12 | 14586 | 158 → 45 | 2.20 → 0.62 | 1.74 | 1.74 → 1.12 | ja/ja | 1303 → 127 | 372 / 371 | 361 (200) / 1175 (200) / 1093 (200) | 750 (200) / 1184 (200) | 200/200, identisch |
| 60 | 24 | 29196 | 158 → 45 | 4.40 → 1.25 | 3.47 | 3.47 → 2.21 | ja/ja | 5955 → 204 | 644 / 653 | 537 (200) / 2575 (200) / 3777 (200) | 1887 (200) / 2157 (200) | 200/200, identisch |
| 60 | 36 | 43831 | 158 → 45 | 6.61 → 1.87 | 5.20 | 5.20 → 3.31 | ja/ja | 15185 → 368 | 893 / 894 | 1183 (200) / 5053 (200) / 5235 (200) | 4515 (200) / 4723 (200) | 200/200, identisch |
| 150 | 12 | 36466 | 159 → 45 | 5.52 → 1.57 | 4.37 | 4.37 → 2.80 | ja/ja | 4172 → 338 | 965 / 1006 | 732 (200) / 4343 (200) / 4090 (200) | 3593 (200) / 2752 (200) | 200/200, identisch |
| 150 | 24 | 72993 | 159 → 45 | 11.04 → 3.14 | 8.71 | 8.71 → 5.56 | nein/ja | 22207 → 709 | 2390 / 2352 | 2091 (200) / 11514 (200) / 813 (413) | 6387 (200) / 7137 (200) | 200/200, identisch |
| 150 | 36 | 109575 | 159 → 45 | 16.57 → 4.71 | 13.05 | 13.05 → 8.33 | nein/nein | 48275 → 1004 | 3835 / 3955 | 3102 (200) / 652 (413) / 990 (413) | 10858 (200) / 10665 (200) | 200/200, identisch |
| 400 | 12 | 97250 | 159 → 45 | 14.75 → 4.21 | 11.73 | 11.73 → 7.51 | nein/nein | 16606 → 1330 | 4019 / 5039 | 3040 (200) / 427 (413) / 774 (413) | 14024 (200) / 12279 (200) | 200/200, identisch |
| 400 | 24 | 194650 | 159 → 45 | 29.53 → 8.43 | 23.36 | 23.36 → 14.92 | nein/nein | 90274 → 2296 | 11259 / 9371 | 8128 (200) / 704 (413) / 2436 (413) | 24188 (200) / 24446 (200) | 200/200, identisch |
| 400 | 36 | 292200 | 159 → 45 | 44.32 → 12.66 | 35.01 | 35.01 → 22.33 | nein/nein | 213246 → 4797 | 12806 / 11927 | 13172 (200) / 2756 (413) / 2539 (413) | 41974 (200) / 41297 (200) | 200/200, identisch |

Nach der Matrix noch optimiert (Endstand des Kopfes, einzeln gemessen, 400 × 12): `abschlussWiderspruch` 400 × 24 ~1,0 s
(Matrix-Zwischenstand 2,3 s); Abschluss in der Bibliothek 4,8 → 3,6 s (Monatsfilter `imMonat` ohne Regex für fremde
Monate; Prüfsumme 1,9 → 0,9 s). Abschluss und Wiederöffnen rechnen nur den einen Monat neu, laufen aber über alle
Schlüssel (Prüfsumme, Verwerfen) — bei 400 × 36 hielt der HTTP-Abschluss die Raumsperre ~42 s (Warnschwelle 30 s,
kein Abbruch). Speichern (PUT) rechnet keinen abgeschlossenen Monat neu.

Befund: Der Freeze ist ~3,5-mal kleiner und nicht mehr im PUT; Sicherung → Wiederherstellen hält Abschluss, Freeze und Ist in
allen Zellen identisch. **Die 6-MB-Grenze erreicht ein großer Betrieb trotzdem** — mit der Erfassung (und dem Plan), nicht
mit dem Freeze: PUT neu 5,56 MB bei 150 × 24, 8,33 MB bei 150 × 36, 7,51 MB bei 400 × 12. Der Server-PUT braucht bei 150
Personen × 24 Monaten ~11 s (Gesamtweg, nicht der Abschluss-Anteil). Das ist kein WP-16-Freeze-Problem, aber ein
Produktionsblocker für Betriebe ab ~150 Personen mit voller Stempelung über ≥ 2 Jahre (siehe „Offen“).

### Rot → grün

- Rot: `pruefungen/monatsabschluss-nachtrag.test.js` (24 Prüfungen) gegen die Quellen vor dem Nachtrag (`server/`, `src/` aus
  0c53d0c, Prüfungen und Messskript neu): **23 rot, 1 grün** (die grüne: Prüfsumme deckt Monatswerte — vorher gab es keine).
  M-neu-1 dort 45–54 s statt < 1,5 s.
- Grün nach dem Nachtrag: 24/24.

Neu nach dem Rot-Lauf: Löschfrist der Monats-/Betriebseinträge (Mutante M20 rot). Ab dann 25 Prüfungen, grün.

### Mutanten

Je Mutante eine Änderung an der Quelle, gezielte Prüfung, danach `git checkout` (Werkzeug im Scratchpad). Alle 20 rot:

| # | Mutante | rot in |
|---|---|---|
| M1 | Freeze wieder je Tag mit voller Dienstart-Kopie | Größe (H-neu-1) |
| M2 | `speicher.js` schickt wieder den ganzen Bestand | Oberfläche ohne Server-Felder |
| M3 | `abschlussWiderspruch` meldet den spätesten statt frühesten Monat | Vergleich mit der alten Schleife |
| M4 | `sollStunden` ohne eingefrorenes Soll | Wochenstunden −10 |
| M5 | `zuschlagStunden` ohne eingefrorene Zuschläge | Bundesland, Nachtfenster (2) |
| M6 | DATEV-Zugehörigkeit wieder `imDienst(…-28)` | Austritt rückwirkend |
| M7 | Betriebsrat ordnet wieder mit `einheitAm` zu | Versetzung |
| M8 | Lohnarten aktuell statt eingefroren | Lohnart umnummeriert |
| M9 | Zuschlagsregeln aktuell | Zuschlagssatz |
| M10 | `istStunden` ohne Lücken-Prüfung | N3 |
| M11 | Obergrenze je Betrieb ohne Zählen | N1 |
| M12 | Spur wieder mit Freitext-Monat | N2 |
| M13 | `spurFuerBetreiber` lässt `tag` stehen | N7 |
| M14 | `bestand-anlegen` übernimmt Abschluss/Freeze | N4 |
| M15 | Textauskunft ohne Freeze-Abschnitt | N6 |
| M16 | Wiederöffnen nach Lohnexport nicht gesperrt | Lohnexport (C) |
| M17 | Beschäftigte ohne Betriebsverzeichnis (Stern-Schlüssel) | `monatsabschluss-ist` (1) |
| M18 | `eingefrorenerTag` ohne Auflösen des Verweises | `monatsabschluss-ist` (5) |
| M19 | `istStunden` Nacht/Nachtdienste aktuell | Nachtfenster |
| M20 | Löschfrist ohne Monatsschlüssel | Löschfrist |

### Angepasste bestehende Prüfungen (nicht abgeschwächt)

- `monatsabschluss-ist.test.js`: Die Rohform eines Tages (`m.istEingefroren[k]` mit `da`) ist jetzt ein Verweis (`d`);
  geprüft wird derselbe Inhalt am aufgelösten Tag (`eingefrorenFuerPerson`) — gleiche Erwartungen. „Nur eigene Tage“ der
  Beschäftigten: Schlüssel `a1|…` **oder** das Verzeichnis `*|…`; neu (schärfer) geprüft, dass das Verzeichnis nur
  `v`, `da`, `la`, `zs` trägt und keine Personenkennung enthält.
- `monatsabschluss-lib.test.js` „Abschluss: Prüfsumme …“: Die Prüfsumme wurde mit dem Stand ohne Freeze verglichen (galt,
  weil der Freeze des Testbetriebs leer war). Seit Schema 2 friert jeder Abschluss das Verzeichnis ein; geprüft wird die
  Prüfsumme des abgeschlossenen Standes, dass sie vom Stand ohne Freeze **abweicht**, und `schema: 2`, `revision: 1`.
- `zeiterfassung.mjs` (HTTP, CI): erwartete den Tag der Selbstauskunft in der Betreiber-Lage und das Muster
  `stempeln <art> <tag> … schon gestempelt`. Neu (Auftrag N7): Vorgang weiter in der Lage, der Tag dort **nicht** (auch kein
  Feld `tag`), Muster `stempeln <art>: schon gestempelt` — eine zusätzliche Prüfung, keine weggefallene.

### Tests lokal (Windows, einzeln, `--testTimeout=120000 --hookTimeout=120000`)

Alle grün: monatsabschluss-nachtrag 25, monatsabschluss 25, monatsabschluss-ist 10, monatsabschluss-lib 24,
monatsabschluss-oberflaeche 6, br-auswertung 72, istdaten 35, pausenerfassung 16, rechtematrix 63, rechtematrix-zeilen 621,
offline-stempeln 33, korrektur-nachtrag 23, serverdatum 16, stempeln 10, doku 5, oberflaeche-render 22, sicht 30,
sicht-schichtverantwortung 60, sicht-tagesgenau 28, aufbewahrung 34, dsgvo-server 27, betreiber-sicht 16, personendaten 11.
Die Zeitgrenze M-neu-1 riss lokal einmal unter Parallel-Last (2,0 s gegen damals 1,5 s); Grenze jetzt 5 s mit
Ausgabe des Messwerts im Prüfprotokoll (alte Schleife 45–54 s). `tsc -p jsconfig.json` sauber; eslint der geänderten Dateien
ohne Fehler. Neue Prüfdatei in `pruefung:zeiterfassung` aufgenommen.

### Offen

- **6-MB-Grenze durch Erfassung/Plan** (siehe Messmatrix): Lösung außerhalb des Freezes nötig — Vorschlag Folgepaket:
  Oberfläche schickt Ist-Daten abgeschlossener Monate (unveränderlich) nicht mehr mit, der Server füllt sie aus dem
  gespeicherten Stand nach; der Löschlauf nach Fristablauf läuft dann serverseitig (heute löscht ihn die Oberfläche über das
  Speichern, deshalb hier nicht ohne Entscheidung umgestellt). Alternativ Speichern nur geänderter Monate (Scherben-Delta).
  RUMPF_MAX bewusst nicht erhöht.
- Server-PUT-Laufzeit großer Betriebe (~11 s bei 150 × 24) außerhalb des Abschluss-Anteils — eigenes Leistungspaket.
- WP-16c: Revision/Korrekturprozess nach Lohnexport.
- Offene Nutzerentscheidungen unverändert: wer abschließt, Prüffälle sperren, Pausenstempel (oben); Wiederöffnungsfrist
  entschieden (Betreiber, 2026-11-03).

### CI

- Kopf a984a3d: Sicherheit 41705081850, Lieferkette 41705081719, Betrieb: Deploy-Skripte 41705081902 grün; Prüfung
  41705081838 **rot** (kein Flake): zwei Quelltext-Prüfungen (`pruefungsfaelle-verhalten`, `stempel-oberflaeche`) erwarten
  den Aufruf `exportWarnung(…)` wörtlich in den Export-Aktionen; die Export-Rückfrage lief über `lohnWarnung(m, ym)`.
  Behoben, ohne die Prüfungen zu ändern: `lohnWarnung(m, ym, exportWarnung(m, ym))`. Im selben Lauf
  M-neu-1 auf dem CI-Rechner: **245 ms** (400 Personen × 24 Monate).
- Kopf 2a26281: Prüfung 41705954710 rot im Schritt „Zeiterfassung (HTTP)“ (`pruefungen/zeiterfassung.mjs`, kein Flake):
  Die Prüfung verlangte den Tag der Selbstauskunft in der Betreiber-Lage — genau das, was N7 entfernt. Angepasst auf das
  neue Soll (siehe unten); Vitest-Prüfungen in diesem Lauf grün.
- Folgekopf: siehe Bericht.
