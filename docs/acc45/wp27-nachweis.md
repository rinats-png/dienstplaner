# WP-27 — Betriebsrat-Auswertung aggregiert, reduzierte Sichten: Nachweis

Branch `acc45/rules/wp27-br-auswertung`, aufgesetzt auf `acc45/rules/wp22b-nachtrag` (braucht die Planrechnung aus
`server/lib/fachpruefung.mjs`) und `origin/integration/centric-complete` (9abf988).

## Akzeptanz

**Aggregation ohne Personenbezug unter Mindestgruppe.** `server/lib/br-auswertung.mjs` rechnet aus dem vollständigen
Bestand Summen je Monat und Einheit sowie für den Betrieb: Dienste, Nachtdienste (Nachtfenster des Betriebs),
Sonntagsdienste, Dienste über zehn Stunden, Ruhezeit unter 11 Stunden nach Plan, bestätigte Ist-Stunden und ihre Zahl —
sechs Monate zurück, zwei voraus. Unter drei Personen stehen keine Zahlen, nur „<3"; ist in einem Monat eine Einheit
gesperrt, fällt auch die Gesamtzeile weg (Zweitsperre gegen Differenzbildung). Keine Person, kein Name, keine Kennung.
Der Server hängt die Auswertung als abgeleitetes Feld `auswertungBetriebsrat` nur an die Sicht des Betriebsrats mit
`audit.view` (rechte.mjs, `bestandFuerRolleKern`); mitgeschickt wird es nie gespeichert. Zwischengespeichert je Betrieb,
Stand und Tag.

**Leistungsnachweis/Belastung korrekt oder gesperrt.** Prüfung der für den Betriebsrat erreichbaren Ansichten:
- Leistungsnachweis: ohne Übergaben (die der Betriebsrat nicht bekommt) stünde dort „keine besonderen Vorkommnisse" —
  für den Betriebsrat gesperrt (`OHNE_BR:`). Ebenso Sondereinsätze, Betriebsmittel, Lenkzeiten (Daten fehlen, leer).
- Prüfung, Ausgleichszeitraum § 3 ArbZG: ohne Ist-Daten „nicht bewertbar" statt „eingehalten".
- Jahresansicht: ohne Kontoangaben kein „Urlaub x/NaN".
- Abwesenheiten, die der Betriebsrat nur als „abwesend" bekommt, heißen „abwesend" statt „Sonstiges".
- Belastung, Verteilung, Personaleinsatz, Untergrenzen, Planstand, Zeitachse, Lagebild: planbasiert bzw. schon richtig
  gekennzeichnet („Ist nicht verfügbar", Konten nur für die Planung).

**Rechte des Betriebsrats.** `audit.view` öffnet die Ansicht „Auswertung (Betriebsrat)", `export.data` den CSV-Export
genau dieser Aggregate. Vorher hatten beide Rechte keine Wirkung. Leitung und Kundenrolle haben die Rechte auch, sehen
aber ohnehin die Einzelwerte; die Ansicht ist dem Betriebsrat vorbehalten (`BR:`). RECHTEMATRIX Abschnitt 2.

## Prüfungen

`pruefungen/br-auswertung.test.js` (Skript `pruefung:br-auswertung`, CI-Schritt „Betriebsrat-Auswertung"):
Mindestgruppe, Zweitsperre, Summen aus Plan und bestätigten Ist-Zeiten, kein Personenbezug, nur der Betriebsrat, nie
gespeichert, Oberfläche (Ansicht, Export, gesperrte Ansichten, „nicht bewertbar", kein NaN, „abwesend").

## Grenzen

- Qualifikationen mit `nurStatus` bekommt der Betriebsrat nicht; zählt eine Mindestbesetzung oder Aufgabe auf sie, meldet
  die Oberfläche für ihn eine fehlende Qualifikation (wie für Beschäftigte) — offen.
- Mehrarbeit gegenüber dem Soll und Konten sind nicht Teil der Auswertung (Konten enthalten Lohnbezug).
- Die Mindestgruppe 3 und der Umfang sind eine fachliche Festlegung für die Betriebsvereinbarung.
