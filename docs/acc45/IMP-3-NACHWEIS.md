# IMP-3 Nachweis — Endpunkt /api/import

Branch `acc45/import/imp-3`, Basis `acc45/import/imp-2` @ `0aa4142` (Parser-Vertrag und Parser aus IMP-2, noch nicht integriert).
Test: `pruefungen/import-endpunkt.test.js`, Aufruf `npm run pruefung:import-endpunkt` (in der Kette `pruefung` nach `pruefung:import-parser`).
Nur synthetische Daten.

## 1. Routen (Vertrag)

Alle Routen: `POST`, Sitzung nötig (`Authorization`/Sitzungsmerkmal wie alle Funktionen), Herkunftsprüfung (`herkunftErlaubt`).
Andere Methode → 405. Antworten JSON, `cache-control: no-store`. Fehlerform immer `{ fehler: <Satz>, code: <CODE>, … }`.

| Route | Rumpf | Erfolg | Wichtige Absagen |
|---|---|---|---|
| `/api/import/upload?art=personal\|schichtzyklus` | die Datei selbst, `content-type: application/octet-stream`; optional Kopf `x-dateiname` (URI-kodiert, nur Endungshinweis für den Parser, nie gespeichert/protokolliert) | 201 `{ vorgang, art, format, blaetter:[{index,name,datenzeilen,spalten}], vorgabeBlatt, hinweise, gueltigBis, inaktivMinuten }` | 413 `DATEI_ZU_GROSS`, 415 falscher Inhaltstyp, 422 Parsercode (`ZU_VIELE_ZEILEN`, `ZU_VIELE_SPALTEN`, `ZU_VIELE_BLAETTER`, `BESCHAEDIGT`, `LEER`, `UNBEKANNTES_FORMAT`, …), 429 `ZU_VIELE_VORGAENGE` |
| `/api/import/analyse` | `{ vorgang, blatt?, zuordnung? }` — `zuordnung` = `{ feld: spaltenindex }`, nur Felder der Weißliste | 200 `{ spalten:[{index,kopf,feld,herkunft}], zuordnung, fehlendePflicht, datensaetze:[{datensatz, werte, fehler, hinweise, konflikte, dublette, erlaubt, vorgabe}], zaehler }` | 404, 409 `BEREITS_UEBERNOMMEN`, 422 `BLATT_UNGUELTIG`/`ZUORDNUNG_UNGUELTIG` |
| `/api/import/vorschau` | `{ vorgang, entscheidungen?: {datensatz: "neu"\|"aktualisieren"\|"ueberspringen"\|"klaeren"}, bestaetigungen?: {datensatz: true}, einheitenAnlegen?: true }` | 200 `{ vorschau:{ neu, aktualisieren:[{datensatz, personId, aenderungen:[{feld,alt,neu}]}], uebersprungen, offen, neueEinheiten, neueStandorte, zeitraum:{von,bis}, zyklen:[] }, zaehler, bereit, bestaetigung }` | 403 `ORG_EDIT_FEHLT`, 409 `ANALYSE_FEHLT`, 422 `PFLICHTSPALTE_FEHLT`, `ENTSCHEIDUNG_UNZULAESSIG`, `AKTUALISIERUNG_OHNE_BESTAETIGUNG`, `ZUORDNUNGSKONFLIKT` |
| `/api/import/uebernahme` | `{ vorgang, bestaetigung }` — `bestaetigung` = Code der **letzten** Vorschau (ausdrücklicher Bestätigungsschritt) | 200 `{ ok, zaehler:{neu, aktualisiert, uebersprungen, neueEinheiten, neueStandorte}, etag }` | 409 `BESTAETIGUNG_UNGUELTIG`, `VORSCHAU_FEHLT`, `BEREITS_UEBERNOMMEN`, `LAEUFT_BEREITS`, `DATEI_BEREITS_UEBERNOMMEN`, `VORSCHAU_VERALTET` (auch: Bestätigung einer älteren Vorschau, Abschnitt 15), `KONFLIKT`, `FACHPRUEFUNG`; 422 `NICHTS_ZU_UEBERNEHMEN`, `ART_NICHT_FREIGEGEBEN`; 500 `UEBERNAHME_ABGEBROCHEN`; 503 `SCHREIBEN_FEHLGESCHLAGEN` |
| `/api/import/verwerfen` | `{ vorgang }` | 200 `{ ok:true }` | 404 |

Ein Vorgang eines anderen Betriebs, Raums oder einer anderen Person ist immer 404 `{ fehler, code:"NICHT_GEFUNDEN" }` — ohne Hinweis, ob es ihn gibt.
Pflichtspalten: Nachname, Vorname, Einheit. Weißliste: `nachname, vorname, personalnummer, email, funktion, wochenstunden, urlaubsanspruch, eintritt, einheit, standort`.

