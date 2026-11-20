# IMP-6 — Schichtmodelle und Schichtzyklen (Nachweis)

Stand: 2026-11-10. Umsetzung: `server/lib/import/schichtmodelle.mjs` (Lesen, Ausrollen),
`server/lib/import/schichtpruefung.mjs` (Analyse, Prüfung, Grenze). Prüfung: `pruefungen/import-schichtmodelle-imp6.test.js`
(`npm run pruefung:import-schichtmodelle`, eigener CI-Schritt). Freigabe Punkt 5: mehrere Modelle je Betrieb, keine feste
Zykluslänge. `IMPORT_DATEI_AKTIV` bleibt `false`, ebenso der Serverschalter `CENTRIC_IMPORT_AKTIV` (Vorgabe aus). Seit dem Teil „Vorschau im Import“ liefert `/api/import` (Art `schichtzyklus`) Analyse und Vorschau der Modelle, ohne zu schreiben (siehe unten).

## Format (Rohinhalt aus dem Parser, IMPORT-VERTRAG.md §6)

| Tabelle | Spalten (Pflicht) | Regeln |
|---|---|---|
| Modelle | `Modell`, `Tag`, `Dienst` | Eine Zeile je Zyklustag. Tag 1 … n lückenlos, je Modell genau einmal; n = Zykluslänge (beliebig). Dienst = Kürzel einer Dienstart **des Betriebs** oder `-` (frei). Leere Zelle = Lücke (Fehler), nie „frei". Mehrere Modelle in einer Tabelle. |
| Zuordnungen | `Personalnummer`, `Modell`, `Beginn`, `Versatz` | Am Beginn arbeitet die Person Zyklustag Versatz + 1. Versatz 0 … n−1, sonst Fehler (kein Modulo). Person nur über die Personalnummer im eigenen Betrieb. Mehrere Zuordnungen je Person = Modellwechsel ab dem jeweiligen Beginn. |

Spaltenerkennung über Überschriften (genau, dann Wortanfang) oder eine mitgeschickte Zuordnung (geprüft wie im Personalimport).

## Konfliktmodell (wie `personen.mjs`)

Je Datensatz `fehler` (Feldnamen, nie Werte), `hinweise`, `konflikte: [{ art }]`, `erlaubt`, `vorgabe`.
Modellkonflikte: `dienstart-unbekannt`, `dienstart-mehrdeutig`, `dienstart-zeit-ungueltig`, `tag-fehlt`, `tag-doppelt`,
`datensatz-fehlerhaft`, `modell-leer`. Ein Modell mit Konflikt ist `pruefbar: false`, wird nicht ausgerollt und nicht geprüft.
Zuordnungskonflikte: `person-unbekannt`, `person-mehrdeutig`, `modell-unbekannt`, `modell-mit-konflikt`, `zuordnung-doppelt`,
`person-nicht-im-dienst`. Arbeitszeitbefunde setzen die Vorgabe auf `klaeren`; `uebernehmen` bleibt nur als ausdrückliche Wahl.

## Prüfung (keine eigene Regel)

Die ausgerollten Schichten werden als Einteilungen in eine Prüfkopie geschrieben; geprüft wird mit `pruefen()` aus
`server/lib/engine/befunde.mjs` und den Einstellungen und Dienstarten des Betriebs. Übernommen werden die Befundarten
`ruhezeit` (inkl. Zeitumstellung), `folge`, `nachtfolge`, `pause`, `tagesgrenze`, `ersatzruhe`, `sonntagsfrei`, `schutz`,
`einschraenkung`, `istdaten`. Zwei Ebenen: je Modell eine neutrale volljährige Prüfperson über zwei volle Zyklen ab `von`
(Verstöße über das Zyklusende), je Zuordnung die Person mit ihren Merkmalen über `von` … `bis`. Nachtschichten werden mit
`fenster`/`uhrversatz`/`dauerAm` gelegt (Ende am Folgetag, wirkliche Dauer bei Zeitumstellung).

## Ressourcengrenze (technisch, keine Geschäftsregel)

`pruefTage = 20.000` Personentage je Analyse (je Modell 2 × Länge, je Person die Tage des Zeitraums). Gemessen ca. 70 µs je
Personentag (Windows-Entwicklungsrechner; 50 Personen × 400 Tage ≈ 1,4 s); 20.000 halten die synchrone Prüfung bei ca. 1,5 s
und unter dem Ziel „unter 2 s" (IMPORT-PLAN Teil E). Keine Grenze für Zykluslänge oder Modellzahl als solche. Darüber
`PRUEFUMFANG_ZU_GROSS` ohne Teilergebnis.

## Konservative Festlegungen (ohne Betreiberentscheidung)

1. Fehlende Grenze im Betrieb (`ruhezeit`, `maxFolge`, `maxNachtFolge`) → Grundwert eines neuen Betriebs (11 h, 6, 4) und
   Hinweis `grundwert-verwendet`; ohne Wert prüfte `pruefen` sonst still nichts.
2. Abwesenheiten, erfasste Ist-Zeiten und eingefrorene Monate zugeordneter Personen bleiben in der Prüfkopie außen vor
   (sie würden Verstöße des Modells verdecken). Vor dem ersten Beginn gelten die Abweichungen des Bestands.
3. „Kein Alleindienst" ist eine Besetzungsfrage, keine Arbeitszeitregel, und wird hier nicht bewertet.
4. Leere Dienstzelle = Lücke, Versatz Pflicht, kein Modulo, Personenzuordnung nie über den Namen.

## Vorschau im Import (ohne Schreiben)

Umsetzung: `server/lib/import/schichtvorschau.mjs`, eingebunden in `server/funktionen/import.mjs` (Art `schichtzyklus`: `analyse`, `vorschau`). Prüfung:
`pruefungen/import-schichtmodell-vorschau-imp6.test.js` (`npm run pruefung:import-schichtmodell-vorschau`, eigener CI-Schritt). Vertrag: IMPORT-VERTRAG.md §9a.

