# WP-29 Geo-Spezifikationsreste: Nachweis

Branch `acc45/time/wp29-geo-spezifikationsreste`, Basis `origin/integration/centric-complete` (741c844, mit WP-20).
Quelle der Spezifikation: `docs/GEO-ZEITERFASSUNG-SPEZIFIKATION.md` (nur in der Git-Geschichte, Commit c335ad5 „E1–E10 verbindlich“;
auf dem Integrationsstand nicht mehr als Datei vorhanden). Abschnitte B1 bis B17 und die Entscheidungen E1 bis E10.

## Ist-Abgleich Spezifikation und Code

Akzeptanz laut Backlog: Felder, Begründungscodes, Warnung über 100 m, Texte B13, Spoofing-Hinweis.

| Spezifikation | Stand auf dem Integrationsstand | Befund |
| --- | --- | --- |
| B1/B4 Drei Zustände, Grund je NICHT_BEWERTBAR | vorhanden (`geo.mjs`) | ok |
| B1 Codes `pruefung_aus`, `keine_koordinate_am_referenzort`, `ungueltige_koordinate`, `ungueltige_genauigkeit`, `genauigkeit_zu_schlecht`, `radius_ungueltig` | vorhanden | ok |
| B1 Codes `keine_freigabe`, `timeout`, `nicht_verfuegbar` (vom Gerät) | fehlten: jedes Ausbleiben der Position wurde `keine_position` | **G1** |
| B1/B10 Code `einsatzort_ungueltig` (Einsatzort inaktiv, kein Rückfall) | fehlte; kein Feld `aktiv` | **G2** |
| B1 Codes `kein_standort`, `keine_feste_pruefung`, `einsatzort_ungueltig` für gelöscht/ohne Koordinate | WP-20 benennt sie `kein_referenzort`, `aussendienst`, `kein_referenzort`/`keine_koordinate_am_referenzort` | bewusst **nicht umbenannt** (WP-20-Tests und gespeicherte Daten), im Nachweis zugeordnet; siehe „Offen“ |
| B2 `koordinatenQuelle`, `koordinatenGeprueftAm` (Standort), Adresse | Adresse vorhanden; Quelle und Prüfdatum fehlten | **G3** |
| B9 Einsatzort: `art`, `aktiv`, `koordinatenQuelle/-GeprueftAm`, Vorgabe-Umkreis 100 m | fehlten; Vorgabe war 200 m | **G3**, **G4** |
| B3 „Aktuelle Position übernehmen“, Warnung bei Genauigkeit über 100 m | Knopf da, Warnung fehlte (Meldung nannte nur die Genauigkeit); Quelle/Bestätigung fehlten | **G5** |
| B4 Warnung `genauigkeitWarnung` am Ereignis, Status unverändert | vorhanden (Server und Anzeige: orange Genauigkeit) | ok; Tooltip ergänzt (G6) |
| B11 „? nicht bewertbar (mit Grund als Text)“ | Befund zeigte nur „Standort nicht bewertbar“ | **G6** |
| B13 Texte: „gespeichert werden Status, gerundete Entfernung, Genauigkeit und Prüfort“ statt „nur, ob du am Einsatzort warst“ | Tour/Handbuch/Schalter nannten drei der vier, an sieben Stellen stand noch der alte Satz | **G7** |
| B14 Spoofing-Hinweis (Standortangabe ist Hinweis, kein Beweis; Auffälligkeit = Gespräch) | in keiner Oberfläche, keinem Handbuch | **G8** |
| B4 Positionsabfrage `enableHighAccuracy`, 10 s, `maximumAge` 0 | vorhanden (`POSITION_OPTIONEN`) | ok |
| B13/E4 Rundung der Entfernung | vorhanden; die Schreibweise `„>5 km“` (mit Leerzeichen) weicht von `„>5km“` der Spezifikation ab | nicht geändert (Test `geo.test.js` pinnt sie) |
| B13 keine Rohkoordinate, keine exakte Distanz | vorhanden, Tests `geo.test.js`, `geo-einsatzorte-handler.test.js`, Gate-Probe `staging-geo.mjs` | ok; durch WP-29 nicht berührt (Handler-Test ergänzt) |
| B3a Betriebsschalter | vorhanden | ok |
| B5–B8 Zustandsmaschine, Zeitmodell, Offline | andere Pakete (WP-06, WP-07, WP-17) | nicht Teil von WP-29 |
| B9 Geo-Modus an der Einteilung (`einsatzortAm`), `geoModus` an der Dienstart | WP-20 löst es über `ortModus` an der Dienstart; eine Einteilung je Tag hat keinen eigenen Modus | nicht Teil von WP-29 (Entwurfsentscheidung WP-20) |
| B15/B18 Karte, Geocoding, QR/NFC | P3 der Spezifikation | nicht Teil von WP-29 |

## Lücken: Test rot, Fix grün

