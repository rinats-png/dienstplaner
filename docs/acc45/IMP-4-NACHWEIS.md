# IMP-4 Nachweis — Personalimport: Vorschau, Oberfläche, Dublettenwahl

Branch `acc45/import/imp-4`, Basis `origin/integration/release-v4` (a792f7c). Test: `pruefungen/import-oberflaeche-imp4.test.js` (26 Fälle), Aufruf `npm run pruefung:import-oberflaeche`.
Nur synthetische Daten.

## Abhängigkeit: IMP-4 darf erst nach IMP-3 integriert werden

Der Endpunkt `/api/import` (IMP-3, Branch `acc45/import/imp-3`, Vertrag `docs/acc45/IMP-3-NACHWEIS.md` §1 und `docs/acc45/IMPORT-VERTRAG.md`)
ist in `integration/release-v4` **nicht** vorhanden. Die Oberfläche ist gegen diesen Vertrag gebaut und nur gegen ein **Testdouble**
(`pruefungen/hilfen/import-schnittstelle-attrappe.mjs`) geprüft; die Gegenprobe gegen den echten Endpunkt steht aus.

Sicherung gegen versehentliche Wirkung: `IMPORT_DATEI_AKTIV = false` in `src/lib/import-schnittstelle.js`. Solange der Schalter aus ist, zeigt die
Importansicht nichts Neues (Test S1/S2), und es geht keine Anfrage an `/api/import` hinaus. Nach der Integration von IMP-3: Schalter auf `true`, Gegenprobe
der Vertragsformen (Tabelle unten) gegen den echten Endpunkt, dann erst IMP-4 integrieren.

## Schnittstelle (klar abgegrenzt)

`src/lib/import-schnittstelle.js` ist die **einzige** Stelle, die `/api/import` kennt (Test S3): reiner Transport für `upload` (Rumpf = Datei, `application/octet-stream`,
Name nur URI-kodiert als `x-dateiname`), `analyse`, `vorschau`, `uebernahme`, `verwerfen` (JSON). Rückgabe immer `{ ok:true, daten }` oder `{ ok:false, status, code, fehler }`, nie eine Ausnahme.
Kein Browserspeicher, kein Zwischenspeicher, kein Protokoll von Inhalten.

Vertragsformen, auf die sich die Oberfläche verlässt (bei der Gegenprobe gegen IMP-3 zu prüfen): Antwort `upload` (`vorgang, blaetter[{index,name,datenzeilen,spalten}], vorgabeBlatt`),
`analyse` (`spalten[{index,kopf,feld,herkunft}], zuordnung, fehlendePflicht, datensaetze[{datensatz, werte, fehler, hinweise, konflikte[{art}], dublette{art,personId|datensatz}, erlaubt[], vorgabe}], zaehler`),
`vorschau` (`vorschau{neu, aktualisieren[{datensatz,personId,aenderungen[{feld,alt,neu}]}], uebersprungen, offen, neueEinheiten, neueStandorte}, bereit, bestaetigung`), `uebernahme` (`zaehler`),
Fehlercodes `ORG_EDIT_FEHLT`, `AKTUALISIERUNG_OHNE_BESTAETIGUNG`, `VORSCHAU_VERALTET`, `DATEI_ZU_GROSS` u. a. Dublettenarten: `personalnummer`, `personalnummer-datei`, `name`, `name-datei`.

## Oberfläche

- `src/lib/import-ablauf.js`: Ablauf und Regeln ohne React (Schritte wahl → pruefen → vorschau → fertig).
- `src/ansichten/import-datei.jsx`: Anzeige (Dateiwahl, Spaltenzuordnung mit Herkunft und Blattwahl, Tabelle der Datensätze mit Wahl je Datensatz, Vorschau mit alt → neu, ausdrückliches Bestätigungshäkchen, Ergebnis).
- `src/ansichten/import.jsx`: Einstieg „Datei hochladen“ nur bei aktivem Schalter; der Einfügeweg (IMP-1) bleibt unverändert.

Regeln in der Oberfläche (zusätzlich zum Server, damit nichts angeboten wird, was er ablehnt):