- Modelltabelle: gewähltes Blatt oder das erste Blatt mit den Spalten Modell, Tag, Dienst; Zuordnungsblatt automatisch oder per `zuordnungBlatt`.
- Ergebnis je Modell: Länge, Zahl der Dienste und freien Tage, Zuordnung der Kürzel zu den Dienstarten des Betriebs, Konflikte mit Zeilennummern;
  für Zuordnungen nur Anzahlen, Konfliktarten und Zeilennummern.
- Datenschutz wie die Altplan-Vorschau: unbekannte Bezeichnungen nur als Index mit Zeilennummern, Abwesenheitsbezeichnungen (auch „krank (Grippe)“) nur als
  Zahl, nie zugeordnet; Modellnamen und Überschriftstexte werden nie zurückgegeben (Modelle als „Modell #n“, Spalten mit fester Rollenbezeichnung); keine
  Personalnummern oder Namen, nichts im Protokoll. Die gemeinsame Erkennung von Abwesenheitsbezeichnungen steht in `server/lib/bezeichnungen.mjs`
  (auch von der Altplan-Vorschau genutzt).
- Grenzen: je Blatt 10.000 Datenzeilen und Summe der Zykluslängen 10.000 (vorab geprüft, `PRUEFUMFANG_ZU_GROSS`; die Bibliothek allein hätte bei Tag 999999 je Modell gerechnet), 50 Modelle
  und 50 unbekannte Bezeichnungen in der Antwort. Rumpf-, Parser- und Vorgangsgrenzen unverändert; Analyse und Vorschau laufen unter der Bremse „schreiben“. Die Bibliothek ist linear in der Zeilenzahl
  (Doppelungen der Zuordnung nur als Anzahl plus höchstens 20 Zeilennummern; vorher quadratisch: 19.999 gleiche Zeilen = 52 s und 3,7 GB). Keine Zeit-/Operationsbudget-Abbruchlogik: die Zeilenobergrenzen begrenzen die synchrone Rechnung (gemessen unter 2 s).
- Übernahme: 422 `ART_NICHT_FREIGEGEBEN` mit „Schichtmodelle werden noch nicht übernommen“, Bestand unverändert (Prüfung vergleicht den Bestand). Personalimport unverändert.

## Zwischenspeicher des Ergebnisses (Analyse, dann Vorschau)

Umsetzung: `server/lib/import/schichtcache.mjs`, Aufruf über `schichtVorschauMitSpeicher` in `schichtvorschau.mjs`; Prüfung
`pruefungen/import-analyse-cache-imp6.test.js` (`npm run pruefung:import-analyse-cache`, eigener CI-Schritt). Funktion bleibt aus (`CENTRIC_IMPORT_AKTIV`, 404 vor dem Rumpf).

- Problem (Review): `vorschau` rechnete alles noch einmal, was `analyse` schon berechnet hatte (gleiche Funktion, gleiche Eingaben).
- Lösung: Das fertige Ergebnis wird je Raum und Vorgang nur im Arbeitsspeicher gehalten, Schlüssel = Raum + Vorgang-Id + Inhaltshash (SHA-256 über Modell- und
  Zuordnungstabelle, Spaltenzuordnung, Dienstarten und Personen des Betriebs). Anderes Eingabeergebnis (andere Zuordnung, geänderte Dienstarten oder Personen, andere Tabelle)
  ergibt einen anderen Hash und damit eine neue Rechnung. Das Ergebnis hängt nur von diesen Daten ab, nicht von Rolle oder Sitzung (die Rolle wird vorher im Handler geprüft).
- Grenzen: je Vorgang ein Eintrag, je Raum höchstens 20, gesamt 200 (ältester zuerst), Lebensdauer 30 Minuten (wie die Inaktivitätsfrist des Vorgangs); der Eintrag wird
  mit dem Vorgang verworfen (Verwerfen, Übernahme, Ablauf in `vorgaenge.mjs`). Nur erfolgreiche Ergebnisse; Kopie bei Ablage und Abruf.
- Datenschutz: gehalten wird nur das Ergebnis, das der Vorgang ohnehin als Antwort an dieselbe Person liefert (keine Rohzeilen, Namen oder Personalnummern); der Hash ist nicht umkehrbar. Nichts wird gespeichert oder protokolliert.
- DoS-Schutz unverändert: Zeilenobergrenze (10.000) und Zellkürzung greifen vor dem Hash und vor jeder Rechnung; die Bremse „schreiben“ läuft im Handler vor dem Speicher, ein Treffer umgeht sie nicht.
- Messung (10.000 Modellzeilen + 10.000 Zuordnungszeilen, 3 Läufe, Windows-Entwicklungsrechner): Vorschau ohne Speicher 159 bis 197 ms, aus dem Speicher 47 bis 100 ms
  (Hash und Kopie); Ablauf Analyse + Vorschau 358 bis 566 ms ohne, 246 bis 470 ms mit Speicher. Der Gewinn je Vorschau ist die ganze Rechnung abzüglich des Hashes; bei den im Review genannten ungünstigeren Eingaben (1,3 bis 2,7 s je Schritt) entfällt die zweite Rechnung ganz.
- Prüfung: einmal gerechnet nach Analyse + Vorschau (Zähler 1), geänderte Zuordnung/Dienstarten/Personen rechnen neu, anderer Raum/Vorgang trifft nie, Verwerfen/Übernahme/Ablauf leeren, Grenzen 20/200, Differenz mit/ohne Speicher gleich, Schalter aus = 404.

## Offen (Entscheidung nötig)

- Übernahme in den Bestand: Der Bestand kennt **einen** Zyklus je Betrieb (`m.zyklus` + Versatz je Einheit). Mehrere Modelle
  mit Zuordnung je Person brauchen ein Datenmodell (oder Abweichungen je Tag, begrenzt durch `RUMPF_MAX` 6 MB): Betreiberentscheidung „mehrere Modelle je Person“.
- Die arbeitszeitrechtliche Prüfung (`schichtpruefung.mjs`) ist noch nicht an den Endpunkt angeschlossen (sie braucht einen Zeitraum `von` … `bis` und rechnet bis
  etwa 1,5 s synchron); die Vorschau nennt nur Zuordnungs- und Formkonflikte.
- Oberfläche: Die Import-Ansicht kennt die Art `schichtzyklus` nicht (nur Personal); keine Anzeige der Modellvorschau, die Oberfläche bleibt aus (`IMPORT_DATEI_AKTIV`).
- Vor jedem Einschalten ist die Prüfung nach § 13 (IMP-9) nötig.

## Nachtrag 2026-11-20: Oberfläche (Pflege mehrerer Modelle je Person)

Branch `acc45/imp/imp-6-ui` (PR gegen `integration/release-v4`, nicht gemergt). Beschreibung: `IMP-6-MEHRFACHMODELLE.md`, Abschnitt
„Oberfläche“. Keine Planwirkung, kein Schalter, keine Workflow-Änderung, keine Serveränderung.

| Akzeptanz | Nachweis |
|---|---|
| Mehrere Modelle je Person anzeigen und bearbeiten | `imp6-oberflaeche` D2–D5; E2E S1–S3 |
| Unterschiedliche Zykluslängen (keine feste Länge) | `imp6-oberflaeche` A3 (1 … 1000), D2; E2E S1 (9 und 14 Tage) |
| Bestehende Validierungen (Server) in der Oberfläche | `imp6-oberflaeche` B (15 Fälle: Befund der Oberfläche = Befund der Serverkette), E2E S3/S4 |
| Verständliche Meldung bei 422 | `imp6-oberflaeche` C2/C5; E2E S4 (echter Server 422, Anzeige im Browser) |
| Inhaltliche 403 nicht als Rollenproblem | `imp6-oberflaeche` C1/C3/C4 (Erkennung gegen die echten Texte, Differenz) |
| Rechte wie der Server | `imp6-oberflaeche` D1 |
| WP-40 zugängliche Namen, nur Bausteine/Tokens | `imp6-oberflaeche` D6/D7; E2E S5 (axe, ein Befund label-content-name-mismatch an den Anhängeknöpfen behoben) |

Angepasste bestehende Prüfungen (begründet):
- `pruefungen/p212-client-kalendertag.test.js` („Differenz: die übrigen Lagen zeigen weder Bereichszeile noch Verwerfen-Knopf“):
  nimmt die neue Lage „schichtmodell“ aus; sie hat bewusst denselben Verwerfen-Weg wie „kalendertag“ (ein zweiter Versuch
  schickte denselben Stand) und ist in `imp6-oberflaeche` C5 geprüft. Für alle übrigen Lagen gilt die Prüfung unverändert.
- `pruefungen/imp6-zyklen-grenzfaelle.test.js` D2 (Wächter): `src/lib/schichtmodelle-pflege.js` in die Liste aufgenommen — bewusste
  Erweiterung ohne Planwirkung; Ansicht und Aktionen nennen die Felder nicht selbst, und `imp6-oberflaeche` E3 sichert, dass nur
  Ansicht und Aktionen die Pflegehilfe nutzen und `fachlogik.js` sie nicht kennt.

Offen: P2-24 (b) Versionierung laufender Modelle (Kategorie C, Betreiberentscheidung; gebaut gilt A, nichts gebaut) — P2-24 (a) ist am 2026-11-20 entschieden (B) und umgesetzt, siehe Nachtrag (b); P2-19 (d), P2-4 Punkte 6 bis 8.

## Nachtrag 2026-11-20 (b): P2-24 B (Schalter), stabile 403-Codes, Review-Auflagen #423

| Punkt | Umsetzung | Nachweis |
|---|---|---|
| P2-24 B Schalter `CENTRIC_SCHICHTMODELL_PFLEGE` (Vorgabe aus) | `server/lib/schalter.mjs`, `GET /api/bestand` `schichtmodellPflege`, `src/lib/schichtmodell-schalter.js`, `src/speicher.js` (lies), Ansicht | `imp6-oberflaeche` S1–S4, E0; `imp6-mehrfachmodelle` 9 (Schalter); E2E S6 |
| Kein Datenverlust bei AUS | Daten bleiben im Zustand und gehen unverändert mit | `imp6-oberflaeche` S3/S4; `imp6-mehrfachmodelle` 9 (byte-gleich, Kopie ohne Felder); E2E S6 |
| Server-Schreibweg bei AUS | bewusst unverändert, Begründung `IMP-6-MEHRFACHMODELLE.md` „Schalter“ | `imp6-mehrfachmodelle` 9 „Schreibweg unverändert“ |
| Folgepunkt 1: stabile 403-Codes | `SCHICHTMODELL_<Prüfcode>` (`schichtmodellAbsageCode`), `rechte.mjs` 1 Zeile, `daten.mjs` reicht `code` durch; Client nur am Code, ohne Code fail-safe „keinRecht“ | `imp6-mehrfachmodelle` 9 (5 Codes Voll-PUT, Teilweg, Differenz); `imp6-oberflaeche` C1, C3, C3b |
| A1 Rechte der Anzeige = feste Matrix des Servers | `darfSchichtmodelle` mit `MATRIX_STD`, Kundenzugang, nie Betriebsmatrix | `imp6-oberflaeche` D1b |
| A2 echter Server-403 → Lage „schichtmodell“ | — | E2E S4b (PUT unterwegs um Überschneidung ergänzt, echter Server antwortet 403 `SCHICHTMODELL_UEBERSCHNEIDUNG`), `imp6-mehrfachmodelle` 9 |
| H1 geleertes „Gültig ab“ | nur die beim Hinzufügen angelegte Fortsetzung gilt als begonnen | `imp6-oberflaeche` D1c |
| H3 Texte ohne Pflegerecht | Dienstart-Löschmeldung nennt den Weg nur mit Schalter und Recht; Leiste ohne Annahme über Rechte | `imp6-oberflaeche` E2 (Quelltext) |
| H4 Personenauswahl | `wirksamePerson`; Entwurf gehört genau einer Person | `imp6-oberflaeche` D1d |
| H5 Stand-Satz ENTSCHEIDUNGSLISTE | Komma/„und“ berichtigt, P2-24 entschieden | — |

### Angepasste Bestandsprüfungen: was sie weiterhin absichern

**`pruefungen/p212-client-kalendertag.test.js`, Test „Differenz: die übrigen Lagen zeigen weder Bereichszeile noch Verwerfen-Knopf“.**
Anforderung (P2-12 Folgepunkt 1, Review #354): Nur Lagen, bei denen „Noch einmal senden“ denselben abgewiesenen Stand
schickte, bieten den Verwerfen-Weg und eine Bereichszeile an; jede andere Lage (Netz, Server, Rolle, Konflikt, Sitzung …)
bleibt wie vor P2-12 — ohne Bereichszeile, ohne Verwerfen, die Textzeile genau einmal. Die Anpassung nimmt nur die neue Lage
„schichtmodell“ aus, die genau in diese Klasse gehört (422/403 auf Inhalt: derselbe Stand scheitert wieder). Für alle
übrigen Lagen gilt die Prüfung unverändert, auch für künftig hinzukommende (die Liste wird aus `SPEICHERLAGE` gebildet).
Die neue Lage selbst prüft `imp6-oberflaeche` C5 mit denselben Aussagen (Bereichszeile, Verwerfen, Sichern, kein „Noch einmal
senden“, keine Rollenmeldung). Nichts ist abgeschwächt: die ausgenommene Lage hat mehr Prüfungen als vorher (vorher gab es sie nicht).

**`pruefungen/imp6-zyklen-grenzfaelle.test.js`, Abschnitt D2 (Wächter).** Anforderung (P2-4 Punkt 6, Vorbedingungen 8 und
Differenz D): Kein Modul bringt die Zuordnungen oder Modelldefinitionen in die Planrechnung, ohne dass diese Liste bewusst
erweitert und die Differenzprüfung D (Planrechnung bit-gleich mit und ohne Zuordnungen) umgestellt wird. Aufgenommen ist
genau eine Datei, `src/lib/schichtmodelle-pflege.js` (Pflege: Entwurf mit der Serverbibliothek prüfen, Feld setzen, Lage
anzeigen); sie rechnet keinen Dienst. Weiterhin abgesichert: (1) jede andere neue Fundstelle in `server/` oder `src/` macht
D2 rot; (2) Ansicht und Aktionen nennen die Felder nicht selbst (sonst stünden sie in der Trefferliste); (3) `imp6-oberflaeche`
E3 verlangt, dass nur `src/ansichten/schichtmodelle.jsx` und `src/app/aktionen/plan.js` die Pflegehilfe nutzen und weder
`fachlogik.js` noch die Hilfe selbst `dienstAm`/`modellDienstAm` nennen; (4) Differenz D läuft unverändert bit-gleich.

## Nachtrag 2026-11-20 (c): Delta-Review #423 (Auflagen nur Doku, Hinweise)

- A-1/A-2: P2-24 geteilt nachgeführt — (a) entschieden B und umgesetzt; (b) Versionierung laufender Modelle **offen** (Kategorie C, Betreiberentscheidung; gebaut gilt A, nichts gebaut). „Folge bei Nichtentscheidung“ berichtigt (Pflege bei AUS nicht sichtbar).
- H-a: `darfSchichtmodelle` rechnet mit der Rolle der Sitzung (`sitz.zugangRolle` = `sitzung.rolle` des Servers), nur ohne Angabe mit der Rolle der Person; Gleichlauf je Zugangsrolle mit `rechte.mjs` `darf` (`imp6-oberflaeche` D1b).
- H-b: `anzuwendendesModell` steht in der Oberfläche nur in `lageAm` (eine Stelle), `lageAm` nur in der Ansicht und nur mit `.text`/`.ton` (reine Anzeige); kein anderes `src/`-Modul nennt `anzuwendendesModell`/`modellDienstAm` (`imp6-oberflaeche` E3).
- H-c: Teilweg bei Schalter AUS mit anderer Änderung: Modelle und Zuordnungen byte-gleich (`imp6-mehrfachmodelle` 9).
- H-e: Betriebshandbuch, Schaltertabelle: Hinweis vor dem Pilot — bei AUS ist „Dienstart löschen“ an einem gespeicherten Modell in der Oberfläche nicht auflösbar.
- Branch auf den aktuellen Stand von `origin/integration/release-v4` zusammengeführt.

## Nachtrag 2026-11-20 (d): CI-Befund #423 — L2 der lokalen Abnahme über 90 s (Ursache in der Testhilfe)

- **Befund:** CI-Läufe 44709493893 und 44709485577 (Kopf 0dbadf3d): `e2e/lokale-abnahme-luecken.spec.mjs` L2 bei 1024x768 nach 90 s abgebrochen (`seiteZu`, `page.goto`); L1 dauerte 47 s, im Basislauf 44706934201 (6b3933c8) 2 s. Im Basislauf zeigen L4c/L4d/L5 dasselbe Muster (63/49/47 s).
- **Ursache (belegt):** `e2e/hilfen.mjs` bildete die Herkunft je Test mit `(h >> 8) % 240` — mit Vorzeichen; für rund die Hälfte der Tests entstand eine ungültige Adresse (z. B. `10.33.-164.113`). `herkunftBestimmen` verwirft eine ungültige Kette und zählt die Gegenstelle `127.0.0.1`: Alle diese Tests teilten EINEN Bremszähler. Die Demo-Bremse auf `GET /api/demos` (Anmeldeseite, 20 je 5 Minuten) lief voll; die Anmeldeseite bekam 429.
  Lokaler Beleg (Probe mit Chromium gegen den laufenden E2E-Server nach rund 45 Tests): ohne eigene Herkunft `GET /api/demos` → 429, Antwort nach 285 ms, aber kein `requestfinished` → `networkidle` erst nach der Zeitgrenze (20 s); mit gültiger eigener Herkunft 200, `networkidle` nach 0,6 s. Im lokalen Volllauf 1024x768 vor der Korrektur: Z4 1,1 min, S0 33,7 s, S1 52,1 s, S3 49 s, S5 1,1 min (einzeln je 2 bis 10 s).
- **Warum mit #423:** Die neue Spec `imp6-schichtmodelle` läuft unmittelbar vor `lokale-abnahme-luecken` und lädt die Anmeldeseite neunmal; das verschob die Erschöpfung des gemeinsamen Zählers in L0 bis L2. Kein Produktcode von #423 ist beteiligt.
- **Behebung:** `e2e/herkunft.mjs` (`herkunftFuerTest`, vorzeichenlos `>>>`), von `e2e/hilfen.mjs` genutzt. Jeder Test hat wieder eine gültige, eigene Herkunft. Keine Prüfung abgeschwächt, keine Zeitgrenze erhöht. Prüfung: `pruefungen/e2e-flaechen.test.js` (2000 Kennungen × 2 Wiederholungen gültig und vom Server als eigene Herkunft gelesen; Gegenprobe: die alte Formel ergibt über 1000 ungültige Adressen und fällt auf 127.0.0.1 zurück).
- **Nach der Korrektur, lokaler Volllauf 1024x768 (14,0 min, 58 bestanden, 7 übersprungen):** Z4 5,1 s, S0 3,6 s; lokale Abnahme L0 8,0 s, L1 4,4 s, L2 10,2 s, L3 12,3 s, L4a–L4d 4,1–6,6 s (vorher im Basislauf 63/49 s), L5 5,9 s, L6 5,6 s. Rot nur `oeffnen-parallel` (P2 Schichtverantwortung: Plan nach 90 s nicht geöffnet) — die Spec nutzt eigene Browserkontexte mit eigener Herkunft (10.48.200.x), nicht die geänderte Testhilfe; einzeln wiederholt grün (1 bestanden, 1,5 min). Lastbedingt auf dem Entwicklungsrechner (sechs Sitzungen gleichzeitig), in beiden CI-Läufen von #423 grün.
- **Offen (nicht Teil dieses Pakets):** Warum Chromium eine 429 von `/api/demos` nicht als beendet meldet, ist nicht untersucht; Folge war nur das Warten der Testhilfe.

## Nachtrag 2026-11-20 (e): CI-Befund #423 nach der Herkunftskorrektur — Planer-Tests 429 (Lastbremse je Code)

- **Befund:** CI-Läufe 44720136042 und 44720127143 (Kopf 5b39bb26): 12 rot, alle mit der Rolle Planung — `plan-planer`, `teilkonflikt`, `lagebild-planer`, `antraege-planer/tauschboerse-planer` (Anmeldung im Browser kommt nicht zustande, `waitForSelector` 30 s) und `heute-stempeluhr(-ausstempeln)` (`API-Anmeldung planer gescheitert (Status 429)` nach rund 110 ms).
- **Ursache (belegt):** Lastbremse `anmelden-code` des Servers (`server/lib/schutz.mjs`: 20 gelungene Anmeldungen je Code in 300 s, Sperre 300 s; `daten.mjs` vor dem Lesen des Bestands). Die Suite meldet die Planung je Viewport rund siebenmal mit demselben Code an. Nach der Herkunftskorrektur (Nachtrag d) fielen die 15-s-Wartezeiten weg, die Viewports 360x740, 390x844 und 430x932 liefen in 3 min 23 s (10:33:24–10:36:47) — der 21. Planer-Login (430x932 `plan-planer`, 10:36:47) bekam 429. Rot sind genau die Planer-Tests von 10:36:47 bis 10:41:40; ab 10:42:33 (gut 300 s nach der ersten Absage) sind sie wieder grün, alle übrigen Rollen durchgehend. Der Code der Planung ist der einzige, der so oft genutzt wird. Kein Produktcode von #423 ist beteiligt.
- **Behebung (nur Testaufbau, Serverregel unverändert):** `global-setup.mjs` legt je Rolle drei weitere Codes für dieselbe Person an (`ZUGANG_POOL = 4`, eigener Aufruf wegen höchstens 20 Einträgen je Aufruf); Browser- (`hilfen.mjs zugangscode`) und API-Anmeldung (Abnahme B) wählen je Test stabil einen Code (`herkunft.mjs codeSchluessel`) — wie mehrere Geräte einer Person. Prüfung in `pruefungen/e2e-flaechen.test.js` (stabil, nur Pool-Schlüssel, gleichmäßig verteilt, Rückfall auf den Rollenzugang; Verdrahtung in Testhilfe, Abnahme B und Aufbau).
- **Branch** mit `origin/integration/release-v4` (#424 Vitest 5, #425 V4-2) zusammengeführt, ohne Konflikte.
- **Lokal (nach Merge):** Planer-Specs (barrierefreiheit, teilkonflikt, abnahme-b-ablaeufe, barrierefreiheit-flaechen) sowie lokale-abnahme-luecken und imp6-schichtmodelle bei 430x932 und 1024x768: 51 bestanden, 29 übersprungen (Projektbindung), 0 rot, 14,5 min. Grenze dieses Belegs: Der Entwicklungsrechner ist langsamer als CI und erreicht 20 Planer-Anmeldungen in 5 Minuten ohnehin kaum; maßgeblich für die Lastbremse ist der nächste CI-Lauf. e2e-flaechen, prozess-wachen, imp6-oberflaeche 76/76; doku 5/5, verdrahtung 8/8, ci-abdeckung 8/8; eslint ohne Fehler.

## Nachtrag 2026-11-20 (f): Planwirkung PR 1 — Rechenkern (Branch `acc45/imp/imp-6-planwirkung`)

- **Umfang:** Rechenkern der Planwirkung (P2-4 Punkt 6) hinter `CENTRIC_SCHICHTMODELL_WIRKUNG` (Vorgabe aus; in PR 1 mit
  keinem Weg verbunden). Aufteilung wegen Umfang > 5 PT: PR 2 = Verdrahtung (Server-Einstieg, Oberfläche, Auslöser der
  Schutzrechnung, Anzeige/Lagebild/Export, Sicht der Beschäftigten). Beschreibung: `IMP-6-MEHRFACHMODELLE.md`, „Planwirkung“.
- **Code:** `server/lib/schichtmodell-kern.mjs` (neu, Kern ohne Importe, aus `schichtzuordnung.mjs` ausgelagert und dort
  re-exportiert — Schnittstelle unverändert); `server/lib/fachpruefung.mjs` (`planDienst`, `schichtmodellLageAm`,
  `teilzeitModell`, `schichtmodellKlaerungen`, Merker `schichtmodellWirkungSetzen/Aktiv`); Aufrufe in `engine/plan.mjs`
  (`personTag`), `fachpruefung.mjs` (`dienstAm`), `isteinfrieren.mjs` (`planTag`, Postenbesetzung), `schutzdurchsetzung.mjs`
  (Planrechner `am`), `engine/einsatz.mjs` (Ersatzvorschlag); `schichtzuordnung.mjs` `wirkungsVorpruefung`; `schalter.mjs`
  `schichtmodellWirkungAn`.
- **Prüfung:** `pruefungen/imp6-planwirkung.test.js` (in `pruefung:imp6-mehrfachmodelle`): K Tabelle (8 Längen × 6 Wechseltage
  × 3 Versatzpaare, drei Rechnungen = Referenz), L Lücke/Überschneidung/ungültig/Springer, N Nacht über Mitternacht am
  Wechseltag (Fachprüfung und Server-Schutzrechnung, Zeitumstellung 9 h/7 h), T Teilzeit, M Besetzung und Posten, D3 Differenz
  (AUS byte-gleich mit Modellen/Lücken/Überschneidungen; AN ohne eigene Modelle byte-gleich; Gegenprobe), A abgeschlossene
  Monate, V Vorprüfung, R Rollen, F 8 000 Zufallsfälle gegen die Referenz, S Schalter und Wächter, Q7 Selbstauskunft.
- **Geänderter bestehender Test (begründet):** `imp6-zyklen-grenzfaelle` D2 — ERLAUBT um `schichtmodell-kern.mjs` und
  `fachpruefung.mjs` erweitert (Kern ausgelagert; `fachpruefung.mjs` ist die eine Stelle der Planrechnung, die ihn liest),
  Suchausdruck zusätzlich um Importe des Kerns verschärft. Differenz D selbst unverändert.
- **Entscheidungsvorlagen:** P2-25 (Frage 7), P2-26 (Frage 8), P2-27 (Stichtag beim Einschalten), P2-28 (Teilzeit/Urlaubskonto).
- **Rot vorher:** Commit `2111ed66` (nur Prüfungen) gegen den Code der Basis: 17 von 17 ausgewählten Fällen (L, T, M, V, S, Q7)
  rot (`schichtmodellWirkungSetzen is not a function` u. a.).
- **Grün lokal (einzeln, `--maxWorkers=1`):** imp6-planwirkung 81/81 (710 s auf dem Entwicklungsrechner, D3 und A sind die
  langen Teile); imp6-mehrfachmodelle 119, imp6-zyklen-grenzfaelle 57, imp6-eigenes-modell 22, imp6-oberflaeche 51,
  fachpruefung-server 63, p212-kalendertag 59, p212-client-kalendertag 12, prozess-wachen 15, doku 5, verdrahtung 8,
  ci-abdeckung 8, acc45-status 17, endgeraete-speicher 6, wp39-app-aufbau 4; eslint ohne Befund; tsc ohne Befund;
  `acc45-backlog pruefen` OK; `vorpruefung --paket IMP-6` ohne harte Verstöße.

## Nachtrag 2026-11-20 (g): Review #429 (Opus, mit Auflagen) — nur Tests und Doku

- **A1 (Test M, Posten):** Der Test behauptete „a1 vorn“, der Startindex `between(anker, 2027-11-03) % 2 = 1` setzte aber a2 vorn —
  die Mutation M8 (Posten bei AN ohne `r !== posten.quelle`) überlebte. Jetzt Tag 2027-11-04 (gerader Abstand, im Test
  ausgerechnet): a1 mit Nachtmodell steht wirklich vorn; zusätzlich `postenBesatzung` = `["a2"]`. **M8 jetzt rot** (lokal,
  Mutation von Hand gesetzt und zurückgenommen).
- **A2 (Springer):** neuer Fall in T „Springer mit Einheit“ — AUS und AN, ohne und mit eigener Zuordnung, drei Rechnungen und
  `planDienst` = null, Gegenprobe ohne `springer` mit Diensten. **M5a (AUS-Zweig von `planDienst` ohne `!p.springer`) jetzt rot.**
- **A3 (offen für REL-1/PR 2):** `RELEASE-UNFERTIG.json` kommt mit #427 (nicht gemergt). Dort ist
  `CENTRIC_SCHICHTMODELL_WIRKUNG` als unfertig (Vorgabe aus) einzutragen — sobald #427 gemergt ist, spätestens mit PR 2.
- **Laufzeit in CI (geprüft, Lauf 44741581647, Job `pruefen`):** `imp6-planwirkung` 81 Tests in 21,0 s; der ganze Schritt
  „Mehrere Schichtmodelle je Person (IMP-6 Teil 2)“ 22 s. Die Jobdauer 35:35 min kommt nicht aus diesem Schritt (längste
  Schritte: BE-2 A1 213 s, Teilspeicherung 149 s, Gate-Proben 116/103 s). Die lokale Dauer (12 min) liegt am belasteten
  Entwicklungsrechner. Keine Workflow-Änderung.
- **Notizen für PR 2 (Hinweise des Reviews):**
  1. Wächter S zur Gesamtsuche `einheitDienst(` in `server/` und `src/` mit Positivliste ausbauen — in `src/` heute noch ohne
     Wirkung: `fachlogik.js` (`urlaubskonto`, Vergleich mit dem Freigabestand), `app/aktionen/plan.js:51`,
     `app/aktionen/begleitung.js:85`, `lib/aushang.js`, `ansichten/monatsplan.jsx`, `ansichten/lagebild.jsx`.
  2. `modellVerzeichnis` wird je Person und Tag bis zu dreimal neu gebaut → Zwischenspeicher je Bestand (nur bei AN).
  3. Ersatzvorschlag: bei Lücke oder „uneindeutig“ gilt heute „in der Dienstphase +8“ — bewusst entscheiden.
  4. Release-Gate-Warnung, wenn `CENTRIC_SCHICHTMODELL_WIRKUNG` gesetzt, aber nicht genau `true` ist (REL-1).

## Nachtrag 2026-11-20 (h): Planwirkung PR 2 — Verdrahtung (Branch `acc45/imp6/teil2-verdrahtung`)

- **Umfang:** Schalter `CENTRIC_SCHICHTMODELL_WIRKUNG` verbunden; **Vorgabe AUS, nicht aktiviert** (weder Standard noch CI).
  Beschreibung: `IMP-6-MEHRFACHMODELLE.md`, „Planwirkung — PR 2“. Server-Einstieg `server/lib/schichtmodell-wirkung.mjs`
  (in `server.mjs` und `daten.mjs`), `GET /api/bestand` `schichtmodellWirkung` nur an Planung/Leitung/Kundenrolle, Merker in
  `src/speicher.js`; Auslöser der Schutzrechnung (`schichtmodellPlanfelder`); `schichtfolgeAm` in `setzeAbweichung`,
  `mehrfachDienst`, `urlaubskonto`, `planVergleich`, Ersatzvorschlag; Hinweis je Einheit in Aushang, Monatsplan, Lagebild
  (`abweichendVomBetriebsmodell`, `schichtmodellHinweis`); Zwischenspeicher `modellVerzeichnisGemerkt`.
- **Review #429 Hinweise:** 1 Wächter S als Gesamtsuche `einheitDienst(` mit Positivliste (umgesetzt); 2 Zwischenspeicher
  (umgesetzt, nur bei Änderung neu); 3 Ersatzvorschlag bei Lücke/Klärung neutral (umgesetzt, Kategorie B); 4 Release-Gate-Warnung
  (REL-1, nicht Teil dieses PR).
- **Prüfung:** neu `pruefungen/imp6-verdrahtung.test.js` (32 Fälle: W, C, F, A, U/P, E, S, H, K; in `pruefung:imp6-mehrfachmodelle`),
  `imp6-mehrfachmodelle` 10 (GET-Angabe je Rolle, Schalter-Werte, Server-Quelle), `imp6-planwirkung` S bewusst umgestellt
  (PR 1: „kein Weg setzt die Quelle“ → PR 2: genau drei Stellen plus die Meldung in `daten.mjs`; Gesamtsuche statt fester
  fünf Dateien). D3 (AUS byte-gleich, AN ohne eigene Modelle byte-gleich) unverändert.
- **Rot vorher:** Commit `bcc51209` (nur Prüfungen) gegen den Code von #429: `imp6-verdrahtung` 22 von 32 rot
  (`schichtfolgeAm`/`abweichendVomBetriebsmodell`/`modellVerzeichnisGemerkt is not a function`, Auslöser `false`, kein Hinweis).
- **Grün lokal (einzeln, `--maxWorkers=1`):** imp6-verdrahtung 32/32; imp6-planwirkung 82/82 (186 s); imp6-mehrfachmodelle 121/121;
  imp6-zyklen-grenzfaelle + imp6-eigenes-modell + imp6-oberflaeche 130/130; document-write-review, engine-einsatz,
  schutzregeln-ersatzsuche, oberflaeche-render, wcag-wp40, v4-inventar, istdaten 176/176; geraete-wp21, fachpruefung-server,
  p212-kalendertag, p212-client-kalendertag, wp39-app-aufbau, endgeraete-speicher 164/164; prozess-wachen 15/15; doku,
  verdrahtung, ci-abdeckung, acc45-status 38/38; tsc ohne Befund; eslint ohne Fehler; `acc45-backlog pruefen` OK.
- **Offen (Vorbedingung vor dem Einschalten):** Sicht der Beschäftigten/Schichtverantwortung/Betriebsrat auf fremde Pläne
  (vom Server gerechneter Dienst); P2-26, P2-27 (und P2-24 (b), P2-25, P2-28) beim Betreiber; `RELEASE-UNFERTIG.json`-Eintrag
  nach dem Merge von #427.

## Nachtrag 2026-11-20 (i): Nachträge aus dem Opus-Review zu #431 (Branch `acc45/imp6/nachtraege-431`)

- **Schalter:** `CENTRIC_SCHICHTMODELL_WIRKUNG` bleibt AUS; nichts aktiviert. Keine Entscheidung zu P2-24 (b), P2-25 bis P2-28.
- **Befund 1, Schreibweg der Teilrollen:** in `IMP-6-MEHRFACHMODELLE.md` („Bewusst nicht gebaut“ 1 und „Vorbedingungen vor AN“)
  aufgenommen. Szenario: Die Schichtverantwortung setzt bei einer Person mit eigenem Modell den Dienst der Betriebsfolge; ihr
  Client (ohne Merker, `daten.mjs` ~Z. 1419) hält ihn für den Plan und löscht die Abweichung (`plan.js` ~Z. 52); der Server
  rechnet nach dem Modell — still gilt der Modelldienst. Datenintegrität beim Schreiben, nicht nur Anzeige. Vorbedingung vor AN:
  vom Server gerechneter Dienst für die Teilrollen mit Sicht und Schreibweg.
- **Befund 3, Mutant M3 (Zwischenspeicher):** neu `imp6-verdrahtung` K4. Folge an Ort und Stelle leer (`tage = []`,
  `tage.length = 0`) oder ungültig (keine Liste) → neu rechnen, Modell unbekannt, nie ein NaN-Dienst; danach wieder gefüllt →
  richtiger Dienst. K2 allein tötete M3 nicht (die Karte zeigt auf den Eintrag selbst, nur die geleerte Folge fällt auf).
  **Rot gegen die Mutation** (in `abbildGleich` den Vergleich von Folge und Länge entfernt, `server/lib/schichtmodell-kern.mjs`
  Z. 56): K4 rot mit `Number.isNaN(index)` = true für eine Zuordnung ohne Versatz (mit Versatz 0: `grund: "versatz"` statt
  „modell-unbekannt“); K1–K3 grün. Ohne Mutation 33/33 grün. Der Kern selbst hat keine Lücke; Code unverändert.
- **Befunde 4 und 5:** als Punkte 4 und 5 auf die Liste „Vorbedingungen vor AN“ (`IMP-6-MEHRFACHMODELLE.md`):
  `teilzeitProfil` (`src/lib/fachlogik.js` ~Z. 1743, aus `m.zyklus` ohne `einheitDienst(`, vom Wächter S nicht erfasst; zu P2-28);
  `src/speicher.js` ~Z. 381 übernimmt den Merker auch aus der gemerkten Antwort (Offline-Client rechnet nach dem Abschalten
  weiter mit den Modellen bis zum nächsten Online-Lesen).
- **Befund 2:** `ENTSCHEIDUNGSLISTE.md` P2-28 und Nachtrag korrigiert (Urlaubskonto nach Modell: gebaut als Vorschlag hinter AN,
  Entscheidung P2-28 offen, Kategorie C).

## Nachtrag 2026-11-20 (j): Teilrollen — vom Server gerechneter Dienst (Branch `acc45/imp6/teilrollen-serverdienst`)

- **Umfang:** Vorbedingung 1 vor AN (Sicht und Schreibweg der Teilrollen). Beschreibung: `IMP-6-MEHRFACHMODELLE.md`, „Teilrollen:
  vom Server gerechneter Dienst“. Schalter `CENTRIC_SCHICHTMODELL_WIRKUNG` bleibt AUS (nirgends gesetzt, auch nicht CI); keine
  Entscheidung zu P2-24 (b), P2-25 bis P2-28. Offline-Merker (Punkt 5) und `teilzeitProfil` (Punkt 4) nicht in diesem Stand.
- **Code:** neu `server/lib/schichtfolge-teilrollen.mjs` (`vollsichtSchichtmodelle`, `schichtfolgeFuerSicht`,
  `abweichungenTeilrollen`); `server/funktionen/daten.mjs` (GET-Angabe `schichtfolgeServer`, Schreibentscheidung vor
  `zusammenfuehren` für Voll-PUT und Teilweg; Rollenregel der Angabe `schichtmodellWirkung` jetzt über `vollsichtSchichtmodelle`,
  gleiche Bedeutung); `server/lib/fachpruefung.mjs` (`schichtfolgeServerSetzen/Aktiv`, `schichtfolgeOffen`,
  `folgtNurBetriebsmodell`; AUS-Zweig von `planDienst`/`schichtfolgeAm` liest den Dienst des Servers nur, wenn gesetzt;
  `abweichendVomBetriebsmodell` zählt ihn); `src/speicher.js` (Übernahme aus der Antwort, Kopf `x-centric-schichtfolge` an PUT
  und Teilweg); `src/app/aktionen/plan.js`, `begleitung.js` (offene Tage: ausdrücklich speichern).
- **Prüfung:** neu `pruefungen/imp6-teilrollen.test.js` (in `pruefung:imp6-mehrfachmodelle`): G Sicht je Rolle (Fenster, Werte,
  Teilzeit, Datenschutz ohne Modellname/Zuordnungskennungen, Umfang, AUS ohne Angabe und sonst gleiche Antwort), W Schreibweg
  (ohne/mit Kennzeichen, Modelldienst entfällt, gleiche Folge, volle Rollen, AUS, Teilweg), C Client, L Bibliothek, S Wächter.
  Wächter `imp6-planwirkung` S: Positivliste um `server/lib/schichtfolge-teilrollen.mjs` (1) erweitert.
- **Rot vorher:** Commit `bf38a890` (nur Prüfungen) gegen den Code der Basis `d5cb1317`: 14 von 22 rot, darunter W1 (gelöschte
  Abweichung der Schichtverantwortung gilt still als Modelldienst „F“ statt „-“).
- **Mutationsnachweis** (je Mutante von Hand gesetzt, `imp6-teilrollen` einzeln gelaufen, zurückgenommen; Modul-Zwischenspeicher
  von Vitest `node_modules/.vitest-cache` vor jedem Lauf geleert): 12 von 12 rot. Ohne Mutation vorher und nachher 25/25 grün.

  | Mutante | Stelle | rot |
  |---|---|---|
  | R1 Rollenfilter Schreibweg (volle Rollen mit entschieden) | `abweichungenTeilrollen` | L2 |
  | R2 Rollenfilter GET (Angabe an volle statt Teilrollen) | `daten.mjs` | G1, G3, S3 |
  | V1 Schreibvergleich gegen Betriebsfolge statt Modelldienst | `abweichungenTeilrollen` | W3, L2 |
  | V2 Löschung ohne Kennzeichen bleibt (alter Fehler) | `abweichungenTeilrollen` | W1, W7, L2 |
  | V3 Kennzeichen ignoriert | `abweichungenTeilrollen` | W2, W7, L2 |
  | S1 Schalterprüfung Schreibweg (Bibliothek) | `abweichungenTeilrollen` | L2 |
  | S2 Schalterprüfung Sicht (Bibliothek) | `schichtfolgeFuerSicht` | L3 |
  | S3 Schalterprüfung GET (`daten.mjs`) | `daten.mjs` | S3 |
  | S4 Schalterprüfung Schreibweg (`daten.mjs`) | `daten.mjs` | S3 |
  | P1 Personen außerhalb der Sicht | `schichtfolgeFuerSicht` | L3 |
  | C1 offener Tag wird gelöscht | `plan.js` | C5 |
  | C2 außerhalb des Fensters Betriebsmodell | `fachpruefung.mjs` | C2 |

  Befund des ersten Laufs: R1, S1–S4 und P1 überlebten — Schalter und Rolle prüfen `daten.mjs` UND die Bibliothek (zwei Stufen,
  fail-closed), alle Personen standen in jeder Sicht. Daraufhin L (Bibliothek allein) und S3 (beide Stufen in `daten.mjs` im
  Quelltext) ergänzt. Hinweis: Nach dem Zurücknehmen einer Mutante war L3 zweimal ohne Mutation rot (Verhalten wie Mutante P1),
  danach grün, ohne Codeänderung. Vermutete Ursache (nicht belegt): eine alte Fassung aus `fsModuleCache`. Deshalb wird der
  Zwischenspeicher bei Mutationsläufen geleert; der gültige Lauf oben ist ohne Zwischenspeicher.