Rot: Commit 26a65b8, Tests auf dem Stand von WP-20 (Basis 741c844): **25 von 30 neuen Tests rot**, die fünf grünen sind
Regressionswächter (Rohkoordinate, Standort-Vorgabe 200 m, Stempel am Einsatzort ohne Koordinate in der Antwort, Rechte).
Grün: Commit 89a4aee.

| Nr | Lücke | Fix |
| --- | --- | --- |
| G1 | Grund der fehlenden Position (B1/B4) | `positionHolen` liefert `fertig(null, grund)` mit `keine_freigabe` (Code 1), `timeout` (3), `nicht_verfuegbar` (2, sonst, keine Schnittstelle); Grund liegt als Code im Puffer (`stempelpuffer.js`) und im Rumpf (`positionGrund`, nur ohne Koordinate); der Server nimmt ihn nur aus der Liste `POSITION_GRUENDE`, sonst `keine_position`; ein Freitext wird nie gespeichert |
| G2 | `einsatzort_ungueltig` | `geoUrteil`: ein Einsatzort mit `aktiv: false` gibt NICHT_BEWERTBAR / `einsatzort_ungueltig`, in `pflicht` mit Markierung `ORT_PRUEFEN`, nie ein Rückfall auf den Standort |
| G3 | Felder | `koordinatenQuelle` (`adresse`, `geraet`, `karte`, `manuell`), `koordinatenGeprueftAm` (JJJJ-MM-TT), Einsatzort `art`, `aktiv` werden beim Schreiben geprüft (`standorteFehler`, 422 mit Klartext; Altbestand blockiert nicht); Standortkarte und Einsatzorte zeigen Quelle und Bestätigung, „Koordinate bestätigen“ setzt das Datum; von Hand geänderte Koordinate setzt `manuell` und nimmt die Bestätigung zurück |
| G4 | Vorgabe-Umkreis Einsatzort 100 m | `EINSATZORT_RADIUS_VORGABE`; neue Einsatzorte legt die Oberfläche mit 100 m an |
| G5 | Warnung über 100 m beim Übernehmen | `positionsUebernahme`: über 100 m Warnung im Meldungstext, Quelle `geraet`, noch nicht bestätigt |
| G6 | Grund als Klartext | `geoAnzeige().grundText`, Tooltip der Stempelbefunde: Status, Grund, „Genauigkeit schlechter als 100 m“ |
| G7 | Texte B13 | `GEO_DATENSCHUTZ_TEXT` (Ergebnis, grob gerundete Entfernung, Messgenauigkeit, Prüfort — keine Koordinate, kein Verlauf) an allen Stellen; die alten Sätze in `App.jsx`, `pruefung.jsx` (Selbsttest-Daten), Handbuch, Tour sind ersetzt |
| G8 | Spoofing-Hinweis B14 | `GEO_SPOOFING_TEXT` im Schalter (Leitung), in den Stempelbefunden und im Handbuch der Leitung |

Neue Dateien: `pruefungen/geo-spezifikation.test.js` (Unit und Oberfläche, 24), `pruefungen/geo-spezifikation-handler.test.js`
(Handler, 6). Beide in `npm run pruefung:geo` (eine Zeile in `package.json`, Konfliktzone „scripts“: bei der Integration prüfen).

## Mutanten

Je Mutant eine Änderung am Quelltext, Testlauf der beiden neuen Dateien, Rücknahme. Alle 15 werden gefangen. Zwei Mutanten
überlebten die erste Fassung der Tests und führten zur Verschärfung (M10, M11: Prüfung des Ereignisses selbst und eines von außen
eingeschleusten Werts); ein weiterer war äquivalent (toter Zweig) und wurde durch M15 ersetzt.

| Mutant | Befund | Ergebnis (rot / alle) |
| --- | --- | --- |
| M1 `einsatzort_ungueltig`-Zeile entfernt | G2 | 3 / 30 |
| M2 Vorgabe-Umkreis Einsatzort wieder 200 m | G4 | 1 / 24 |
| M3 Gerätegrund ohne Liste (jeder Text) | G1, Datenschutz | 2 / 30 |
| M4 Fehlercode 3 auf `keine_freigabe` | G1 | 1 / 24 |
| M5 Warnung schon ab 100 m statt über 100 m | G5 | 1 / 24 |
| M6 Prüfdatum nicht geprüft | G3 | 2 / 30 |
| M7 Quelle nicht geprüft | G3 | 4 / 30 |
| M8 Spoofing-Hinweis fehlt im Schalter | G8 | 1 / 24 |
| M9 Spoofing-Hinweis fehlt in den Stempelbefunden | G8 | 1 / 24 |
| M10 Grund auch neben einer Koordinate im Puffer | G1, Datenschutz | 1 / 24 |
| M11 `rumpfFuer` ohne Liste und ohne Koordinatenprüfung | G1, Datenschutz | 1 / 24 |
| M12 Datenschutztext ohne Prüfort | G7 | 1 / 24 |
| M13 fehlende Schnittstelle ohne Grund | G1 | 1 / 24 |
| M14 manuelle Änderung lässt die Bestätigung stehen | G3 | 1 / 24 |
| M15 Server nimmt den Gerätegrund auch mit Position | G1 | 2 / 30 |