## 2. Rollen und Zugriffsschicht

| Rolle | Import | Neue Einheiten/Standorte | Grund |
|---|---|---|---|
| Leitung | ja | ja (`org.edit`) | `staff.edit` + Schreibumfang voll |
| Kundenrolle (`kunde`, Zugang ohne Person) | **403** (Option A, Freigabe Betreiber; siehe Abschnitt 15) | – | Personaldaten nur durch Leitung/Planung mit Person |
| Planung | ja | **nein** → 403 `ORG_EDIT_FEHLT`; fehlende Einheit bleibt Zuordnungskonflikt (Datensatz „offen") | Planungsrechte erzeugen keine Organisation |
| Schichtverantwortung, Beschäftigte, Betriebsrat, Betreiber | 403 | – | kein `staff.edit` bzw. kein voller Schreibumfang |

- Rolle = `wirksameRolle` (Person im Bestand), bei jedem Schritt neu geprüft. Betrieb = `eigenerMandant(bestand, sitzung)`; nie aus dem Rumpf.
- Schreiben ausschließlich über die bestehenden Stationen von `PUT /api/bestand` (`lib/import/uebernahme.mjs`): Sicht der Rolle (`bestandFuerRolle`) → Plan anwenden → `zusammenfuehren` (Schreibumfang, Rückfüllung, Rollenwechsel, Einheitsprüfung) → Fachprüfung (WP-22) → `personenAngleichen`/`uebergabenAngleichen` → Standortprüfung → `pruefeGestalt` → **ein** `bestandSchreiben` mit erwartetem Stand unter `unterRaumsperre`.
- Zusätzliche Sperre nur für den Import: Nach dem Zusammenführen darf sich im Betrieb nichts außer den geplanten Personen, neuen Einheiten und neuen Standorten geändert haben, sonst wird nicht geschrieben (`nurGeplant`).
- Felder: Neuanlage schreibt nur die Weißliste (+ feste Vorgaben: `rolle: "mitarbeiter"`, keine Qualifikationen). Aktualisieren ändert nur `vorname, nachname, email, funktion, wochenstunden, urlaubsanspruch`; nie Personalnummer, Einheit, Eintritt, Rolle. Eine leere Zelle überschreibt nie.

## 3. Dubletten (verbindliche Regeln)

| Fall | Erkennung | Erlaubt | Vorgabe |
|---|---|---|---|
| Personalnummer im eigenen Betrieb vorhanden | `personalnummer` (getrimmt, ohne Groß/Klein) | aktualisieren (nur mit `bestaetigungen[n]=true`), überspringen, klären | klären |
| Personalnummer mehrfach in der Datei | alle betroffenen Datensätze | überspringen, klären | klären |
| gleiche Nummer in einem **anderen** Betrieb | keine Dublette (mandantenintern) | neu, … | neu |
| ohne Personalnummer, gleicher Vor-+Nachname | nur **Vorschlag** zur manuellen Prüfung | neu (ausdrücklich), überspringen, klären — **nie** aktualisieren | klären |
| gleicher Name mehrfach in der Datei (ohne Nr.) | Vorschlag am späteren Datensatz | neu, überspringen, klären | klären |

Keine automatische Überschreibung, keine Zusammenführung über den Namen. „Neu" bei einer Personalnummer-Dublette ist unzulässig (422).

## 4. Wiederholschutz (Idempotenz)

1. Je Vorgang: nach Erfolg Zustand `uebernommen` → jede weitere Übernahme 409 `BEREITS_UEBERNOMMEN` (mit den Zahlen). Gleichzeitige Anfragen: Merker `laeuft` → 409 `LAEUFT_BEREITS`.
2. Bestätigungscode = SHA-256 des Plans der letzten Vorschau. Unter der Raumsperre wird der Plan aus dem aktuellen Bestand neu berechnet; weicht er ab → 409 `VORSCHAU_VERALTET`.
3. Je Datei und Betrieb: Vermerk `importerledigt:<raum>:<sha256(mandantId|sha256(Datei))>` mit `{ zeit, person (Id), zaehler }`, geprüft und gesetzt unter derselben Sperre → 409 `DATEI_BEREITS_UEBERNOMMEN`. Frist **30 Tage** (gleich der Betriebsspur); abgelaufene Vermerke werden beim nächsten Upload des Raums gelöscht, bei Raumlöschung mit (`raumloeschung.mjs`).

## 5. Protokoll (Betriebsspur `centric-spur`, `protokoll("import", …)`)

Felder je Zeile (aus `schutz.mjs`): `zeit`, `art: "import"`, `kennung` (Hash des Raums), `ausgang` (`hochgeladen`, `erfolg`, `abgewiesen`, `verworfen`, `fehler`), `zusatz`, `rolle`, `person` (**Id**, nie Name), `mandantId`, `weg` (`import/<schritt>`), `verfahren`, `herkunft` (Kürzel).
`zusatz` enthält nur Zahlen und Codes, z. B. `neu 2 · aktualisiert 0 · übersprungen 0 · Einheiten neu 0 · Standorte neu 0`, `Format csv · 1 Blätter · 2 Datenzeilen`, `Datei: ZU_VIELE_ZEILEN`, `Übernahme: VORSCHAU_VERALTET`.
Nie: Dateiname, Zellinhalt, Namen, E-Mail, Personalnummer, Ausnahmetext. Unerwartete Fehler: `fehler`/`unerwarteter Fehler`, Antwort 500 ohne Stacktrace. Getestet (Test „Protokollzeilen").

## 6. Temporäre Daten und Fristen

| Was | Wo | Frist | Begründung |
|---|---|---|---|
| hochgeladene Datei | nur Speicher der Anfrage | nach dem Parsen verworfen (nicht im Vorgang) | Art. 5 Abs. 1 lit. c/e DSGVO; Datei wird nie auf Platte geschrieben |
| Rohinhalt (Parser-Ergebnis), Analyse, Plan | Vorgang im Arbeitsspeicher (`lib/import/vorgaenge.mjs`) | **30 min ohne Zugriff**, höchstens **2 h** ab Upload; nach Übernahme sofort; Verwerfen sofort; Neustart löscht alles | Zuordnung und Vorschau prüft man in Minuten; Arbeitsspeicher statt Platte, damit keine Personaldaten in Sicherungen/Abbildern landen (ein Prozess je Ablage, `prozesssperre.mjs`) |
| Vermerk „übernommen" am Vorgang | Speicher | bis 2 h ab Upload | nur Zahlen, Wiederholschutz im laufenden Vorgang |
| `importerledigt:` | Ablage `centric` | 30 Tage | nur Hashwerte, Zeit, Person-Id, Zahlen; Wiederholschutz über Neustarts |
| Grenzen | `HOECHST.gesamt = 20`, `HOECHST.jeRaum = 3` offene Vorgänge | – | begrenzt den Arbeitsspeicher (Parser liefert höchstens 4 Mio. Zellen je Datei) |

## 7. Atomarität

Bis zum Journal in `bestandSchreiben` existiert der neue Stand nur im Speicher. Getestet mit Fehlerinjektion (`_pruefhaken`, im Betrieb `null`):
- Abbruch nach dem 2. von 3 Datensätzen → 500 `UEBERNAHME_ABGEBROCHEN`, Stand und Personen unverändert; Wiederholung desselben Vorgangs gelingt danach.
- Plattenfehler beim Journal → 503 `SCHREIBEN_FEHLGESCHLAGEN`, Stand unverändert.
- Plattenfehler nach dem Journal (Kern) → Journal gilt (WP-45); `nachpruefen` erkennt „festgeschrieben" → 200, alle drei Personen vorhanden, keine halb.
- Ein „teilweise"-Befund wird nie als Erfolg gemeldet (500 `SCHREIBEN_UNKLAR`).

## 8. Grenzen

Immer die Standardgrenzen des Parser-Vertrags (keine Werte aus der Anfrage): 10 MB Datei, 100 MB entpackt, 20.000 Datenzeilen, 200 Spalten, 20 Blätter, 4 Mio. Zellen, 20 s.
`server.mjs`: neue optionale `config.rumpfMax` je Funktionsdatei (Obergrenze 16 MB); `import.mjs` setzt 10 MB. Alle anderen Funktionen bleiben bei 6 MB. JSON-Rümpfe der übrigen Importrouten: höchstens 2 MB.

## 9. Tests

`pruefungen/import-endpunkt.test.js`: **36 Fälle, 36 grün** (32 + 4 neue zum Eintrittsdatum; Laufzeit ca. 2 min, davon der 20.001-Zeilen-Fall den größten Teil). Eintrittsdatum: gegen bd37c16 war 1 der 4 neuen Fälle rot (neue Person mit leerem Eintritt bekam das heutige Datum); die drei übrigen (gültig, ungültig, Aktualisieren lässt Eintritt stehen) bestätigen bestehendes Verhalten.

| Bereich | Fälle |
|---|---|
| Rollen | 401 ohne Sitzung; Leitung/Planung 201; Schichtverantwortung, Beschäftigte, Betriebsrat 403 ohne Vorgang/Schreiben; 405/403 Herkunft/415 |
| Ablauf | CSV und XLSX bis zur Übernahme; Personalnummer gespeichert, leere E-Mail bleibt leer; Vorgang danach ohne Inhalte; Übernahme ohne Bestätigung 409 |
| Fehler je Datensatz | Feldname, nie Wert |
| Wiederholung | gleicher Vorgang 409; Doppelklick genau ein 200; gleiche Datei neuer Vorgang 409 |
| Grenzen/Datei | >10 MB 413; 20.001 Zeilen; 201 Spalten; abgeschnittene XLSX ohne Stacktrace; leere Datei |
| Dubletten | mit Personalnummer (neu unzulässig, Aktualisieren ohne Bestätigung 422, mit Bestätigung nur erlaubte Felder, Eintritt unverändert); ohne Personalnummer (nie aktualisieren, neu nur ausdrücklich); mandantenintern; doppelt in der Datei |
| org.edit | Planung: Konflikt, Anlegen 403; Leitung legt Einheit an |
| Mandant | fremder Betrieb im selben Raum und fremder Raum: alle Routen 404 ohne Auskunft; andere Person desselben Betriebs 404; Leitung m2 schreibt nur m2 |
| Atomarität | drei Fehlerinjektionsfälle (Abschnitt 7) |
| Protokoll/Fristen/Gerüst | Spur ohne Personendaten mit Person-Id und Zahlen; 30-min-Frist, Verwerfen; Schichtzyklus-Gerüst; Registrierung |

„Rot zuerst": Die Prüfung entstand nach dem ersten Entwurf. Ersatzweise **Mutationsprobe**: Besitzprüfung des Vorgangs, Bestätigungspflicht, org.edit-Prüfung und Namensregel (Name wie Personalnummer behandeln) testweise ausgeschaltet → 4 Fälle rot (Dubletten ×2, org.edit, Mandant); danach Originale wiederhergestellt, alles grün.

Regression (lokal, Windows 11):
- `npm run lint` 0 Fehler (162 Warnungen, alle Bestand, keine in den neuen Dateien); `npm run pruefung:typen` grün; `pruefung:verdrahtung` grün.
- `server.test.js` 25/26: rot nur „hört auf SIGTERM sauber auf" — ebenso rot mit dem unveränderten `server.mjs` der Basis (Windows beendet bei `kill("SIGTERM")` hart). Nicht durch IMP-3.
- Echter Serverstart (`node server.mjs`, leere Ablage): `/api/import/upload` mit 7 MB erreicht die Funktion (401 ohne Sitzung), 11 MB → 413 aus `server.mjs`, `/api/bestand` mit 7 MB → weiterhin 413; Startprotokoll listet `import /api/import/upload` usw.
- `aufraeumen.test.js`: lokal wechselnde 5-s-Zeitüberschreitungen (4–8 Fälle je Lauf) — **mit und ohne** die Zeile in `raumloeschung.mjs` (Basis zweimal gemessen: 8 rot je Lauf). Lastbedingt auf dieser Maschine, nicht durch IMP-3; in CI nachzuprüfen.
- `registrierung.test.js` rot nur im Parallellauf mit Zeitüberschreitungen (nicht berührt).
- `import-parser*`, `account-isolation`, `loeschsperre`, `sitzungsinventar`, `intelligence-gateway-*`, `kalender-feed-live` grün.

## 10. Basis-Abhängigkeiten

- **IMP-2** (Parser, `0aa4142`): Basis dieses Branches.
- **IMP-1** (`acc45/import/imp-1`, `e675b62`, Basis `47ca6ea` wie IMP-2) ist **nicht** zusammengeführt. Grund: Die IMP-1-Logik liegt im Client (`src/lib/fachlogik.js`, `src/pruefung.jsx`, `App.jsx`); der Server kann `fachlogik.js` nicht laden (React-Hooks, Client-Importe). Der Server muss Dubletten ohnehin selbst prüfen. IMP-3 enthält deshalb einen eigenen, reinen Prüfkern `server/lib/import/personen.mjs`, der die IMP-1-Regeln übernimmt (strenges Datum, keine erfundene E-Mail, Personalnummer lesen und speichern) und die schärferen IMP-3-Regeln umsetzt (Name nur Vorschlag, Aktualisieren nur über Personalnummer). **Folgepunkt (IMP-4):** Oberfläche auf `/api/import` umstellen; die Kopien in `fachlogik.js`/`pruefung.jsx` entfallen dann. Bis dahin gibt es zwei Regelstände (Client-Einfügeweg nach IMP-1, Server-Import nach IMP-3), die sich bei Namensdubletten unterscheiden (IMP-1 erlaubt „aktualisieren" mit Bestätigung auch bei Namenstreffer).

## 11. Konfliktstellen für den Rebase (WP-18, SI-P4 u. a.)

| Datei | Änderung | Hinweis |
|---|---|---|
| `server.mjs` | +1 Konstante `RUMPF_HOECHST`, Feld `rumpfMax` in `funktionenLaden`, `rumpfEinlesen(req, grenze)`, Aufruf mit `route.rumpfMax` (10 Zeilen) | Die Registrierung selbst braucht **keine** Zeile: `server.mjs` lädt jede Datei aus `server/funktionen/` (genaue Pfade vor `/api/*`). |
| `package.json` | Skript `pruefung:import-endpunkt` + Anhang an Kette `pruefung` | gleiche Stelle wie IMP-2 (`import-parser`) |
| `server/lib/raumloeschung.mjs` | 1 Zeile `praefixWeg("importerledigt:…")` | |
| neu | `server/funktionen/import.mjs`, `server/lib/import/{personen,vorgaenge,uebernahme}.mjs`, Test, dieser Nachweis | keine Überschneidung |

`daten.mjs` und `rechte.mjs` sind **nicht** geändert.

## 12. KI-Andockstelle (IMP-9)

Markiert in `server/lib/import/personen.mjs`, `analysieren`, Kommentar `IMP-9 ANDOCKSTELLE`: Eingang wären nur Spalten ohne Zuordnung (Überschrift, höchstens maskierte Proben) über das Gateway (F7A), Ausgang nur ein Vorschlag für `zuordnung`, den die Person bestätigt. Kein Aufruf, kein Schalter.

## 13. Restrisiken und offene Punkte

1. **Excel-Datum 1904er-System**: Datumszellen werden als 1900er-Seriennummer gelesen; eine Mac-Datei mit 1904er-System läge 4 Jahre daneben. Der Parser liefert das Datumssystem nicht mit (IMP-2-Folgepunkt).
2. **Vorgänge nur im Arbeitsspeicher**: Neustart verwirft offene Importe (gewollt). Bei mehreren Prozessen je Ablage ginge das nicht — ausgeschlossen durch `prozesssperre.mjs`.
3. **Wiederholschutz-Vermerk nach dem Schreiben**: Bricht der Prozess genau zwischen `bestandSchreiben` und dem Vermerk ab, fehlt der Dateivermerk; ein zweiter Import derselben Datei würde dann an den Personalnummer-Dubletten hängen bleiben (Vorgabe „klären"), aber Datensätze ohne Personalnummer wären nur als Namensvorschlag markiert.
4. **Gleiche Datei nach 30 Tagen** gilt wieder als neu (Dubletten greifen weiterhin).
5. **Leeres Eintrittsdatum** (geschlossen, Entscheidung 2026-11-09): leer und optional -> `null`; gültig -> übernommen (ISO oder TT.MM.JJJJ); ungültig (31.02., fremdes Format) -> Fehler „Eintrittsdatum ungültig", Datensatz nur überspringbar; „heute" nie ohne ausdrückliche Eingabe, kein Hinweis „heutiges Datum angenommen" mehr. Aktualisieren fasst den Eintritt nie an (leere Zelle überschreibt kein bestehendes Datum). Technischer Anker: `zugehoerigkeit[0].ab` und `rolleSeit` einer neuen Person ohne Eintritt tragen den Tag der Übernahme (sie brauchen ein Datum, sind aber kein Eintritt; Serverleser wie `fachpruefung` vergleichen `ab` als Text). Offen bleibt, ob dieser Anker später auf „von Anfang an" umgestellt wird (wie im Client-Zweig `acc45/person/eintritt`, wo die Leser leeres `ab` tolerieren).
6. **Rolle wird nicht importiert** (neue Personen sind „mitarbeiter"); Rollenvergabe bleibt im Rollendialog (roles.assign). Qualifikationen: IMP-5.
7. **Betreiberkonsole**: `spurLesen` listet die Art `import` nicht (feste Liste in `schutz.mjs`); die Zeilen liegen in der Spur und sind für die Auskunft auffindbar. Aufnahme in die Liste wäre eine Zeile in einer geteilten Datei — bewusst nicht gemacht.
8. **Schichtzyklen**: nur Gerüst (`art=schichtzyklus`: Upload, Spaltenliste, Vorschau mit `zyklen: []`, Übernahme 422). Umsetzung IMP-6.
9. Der 20.001-Zeilen-Test braucht in CI rund 1–2 Minuten.

## 14. Auflagen aus dem Review

Basis 90592bc, Branch `acc45/import/imp-3-auflagen`. Tests in `pruefungen/import-endpunkt.test.js` (Abschnitt „Auflagen aus dem IMP-3-Review"). Rot = gegen 90592bc gemessen (56 Tests, 13 rot); grün = nach der Umsetzung (56/56).

| Auflage | Status | Test (Auszug) | rot/grün |
|---|---|---|---|
| 2 Gleicher Name bei abweichender/fehlender Nummer nie „neu" | umgesetzt (`personen.mjs`) | „Name gleich, Nummer abweicht", „…Datei hat Nummer, Bestand keine", „…keine Nummer, Bestand hat eine", „gleicher Name zweimal in der Datei mit verschiedenen Nummern" | 2 rot (Nummer abweicht; Name in Datei), danach grün; die übrigen Fälle waren schon grün |
| 2 Gleichwertige Nummern (führende Nullen, Trennzeichen) = möglicher Treffer, „klären" (neue Art `personalnummer-aehnlich`, kein „aktualisieren") | umgesetzt | „01001 gegen 1001", „001001", „P-1001 gegen P1001", „p 1001", „P01001" | 5 rot / 5 grün |
| 2 Doppelte Nummer in der Datei: alle Zeilen markiert | umgesetzt | „gleichwertige Nummern innerhalb der Datei", „dieselbe Nummer dreimal …" | 2 rot / grün |
| 2 Stiller Treffer auf die erste Person (`nachNummer`) | beseitigt: mehrere Personen mit gleicher Nummer ergeben `personalnummer-mehrdeutig`, nur überspringen/klären | „dieselbe Nummer mehrfach im Bestand" | rot / grün |
| 3 Parser-Worker global höchstens 2 gleichzeitig, übrige sofort 503 `ZU_VIEL_GLEICHZEITIG` (kein Warten: staut keine Dateipuffer auf) | umgesetzt (`parser.mjs`, `import.mjs`) | „höchstens 2 Parser gleichzeitig …" | rot / grün |
| 3 Vorgangsgrenze (3 je Raum, 20 gesamt) vor dem Parsen | umgesetzt: Platz wird vor dem Lesen des Rumpfs belegt (`vorgangAnlegen`), nach dem Parsen gefüllt (`vorgangFuellen`), bei Fehlschlag freigegeben | „Vorgangsgrenze greift VOR dem Parsen", „ein fehlgeschlagener Upload hält keinen Vorgang fest" | 1 rot (422 statt 429) / grün; der zweite Test war schon grün |
| 4a VORSCHAU_VERALTET | Test ergänzt | „Bestand ändert sich zwischen Vorschau und Übernahme" | grün/grün (Verhalten vorhanden, nur ungeprüft) |
| 4b leere Zelle überschreibt nichts | Test ergänzt (nur Funktion gefüllt; E-Mail, Stunden, Urlaub bleiben; neue Zeile mit leerer Zelle: E-Mail leer) | „nur die gefüllte Zelle ändert …" | grün/grün (Verhalten vorhanden) |
| 4c Betreiber und Kundenrolle 403 | Test ergänzt; für „kunde" mit Änderung in `import.mjs` | „betreiber: Upload 403", „kunde: Upload 403" | betreiber grün/grün; kunde rot / grün |
| 4d führende Nullen | siehe Auflage 2 | s. o. | s. o. |
| 4e Namensgleiche mit abweichender Nummer | siehe Auflage 2 | s. o. | s. o. |

Gesamt: 13 rot gegen 90592bc, alle grün; keine bestehende Assertion geändert oder entfernt.

Begründungen zu Verhaltensänderungen:
- **Kundenrolle:** Die Kopfzeile von `import.mjs` nannte die Kundenrolle (Rückfallrolle „kunde", Zugang ohne Person) als importberechtigt (volles Schreibrecht). Die Review-Auflage verlangt 403; die Rolle wird jetzt ausdrücklich abgewiesen. `rechte.mjs` unberührt.
- **Doppelte Nummer in der Datei geht einem Bestandstreffer vor:** Vorher blieb eine Zeile mit Treffer im Bestand „aktualisieren"-fähig, auch wenn dieselbe Nummer mehrfach in der Datei stand (dieselbe Person könnte zweimal aktualisiert werden). Jetzt: nur überspringen oder klären.
- **Gleicher Name in der Datei** (verschiedene Nummern) ist jetzt „klären" (vorher nur ohne Nummer).
- Neue Dublettenarten `personalnummer-aehnlich` und `personalnummer-mehrdeutig` im Feld `dublette.art`; die Oberfläche (IMP-4) muss sie anzeigen.

Offene Punkte: Die Schlüsselregel (Trennzeichen entfernen, führende Nullen nach optionalem Buchstabenpräfix) erfasst keine Nullen mitten in der Nummer. Die Parser-Grenze gilt je Prozess (ein Prozess je Ablage).

## 15. Auflagen aus dem Delta-Review (Opus)

Basis `9125b0a` (`acc45/import/imp-3-auflagen`), Branch `acc45/import/imp-3-auflagen2`. Tests in `pruefungen/import-endpunkt.test.js`, Abschnitte „Delta-Review 3a/3b/1b/4a" und „Freigabe Betreiber — Datumswerte". Reihenfolgen werden über Zustände erzwungen (von außen gehaltene Raumsperre `unterRaumsperre`, Marke `laeuft`, Prüfhaken vor dem Parsen), nicht über Wartezeiten.

**Rot-Messung:** die endgültige Testdatei gegen den Produktionscode von `9125b0a` (`server/funktionen/import.mjs`, `server/lib/import/*` zurückgesetzt): **14 rot, 59 grün, 1 übersprungen** von 74 (56 Bestand grün, 18 neu). **Grün:** nach der Umsetzung **73 grün, 1 übersprungen** (Datei allein), mit `import-parser.test.js` **116 grün, 1 übersprungen**, dreifach parallel unter Last (`--testTimeout=60000`) jeweils ohne Fehlschlag.

| Auflage | Status | Test | rot vor Fix | grün nach Fix |
|---|---|---|---|---|
| 3a Übernahme-Rennen: Bestätigung und Momentaufnahme an `uebernehmen`, Hash dort gegen die Bestätigung, Vorschau/Analyse 409 bei laufender Übernahme | umgesetzt (`import.mjs`, `uebernahme.mjs`) | „zweiter Tab: Vorschau und Analyse während laufender Übernahme 409; geschrieben wird der bestätigte Plan" | rot (Vorschau 200 statt 409; alter Code schrieb den Plan des zweiten Tabs) | grün |
| | | „Übernahme mit alter Bestätigung nach neuer Vorschau: 409 VORSCHAU_VERALTET, nichts geschrieben" | rot (409 `BESTAETIGUNG_UNGUELTIG`; geschrieben wurde auch vorher nichts) | grün |
| | | „Doppelklick: zweite Übernahme während der ersten 409 LAEUFT_BEREITS" (deterministische Fassung) | grün (Regressionswächter) | grün |
| 3b Plan-Hash mit Dublettenlage (je Datensatz Dublettenart, Ziel, Vorgabe, Konfliktarten, Einheit/Standort) | umgesetzt (`personen.mjs`, `planen`) | „„neu" bestätigt, danach Person gleichen Namens im Bestand angelegt: 409 VORSCHAU_VERALTET, keine doppelte Person" | rot (200, doppelte Person) | grün |
| 1b Namensvergleich normalisiert (ä/ö/ü/ß, Leerraum zusammengefasst, Bindestrich = Leerzeichen, Groß/Klein) | umgesetzt (`personen.mjs`: `nameVergleich`, `namensSchluessel`; Bestand und innerhalb der Datei) | 6 Paare (Müller/Mueller beide Richtungen, Strauß/Strauss + Jörg/Joerg, „Anna  Lena"/„Anna Lena", „Anna-Lena"/„Anna Lena", „MEYER LUEDENSCHEIDT"/„Meyer-Lüdenscheidt"), „innerhalb der Datei …" | 7 rot | 7 grün |
| | | „verschiedene Namen bleiben verschieden" (Annalena ≠ Anna Lena; kyrillische Namen nicht auf leeren Schlüssel) | grün (Wächter gegen Übernormalisierung) | grün |
| 4a höchstens 1 Parser je Raum, überzählige 503 `ZU_VIEL_GLEICHZEITIG` | umgesetzt (`vorgaenge.mjs` `parserPlatzBelegen`, `PARSER_JE_RAUM_MAX = 1`; `import.mjs` vor dem Lesen des Rumpfs) — **`parser.mjs` unverändert** (Freigabe: Parser gehört IMP-2) | „zwei parallele Uploads desselben Raums: der zweite 503 …", „zwei Räume gleichzeitig: beide dürfen parsen" | gegen 9125b0a beide rot (Prüfhaken fehlt). Fachliche Probe: nur die Grenze ausgeschaltet (`PARSER_JE_RAUM_MAX = Infinity`) → 1 rot (gleicher Raum), 1 grün (zwei Räume) | 2 grün |

### Freigaben Betreiber (2026-11-09, zusätzlich)

1. **Kundenrolle: Option A.** Die Rolle `kunde` erhält beim Import 403 und verändert über den Import keine Mitarbeiterdaten (umgesetzt seit `9125b0a`, Test „kunde: Upload 403, nichts geparst, nichts gespeichert"). Option B wird nicht gebaut. Tabelle in Abschnitt 2 berichtigt.
2. **Vorschau = gespeichertes Datum.** Die Umrechnung des Datumssystems geschieht nur in der Analyse (`personen.mjs` `datumAusZelle(z, datumssystem)`: 1900 Vorgabe, 1904 = +1462 Tage). Vorschau (`eintritt` ISO, neu `eintrittAnzeige` TT.MM.JJJJ) und Übernahme tragen denselben Wert; `anwenden` rechnet nichts um. Leer bleibt `null`, `eintrittAnzeige: "nicht angegeben"`. Ein Geburtsdatum kennt der Personalimport nicht (nicht in der Weißliste); kommt es hinzu, gilt dieselbe Regel.
3. **Tests:** „1900er- und 1904er-Mappe mit gleichem Kalenderdatum: gleiche Vorschau; die Übernahme speichert genau das Vorschau-Datum" (rot gegen 9125b0a: 1904 lag 4 Jahre daneben, `eintrittAnzeige` fehlte → grün), „leeres Eintrittsdatum: null, „nicht angegeben"" (rot → grün), „ohne Angabe des Datumssystems gilt 1900" (grün/grün).
4. **Feld `datumssystem` aus IMP-2:** gelesen als `erg.datumssystem` (Mappe) und vorrangig `blaetter[i].datumssystem` (Blatt), Werte `1900`/`1904` als Zahl oder Text. Der heutige Parser liefert das Feld noch nicht; der 1904-Test setzt es deshalb am Vorgang so, wie IMP-2 es liefern wird (nur wenn es fehlt). Der Test „echter Parser-Weg (sobald IMP-2 `datumssystem` liefert)" läuft automatisch, sobald der Parser das Feld liefert, und ist bis dahin **übersprungen**. Ohne Feld gilt 1900 (bisheriges Verhalten). Liefert IMP-2 einen anderen Ort oder Wertetyp, ist nur `import.mjs` (Upload/Analyse) und `datumssystemAus` anzupassen.

### Verhaltensänderungen (Begründung)

- Übernahme mit einer Bestätigung, die nicht zur letzten Vorschau gehört: jetzt 409 `VORSCHAU_VERALTET` statt `BESTAETIGUNG_UNGUELTIG` (Auftrag 3a). `BESTAETIGUNG_UNGUELTIG` bleibt für fehlende/leere Bestätigung. Keine bestehende Assertion prüfte den Code (Zeile „Ohne Bestätigung keine Übernahme" prüft nur 409 und bleibt grün).
- Neu: 409 `UEBERNAHME_LAEUFT` für Analyse und Vorschau, solange eine Übernahme des Vorgangs läuft. Die Marke `laeuft` wird vor dem ersten `await` gesetzt (vorher erst nach der Bremse — Lücke für Doppelklick).
- Neu: 503 `ZU_VIEL_GLEICHZEITIG` beim Upload, wenn im Raum schon ein Parser läuft (Datei wird nicht gelesen, kein Vorgang bleibt).
- Bestätigungscodes ändern sich (Hash über Plan **und** Lage); alte Codes laufender Vorgänge werden nach dem Ausrollen als veraltet abgewiesen (Vorgänge leben ohnehin nur im Speicher und höchstens 2 h).
- Namensdubletten werden häufiger erkannt (nur Vorgabe „klären", nie Zusammenführung).
- Test-Hilfe: `afterEach` setzt den neuen Prüfhaken nur zurück, wenn es ihn gibt (damit die Rot-Messung gegen den alten Code lief). Keine bestehende Assertion geändert oder entfernt.

### Nicht Teil dieses Auftrags (nur dokumentiert, nicht umgebaut)

1a, 1c, 4b, 5a, 5b, 7b, 7c, 8a aus dem Delta-Review bleiben offen wie dort beschrieben. Kundenrollen-Frage: durch Freigabe Option A entschieden (s. o.).

### Offene Punkte

- **Verwerfen während laufender Übernahme** wird nicht abgewiesen: der Vorgang verschwindet, die Übernahme schreibt mit ihrer Momentaufnahme trotzdem zu Ende (ganz oder gar nicht). Kein Datenverlust, aber für die Person überraschend; Vorschlag: `verwerfen` bei `laeuft` ebenfalls 409.
- `datumssystem`: endgültiger Ort/Wertetyp hängt an IMP-2 (s. o.); der übersprungene Test macht den Anschluss sichtbar.
- Die Raum-Grenze gilt je Prozess (wie die globale; ein Prozess je Ablage).