| Regel | Umsetzung | Test |
|---|---|---|
| keine automatische Überschreibung | Startwahl nie „aktualisieren“ (auch wenn der Server es vorgäbe); „aktualisieren“ nur mit Häkchen je Person; ohne Bestätigung keine Vorschau und kein Serveraufruf | D4, A1, A3 |
| Namenstreffer nur Vorschlag | bei `name`/`name-datei` ist „aktualisieren“ nie wählbar; Text „Vorschlag … nichts zusammengeführt“ | D2, V2 |
| Dublettenvorschlag nur ohne Personalnummer | Namensvorschlag entsteht nur ohne Nummer (Server, `erlaubt`); bei Personalnummer-Treffer nur aktualisieren/überspringen/klären, kein „neu“ | D1, D3 |
| Personalnummer mandantenintern eindeutig | Bezug auf den eigenen Betrieb; Text „im Betrieb eindeutig“; Fremdbetrieb ist Sache des Servers (404/keine Dublette) | D1 (Text) |
| Vorschau vor Übernahme | Übernahme nur mit Vorschau, deren Code und Häkchen; jede Änderung verwirft die Vorschau | A4, A5, A6, V3 |
| Doppelklick | genau eine Übernahme | A7 |
| nichts zu übernehmen | nicht „bereit“, keine Übernahme | A8 |
| Serverabsagen | 403 `ORG_EDIT_FEHLT`, 409 `VORSCHAU_VERALTET` mit Satz; veraltet führt zurück in die Prüfung | A9 |
| Abbrechen | `verwerfen` beim Server; nach Übernahme nicht nötig; keine Personendaten im Zustand nach der Übernahme | A11, A4 |

## Kopie `src/pruefung.jsx` — Befund: NICHT entfernt

Die Datei ist **keine** reine Kopie und nicht überflüssig. Sie ist die Selbstprüfung der Anwendung (`selbsttest`, über 500 Zusicherungen): importiert von `src/lib/selbsttest.js` (dynamisch)
und `pruefungen/selbsttest.test.js` (`pruefung:selbst`, Teil der CI, `.github/workflows/pruefung.yml`); weitere Prüfungen lesen ihren Quelltext
(`g9-nachtrag`, `g9-verkauf`, `geo-spezifikation`, `person-eintritt` A1-3, `import-bestand-imp1` R10). Sie trägt 7771 Zeilen mit vielen eigenen Kopien (nicht nur die Importlogik);
der Importabschnitt (`importParsen`/`importZuordnen`/`importPruefen`, Zeilen 1971–2300) ist per R10 auf Gleichlauf mit `fachlogik.js` geprüft, aber die Datei selbst ist weder identisch noch ungenutzt.
Ein Entfernen würde die Selbstprüfung der Anwendung und mehrere Prüfungen zerstören; ein Anpassen von R10 wäre ein Umbau der Selbstprüfung (eigener Auftrag, wie schon in `IMP-1-NACHWEIS.md` vermerkt).
**Folgepunkt (eigenes Paket):** Importabschnitt in `pruefung.jsx` durch Import aus `fachlogik.js` ersetzen und R10 auf Import-Identität umstellen. Nicht Teil dieses Pakets.

## Prüfungen

- `import-oberflaeche-imp4`: **26/26** (Schnittstelle 5, Dublettenregeln 5, Ablauf 12, Anzeige 4).
- Regression: `import-bestand-imp1`, `wp39-app-aufbau`, `oberflaeche-render`: 85/85 grün (zusammen mit obigen 111/111 in einem Lauf).
- `eslint` der neuen/geänderten Dateien: 0 Meldungen; `pruefung:typen` (tsc) grün; `werkzeug/verdrahtung-pruefen.mjs`: ok (294 Prüfdateien); das neue Skript steht in der Kette `pruefung`.
- `verdrahtung.test.js` „das Repo selbst besteht“ lief lokal rot (14,5 s, Zeitgrenze unter Last); direkter Lauf des Werkzeugs ist ok. Nicht durch IMP-4.

## Offene Punkte

1. Gegenprobe gegen den echten `/api/import` nach Integration von IMP-3 (Vertragsformen oben); danach `IMPORT_DATEI_AKTIV = true`.
2. Nach erfolgreicher Übernahme lädt die Oberfläche die Seite neu (wie andere Serverschreibwege), damit der Bestand frisch ist.
3. Browsertest (Dateiauswahl, Tabelle, Smartphone-Breite) steht aus; gerendert wurde statisch. Barrierefreiheit: Beschriftungen per `aria-label`, Fehlermeldungen `role="alert"`.
4. Rolle und Qualifikationen werden nicht importiert (IMP-3 §13/6, IMP-5); Schichtzyklen: IMP-6.
5. Entfernung/Umbau von `src/pruefung.jsx`: siehe Befund, eigenes Paket.
