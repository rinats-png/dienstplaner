# WP-I4 Interne Vorgaben: Verwaltung (Rest nach PR #256)

Stufe L3 (Rechte, Mandantentrennung), Umfangsklasse SICHERHEIT-QUALITAET. Basis `origin/integration/release-v4` (f1e44eca). Nur synthetische Daten.

## Abgleich Plan (Block K, I4) gegen Repo-Ist

| Akzeptanz / Ziel | Stand |
|---|---|
| Vorgabe ohne KI anlegen, testen, aktivieren | erfüllt (PR #256: `src/ansichten/vorgaben.jsx`, `server/lib/vorgaben.mjs`) |
| Geltung, Zeitraum, Stärke, Priorität, Grundlage | erfüllt |
| Ausnahmen | Server und Anzeige erfüllt; **Ausnahmezeiträume waren in der Oberfläche nicht eingebbar** (Lücke, jetzt geschlossen) |
| Stufengrenzen 5/25/∞ (E-21), Stufenzähler | erfüllt (Grenze 25 für `pro` wartet auf Bestätigung, Frage 4) |
| Recht dafür, Rechtematrix-Zeile | erfüllt (`org.edit`, `RECHTEMATRIX.md` Zeile und Fußnote 30) |
| Datenmodell, Migration | erfüllt (Altbestand bleibt unberührt; Test Altbestand und Rundweg) |
| Bezüge (Einheiten, Personen) gehören zum eigenen Betrieb | **fehlte** (Server nahm beliebige Kennungen, auch aus einem anderen Betrieb), jetzt geschlossen |
| Betriebsrat sieht nur Zahl/Text ohne Personen | **nicht umgesetzt, BLOCKED auf Betreiber** (Frage 2); heute sieht der Betriebsrat nichts, bewusst |

## Umgesetzt in diesem Teil (kleinster Umfang)

1. `server/lib/vorgaben.mjs`: neue oder geänderte Vorgabe darf in `geltung.einheiten`, `geltung.personen` und `ausnahmen.personen` nur Kennungen des übermittelten (eigenen) Betriebs nennen; eine im selben Schreibvorgang angelegte Einheit oder Person zählt. Was die gespeicherte Vorgabe schon nannte (inzwischen gelöschte Kennung), blockiert Änderungen nicht; neu hinzukommen darf nur Bekanntes. Unveränderter Altbestand wird weiter nicht nachträglich geprüft. Antwort wie jede andere Formabweisung (422 mit Text). Keine Änderung an Rollen, Rechten, Sicht oder Stufengrenze.
2. `src/ansichten/vorgaben.jsx`: Ausnahmezeiträume (Von/Bis, Hinzufügen/Entfernen, höchstens 20) im Formular; verwaiste Kennungen (gelöschte Einheit/Person) fallen beim Speichern heraus (`bezuegeBereinigen`), der Formularstand wird über die reine Funktion `formularZuVorgabe` zur Vorgabe; veralteter Kommentar „Planung liest nur“ berichtigt (die Planung bekommt den Abschnitt nicht).

## Rot -> grün

- `pruefungen/intelligence-vorgaben-bezuege.test.js` (neu, 8 Tests, Server): vor dem Code 5 rot (Geltung Einheit, Geltung Personen, Ausnahmen Personen, fremder Betrieb, Altbestand), danach grün.
- `pruefungen/intelligence-vorgaben-oberflaeche.test.js` (+4 Tests): vor dem Code 3 rot (Ausnahmezeiträume angeboten und angezeigt, Bereinigung), danach grün.
- `pruefungen/intelligence-vorgaben-wege.test.js` (+1 Test, echter Handler, Voll-PUT): Bezüge unbekannt abgewiesen, nichts gespeichert; bekannte gehen. Kein bestehender Test wurde geändert oder abgeschwächt.
  Erster Entwurf (strenge Prüfung auch gespeicherter Kennungen) ließ drei bestehende Wege-Tests rot werden (synthetischer Altbestand nennt eine nicht vorhandene Person); das war ein Entwurfsfehler und kein Testfehler, die Regel ist deshalb „Bestehendes darf bleiben, Neues muss bekannt sein“.

## Mutationen (je Schutz einzeln, jeweils rot, danach zurückgesetzt)

| Mutation | Ergebnis |
|---|---|
| Bezugsprüfung entfällt | 6 Tests rot (unit + Handler) |
| Toleranz für gespeicherte Kennungen entfällt | 4 rot (3 bestehende Wege-Tests, 1 neuer) |
| `ausnahmen.personen` ungeprüft | 2 rot |
| bekannte Personen nur aus altem Stand | 1 rot (nach Ergänzung des Tests „im selben Schritt angelegte Person“; vorher überlebte sie) |
| Oberfläche bereinigt verwaiste Kennungen nicht | 1 rot (überlebte zuerst, durch Test über `formularZuVorgabe` getötet) |
| Oberfläche verliert Ausnahmezeiträume beim Speichern | 1 rot (überlebte zuerst, jetzt getötet) |

## Alle Schreibwege und Rollen

Einziger Aufrufer ist `vorgabenZusammen` in `rechte.mjs` (Voll-PUT und Teilweg laufen durch dieselbe Kette; Wege-Tests grün). Ohne `org.edit` bleibt das Feld wirkungslos (Test „ohne org.edit“, kein neuer Fehler). Mandantentrennung: Betrieb 2 im selben Raum bleibt unberührt (bestehende Tests); fremde Kennungen werden jetzt abgewiesen.

## Offene Betreiberfragen (nichts davon entschieden, keine Annahme eingebaut)

1. Planung: entschieden 2026-11-25 (1.1 B): liest, ändert nicht (Teil 3).
2. Betriebsratssicht: vorläufig keine (1.2 A); Lesesicht hinter Schalter AUS gebaut (Teil 3).
3. Protokoll: entschieden (1.3 C), gebaut in Teil 3.
4. Grenze 25: vorläufig bestätigt (1.4 A), zentral.
5. Server-Erzwingung „erst testen“: entschieden (1.5 B), gebaut in Teil 3.

Wirkung im Plan (Planungsassistent, Ersatzsuche, Selbstplanung) ist WP-I5 und nicht Teil von I4.

## Tests (lokal, gezielt, TZ=UTC, `--maxWorkers=1`)

`pruefungen/intelligence*`, `rechtematrix*`, `einstellungen*`, `stufen*`: 41 Dateien, 2012 Tests grün (Vorgaben-Dateien: bezuege 8, oberfläche 11, wege +1). Vollregression in CI.

## Teil 3 (Betreiberentscheidungen 2026-11-25, Basis PR #555)

Stufe L3, SICHERHEIT-QUALITAET. Nur synthetische Daten, kein produktives KI-Verhalten. Plan-Probelauf (Variante C, 1.5) kommt mit WP-I8/I9 und ist nicht gebaut.

| Punkt | Umsetzung | Beleg |
|---|---|---|
| 1.1 B Planung liest, nur `org.edit` ändert | `rechte.mjs`: Planung bekommt `vorgaben` des eigenen Betriebs (Vollsicht hat keine Einheitsbeschränkung, Zuständigkeit = Betrieb); Schreiben unverändert nur `org.edit` (Feld sonst wirkungslos); Oberfläche lesend (`lesend`), RECHTEMATRIX.md Zeile und Fußnote 30, `rechtematrix.test.js` Zelle PL | Wege 1, 2; Oberfläche; Matrix |
| 1.2 Betriebsrat AUS, Ziel B hinter Schalter | `VORGABEN_BETRIEBSRAT_LESEN = false` (eine Konstante in `vorgaben.mjs`, Einschalten = bewusste Codeänderung); `vorgabenBetriebsratSicht` (Zahl/Text, ohne Personenkennungen in Geltung/Ausnahmen, ohne Stempel-Personen); Protokolleinträge der Vorgaben für BR nur bei EIN, dann ohne Person (`moduleinstellungenSicht`). Nicht rechtlich freigegeben, nicht aktiviert | Teil-3-Test (AUS und EIN per Testparameter an `betriebSicht`) |
| 1.3 C Deaktivieren, Protokoll | Löschen nur für einen nie aktiven Entwurf (`status != aktiv` und kein `aktiviertAm`); `aktiviertAm/-Von` bleiben beim Deaktivieren erhalten (Fund durch Test). Protokoll im bestehenden Modulprotokoll (`modul: "vorgaben"`; Art, Kennung `VORGABE-<ID>`, Zeit, Person, Version, Namen geänderter Felder, keine Werte), zusätzlich Zeile im Betriebsprotokoll (`modulProtokollZeilen`). Aufbewahrung/Obergrenze/Löschweg unverändert die des Modulprotokolls (`MODULPROTOKOLL_FRIST`, vorläufig ungeprüft FN-32: löscht heute nichts); an der Obergrenze sind nur Anlegen/Aktivieren/Ändern gesperrt, Deaktivieren geht immer | Teil-3-Test, Wege 7 |
| 1.4 A Grenze 25 für `pro` | Bereits zentral: `VORGABEN_STUFENGRENZE` in `vorgaben.mjs`, von `src/stufen.js` und der Oberfläche nur gelesen; nur belegt/getestet | Teil-3-Test „zentral“ |
| 1.5 B Server erzwingt „erst testen“ | `vorgabenZusammen`: jede neue oder geänderte aktive Vorgabe muss den Testlauf mit Beispielfällen bestehen (`vorgabeTestlauf`), sonst 403 mit Text; Entwurf und Deaktivieren frei | Teil-3-Test, Wege 7 |
| Review #555 (1) | `frueher` in `pruefeBezuege` prüft `Array.isArray` (kein Programmfehler bei Altbestand ohne Liste) | Teil-3-Test |
| Review #555 (2) | Test über den echten Handler mit zweitem Betrieb im selben Raum (Einheit/Person des anderen Betriebs abgewiesen) | Wege 7 |
| Review #555 (3) | Test „im selben Schritt gelöschte Person, zugleich genannt“ abgewiesen (Mutation `bekannt = alt ∪ neu`) | Teil-3-Test |

### Rot → grün
Neu `pruefungen/intelligence-vorgaben-teil3.test.js` (22 Tests; vor dem Code 15 rot, Rest grün, weil Review-Befund 3 und Grenze schon erfüllt waren), `intelligence-vorgaben-wege.test.js` Abschnitt 7 (+7 Tests, Fixture: zweiter Betrieb mit eigener Einheit/Person), `intelligence-vorgaben-oberflaeche.test.js` (+3 Tests; 4 rot vor dem Code).

### Angepasste bestehende Tests (jeweils wegen der Entscheidung, nicht abgeschwächt)
- `intelligence-vorgaben.test.js`: „Planung bekommt nichts“ → Planung liest (1.1), die übrigen drei Rollen unverändert; „Stufenwechsel nach unten“ verringert per Deaktivieren statt Löschen; „Löschen durch die Leitung“ → Entwurf löschbar, aktive abgewiesen (1.3).
- `intelligence-vorgaben-wege.test.js`: Lesen je Rolle (PL/DP lesen), „Löschen geht“ → aktive Vorgabe nicht löschbar, Altbestand-Test (Planung liest).
- `intelligence-vorgaben-oberflaeche.test.js`: Planung bekommt den Abschnitt (lesend); Einhängung ohne `darf(org.edit)` in `einstellungen.jsx` (die Komponente entscheidet).
- `rechtematrix.test.js`: Zelle PL der Zeile „Vorgabe: Person in der Geltung“ 0 → 1.

### Mutationen (je Schutz einzeln, alle rot, danach zurückgesetzt; Läufe nacheinander)
Test vor Aktivieren entfällt 4 rot · Löschen aktiver Vorgabe erlaubt 8 · Protokoll nicht angehängt 10 · `frueher` ohne Typprüfung 1 · `bekannt = alt ∪ neu` 1 · Aktivierungsstempel gehen beim Deaktivieren verloren 1 · Deaktivieren an der Protokollgrenze gesperrt 1 · Betriebsrat-Schalter EIN 6 · BR sieht Protokoll der Vorgaben trotz AUS 2 · BR-Sicht mit Personen 1 · Beschäftigte sehen Vorgaben 5 · Planung liest nicht (Strip zurück) 4 · Planung darf schreiben 8 · Betriebsprotokoll-Zeile fehlt 1 · Oberfläche bietet Löschen immer an 1 · Oberfläche: Planung bearbeitet 2.

### Offene Fragen (nichts erfunden)
1. Regelarten/Parameter ohne Beispielfälle (z. B. Besetzungsregel „Anteil mit Merkmal“) lassen sich nach 1.5 nicht aktivieren (wie schon die Oberfläche); Beispielfälle dafür wären ein eigener kleiner Schritt (WP-I8/I9 Probelauf).
2. Löschfrist des Modulprotokolls (und damit der Vorgaben-Einträge) ist vorläufig ungeprüft (FN-32): bis zur Bestätigung löscht der Lauf nichts; Obergrenze 2000 Einträge je Betrieb bleibt die Sperre.
3. Planung = Rolle `planer` mit `staff.edit` (ohne Einheitsbeschränkung): „innerhalb ihrer Zuständigkeit“ als „eigener Betrieb“ gelesen; soll die Planung auf eigene Einheiten beschränkt werden, wäre das eine neue Entscheidung.
4. Betriebsrat Ziel B: Einschalten braucht die rechtliche Rückmeldung (nicht behauptet).
5. Löschen ganzer Betriebe/Datenschutzläufe (Art. 17) betrifft die Vorgaben mit dem Betrieb; nichts Neues eingebaut.

Lokale Gesamtläufe Teil 3 (TZ=UTC, `--maxWorkers=1`): `pruefungen/intelligence*`, `rechtematrix*`, `sicht*`, `art9-katalog`, `modul-kern*`, `modul-integritaet-quer`, `abnahme-c-module`, `v4-3b-einstellungen`, `wp48-rundweg`, `einstellungen*`, `stufen*`: 61 Dateien, 2499 Tests grün. Vollregression in CI.

## Nachbesserung nach Review #561 (Befund → Fix → Test → Mutation)

Stufe L3, SICHERHEIT-QUALITAET, kleinster Umfang. Tests zuerst: `pruefungen/intelligence-vorgaben-aufwand.test.js` (16 Tests). Rot vor dem Code: der Lauf mit den Parametern 1e9/1e15 hing (der Befund selbst, Abbruch von Hand, verwaister Worker beendet); nach dem Code 16 grün.

| Nr. | Befund | Fix | Test | Mutation (rot) |
|---|---|---|---|---|
| 1 HOCH | Parameter ohne Obergrenze, Beispielfälle in Parametergröße, synchron je aktive Vorgabe (DoS) | `VORGABEN_PARAMETER_GRENZE` (Zählgrenze, Folge-Maximum, Danach-frei je 366, Personen 300; ganze Zahlen, nur Zahlentyp) in `pruefeVorgabe` (`groessenFehler`); `beispielFaelle` erzeugt bei unzulässiger Größe nichts (Selbstschutz); je Anfrage kumulierter Aufwand `VORGABEN_AUFWAND_JE_ANFRAGE` (50000 Einheiten, geschätzt vor dem Rechnen, Summe über alle zu testenden Vorgaben) und Zeitbudget `VORGABEN_ZEITBUDGET_MS` (2000 ms, vor jedem Testlauf); Abweisung mit Text (Schreibweg antwortet wie alle fachlichen Abweisungen mit 403, nicht 422) | 1e5, 1e9, 1e15, NaN, ±Infinity, negativ, gebrochen für Zähl-, Muster-, Besetzungs-, Paarregel in unter 200 ms abgewiesen; 200 riesige Vorgaben in einer Anfrage schnell abgewiesen; Obergrenze selbst gültig; Gesamtbudget und Zeitbudget | Grenze entfernt 2 rot · Selbstschutz entfernt: Lauf hängt (rot per Zeitüberschreitung) · Aufwandsdeckel entfernt 1 · Zeitbudget entfernt 1 |
| 2 MITTEL | `betriebWiederherstellen` übernahm `vorgaben` (in `VOLL_BETRIEB`) aus der Sicherung an `vorgabenZusammen` vorbei | Muster der Branchenmodule: Vorgaben des laufenden Betriebs gelten weiter (fehlt das Feld heute, kommt keines zurück); das Modulprotokoll blieb schon über `MODULEINSTELLUNGEN_FELDER`; weicht die Sicherung ab, nennt die Betriebsprotokollzeile der Wiederherstellung die Auslassung | 3 Tests: heutige Vorgaben + Protokoll bleiben, kein Feld heute = keines danach, gleiche Vorgaben = keine Zeile | Übernahme aus der Sicherung 2 rot · Protokollzeile fehlt 2 |
| 3 MITTEL | Altbestand `inaktiv` ohne `aktiviertAm` war löschbar | Löschen nur bei `status === "entwurf"` und ohne `aktiviertAm` (Server und Oberfläche `loeschbar`); Deaktivieren trägt fehlendes `aktiviertAm/-Von` aus `geaendertAm/-Von` des Vorzustands nach (sonst `jetzt`) | 4 Tests (inaktiv ohne Marke nicht löschbar, Entwurf löschbar, Marke nachgetragen, Marke = jetzt) | Server `!== "aktiv"` 1 rot · Marke nicht nachgetragen 2 · Oberfläche 1 |
| 4 NIEDRIG | Kopf von `intelligence-vorgaben-teil3.test.js` nannte Abschnitt 6 | Abschnitt 7 | | |

Angepasster bestehender Test (nur aus Befund 3, nicht abgeschwächt, sondern an die strengere Regel angepasst): `intelligence-vorgaben-oberflaeche.test.js`, „nur einen nie aktiven Entwurf löschen“: `V("i","inaktiv")` ohne Marke bietet jetzt kein „Löschen“ an (vorher ja).

Altbestand: keine bestehende Vorgabe in Tests oder Seeds liegt über den neuen Grenzen; unveränderter Altbestand wird ohnehin nicht neu geprüft (nur Neues/Geändertes).

Offene Punkte (nicht Teil dieses PR, nichts geändert):
- Die vorhandenen Beispielfälle können bei Zählregeln mit Grenze über 31 (Ereignisse nur im März-Fenster) und bei Mustern „Höchstens in Folge“ (Block am Zeitraumanfang = offen) ihren eigenen Test nicht bestehen; solche Vorgaben bleiben nach 1.5 nicht aktivierbar. Das ist der Zustand vor dieser Änderung; bessere Beispielfälle sind eigener Schritt (WP-I8/I9).
- Abweisung des Schreibwegs ist wie bisher 403 mit Text; ein eigener 422 bräuchte eine Änderung im Handler (`daten.mjs`), die hier nicht vorgenommen wurde.

### Hinweis für WP-I5/WP-I7
Jede Intelligence-Berechnung braucht eine kumulierte Aufwandsgrenze je Anfrage (Summe über alle Vorgaben und Fälle) und ein Zeitbudget, nicht nur Grenzen je Parameter; sonst blockiert eine Anfrage mit `org.edit` die Ereignisschleife für alle Mandanten. Wiederherstellen (und jeder andere Weg, der Betriebsdaten ersetzt) darf Schutzregeln des normalen Schreibwegs (Löschsperre, Server-Test, Stufengrenze) nicht umgehen: neue Betriebsfelder mit Schutzlogik in `VOLL_BETRIEB` müssen in `betriebWiederherstellen` ausdrücklich „gilt weiter wie heute“ erhalten. Die Aufwandsschätzung (`vorgabeTestAufwand`) ist eine Schätzung der Beispielfallgröße; neue Regelarten müssen sie mitführen.

Lokale Läufe der Nachbesserung (TZ=UTC, `--maxWorkers=1`): `intelligence-vorgaben*`, `rechtematrix*`, `sicherungen.test.js`, `wiederherstellen-ui`, `modul-kern*`, `modul-integritaet-quer`, `entwuerfe`, `rb1-plan-publish`, `sicht*`, `einstellungen*`, `stufen*`: 29 Dateien, 1556 Tests grün. Vollregression in CI.