## Datenschutz H8+

- Keine Rohkoordinate in Antwort oder Ablage: neue Pfade übertragen nur den Code `positionGrund`. Er steht nie neben einer
  Koordinate (Puffer, Rumpf) und wird auf dem Server gegen die Liste geprüft; Handler-Test: gesendete Marken-Koordinate
  taucht in Antwort und Ablage nicht auf, auch nicht mit `positionGrund`.
- Sicht: Die neuen Standortfelder (`koordinatenQuelle`, `koordinatenGeprueftAm`) liegen im Positivkatalog `sicht.mjs`
  (`standorte` nimmt nur `id`, `name`, `land`, `bundesland`), die Einsatzorte sind `WEG` für Beschäftigte, Betriebsrat und
  Schichtverantwortung. Test: `geo-spezifikation.test.js` „Rollen ohne Planung und Leitung sehen die neuen Standortfelder nicht“.
  Eine neue Matrixzeile entsteht nicht, daher keine neue Sondenpflicht; die vorhandenen Sonden (`rechtematrix-zeilen`) bleiben grün.
- Der Pflichtmodus lehnt nie ab (E3): `einsatzort_ungueltig` und die neuen Gerätegründe geben `NICHT_BEWERTBAR`, in `pflicht` die
  Markierung `ORT_PRUEFEN`; der Stempel wird immer gespeichert (Handler-Test).
- Fremde Ortsurteile sehen weiterhin nur Leitung und Planung; unverändert.

## Anpassung eines bestehenden Tests

`pruefungen/geo-einsatzorte.test.js`, „Einsatzort: der Umkreis des Einsatzorts gilt …“: Die Zeile „Ohne Radius am Einsatzort gilt
die Vorgabe 200 m“ pinnte den Rückfall auf den Wert des Standorts. Die Spezifikation (B9 und „Festlegungen“) nennt 100 m für
Einsatzorte. Der Test sagt jetzt: ohne Radius gilt 100 m (80 m innerhalb, 150 m außerhalb) — strenger, keine Abschwächung.
Wirkung auf Daten: Einsatzorte, die die Oberfläche seit WP-20 anlegt, tragen ausdrücklich 200 m und sind nicht betroffen; nur
Einsatzorte ganz ohne Radius (etwa über die Schnittstelle) werden von 200 auf 100 m enger. `geo.test.js` ist unverändert, darunter
„Quelltext: keine eigene Ortsprüfung mehr im Client“.

## Offen und nicht eigenmächtig entschieden

- **Aus WP-20 (unverändert):** Die Planung kann den Pflichtmodus über Dienstart/Einsatzort aushebeln; Frist für `ORT_PRUEFEN`;
  Betriebsvereinbarung und Mitbestimmung (§ 87 Abs. 1 Nr. 6 BetrVG), ein Flag `geoPruefungBestaetigt` für zwei Texte.
  WP-29 ändert daran nichts.
- **Codenamen:** WP-20 und die Spezifikation benennen drei Fälle verschieden (`kein_referenzort` statt `kein_standort`,
  `aussendienst` statt `keine_feste_pruefung`; ein gelöschter oder koordinatenloser Einsatzort gibt `kein_referenzort` bzw.
  `keine_koordinate_am_referenzort` statt `einsatzort_ungueltig`). Eine Umbenennung ändert gespeicherte Daten und
  WP-20-Tests; sie bleibt eine Entscheidung der Leitung. Nur der neue Fall (inaktiv) trägt den Spezifikationsnamen.
- **Quelle „Pflicht, sobald Koordinaten gesetzt werden“ (B2):** Die Oberfläche setzt die Quelle immer; der Server lehnt eine Koordinate
  ohne Quelle nicht ab, weil sonst jede Schnittstelle und jede vorhandene Prüfung ohne Quelle 422 bekäme. Die Anwendung prüft die
  Werte, nicht ihr Vorhandensein. Entscheidung, ob serverseitig verlangt werden soll.
- **Geo-Modus je Einteilung (`einsatzortAm`)** und die B9-Eigenschaft „Adresse am Einsatzort“ bleiben offen (nicht Teil des
  Backlog-Akzeptanzsatzes; die Adresse eines Einsatzorts ist nach B9 besonders sensibel und wird nicht ohne
  Datenschutzfolgenabschätzung eingeführt).
- **Rundung:** `„>5 km“` (Leerzeichen) gegen `„>5km“` der Spezifikation; Test pinnt das Leerzeichen.
- `selbsttest.test.js` („Erster Aufbau unter 500 ms“) war auf dem lokalen, ausgelasteten Rechner rot (reine Rechenzeit von
  `stundenkonto`); der CI-Lauf ist maßgeblich.
- Gerätetest GPS (echtes Gerät) ist nicht ausgeführt.
